const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_CHARS = 400_000;

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function safeHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '0.0.0.0' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function decodeHtml(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim() || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function metaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = escapeRegExp(key);
    const a = new RegExp(
      '<meta[^>]+(?:property|name)=[\"\\\']' + escaped +
        '[\"\\\'][^>]+content=[\"\\\']([^\"\\\']*)[\"\\\'][^>]*>',
      'i',
    ).exec(html);
    if (a?.[1]) return decodeHtml(a[1]);

    const b = new RegExp(
      '<meta[^>]+content=[\"\\\']([^\"\\\']*)[\"\\\'][^>]+(?:property|name)=[\"\\\']' +
        escaped + '[\"\\\'][^>]*>',
      'i',
    ).exec(html);
    if (b?.[1]) return decodeHtml(b[1]);
  }
  return undefined;
}

function titleContent(html: string): string | undefined {
  return decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
}

function absoluteUrl(value: string | undefined, base: URL): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function numberMeta(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function decodeJsonUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decodeHtml(
      value
        .replace(/\\u0026/gi, '&')
        .replace(/\\u003d/gi, '=')
        .replace(/\\u002f/gi, '/')
        .replace(/\\\//g, '/')
    );
  } catch {
    return undefined;
  }
}

function instagramTarget(url: URL): { id: string; kind: string } | null {
  const match = url.pathname.match(/^\/(reel|reels|p|tv)\/([\w-]+)/i);
  if (!match) return null;
  return {
    kind: match[1].toLowerCase() === 'reels' ? 'reel' : match[1].toLowerCase(),
    id: match[2],
  };
}

function instagramEmbedMedia(html: string, base: URL) {
  const directVideo =
    decodeJsonUrl(/"video_url"\s*:\s*"([^"]+)"/i.exec(html)?.[1]) ||
    decodeJsonUrl(/<source[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]) ||
    decodeJsonUrl(/<video[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]) ||
    metaContent(html, ['og:video:secure_url', 'og:video:url', 'og:video']);

  const poster =
    decodeJsonUrl(/"thumbnail_src"\s*:\s*"([^"]+)"/i.exec(html)?.[1]) ||
    decodeJsonUrl(/"display_url"\s*:\s*"([^"]+)"/i.exec(html)?.[1]) ||
    decodeJsonUrl(/<video[^>]+poster=["']([^"']+)["']/i.exec(html)?.[1]) ||
    metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image']);

  return {
    video: absoluteUrl(directVideo, base),
    image: absoluteUrl(poster, base),
  };
}

async function fetchInstagramMedia(target: URL) {
  const parsed = instagramTarget(target);
  if (!parsed) return null;

  const embedUrl = new URL(
    'https://www.instagram.com/' + parsed.kind + '/' + parsed.id + '/embed/'
  );
  const html = await fetchHtml(embedUrl);
  if (!html) return null;
  return instagramEmbedMedia(html, embedUrl);
}

async function fetchHtml(url: URL): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
        'Accept-Language': 'uz,en;q=0.9,ru;q=0.8',
      },
    });
    if (!response.ok) return null;

    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) return null;
    return (await response.text()).slice(0, MAX_HTML_CHARS);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const raw =
    req.method === 'GET'
      ? String(req.query?.url ?? '')
      : String(req.body?.url ?? '');

  const target = safeHttpUrl(raw);
  if (!target) {
    res.status(400).json({ error: 'invalid_url' });
    return;
  }

  const html = await fetchHtml(target);
  const instagramMedia =
    /(^|\.)instagram\.com$/i.test(target.hostname)
      ? await fetchInstagramMedia(target)
      : null;

  if (!html && !instagramMedia) {
    res.status(200).json({
      siteName: target.hostname.replace(/^www\./, ''),
      title: target.hostname.replace(/^www\./, ''),
    });
    return;
  }

  const sourceHtml = html || '';
  const image = instagramMedia?.image || absoluteUrl(
    metaContent(sourceHtml, ['og:image:secure_url', 'og:image', 'twitter:image']),
    target,
  );
  const video = instagramMedia?.video || absoluteUrl(
    metaContent(sourceHtml, [
      'og:video:secure_url',
      'og:video:url',
      'og:video',
      'twitter:player:stream',
    ]),
    target,
  );

  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.status(200).json({
    siteName:
      metaContent(sourceHtml, ['og:site_name', 'application-name']) ||
      target.hostname.replace(/^www\./, ''),
    title:
      metaContent(sourceHtml, ['og:title', 'twitter:title']) ||
      titleContent(sourceHtml) ||
      target.hostname.replace(/^www\./, ''),
    description: metaContent(sourceHtml, ['og:description', 'twitter:description', 'description']),
    image,
    video,
    videoWidth: numberMeta(metaContent(sourceHtml, ['og:video:width'])),
    videoHeight: numberMeta(metaContent(sourceHtml, ['og:video:height'])),
    imageWidth: numberMeta(metaContent(sourceHtml, ['og:image:width'])),
    imageHeight: numberMeta(metaContent(sourceHtml, ['og:image:height'])),
    author: metaContent(sourceHtml, ['author', 'article:author']),
    duration: numberMeta(metaContent(sourceHtml, ['video:duration', 'og:video:duration'])),
  });
}
