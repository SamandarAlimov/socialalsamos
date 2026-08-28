/**
 * Emoji asset resolution.
 *
 * MUHIM: bu yerda LOKAL fayllar (`/emoji/animated/...`, `/emoji/static/...`)
 * so'ralmaydi. Sabab: SPA hostingda (Vercel) mavjud bo'lmagan static path
 * `index.html` qaytaradi -> `<img>` "yuklandi" deb hisoblab, buzilgan rasm
 * ko'rsatishi yoki keraksiz 404/HTML javoblar oqimi paydo bo'lishi mumkin.
 * Shu sababli faqat kod-nuqta (codepoint) bo'yicha ishlaydigan CDN'lar:
 *
 *  1. Noto Animated Emoji (`512.webp`) - HAR BIR emoji uchun animatsiya,
 *     nom xaritasi kerak emas.
 *  2. Noto Animated Emoji (`512.gif`) - webp qo'llab-quvvatlanmasa.
 *  3. Apple emoji to'plami (statik) - Telegram Web/Desktop ko'rinishi.
 *  4. Tizim glifi (`<AnimatedEmoji />` ichida).
 */

const NOTO_BASE = 'https://' + 'fonts.gstatic.com/s/e/notoemoji/latest';
const APPLE_BASE =
  'https://' + 'cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64';

/** Emoji klasterining xom kod-nuqtalari, kichik harfli hex. */
export function codepoints(emoji: string): string[] {
  return Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
}

/** Noto `_` bilan ajratadi; FE0F bilan va FE0F'siz variantlar. */
export function notoSlugs(emoji: string): string[] {
  const points = codepoints(emoji);
  const full = points.join('_');
  const stripped = points.filter((p) => p !== 'fe0f').join('_');
  const slugs = [full];
  if (stripped && stripped !== full) slugs.push(stripped);
  return slugs;
}

/** emoji-datasource (Apple / Telegram ko'rinishi) `-` bilan ajratadi. */
export function appleSlugs(emoji: string): string[] {
  const points = codepoints(emoji);
  const stripped = points.filter((p) => p !== 'fe0f').join('-');
  const full = points.join('-');
  return Array.from(new Set([stripped, full].filter(Boolean)));
}

/** Noto animatsion `.webp` manzillari (asosiy animatsiya manbasi). */
export function notoAnimatedWebpUrls(emoji: string): string[] {
  return notoSlugs(emoji).map((cp) => NOTO_BASE + '/' + cp + '/512.webp');
}

/** Noto animatsion `.gif` manzillari (webp ishlamasa). */
export function notoAnimatedGifUrls(emoji: string): string[] {
  return notoSlugs(emoji).map((cp) => NOTO_BASE + '/' + cp + '/512.gif');
}

/** Apple statik `.png` manzillari. */
export function appleStaticUrls(emoji: string): string[] {
  return appleSlugs(emoji).map((cp) => APPLE_BASE + '/' + cp + '.png');
}

/** Animatsion emoji uchun tartiblangan manzillar ro'yxati. */
export function animatedEmojiCandidates(emoji: string): string[] {
  return [
    ...notoAnimatedWebpUrls(emoji),
    ...notoAnimatedGifUrls(emoji),
    ...appleStaticUrls(emoji),
  ];
}

/**
 * Statik glif uchun tartiblangan manzillar.
 * Apple to'plami birinchi: Telegram xabar matnida shu ko'rinish ishlatiladi.
 */
export function staticEmojiCandidates(emoji: string): string[] {
  return [...appleStaticUrls(emoji), ...notoAnimatedWebpUrls(emoji)];
}

/** Lottie JSON manzili (katta yakka emoji uchun yuqori sifatli o'ynatish). */
export function lottieEmojiUrl(emoji: string): string {
  return NOTO_BASE + '/' + notoSlugs(emoji)[0] + '/lottie.json';
}

/** Lottie JSON uchun barcha ehtimoliy manzillar. */
export function lottieEmojiUrls(emoji: string): string[] {
  return notoSlugs(emoji).map((cp) => NOTO_BASE + '/' + cp + '/lottie.json');
}
