/**
 * Havolalarni Telegramdek "ichkarida ochish" uchun yordamchi qatlam.
 *
 * Ikki manba:
 *  1. `detectEmbed(url)` - mahalliy (tarmoqsiz) aniqlash: YouTube / Instagram /
 *     TikTok / Telegram / Vimeo / to'g'ridan-to'g'ri media fayl. Darhol ishlaydi,
 *     shuning uchun karta hech qachon kutib turmaydi.
 *  2. `fetchLinkMeta(url)` - `link-preview` edge funksiyasi orqali serverda
 *     o'qilgan Open Graph ma'lumotlari (sarlavha, tavsif, rasm va eng muhimi
 *     `og:video` - haqiqiy mp4 manzili). Brauzerda buni qilish CORS sababli
 *     imkonsiz.
 *
 * Yuklab olish `media-proxy` edge funksiyasi orqali amalga oshiriladi, chunki
 * Instagram/TikTok CDN'lari CORS bermaydi.
 */

const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL as string) || '';
const SUPABASE_KEY: string =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || '';

const YT_EMBED = 'https://' + 'www.youtube-nocookie.com/embed/';
const YT_THUMB = 'https://' + 'img.youtube.com/vi/';
const IG_BASE = 'https://' + 'www.instagram.com/';
const TT_EMBED = 'https://' + 'www.tiktok.com/embed/v2/';
const TG_BASE = 'https://' + 't.me/';
const VIMEO_EMBED = 'https://' + 'player.vimeo.com/video/';

export type EmbedProvider =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'telegram'
  | 'vimeo'
  | 'file'
  | 'none';

export interface EmbedInfo {
  provider: EmbedProvider;
  id?: string;
  /** iframe orqali ijro etiladigan manzil. */
  embedUrl?: string;
  /** To'g'ridan-to'g'ri media fayl (mp4/webm/mp3...). */
  fileUrl?: string;
  fileKind?: 'video' | 'audio' | 'image';
  thumbnail?: string;
  /** Vertikal (Reels/Shorts/TikTok) yoki gorizontal. */
  portrait?: boolean;
  siteName?: string;
}

export interface LinkMeta {
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

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|wav)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function matches(host: string, base: string): boolean {
  return host === base || host.endsWith('.' + base);
}

export function youtubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function instagramShortcode(url: string): { id: string; kind: string } | null {
  const match = url.match(/instagram\.com\/(reel|reels|p|tv)\/([\w-]+)/i);
  if (!match) return null;
  const kind = match[1].toLowerCase() === 'reels' ? 'reel' : match[1].toLowerCase();
  return { id: match[2], kind };
}

/** Tarmoqqa chiqmasdan havolani aniqlash. */
export function detectEmbed(url: string): EmbedInfo {
  const host = hostOf(url);

  const ytId = youtubeId(url);
  if (ytId) {
    return {
      provider: 'youtube',
      id: ytId,
      // `playsinline` - iOS'da to'liq ekranga o'tib ketmasligi uchun.
      embedUrl: YT_EMBED + ytId + '?autoplay=1&playsinline=1&rel=0&modestbranding=1',
      thumbnail: YT_THUMB + ytId + '/hqdefault.jpg',
      portrait: /shorts/.test(url),
      siteName: 'YouTube',
    };
  }

  const ig = instagramShortcode(url);
  if (ig) {
    return {
      provider: 'instagram',
      id: ig.id,
      embedUrl: IG_BASE + ig.kind + '/' + ig.id + '/embed/captioned/',
      portrait: ig.kind !== 'p',
      siteName: 'Instagram',
    };
  }

  if (matches(host, 'tiktok.com')) {
    const match = url.match(/\/video\/(\d+)/);
    if (match && match[1]) {
      return {
        provider: 'tiktok',
        id: match[1],
        embedUrl: TT_EMBED + match[1],
        portrait: true,
        siteName: 'TikTok',
      };
    }
  }

  if (matches(host, 't.me') || matches(host, 'telegram.me')) {
    const match = url.match(/t(?:elegram)?\.me\/(?:s\/)?([\w\d_]+)\/(\d+)/i);
    if (match) {
      return {
        provider: 'telegram',
        id: match[1] + '/' + match[2],
        embedUrl: TG_BASE + match[1] + '/' + match[2] + '?embed=1&userpic=true&dark=1',
        siteName: 'Telegram',
      };
    }
  }

  if (matches(host, 'vimeo.com')) {
    const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (match && match[1]) {
      return {
        provider: 'vimeo',
        id: match[1],
        embedUrl: VIMEO_EMBED + match[1] + '?autoplay=1',
        siteName: 'Vimeo',
      };
    }
  }

  if (VIDEO_EXT.test(url)) {
    return { provider: 'file', fileUrl: url, fileKind: 'video' };
  }
  if (AUDIO_EXT.test(url)) {
    return { provider: 'file', fileUrl: url, fileKind: 'audio' };
  }
  if (IMAGE_EXT.test(url)) {
    return { provider: 'file', fileUrl: url, fileKind: 'image', thumbnail: url };
  }

  return { provider: 'none' };
}

/* ------------------------------------------------------------------ */
/* Server metama'lumotlari                                             */
/* ------------------------------------------------------------------ */

const metaCache = new Map<string, LinkMeta | null>();
const inflight = new Map<string, Promise<LinkMeta | null>>();
const META_TIMEOUT_MS = 10000;

function functionUrl(name: string): string | null {
  if (!SUPABASE_URL) return null;
  return SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/' + name;
}

async function requestMeta(url: string): Promise<LinkMeta | null> {
  const endpoint = functionUrl('link-preview');
  if (!endpoint) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
      },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LinkMeta & { error?: string };
    if (data.error) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Keshlangan, takrorlanmaydigan metama'lumot so'rovi. */
export function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  if (metaCache.has(url)) return Promise.resolve(metaCache.get(url) || null);
  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = requestMeta(url)
    .then((meta) => {
      metaCache.set(url, meta);
      return meta;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, promise);
  return promise;
}

/* ------------------------------------------------------------------ */
/* Yuklab olish                                                        */
/* ------------------------------------------------------------------ */

/** Proxy orqali yuklab olish manzili (CORS va Content-Disposition uchun). */
export function proxyMediaUrl(
  mediaUrl: string,
  filename: string,
  asAttachment = true
): string | null {
  const endpoint = functionUrl('media-proxy');
  if (!endpoint) return null;
  return (
    endpoint +
    '?url=' +
    encodeURIComponent(mediaUrl) +
    '&filename=' +
    encodeURIComponent(filename) +
    '&download=' +
    (asAttachment ? '1' : '0')
  );
}

function triggerAnchorDownload(href: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Media faylni yuklab olish. Avval to'g'ridan-to'g'ri (o'z domenimizdagi
 * fayllar uchun), keyin `media-proxy` orqali. Ikkisi ham bo'lmasa yangi
 * oynada ochiladi.
 */
export async function downloadRemoteMedia(
  mediaUrl: string,
  filename: string
): Promise<boolean> {
  // 1) Bir xil domen yoki CORS ruxsat bergan manba
  try {
    const res = await fetch(mediaUrl);
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerAnchorDownload(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      return true;
    }
  } catch {
    // CORS - proxy'ga o'tamiz
  }

  // 2) Proxy (Instagram/TikTok/Telegram CDN)
  const proxied = proxyMediaUrl(mediaUrl, filename, true);
  if (proxied) {
    try {
      const res = await fetch(proxied);
      if (res.ok) {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        triggerAnchorDownload(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        return true;
      }
    } catch {
      // pastdagi zaxira variant
    }
    triggerAnchorDownload(proxied, filename);
    return true;
  }

  window.open(mediaUrl, '_blank', 'noopener,noreferrer');
  return false;
}

/** Fayl nomini havoladan yasash. */
export function suggestedFilename(
  url: string,
  provider: EmbedProvider,
  id?: string
): string {
  const base =
    provider !== 'none' && provider !== 'file'
      ? provider + '-' + (id || 'video').replace(/[^\w-]+/g, '-')
      : 'alsamos-media';
  const extMatch = url.match(/\.(mp4|webm|mov|m4v|mp3|m4a|jpg|jpeg|png|webp|gif)(\?|#|$)/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';
  return base + '.' + ext;
}

export function formatDuration(seconds?: number): string | undefined {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins + ':' + (secs < 10 ? '0' + secs : String(secs));
}
