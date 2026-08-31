// Umumiy tarmoq yordamchilari: SSRF himoyasi va HTML -> matn.
// Barcha AI vositalari tashqi URL bilan ishlaganda SHU yerdan o'tadi.

const LOCAL_HOST_RE =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;

export function isPublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "metadata.google.internal" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.startsWith("[") ||
      LOCAL_HOST_RE.test(host)
    ) {
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

/** HTML dan o'qiladigan matn ajratadi (script/style olib tashlanadi). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type FetchedPage = {
  url: string;
  title: string | null;
  text: string;
  truncated: boolean;
};

/** Sahifani xavfsiz yuklab, matnga aylantiradi. */
export async function fetchPageText(
  raw: string,
  maxChars = 12000,
  timeoutMs = 15000,
): Promise<FetchedPage> {
  if (!isPublicHttpUrl(raw)) {
    throw new Error("Bu URL manzili ruxsat etilmagan.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(raw, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "AlsamosAI/1.0 (+https://alsamos.com)",
        Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5",
      },
    });
    if (!res.ok) throw new Error(`Sahifa ochilmadi (HTTP ${res.status}).`);

    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.text();

    let text: string;
    if (contentType.includes("json")) {
      text = body;
    } else if (contentType.includes("html") || /<html[\s>]/i.test(body)) {
      text = htmlToText(body);
    } else {
      text = body;
    }

    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return {
      url: res.url || raw,
      title: titleMatch ? htmlToText(titleMatch[1]).slice(0, 200) : null,
      text: text.slice(0, maxChars),
      truncated: text.length > maxChars,
    };
  } finally {
    clearTimeout(timer);
  }
}
