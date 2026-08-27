/**
 * Telegram-grade emoji asset resolution.
 *
 * Resolution order (each step falls back to the next on load error):
 *  1. Local override folder  -> `public/emoji/animated/<cp>.webp|gif`
 *     Drop Telegram's open-source animated emoji here (converted TGS -> webp/gif)
 *     and they are used automatically, no code change needed.
 *  2. Noto Animated Emoji CDN (full animated coverage).
 *  3. Apple emoji set (the exact glyph style Telegram Desktop / Web use).
 *  4. Native system glyph (handled by <AnimatedEmoji />).
 */

const NOTO_CDN = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
const APPLE_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64';

const LOCAL_ANIMATED = '/emoji/animated';
const LOCAL_STATIC = '/emoji/static';

/** Raw codepoints of an emoji cluster, lowercase hex. */
export function codepoints(emoji: string): string[] {
  return Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
}

/** Noto uses `_` separated codepoints, both with and without FE0F. */
export function notoSlugs(emoji: string): string[] {
  const points = codepoints(emoji);
  const full = points.join('_');
  const stripped = points.filter((p) => p !== 'fe0f').join('_');
  return full === stripped ? [full] : [full, stripped];
}

/** emoji-datasource (Apple / Telegram look) uses `-` separated codepoints. */
export function appleSlugs(emoji: string): string[] {
  const points = codepoints(emoji);
  const stripped = points.filter((p) => p !== 'fe0f').join('-');
  const full = points.join('-');
  return Array.from(new Set([stripped, full]));
}

/** Ordered candidate URLs for an animated emoji. */
export function animatedEmojiCandidates(emoji: string): string[] {
  const noto = notoSlugs(emoji);
  const apple = appleSlugs(emoji);
  return [
    ...noto.map((cp) => `${LOCAL_ANIMATED}/${cp}.webp`),
    ...noto.map((cp) => `${LOCAL_ANIMATED}/${cp}.gif`),
    ...noto.map((cp) => `${NOTO_CDN}/${cp}/512.gif`),
    ...apple.map((cp) => `${APPLE_CDN}/${cp}.png`),
    ...apple.map((cp) => `${LOCAL_STATIC}/${cp}.png`),
  ];
}

/**
 * Ordered candidate URLs for a static emoji glyph.
 * Apple set first: this is what Telegram renders inside message text.
 */
export function staticEmojiCandidates(emoji: string): string[] {
  const apple = appleSlugs(emoji);
  const noto = notoSlugs(emoji);
  return [
    ...apple.map((cp) => `${LOCAL_STATIC}/${cp}.png`),
    ...apple.map((cp) => `${APPLE_CDN}/${cp}.png`),
    ...noto.map((cp) => `${NOTO_CDN}/${cp}/512.gif`),
  ];
}

/** Lottie JSON url (high fidelity playback for large single emoji). */
export function lottieEmojiUrl(emoji: string): string {
  return `${NOTO_CDN}/${notoSlugs(emoji)[0]}/lottie.json`;
}
