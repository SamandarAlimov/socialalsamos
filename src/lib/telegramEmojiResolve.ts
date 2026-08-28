import { normalizeEmojiKey, telegramAnimatedEmojiUrl } from './telegramEmojiCdn';
import { EXTRA_TELEGRAM_EMOJI_PATHS } from './telegramEmojiExtra';
import { notoAnimatedGifUrls, notoAnimatedWebpUrls } from './emojiAssets';

// URL bo'laklab yig'iladi
const CDN_BASE =
  'https://' +
  'cdn.jsdelivr.net/gh/Tarikul-Islam-Anik/Telegram-Animated-Emojis@main';

function toUrl(path: string): string {
  const slash = path.indexOf('/');
  const dir = path.slice(0, slash);
  const name = path.slice(slash + 1);
  return (
    CDN_BASE + '/' + encodeURIComponent(dir) + '/' + encodeURIComponent(name) + '.webp'
  );
}

/**
 * Emoji uchun animatsion fayl manzillari, sifat tartibida:
 *  1. Telegramning o'z animatsion to'plami (nom xaritasi bo'yicha)
 *  2. Noto Animated Emoji `512.webp` - kod-nuqta bo'yicha, deyarli barcha emoji
 *  3. Noto Animated Emoji `512.gif`
 *
 * Shu sababli ro'yxat HECH QACHON bo'sh bo'lmaydi va animatsiya har doim bor.
 */
export function telegramEmojiUrlCandidates(emoji: string): string[] {
  const urls: string[] = [];

  const primary = telegramAnimatedEmojiUrl(emoji);
  if (primary) urls.push(primary);

  const extra = EXTRA_TELEGRAM_EMOJI_PATHS[normalizeEmojiKey(emoji)];
  if (extra) urls.push(toUrl(extra));

  urls.push(...notoAnimatedWebpUrls(emoji));
  urls.push(...notoAnimatedGifUrls(emoji));

  return Array.from(new Set(urls));
}

/**
 * Eng yaxshi animatsion emoji manzili.
 * Avval Telegram to'plami, topilmasa Noto animatsion emojisi.
 */
export function resolveTelegramEmojiUrl(emoji: string): string | null {
  const [first] = telegramEmojiUrlCandidates(emoji);
  return first || null;
}

/** Faqat Telegramning o'z to'plamida bormi? */
export function hasNativeTelegramEmoji(emoji: string): boolean {
  if (telegramAnimatedEmojiUrl(emoji)) return true;
  return Boolean(EXTRA_TELEGRAM_EMOJI_PATHS[normalizeEmojiKey(emoji)]);
}

/** Animatsion emoji mavjudmi (Telegram yoki Noto). */
export function hasTelegramAnimatedEmoji(emoji: string): boolean {
  return telegramEmojiUrlCandidates(emoji).length > 0;
}
