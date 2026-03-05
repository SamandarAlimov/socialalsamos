const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' || hostname === '0.0.0.0' ||
      hostname.startsWith('127.') || hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') || hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^\[?::1\]?$/.test(hostname) ||
      /^\[?fc[0-9a-f]{0,2}:/i.test(hostname) ||
      /^\[?fd[0-9a-f]{0,2}:/i.test(hostname) ||
      /^\[?fe80:/i.test(hostname)
    ) return false;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    return true;
  } catch { return false; }
}

function normalizeProxyOrigin(origin: string): string {
  if (origin.startsWith('https://')) return origin;
  if (origin.startsWith('http://')) return origin.replace('http://', 'https://');
  return `https://${origin.replace(/^\/+/, '')}`;
}

function makeProxyUrl(targetUrl: string, proxyOrigin: string): string {
  return `${normalizeProxyOrigin(proxyOrigin)}/functions/v1/mini-app-proxy?url=${encodeURIComponent(targetUrl)}`;
}

function rewriteUrls(html: string, baseUrl: string, proxyOrigin: string): string {
  const toProxy = (inputUrl: string) => {
    try {
      const absolute = new URL(inputUrl, baseUrl).href;
      return makeProxyUrl(absolute, proxyOrigin);
    } catch { return inputUrl; }
  };

  // Inject <base> tag right after <head> for relative URL resolution
  const baseTag = `<base href="${baseUrl}">`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1\n${baseTag}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/(<html[^>]*>)/i, `$1<head>${baseTag}</head>`);
  }

  // Rewrite src/href/action/poster/data-src/srcset
  html = html.replace(
    /((?:src|href|action|poster|data-src)\s*=\s*["'])([^"']*)(["'])/gi,
    (match, prefix, value, suffix) => {
      const raw = (value || '').trim();
      if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('data:') || raw.startsWith('blob:')) return match;
      return `${prefix}${toProxy(raw)}${suffix}`;
    }
  );

  // Rewrite CSS url() references
  html = html.replace(
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    (match, value) => {
      const raw = (value || '').trim();
      if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('#')) return match;
      return `url("${toProxy(raw)}")`;
    }
  );

  // Remove ALL frame-blocking headers via meta tags
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');

  // Inject script to disable frame-busting JS
  const antiFrameBust = `<script>
    // Prevent frame-busting scripts
    if (window.top !== window.self) {
      try {
        Object.defineProperty(window, 'top', { get: function() { return window.self; } });
      } catch(e) {}
      try {
        Object.defineProperty(window, 'parent', { get: function() { return window.self; } });
      } catch(e) {}
    }
  </script>`;
  
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1\n${antiFrameBust}`);
  } else {
    html = antiFrameBust + html;
  }

  return html;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let targetUrl: string | null = null;

    if (req.method === 'GET') {
      targetUrl = new URL(req.url).searchParams.get('url');
    } else if (req.method === 'POST') {
      const body = await req.json();
      targetUrl = body.url || null;
    }

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    if (!isAllowedUrl(targetUrl)) {
      return new Response(JSON.stringify({ error: 'URL not allowed' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Proxying URL:', targetUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'uz,en;q=0.5',
          'Accept-Encoding': 'identity',
        },
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timeout);
    }

    const contentType = response.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml+xml');

    if (isHtml || contentType.startsWith('text/plain')) {
      let html = await response.text();
      const trimmed = html.trimStart();
      const looksLikeHtml = isHtml || /^<!doctype/i.test(trimmed) || /^<html/i.test(trimmed) || /^&lt;!doctype/i.test(trimmed) || /^&lt;html/i.test(trimmed);

      if (looksLikeHtml) {
        const proxyOrigin = normalizeProxyOrigin(new URL(req.url).origin);

        // Decode HTML entities if needed
        if (/^&lt;/i.test(trimmed)) {
          html = html
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&');
        }

        html = rewriteUrls(html, targetUrl, proxyOrigin);

        const responseHeaders = {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=120',
          'X-Frame-Options': '', // Clear it
        };

        if (req.method === 'GET') {
          return new Response(html, { status: 200, headers: responseHeaders });
        }

        return new Response(JSON.stringify({ success: true, html }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
        });
      }
    }

    // Non-HTML: pass through (images, CSS, JS, fonts, etc.)
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});