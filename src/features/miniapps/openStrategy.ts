// Mini app ochish strategiyasi.
// Bir xil qoidalar Flutter tomonida `lib/features/miniapps/domain/mini_app_open_strategy.dart`
// faylida takrorlanadi. O'zgartirish docs/contracts/mini-apps/open-strategy.md orqali kelishiladi.

import type { MiniAppDisplayMode } from './types';

/**
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

/** Kamera/mikrofon/joylashuv faqat foydalanuvchi ruxsat bergan mini app uchun beriladi. */
export const MINI_APP_IFRAME_ALLOW_BASE = 'clipboard-write; fullscreen';

export const DIRECT_TIMEOUT_MS = 8000;
export const PROXY_TIMEOUT_MS = 15000;

const BLOCKED_SCHEMES = ['javascript:', 'data:', 'blob:', 'file:', 'ftp:', 'ws:', 'wss:'];

/** Iframe'ni to'liq bloklaydigan hostlar (X-Frame-Options / CSP frame-ancestors). */
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
];

export type UrlRejectReason =
  | 'empty'
  | 'malformed'
  | 'scheme_not_allowed'
  | 'private_host'
  | 'no_host';

export type NormalizedUrl =
  | { ok: true; url: string; host: string; punycode: boolean }
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
  // (Eski kod bu holatda buzilgan `?listType=search&list=` URL yasagan.)
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

/** Sayt iframe'da ochilishini bloklaydimi? */
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
}

export interface OpenPlan {
  steps: OpenStep[];
  /** Reja tuzilmagan bo'lsa sababi (masalan noto'g'ri URL). */
  error: UrlRejectReason | 'unsupported' | null;
  canonicalUrl: string | null;
  punycodeWarning: boolean;
}

export function buildProxyUrl(apiBase: string, targetUrl: string, cacheBuster?: string | number): string {
  const base = apiBase.replace(/\/+$/, '');
  const suffix = cacheBuster === undefined ? '' : '&_ts=' + encodeURIComponent(String(cacheBuster));
  return base + '/functions/v1/mini-app-proxy?url=' + encodeURIComponent(targetUrl) + suffix;
}

export interface BuildOpenPlanInput {
  url: string | null | undefined;
  displayMode?: MiniAppDisplayMode;
  appType?: 'link' | 'webapp' | 'bot' | 'native';
  deepLink?: string | null;
  apiBase?: string | null;
  cacheBuster?: string | number;
}

/**
 * Ochish qadamlari tartibini docs/contracts/mini-apps/open-strategy.md bo'yicha tuzadi.
 * Har bir qadam muvaffaqiyatsiz bo'lsa (timeout/xato) keyingisiga o'tiladi.
 */
export function buildOpenPlan(input: BuildOpenPlanInput): OpenPlan {
  const { displayMode = 'iframe', appType = 'link', deepLink, apiBase, cacheBuster } = input;

  if (appType === 'native') {
    return deepLink
      ? {
          steps: [{ kind: 'native', src: deepLink, timeoutMs: 0 }],
          error: null,
          canonicalUrl: deepLink,
          punycodeWarning: false,
        }
      : { steps: [], error: 'unsupported', canonicalUrl: null, punycodeWarning: false };
  }

  const normalized = normalizeMiniAppUrl(input.url);
  if (!normalized.ok) {
    return { steps: [], error: normalized.reason, canonicalUrl: null, punycodeWarning: false };
  }

  const target = normalized.url;
  const embed = resolveEmbedUrl(target);
  const proxyStep: OpenStep | null = apiBase
    ? { kind: 'proxy', src: buildProxyUrl(apiBase, target, cacheBuster), timeoutMs: PROXY_TIMEOUT_MS }
    : null;
  const externalStep: OpenStep = { kind: 'external', src: target, timeoutMs: 0 };

  const steps: OpenStep[] = [];

  if (displayMode === 'external' || (appType === 'bot' && !embed)) {
    steps.push(externalStep);
  } else if (displayMode === 'proxy') {
    if (proxyStep) steps.push(proxyStep);
    steps.push(externalStep);
  } else if (displayMode === 'embed') {
    if (embed) steps.push({ kind: 'embed', src: embed, timeoutMs: DIRECT_TIMEOUT_MS });
    if (proxyStep) steps.push(proxyStep);
    steps.push(externalStep);
  } else {
    // 'iframe' va 'webview' (web'da bir xil)
    if (embed) steps.push({ kind: 'embed', src: embed, timeoutMs: DIRECT_TIMEOUT_MS });
    if (!isFramingBlocked(target)) {
      steps.push({ kind: 'direct', src: target, timeoutMs: DIRECT_TIMEOUT_MS });
    }
    if (proxyStep) steps.push(proxyStep);
    steps.push(externalStep);
  }

  return {
    steps,
    error: null,
    canonicalUrl: target,
    punycodeWarning: normalized.punycode,
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
