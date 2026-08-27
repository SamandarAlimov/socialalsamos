/**
 * Telegram emoji sizing rules.
 *
 * Telegram renders a message that contains nothing but emoji without a bubble,
 * and scales the glyphs down as the count grows:
 *   1 emoji  -> very large (animated)
 *   2 emoji  -> large
 *   3 emoji  -> medium
 *   4+ emoji -> normal inline text size (regular bubble)
 */

const EMOJI_CHAR =
  /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator})/u;

const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{Emoji_Modifier_Base}|[\u200d\ufe0f\ufe0e\u20e3\u0023\u002a\u0030-\u0039\s])+$/u;

/** Split a string into grapheme clusters (emoji-safe). */
export function splitGraphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: 'grapheme' });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  // Fallback: keep ZWJ sequences and variation selectors together
  return text.match(/(\P{Mark}\p{Mark}*(?:\u200d\P{Mark}\p{Mark}*)*|.)/gu) ?? Array.from(text);
}

export interface EmojiOnlyInfo {
  emojis: string[];
  /** Rendered pixel size for each emoji. */
  size: number;
}

/**
 * Returns emoji-only rendering info, or `null` when the message should be
 * rendered as a normal text bubble.
 */
export function getEmojiOnlyInfo(content: string | null | undefined): EmojiOnlyInfo | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 40) return null;
  if (!EMOJI_CHAR.test(trimmed)) return null;
  if (!EMOJI_ONLY.test(trimmed)) return null;

  const emojis = splitGraphemes(trimmed).filter((g) => g.trim().length > 0);
  if (emojis.length === 0 || emojis.length > 3) return null;

  const size = emojis.length === 1 ? 100 : emojis.length === 2 ? 72 : 56;
  return { emojis, size };
}

export type InlinePart = { type: 'text' | 'emoji'; value: string };

/** Split plain text into text / emoji runs so emoji can be rendered as images. */
export function splitInlineEmoji(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let buffer = '';

  for (const g of splitGraphemes(text)) {
    if (EMOJI_CHAR.test(g)) {
      if (buffer) {
        parts.push({ type: 'text', value: buffer });
        buffer = '';
      }
      parts.push({ type: 'emoji', value: g });
    } else {
      buffer += g;
    }
  }
  if (buffer) parts.push({ type: 'text', value: buffer });
  return parts;
}
