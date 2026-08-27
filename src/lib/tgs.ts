/**
 * Telegramning haqiqiy animatsion emojilari `.tgs` formatida bo'ladi:
 * bu gzip bilan siqilgan Lottie (Bodymovin) JSON fayli.
 *
 * Bu modul `.tgs` faylni yuklab, gzipdan chiqaradi va Lottie JSON qaytaradi.
 * Gzipdan chiqarish brauzerning o'z `DecompressionStream('gzip')` API'si bilan
 * amalga oshiriladi (Chrome/Edge 80+, Safari 16.4+, Firefox 113+).
 * Qo'shimcha npm paketi (pako/fflate) talab qilinmaydi.
 *
 * MUHIM: loyiha SPA bo'lgani uchun mavjud bo'lmagan `/emoji/tgs/*.tgs` manzili
 * 404 emas, `index.html` (ya'ni "<!doctype html...") qaytaradi. Shuning uchun:
 *  - HTML javob jimgina rad etiladi (konsol to'lmaydi),
 *  - birinchi shunday javobdan keyin lokal `.tgs` to'plami YO'Q deb belgilanadi
 *    va boshqa hech qanday so'rov yuborilmaydi (tarmoq ham bo'shashadi).
 */

const cache = new Map<string, Promise<unknown | null>>();

/** null = hali tekshirilmagan, false = lokal .tgs to'plami yo'q, true = bor */
let localPackAvailable: boolean | null = null;
let warnedOnce = false;

function disableLocalPack() {
  if (localPackAvailable !== false) {
    localPackAvailable = false;
    if (!warnedOnce) {
      warnedOnce = true;
      // Faqat bir marta, xato emas — shunchaki ma'lumot
      console.info(
        "Lokal Telegram .tgs to'plami topilmadi (public/emoji/tgs). Animatsion emoji CDN/fallback orqali ishlaydi."
      );
    }
  }
}

function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 40).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

async function gunzip(buffer: ArrayBuffer): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(buffer);

  // Gzip emas: JSON bo'lsa o'zini qaytaramiz, HTML bo'lsa rad etamiz
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    const first = String.fromCharCode(bytes[0] || 0);
    if (first === '{' || first === '[') return bytes;
    return null;
  }

  const AnyGlobal = globalThis as unknown as { DecompressionStream?: any };
  if (typeof AnyGlobal.DecompressionStream !== 'function') {
    return null;
  }

  try {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new AnyGlobal.DecompressionStream('gzip'));
    const decompressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(decompressed);
  } catch {
    return null;
  }
}

/**
 * `.tgs` (yoki oddiy `.json`) manzilidan Lottie animatsiya ma'lumotini yuklaydi.
 * Natija keshlanadi; topilmasa jimgina `null` qaytaradi.
 */
export function loadTgsAnimation(url: string): Promise<unknown | null> {
  if (localPackAvailable === false) return Promise.resolve(null);

  const cached = cache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) {
        if (response.status === 404) disableLocalPack();
        return null;
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        // SPA fallback: fayl yo'q
        disableLocalPack();
        return null;
      }

      if (url.endsWith('.json')) {
        const text = await response.text();
        if (!text || looksLikeHtml(text)) {
          disableLocalPack();
          return null;
        }
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }

      const buffer = await response.arrayBuffer();
      const raw = await gunzip(buffer);
      if (!raw) {
        disableLocalPack();
        return null;
      }

      const text = new TextDecoder().decode(raw);
      if (looksLikeHtml(text)) {
        disableLocalPack();
        return null;
      }

      try {
        const data = JSON.parse(text);
        localPackAvailable = true;
        return data;
      } catch {
        return null;
      }
    } catch {
      // Tarmoq xatosi — jimgina fallback
      return null;
    }
  })();

  cache.set(url, promise);
  return promise;
}

/** Emojini codepoint ko'rinishiga aylantirish: "1f600" yoki "1f1fa-1f1f8" */
export function emojiToCodepoints(emoji: string): string {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join('-');
}

/**
 * Telegram animatsion emoji uchun mumkin bo'lgan lokal manbalar:
 *   public/emoji/tgs/<codepoints>.tgs | .json
 * To'plam yo'qligi aniqlangan bo'lsa, bo'sh ro'yxat qaytariladi.
 */
export function telegramEmojiCandidates(emoji: string): string[] {
  if (localPackAvailable === false) return [];

  const cp = emojiToCodepoints(emoji);
  const withoutVariation = cp
    .split('-')
    .filter((part) => part !== 'fe0f')
    .join('-');

  const paths = new Set<string>();
  for (const code of [cp, withoutVariation]) {
    paths.add(`/emoji/tgs/${code}.tgs`);
    paths.add(`/emoji/tgs/${code}.json`);
  }
  return Array.from(paths);
}
