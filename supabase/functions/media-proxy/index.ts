// Media proxy: uzoq CDN'dagi video/rasmni foydalanuvchiga YUKLAB OLISH uchun
// oqim bilan uzatadi.
//
// Nega kerak: Instagram/TikTok CDN'lari `Access-Control-Allow-Origin`
// bermaydi, shuning uchun brauzerda `fetch(...).blob()` ishlamaydi va
// `<a download>` ham cross-origin faylni yuklab olmaydi. Telegram ham
// mediani o'z serveri orqali beradi.
//
// Xavfsizlik: faqat ruxsat berilgan media hostlar (allowlist).

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges',
};

const ALLOWED_HOST_SUFFIXES = [
  'cdninstagram.com',
  'fbcdn.net',
  'instagram.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokv.com',
  'muscdn.com',
  'telegram.org',
  'telegram-cdn.org',
  't.me',
  'twimg.com',
  'vimeocdn.com',
  'akamaized.net',
  'googlevideo.com',
];

const MAX_BYTES = 200 * 1024 * 1024;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

function hostAllowed(target: string): boolean {
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith('.' + suffix)
    );
  } catch {
    return false;
  }
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 120);
  return cleaned || 'alsamos-media';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const params = new URL(req.url).searchParams;
  const target = params.get('url') || '';
  const filename = safeFilename(params.get('filename') || 'alsamos-video.mp4');
  const asAttachment = params.get('download') !== '0';

  if (!target || !hostAllowed(target)) {
    return new Response(JSON.stringify({ error: 'host_not_allowed' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const range = req.headers.get('range');
  const upstream = await fetch(target, {
    headers: {
      'User-Agent': BROWSER_UA,
      ...(range ? { Range: range } : {}),
    },
    redirect: 'follow',
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(JSON.stringify({ error: 'upstream_error' }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const length = Number(upstream.headers.get('content-length') || '0');
  if (length > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'too_large' }), {
      status: 413,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Cache-Control': 'public, max-age=3600',
    'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers['Content-Range'] = contentRange;
  if (asAttachment) {
    headers['Content-Disposition'] = 'attachment; filename="' + filename + '"';
  }

  return new Response(upstream.body, { status: upstream.status, headers });
});
