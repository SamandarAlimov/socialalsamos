// Telegram uslubidagi havola preview'i.
//
// Brauzerda boshqa saytning HTML'ini o'qish CORS sababli mumkin emas, shuning
// uchun Open Graph metama'lumotlari SERVERDA o'qiladi. Telegram ham xuddi
// shunday ishlaydi: linkni bot serveri ochib, og:title / og:image / og:video
// ni oladi va foydalanuvchiga tayyor karta ko'rsatadi.
//
// Javob: { siteName, title, description, image, video, videoWidth,
//          videoHeight, author, duration }

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Ba'zi saytlar (Instagram, TikTok) faqat brauzerga o'xshagan UA'ga javob beradi.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const BOT_UA = 'facebookexternalhit/1.1 (+http://' + 'www.facebook.com/externalhit_uatext.php)';

const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_CHARS = 400000;

interface LinkMeta {
  siteName?: string;
  title?: string;
  description?: string;
  image?: string;
  video?: string;
  videoWidth?: number;
  videoHeight?: number;
  author?: string;
  duration?: number;
}

function json(body: unknown, status = 200, cacheSeconds = 0): Response {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = 'public, max-age=' + cacheSeconds;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function fetchText(target: string, ua: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,uz;q=0.8,ru;q=0.7',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, MAX_HTML_CHARS);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** <meta property|name="key" content="..."> ni ikki tartibda ham o'qiydi. */
function metaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(
        '<meta[^>]+(?:property|name)=["\']' +
          escaped +
          '["\'][^>]*?content=["\']([^"\']*)["\']',
        'i'
      ),
      new RegExp(
        '<meta[^>]+content=["\']([^"\']*)["\'][^>]*?(?:property|name)=["\']' +
          escaped +
          '["\']',
        'i'
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const value = decodeEntities(match[1]);
        if (value) return value;
      }
    }
  }
  return undefined;
}

function titleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  return match && match[1] ? decodeEntities(match[1]) : undefined;
}

function toNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseHtml(html: string): LinkMeta {
  return {
    siteName: metaContent(html, ['og:site_name', 'twitter:site']),
    title: metaContent(html, ['og:title', 'twitter:title']) || titleTag(html),
    description: metaContent(html, [
      'og:description',
      'twitter:description',
      'description',
    ]),
    image: metaContent(html, [
      'og:image:secure_url',
      'og:image',
      'twitter:image',
      'twitter:image:src',
    ]),
    video: metaContent(html, [
      'og:video:secure_url',
      'og:video:url',
      'og:video',
      'twitter:player:stream',
    ]),
    videoWidth: toNumber(metaContent(html, ['og:video:width', 'twitter:player:width'])),
    videoHeight: toNumber(metaContent(html, ['og:video:height', 'twitter:player:height'])),
    duration: toNumber(metaContent(html, ['og:video:duration', 'video:duration'])),
    author: metaContent(html, ['author', 'og:author', 'twitter:creator']),
  };
}

/** oEmbed - YouTube/TikTok/Vimeo uchun ishonchli sarlavha va rasm manbasi. */
function oembedEndpoint(target: string): string | null {
  let host = '';
  try {
    host = new URL(target).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const encoded = encodeURIComponent(target);
  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
    return 'https://' + 'www.youtube.com/oembed?format=json&url=' + encoded;
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    return 'https://' + 'www.tiktok.com/oembed?url=' + encoded;
  }
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    return 'https://' + 'vimeo.com/api/oembed.json?url=' + encoded;
  }
  return null;
}

async function oembedMeta(target: string): Promise<LinkMeta | null> {
  const endpoint = oembedEndpoint(target);
  if (!endpoint) return null;
  const raw = await fetchText(endpoint, BROWSER_UA);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      siteName: typeof data.provider_name === 'string' ? data.provider_name : undefined,
      title: typeof data.title === 'string' ? data.title : undefined,
      author: typeof data.author_name === 'string' ? data.author_name : undefined,
      image: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : undefined,
      videoWidth: typeof data.width === 'number' ? data.width : undefined,
      videoHeight: typeof data.height === 'number' ? data.height : undefined,
    };
  } catch {
    return null;
  }
}

function merge(base: LinkMeta, extra: LinkMeta | null): LinkMeta {
  if (!extra) return base;
  const result: LinkMeta = { ...base };
  for (const key of Object.keys(extra) as Array<keyof LinkMeta>) {
    const value = extra[key];
    if (value !== undefined && value !== null && value !== '' && result[key] === undefined) {
      (result[key] as unknown) = value;
    }
  }
  return result;
}

function isSafeUrl(target: string): boolean {
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let target = '';
  try {
    if (req.method === 'GET') {
      target = new URL(req.url).searchParams.get('url') || '';
    } else {
      const body = (await req.json()) as { url?: string };
      target = body.url || '';
    }
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  if (!target || !isSafeUrl(target)) {
    return json({ error: 'invalid_url' }, 400);
  }

  // 1) Bot UA (Facebook crawler) ko'p saytlarda to'liq OG beradi.
  // 2) Bo'lmasa brauzer UA bilan qayta urinamiz.
  let meta: LinkMeta = {};
  const botHtml = await fetchText(target, BOT_UA);
  if (botHtml) meta = parseHtml(botHtml);

  if (!meta.video || !meta.image || !meta.title) {
    const browserHtml = await fetchText(target, BROWSER_UA);
    if (browserHtml) meta = merge(meta, parseHtml(browserHtml));
  }

  meta = merge(meta, await oembedMeta(target));

  const hasAnything = Boolean(
    meta.title || meta.description || meta.image || meta.video
  );
  if (!hasAnything) {
    return json({ error: 'no_metadata' }, 404);
  }

  // 6 soat keshlash: bir xil havola qayta-qayta scrape qilinmaydi.
  return json(meta, 200, 21600);
});
