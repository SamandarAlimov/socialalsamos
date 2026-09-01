// Mini app ochish strategiyasi.
// Bir xil qoidalar Flutter tomonida `lib/features/miniapps/domain/mini_app_open_strategy.dart`
// faylida takrorlanadi. O'zgartirish docs/contracts/mini-apps/open-strategy.md orqali kelishiladi.

import type { MiniAppDisplayMode } from './types';

/**
 * Oddiy (ishonchsiz) iframe uchun sandbox.
 * `allow-same-origin` ATAYLAB yo'q: `allow-scripts` bilan birga berilsa iframe
 * sandbox'dan chiqib, host sahifaning localStorage/tokenlariga kirishi mumkin.
 */
export const MINI_APP_IFRAME_SANDBOX = [
  'allow-scripts',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-modals',
  'allow-downloads',
  'allow-presentation',
].join(' ');

/**
 * Alohida proksi domeni (masalan proxy.alsamos.com) uchun sandbox.
 * Bu yerda `allow-same-origin` XAVFSIZ, chunki proksi origini alsamos.com dan
 * BOSHQA origin — iframe host sahifaga tegolmaydi, lekin sayt localStorage,
 * cookie va IndexedDB bilan to'liq ishlaydi.
 *
 * DIQQAT: bu sandbox faqat alohida domendagi proksi uchun. Bir xil origindagi
 * `/mp/` proksisi uchun `allow-same-origin` BERILMAYDI.
 */
export const MINI_APP_PROXY_IFRAME_SANDBOX = [MINI_APP_IFRAME_SANDBOX, 'allow-same-origin'].join(' ');

/** Kamera/mikrofon/joylashuv faqat foydalanuvchi ruxsat bergan mini app uchun beriladi. */
export const MINI_APP_IFRAME_ALLOW_BASE = 'clipboard-write; fullscreen';

export const DIRECT_TIMEOUT_MS = 8000;
export const PROXY_TIMEOUT_MS = 15000;

/** Alohida proksi domenidagi path prefiksi (workers/mini-app-proxy bilan bir xil). */
export const MINI_APP_PROXY_PATH_PREFIX = '/p/';

/**
 * Bir xil origindagi proksi prefiksi.
 * URL shakli: `https://alsamos.com/mp/<host>/<path>?<query>`
 * vercel.json rewrite ni `api/mini-app-proxy.ts` ga yo'naltiradi.
 * Path ichida `:` va `//` YO'Q — aks holda Vercel routing 404 qaytaradi.
 */
export const MINI_APP_SAME_ORIGIN_PROXY_PREFIX = '/mp/';

const BLOCKED_SCHEMES = ['javascript:', 'data:', 'blob:', 'file:', 'ftp:', 'ws:', 'wss:'];

/**
 * Iframe'ni to'liq bloklaydigan hostlar (X-Frame-Options / CSP frame-ancestors).
 * Bu ro'yxat faqat TO'G'RIDAN-TO'G'RI iframe qadamini o'tkazib yuboradi.
 * Proksi qadami baribir sinaladi — maqsad ilovani superapp ICHIDA ochish.
 */
const FRAMING_BLOCKED_HOSTS = [
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'web.whatsapp.com',
  'whatsapp.com',
  'tiktok.com',
  'accounts.google.com',
  'mail.google.com',
  'chat.openai.com',
  'github.com',
  'gmail.com',
  // islom.uz: Content-Security-Policy: frame-ancestors 'self'
  'islom.uz',
];

export type UrlRejectReason =
  | 'empty'
  | 'malformed'
  | 'scheme_not_allowed'
  | 'private_host'
  | 'no_host';

export type NormalizedUrl =
  | { ok: true; url: string; host: string; punycode: boolean; reason?: undefined }
  | { ok: false; reason: UrlRejectReason };

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal' || host === '169.254.169.254') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
  if (/^f[cd][0-9a-f]{0,2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  // Nuqtasiz va IP bo'lmagan host (ichki tarmoq nomi)
  if (!host.includes('.') && !host.includes(':')) return true;
  return false;
}

/** Foydalanuvchi kiritgan URL'ni majburiy https ga keltiradi va xavfsizligini tekshiradi. */
export function normalizeMiniAppUrl(raw: string | null | undefined): NormalizedUrl {
  const value = (raw ?? '').trim();
  if (!value) return { ok: false, reason: 'empty' };

  const lower = value.toLowerCase();
  if (BLOCKED_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return { ok: false, reason: 'scheme_not_allowed' };
  }

  let candidate = value;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = 'https://' + candidate;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'scheme_not_allowed' };
  }
  if (!parsed.hostname) return { ok: false, reason: 'no_host' };
  if (isPrivateHost(parsed.hostname)) return { ok: false, reason: 'private_host' };

  return {
    ok: true,
    url: parsed.toString(),
    host: parsed.hostname.toLowerCase(),
    punycode: parsed.hostname.toLowerCase().includes('xn--'),
  };
}

function hostMatches(host: string, entry: string): boolean {
  return host === entry || host.endsWith('.' + entry);
}

function youtubeEmbed(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id ? 'https://www.youtube.com/embed/' + id : null;
  }

  if (!hostMatches(host, 'youtube.com') && host !== 'youtube-nocookie.com') return null;

  const videoId = parsed.searchParams.get('v');
  if (videoId) return 'https://www.youtube.com/embed/' + videoId;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[0] === 'shorts' && segments[1]) {
    return 'https://www.youtube.com/embed/' + segments[1];
  }
  if (segments[0] === 'embed' && segments[1]) {
    return parsed.toString();
  }

  const list = parsed.searchParams.get('list');
  if (list) return 'https://www.youtube.com/embed/videoseries?list=' + list;

  // Kanal yoki asosiy sahifa uchun embed mavjud emas.
  return null;
}

/** Embed havolasi topilsa qaytaradi, aks holda null (soxta URL yasalmaydi). */
export function resolveEmbedUrl(rawUrl: string): string | null {
  const normalized = normalizeMiniAppUrl(rawUrl);
  if (!normalized.ok) return null;

  const parsed = new URL(normalized.url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const segments = parsed.pathname.split('/').filter(Boolean);

  const yt = youtubeEmbed(parsed);
  if (yt) return yt;

  if (hostMatches(host, 'vimeo.com')) {
    const id = segments.find((segment) => /^\d+$/.test(segment));
    return id ? 'https://player.vimeo.com/video/' + id : null;
  }

  if (hostMatches(host, 'instagram.com')) {
    if (['p', 'reel', 'reels', 'tv'].includes(segments[0]) && segments[1]) {
      const kind = segments[0] === 'reels' ? 'reel' : segments[0];
      return 'https://www.instagram.com/' + kind + '/' + segments[1] + '/embed/';
    }
    return null;
  }

  if (host === 't.me' || hostMatches(host, 'telegram.me')) {
    if (!segments.length) return null;
    if (segments[0] === 's') return parsed.toString();
    // Botlar va shaxsiy havolalar uchun embed yo'q.
    if (segments[0].toLowerCase().endsWith('bot')) return null;
    return 'https://t.me/s/' + segments.join('/');
  }

  return null;
}

/** Sayt to'g'ridan-to'g'ri iframe'da ochilishini bloklaydimi? */
export function isFramingBlocked(rawUrl: string): boolean {
  const normalized = normalizeMiniAppUrl(rawUrl);
  if (!normalized.ok) return false;
  return FRAMING_BLOCKED_HOSTS.some((entry) => hostMatches(normalized.host, entry));
}

export type OpenStepKind = 'embed' | 'direct' | 'proxy' | 'external' | 'native';

export interface OpenStep {
  kind: OpenStepKind;
  src: string;
  timeoutMs: number;
  /** Shu qadam uchun iframe sandbox qiymati. */
  sandbox: string;
}

export interface OpenPlan {
  steps: OpenStep[];
  /** Reja tuzilmagan bo'lsa sababi (masalan noto'g'ri URL). */
  error: UrlRejectReason | 'unsupported' | null;
  canonicalUrl: string | null;
  punycodeWarning: boolean;
  /** Sayt iframe'ni bloklashi aniq — to'g'ridan-to'g'ri qadam o'tkazib yuborildi. */
  framingBlocked: boolean;
  /** O'zimiz boshqaradigan proksi mavjudmi (superapp ichida ochish imkoni). */
  inAppProxy: boolean;
}

/**
 * `VITE_MINI_APP_PROXY_ORIGIN` — alohida proksi domeni (workers/mini-app-proxy).
 * Sozlanmagan bo'lsa bir xil origindagi `/mp/` proksisidan foydalanamiz
 * (api/mini-app-proxy.ts, Vercel), ya'ni qo'shimcha sozlamasiz ham ichida ochiladi.
 */
function envProxyOrigin(): string | null {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const value = env?.VITE_MINI_APP_PROXY_ORIGIN;
    return value && value.trim() ? value.trim().replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

/** Brauzerdagi joriy origin (bir xil origindagi proksi uchun). */
function sameOriginProxyOrigin(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const origin = window.location?.origin;
    return origin && /^https?:/i.test(origin) ? origin.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

/** Supabase Edge Function proksisi (eng oxirgi zaxira variant). */
export function buildProxyUrl(apiBase: string, targetUrl: string, cacheBuster?: string | number): string {
  const base = apiBase.replace(/\/+$/, '');
  const suffix = cacheBuster === undefined ? '' : '&_ts=' + encodeURIComponent(String(cacheBuster));
  return base + '/functions/v1/mini-app-proxy?url=' + encodeURIComponent(targetUrl) + suffix;
}

/**
 * Alohida proksi domeni uchun URL: `https://proxy.alsamos.com/p/https://islom.uz/...`
 * (Cloudflare Worker `//` va `:` belgilarini muammosiz qabul qiladi.)
 */
export function buildInAppProxyUrl(
  proxyOrigin: string,
  targetUrl: string,
  cacheBuster?: string | number,
  pathPrefix: string = MINI_APP_PROXY_PATH_PREFIX,
): string {
  const origin = proxyOrigin.replace(/\/+$/, '');
  let target = targetUrl;
  if (cacheBuster !== undefined) {
    const separator = target.includes('?') ? '&' : '?';
    target = target + separator + '__mp=' + encodeURIComponent(String(cacheBuster));
  }
  return origin + pathPrefix + target;
}

/**
 * Bir xil origindagi proksi uchun URL: `https://alsamos.com/mp/islom.uz/sahifa?x=1`
 * Sxema va `//` path'da saqlanmaydi — Vercel routing shundaginagina ishlaydi.
 * Host path ichida bo'lgani uchun `<base href>` bilan nisbiy VA host-ichidagi
 * resurslar ham proksi ustidan yuklanadi.
 */
export function buildSameOriginProxyUrl(
  proxyOrigin: string,
  targetUrl: string,
  cacheBuster?: string | number,
  pathPrefix: string = MINI_APP_SAME_ORIGIN_PROXY_PREFIX,
): string {
  const origin = proxyOrigin.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return targetUrl;
  }
  if (cacheBuster !== undefined) {
    parsed.searchParams.set('__mp', String(cacheBuster));
  }
  const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/';
  return origin + pathPrefix + parsed.host + path + parsed.search;
}

export interface BuildOpenPlanInput {
  url: string | null | undefined;
  displayMode?: MiniAppDisplayMode;
  appType?: 'link' | 'webapp' | 'bot' | 'native';
  deepLink?: string | null;
  apiBase?: string | null;
  cacheBuster?: string | number;
  /** Bazadagi `mini_apps.frame_blocked` bayrog'i (server tekshiruvi natijasi). */
  frameBlocked?: boolean;
  /** Alohida proksi domeni; berilmasa VITE_MINI_APP_PROXY_ORIGIN o'qiladi. */
  proxyOrigin?: string | null;
  /** Bir xil origindagi proksini o'chirish uchun (test/SSR). */
  sameOriginProxy?: boolean;
}

function emptyPlan(error: OpenPlan['error']): OpenPlan {
  return {
    steps: [],
    error,
    canonicalUrl: null,
    punycodeWarning: false,
    framingBlocked: false,
    inAppProxy: false,
  };
}

/**
 * Ochish qadamlari tartibini docs/contracts/mini-apps/open-strategy.md bo'yicha tuzadi.
 * Asosiy tamoyil: mini app IMKON QADAR superapp ichida ochilishi kerak.
 * Tashqi brauzer — faqat oxirgi zaxira variant.
 */
export function buildOpenPlan(input: BuildOpenPlanInput): OpenPlan {
  const { displayMode = 'iframe', appType = 'link', deepLink, apiBase, cacheBuster } = input;

  if (appType === 'native') {
    if (!deepLink) return emptyPlan('unsupported');
    return {
      steps: [{ kind: 'native', src: deepLink, timeoutMs: 0, sandbox: MINI_APP_IFRAME_SANDBOX }],
      error: null,
      canonicalUrl: deepLink,
      punycodeWarning: false,
      framingBlocked: false,
      inAppProxy: false,
    };
  }

  const normalized = normalizeMiniAppUrl(input.url);
  if (!normalized.ok) return emptyPlan(normalized.reason);

  const target = normalized.url;
  const embed = resolveEmbedUrl(target);
  const blocked = Boolean(input.frameBlocked) || isFramingBlocked(target);

  // 1) Alohida proksi domeni (eng yaxshi: allow-same-origin bilan to'liq ishlaydi)
  const dedicatedOrigin = input.proxyOrigin === undefined ? envProxyOrigin() : input.proxyOrigin;
  // 2) Bir xil origindagi /mp/ proksisi (qo'shimcha sozlamasiz ishlaydi)
  const sameOrigin =
    dedicatedOrigin || input.sameOriginProxy === false ? null : sameOriginProxyOrigin();

  let proxyStep: OpenStep | null = null;
  if (dedicatedOrigin) {
    proxyStep = {
      kind: 'proxy',
      src: buildInAppProxyUrl(dedicatedOrigin, target, cacheBuster, MINI_APP_PROXY_PATH_PREFIX),
      timeoutMs: PROXY_TIMEOUT_MS,
      sandbox: MINI_APP_PROXY_IFRAME_SANDBOX,
    };
  } else if (sameOrigin) {
    proxyStep = {
      kind: 'proxy',
      src: buildSameOriginProxyUrl(sameOrigin, target, cacheBuster),
      timeoutMs: PROXY_TIMEOUT_MS,
      // Bir xil origin: allow-same-origin BERILMAYDI (host sahifa xavfsizligi uchun).
      sandbox: MINI_APP_IFRAME_SANDBOX,
    };
  } else if (apiBase) {
    proxyStep = {
      kind: 'proxy',
      src: buildProxyUrl(apiBase, target, cacheBuster),
      timeoutMs: PROXY_TIMEOUT_MS,
      sandbox: MINI_APP_IFRAME_SANDBOX,
    };
  }

  const hasInAppProxy = Boolean(dedicatedOrigin || sameOrigin);

  const embedStep: OpenStep | null = embed
    ? { kind: 'embed', src: embed, timeoutMs: DIRECT_TIMEOUT_MS, sandbox: MINI_APP_IFRAME_SANDBOX }
    : null;
  const directStep: OpenStep = {
    kind: 'direct',
    src: target,
    timeoutMs: DIRECT_TIMEOUT_MS,
    sandbox: MINI_APP_IFRAME_SANDBOX,
  };
  const externalStep: OpenStep = {
    kind: 'external',
    src: target,
    timeoutMs: 0,
    sandbox: MINI_APP_IFRAME_SANDBOX,
  };

  const steps: OpenStep[] = [];

  if (appType === 'bot' && !embed) {
    // Telegram bot havolasi faqat Telegram ilovasida ishlaydi.
    steps.push(externalStep);
  } else if (displayMode === 'external') {
    // Baza `external` desa ham, proksimiz bo'lsa avval ichkarida sinaymiz.
    if (proxyStep) steps.push(proxyStep);
    steps.push(externalStep);
  } else if (displayMode === 'proxy') {
    if (proxyStep) steps.push(proxyStep);
    steps.push(externalStep);
  } else if (displayMode === 'embed') {
    if (embedStep) steps.push(embedStep);
    if (proxyStep) steps.push(proxyStep);
    steps.push(externalStep);
  } else {
    // 'iframe' va 'webview' (web'da bir xil)
    if (embedStep) steps.push(embedStep);
    // Bloklangani ma'lum bo'lsa, 8 soniya bo'sh kutishning ma'nosi yo'q.
    if (!blocked) steps.push(directStep);
    if (proxyStep) steps.push(proxyStep);
    steps.push(externalStep);
  }

  return {
    steps,
    error: null,
    canonicalUrl: target,
    punycodeWarning: normalized.punycode,
    framingBlocked: blocked,
    inAppProxy: hasInAppProxy,
  };
}

/** Ruxsat berilgan `permissions` ro'yxatidan iframe `allow` atributini yasaydi. */
export function buildIframeAllow(permissions: string[] | null | undefined): string {
  const granted = new Set(permissions ?? []);
  const parts = [MINI_APP_IFRAME_ALLOW_BASE];
  if (granted.has('camera')) parts.push('camera');
  if (granted.has('microphone')) parts.push('microphone');
  if (granted.has('location')) parts.push('geolocation');
  if (granted.has('payments')) parts.push('payment');
  return parts.join('; ');
}
