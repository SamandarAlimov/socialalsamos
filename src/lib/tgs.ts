/**
 * Telegramning haqiqiy animatsion emojilari `.tgs` formatida bo'ladi:
 * bu gzip bilan siqilgan Lottie (Bodymovin) JSON fayli.
 *
 * Bu modul `.tgs` faylni yuklab, gzipdan chiqaradi va Lottie JSON qaytaradi.
 * Brauzerda `DecompressionStream('gzip')` ishlatiladi (Chrome/Edge/Safari 16.4+),
 * qo'llab-quvvatlanmasa `fflate` yoki `pako` (agar loyihada bo'lsa) ishlatiladi.
 */

const cache = new Map<string, Promise<unknown | null>>();

async function gunzip(buffer: ArrayBuffer): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(buffer);

  // Fayl gzip emas (allaqachon JSON) bo'lsa, o'zini qaytaramiz
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes;

  const AnyWindow = globalThis as unknown as { DecompressionStream?: any };
  if (typeof AnyWindow.DecompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(
        new AnyWindow.DecompressionStream('gzip')
      );
      const decompressed = await new Response(stream).arrayBuffer();
      return new Uint8Array(decompressed);
    } catch (error) {
      console.warn('DecompressionStream ishlamadi, zaxira usul sinaladi', error);
    }
  }

  // Zaxira: fflate / pako (agar o'rnatilgan bo'lsa)
  try {
    const fflate: any = await import(/* @vite-ignore */ 'fflate');
    return fflate.gunzipSync(bytes);
  } catch {
    // e'tiborsiz
  }
  try {
    const pako: any = await import(/* @vite-ignore */ 'pako');
    return pako.ungzip(bytes);
  } catch {
    return null;
  }
}

/**
 * `.tgs` (yoki oddiy `.json`) manzilidan Lottie animatsiya ma'lumotini yuklaydi.
 * Natija keshlanadi, xatolik bo'lsa `null` qaytaradi.
 */
export function loadTgsAnimation(url: string): Promise<unknown | null> {
  const cached = cache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) return null;

      if (url.endsWith('.json')) {
        return await response.json();
      }

      const buffer = await response.arrayBuffer();
      const raw = await gunzip(buffer);
      if (!raw) return null;
      const text = new TextDecoder().decode(raw);
      return JSON.parse(text);
    } catch (error) {
      console.warn('TGS emojini yuklab bo\u2018lmadi:', url, error);
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
 * Telegram animatsion emoji uchun mumkin bo'lgan manbalar.
 * Birinchi navbatda loyihaning o'zidagi Telegram to'plami tekshiriladi:
 *   public/emoji/tgs/<codepoints>.tgs
 */
export function telegramEmojiCandidates(emoji: string): string[] {
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
