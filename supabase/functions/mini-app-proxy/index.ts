// Mini-app proxy.
//
// Xavfsizlik qatlamlari:
//  1. Guard: JWT + limit (AUTH_ENFORCE=log bo'lsa bloklamaydi, faqat yozadi).
//  2. SSRF: ichki IP/localhost/metadata manzillari bloklangan, protokol faqat http(s).
//  3. Allowlist: MINI_APP_ALLOWED_HOSTS bo'sh bo'lsa — log rejimida ruxsat beriladi va
//     haqiqiy hostlar function_usage.metadata ga yoziladi. Ro'yxat to'lgach
//     faqat undagi domenlar ochiladi.
//  4. Redirect qo'lda kuzatiladi: har bir qadam qayta tekshiriladi (redirect orqali
//     ichki tarmoqqa o'tishning oldini oladi).
//  5. Javob hajmi va vaqt cheklangan.

import { guard, preflight, corsHeaders as guardCors, jsonResponse, guardError, bearerToken } from "../_shared/guard.ts";

const FUNCTION_NAME = "mini-app-proxy";
const RATE_LIMIT = 1000;
const RATE_WINDOW_MINUTES = 60;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 12 * 1024 * 1024;

function proxyCors(req: Request): Record<string, string> {
  return {
    ...guardCors(req, "GET, POST, OPTIONS"),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function allowedHosts(): string[] {
  return (Deno.env.get("MINI_APP_ALLOWED_HOSTS") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(hostname: string, list: string[]): boolean {
  const host = hostname.toLowerCase();
  return list.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "169.254.169.254" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
    /^::1$/.test(host) ||
    /^fc[0-9a-f]{0,2}:/i.test(host) ||
    /^fd[0-9a-f]{0,2}:/i.test(host) ||
    /^fe80:/i.test(host)
  );
}

function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return !isPrivateHost(url.hostname);
  } catch {
    return false;
  }
}

function normalizeProxyOrigin(origin: string): string {
  if (origin.startsWith("https://")) return origin;
  if (origin.startsWith("http://")) return origin.replace("http://", "https://");
  return `{{https://${origin.replace(/^}}\/+/, "")}`;
}

// Ichki resurslar ham tekshiruvdan o'tishi uchun tokenni proksi havolalariga ko'chiramiz.
function makeProxyUrl(targetUrl: string, proxyOrigin: string, token: string | null): string {
  const base = `${normalizeProxyOrigin(proxyOrigin)}/functions/v1/mini-app-proxy?url=${encodeURIComponent(targetUrl)}`;
  return token ? `${base}&access_token=${encodeURIComponent(token)}` : base;
}

function rewriteUrls(html: string, baseUrl: string, proxyOrigin: string, token: string | null): string {
  const toProxy = (inputUrl: string) => {
    try {
      const absolute = new URL(inputUrl, baseUrl).href;
      if (!isSafeUrl(absolute)) return inputUrl;
      return makeProxyUrl(absolute, proxyOrigin, token);
    } catch {
      return inputUrl;
    }
  };

  const baseTag = `<base href="${baseUrl}">`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1\n${baseTag}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/(<html[^>]*>)/i, `$1<head>${baseTag}</head>`);
  }

  html = html.replace(
    /((?:src|href|action|poster|data-src)\s*=\s*["'])([^"']*)(["'])/gi,
    (match, prefix, value, suffix) => {
      const raw = (value || "").trim();
      if (
        !raw ||
        raw.startsWith("#") ||
        raw.startsWith("javascript:") ||
        raw.startsWith("mailto:") ||
        raw.startsWith("tel:") ||
        raw.startsWith("data:") ||
        raw.startsWith("blob:")
      ) {
        return match;
      }
      return `${prefix}${toProxy(raw)}${suffix}`;
    },
  );

  html = html.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (match, value) => {
    const raw = (value || "").trim();
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) return match;
    return `url("${toProxy(raw)}")`;
  });

  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, "");
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, "");

  const antiFrameBust = `<script>
    if (window.top !== window.self) {
      try { Object.defineProperty(window, 'top', { get: function() { return window.self; } }); } catch(e) {}
      try { Object.defineProperty(window, 'parent', { get: function() { return window.self; } }); } catch(e) {}
    }
  </script>`;

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1\n${antiFrameBust}`);
  } else {
    html = antiFrameBust + html;
  }

  return html;
}

// Redirectlarni qo'lda kuzatib, har bir qadamni tekshiramiz.
async function safeFetch(startUrl: string, list: string[]): Promise<{ response: Response; finalUrl: string } | { error: string; status: number }> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafeUrl(current)) return { error: "URL not allowed", status: 403 };
    if (list.length > 0 && !hostAllowed(new URL(current).hostname, list)) {
      return { error: "Host not allowed", status: 403 };
    }

    const response = await fetch(current, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "uz,en;q=0.5",
        "Accept-Encoding": "identity",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: current };
      try {
        current = new URL(location, current).href;
      } catch {
        return { error: "Bad redirect", status: 502 };
      }
      continue;
    }

    return { response, finalUrl: current };
  }

  return { error: "Too many redirects", status: 502 };
}

async function readLimited(response: Response): Promise<ArrayBuffer | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return null;
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) return null;
  return buffer;
}

Deno.serve(async (req) => {
  const pre = preflight(req, "GET, POST, OPTIONS");
  if (pre) return pre;

  if (req.method !== "GET" && req.method !== "POST") {
    return guardError(req, "METHOD_NOT_ALLOWED", "Faqat GET va POST qabul qilinadi.", 405);
  }

  try {
    let targetUrl: string | null = null;
    if (req.method === "GET") {
      targetUrl = new URL(req.url).searchParams.get("url");
    } else {
      const body = await req.json().catch(() => ({}));
      targetUrl = (body as { url?: string }).url ?? null;
    }

    if (!targetUrl) {
      return guardError(req, "INVALID_REQUEST", "url parametri talab qilinadi.", 400);
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `{{https://${targetUrl}}}`;
    }
    if (!isSafeUrl(targetUrl)) {
      return guardError(req, "FORBIDDEN", "Bu manzilga ruxsat berilmagan.", 403);
    }

    const host = new URL(targetUrl).hostname.toLowerCase();
    const list = allowedHosts();

    // Guard: JWT + limit. Host nomi metadata sifatida yoziladi — allowlist shundan tuziladi.
    const gate = await guard(req, {
      functionName: FUNCTION_NAME,
      limit: RATE_LIMIT,
      windowMinutes: RATE_WINDOW_MINUTES,
      requireAuth: true,
      metadata: { host, allowlist_configured: list.length > 0 },
    });
    if (gate.response) return gate.response;

    if (list.length > 0 && !hostAllowed(host, list)) {
      return guardError(req, "FORBIDDEN", "Bu domen ruxsat etilganlar ro'yxatida yo'q.", 403);
    }

    const fetched = await safeFetch(targetUrl, list);
    if ("error" in fetched) {
      return jsonResponse(req, { error: fetched.error, code: "FORBIDDEN" }, fetched.status);
    }

    const { response, finalUrl } = fetched;
    const contentType = response.headers.get("content-type") || "";
    const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
    const token = bearerToken(req);

    if (isHtml || contentType.startsWith("text/plain")) {
      const buffer = await readLimited(response);
      if (!buffer) {
        return guardError(req, "INVALID_REQUEST", "Sahifa hajmi juda katta.", 413);
      }
      let html = new TextDecoder().decode(buffer);
      const trimmed = html.trimStart();
      const looksLikeHtml =
        isHtml ||
        /^<!doctype/i.test(trimmed) ||
        /^<html/i.test(trimmed) ||
        /^&lt;!doctype/i.test(trimmed) ||
        /^&lt;html/i.test(trimmed);

      if (looksLikeHtml) {
        const proxyOrigin = normalizeProxyOrigin(new URL(req.url).origin);

        if (/^&lt;/i.test(trimmed)) {
          html = html
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&");
        }

        html = rewriteUrls(html, finalUrl, proxyOrigin, token);

        if (req.method === "GET") {
          return new Response(html, {
            status: 200,
            headers: {
              ...proxyCors(req),
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "private, max-age=120",
            },
          });
        }

        return new Response(JSON.stringify({ success: true, html }), {
          status: 200,
          headers: {
            ...proxyCors(req),
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=120",
          },
        });
      }

      return new Response(html, {
        status: response.status,
        headers: { ...proxyCors(req), "Content-Type": contentType || "text/plain; charset=utf-8" },
      });
    }

    const body = await readLimited(response);
    if (!body) {
      return guardError(req, "INVALID_REQUEST", "Fayl hajmi juda katta.", 413);
    }

    return new Response(body, {
      status: response.status,
      headers: {
        ...proxyCors(req),
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return guardError(req, "SERVER_ERROR", "Proksi xatoligi.", 500);
  }
});
