import { normalizeEmojiKey, telegramAnimatedEmojiUrl } from './telegramEmojiCdn';
import { EXTRA_TELEGRAM_EMOJI_PATHS } from './telegramEmojiExtra';

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
 * Telegramning haqiqiy animatsion emoji faylini qaytaradi.
 * Avval asosiy xarita (Smileys/People/Symbols), keyin qo'shimcha xarita
 * (Animals/Food/Activity/Travel) tekshiriladi. Topilmasa `null`.
 */
export function resolveTelegramEmojiUrl(emoji: string): string | null {
  const primary = telegramAnimatedEmojiUrl(emoji);
  if (primary) return primary;

  const path = EXTRA_TELEGRAM_EMOJI_PATHS[normalizeEmojiKey(emoji)];
  return path ? toUrl(path) : null;
}

/** Shu emoji Telegram to'plamida bormi? */
export function hasTelegramAnimatedEmoji(emoji: string): boolean {
  return resolveTelegramEmojiUrl(emoji) !== null;
}
