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
  /**
   * Media nisbati = width / height.
   * 16/9 = 1.777, 4/3 = 1.333, 1/1 = 1, 4/5 = 0.8, 3/4 = 0.75, 9/16 = 0.5625.
   */
  aspectRatio?: number;
  /**
   * iframe ichidagi platformaga tegishli qo'shimcha UI (sarlavha, profil,
   * like/comment tugmalari) balandligi - px. Shu joy hisobga olinmasa
   * iframe ichida scroll paydo bo'ladi.
   */
  embedChrome?: number;
  siteName?: string;
}

export interface LinkMeta {
  siteName?: string;
  title?: string;
  description?: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
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
    const shorts = /shorts/.test(url);
    return {
      provider: 'youtube',
      id: ytId,
      // `playsinline` - iOS'da to'liq ekranga o'tib ketmasligi uchun.
      embedUrl: YT_EMBED + ytId + '?autoplay=1&playsinline=1&rel=0&modestbranding=1',
      thumbnail: YT_THUMB + ytId + '/hqdefault.jpg',
      portrait: shorts,
      aspectRatio: shorts ? 9 / 16 : 16 / 9,
      siteName: 'YouTube',
    };
  }

  const ig = instagramShortcode(url);
  if (ig) {
    const portrait = ig.kind !== 'p';
    return {
      provider: 'instagram',
      id: ig.id,
      // `captioned` emas: izoh matni balandligi oldindan noma'lum bo'lgani
      // uchun iframe ichida scroll paydo bo'ladi.
      embedUrl: IG_BASE + ig.kind + '/' + ig.id + '/embed/',
      portrait,
      // Reels/IGTV - 9:16, oddiy post - 4:5 (Instagram'ning asosiy nisbati).
      aspectRatio: portrait ? 9 / 16 : 4 / 5,
      // Instagram embed'da yuqorida profil satri, pastda harakatlar satri bor.
      embedChrome: 108,
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
        aspectRatio: 9 / 16,
        // TikTok embed'da sarlavha va musiqa satri.
        embedChrome: 132,
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
        // Telegram post balandligi matnga bog'liq - 3:4 eng xolis tanlov.
        aspectRatio: 3 / 4,
        embedChrome: 72,
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
        aspectRatio: 16 / 9,
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
/* Nisbat (aspect ratio) hisobi                                        */
/* ------------------------------------------------------------------ */

/** Ijtimoiy tarmoqlarda uchraydigan standart nisbatlar (width / height). */
export const STANDARD_ASPECT_RATIOS = [
  9 / 16, // 0.5625 - Reels / Shorts / TikTok
  3 / 4, // 0.75
  4 / 5, // 0.8 - Instagram post
  1, // 1:1
  5 / 4, // 1.25
  4 / 3, // 1.333
  3 / 2, // 1.5
  16 / 9, // 1.777
  1.85,
  2.35, // kinoskop
];

/** Juda cho'zilgan yoki juda baland mediani ham xavfsiz chegarada saqlaymiz. */
const MIN_RATIO = 0.45;
const MAX_RATIO = 2.5;

/**
 * Haqiqiy nisbatni eng yaqin standart nisbatga "yopishtiradi" (4% farq ichida),
 * aks holda o'zini qaytaradi. Shu sababli 1080x1920 -> aniq 9:16,
 * 1080x1350 -> aniq 4:5 bo'ladi va bir piksellik qiyshiqlik ko'rinmaydi.
 */
export function snapAspectRatio(ratio?: number | null): number | undefined {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return undefined;
  const clamped = Math.min(Math.max(ratio, MIN_RATIO), MAX_RATIO);

  let best = clamped;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const candidate of STANDARD_ASPECT_RATIOS) {
    const diff = Math.abs(Math.log(clamped / candidate));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  return bestDiff <= 0.04 ? best : clamped;
}

function ratioFrom(width?: number, height?: number): number | undefined {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return undefined;
  }
  if (width <= 0 || height <= 0) return undefined;
  return width / height;
}

/**
 * Media uchun eng ishonchli nisbatni tanlaydi.
 *
 * Ustuvorlik:
 *  1. `og:video:width/height` (server metama'lumoti)
 *  2. brauzer o'qigan haqiqiy o'lcham (video/rasm yuklangandan keyin)
 *  3. `og:image:width/height`
 *  4. provider bo'yicha standart nisbat (Reels -> 9:16, YouTube -> 16:9 ...)
 *  5. 16:9
 */
export function resolveAspectRatio(input: {
  embed?: EmbedInfo;
  meta?: LinkMeta;
  /** Brauzer o'qigan haqiqiy nisbat (videoWidth/videoHeight yoki naturalWidth/naturalHeight). */
  natural?: number;
  fallback?: number;
}): number {
  const { embed, meta, natural, fallback } = input;

  const candidates: Array<number | undefined> = [
    ratioFrom(meta?.videoWidth, meta?.videoHeight),
    natural,
    ratioFrom(meta?.imageWidth, meta?.imageHeight),
    embed?.aspectRatio,
    embed?.portrait ? 9 / 16 : undefined,
    fallback,
  ];

  for (const candidate of candidates) {
    const snapped = snapAspectRatio(candidate);
    if (snapped) return snapped;
  }
  return 16 / 9;
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
