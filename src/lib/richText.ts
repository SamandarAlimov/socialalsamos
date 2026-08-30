/**
 * Postlarni formatlash: qalin, qiya, chizilgan, tagi chizilgan, kod,
 * sarlavha (head) va rangli matn.
 *
 * Format sintaksisi (matnda saqlanadi, xavfsiz — HTML emas):
 *   **qalin**            _qiya_            ~~chizilgan~~
 *   __tagi chizilgan__   `kod`             # Sarlavha (satr boshida)
 *   {c:red}rangli matn{/c}
 */

export type InlineFormat = 'bold' | 'italic' | 'strike' | 'underline' | 'code';
export type BlockFormat = 'h1' | 'h2' | 'h3' | 'quote' | 'bullet';

export const TEXT_COLORS = [
  { id: 'red', label: 'Qizil', className: 'text-red-500', cssValue: '#ef4444' },
  { id: 'orange', label: 'Zarg\u2018aldoq', className: 'text-orange-500', cssValue: '#f97316' },
  { id: 'yellow', label: 'Sariq', className: 'text-yellow-500', cssValue: '#eab308' },
  { id: 'green', label: 'Yashil', className: 'text-green-500', cssValue: '#22c55e' },
  { id: 'blue', label: 'Ko\u2018k', className: 'text-blue-500', cssValue: '#3b82f6' },
  { id: 'purple', label: 'Binafsha', className: 'text-purple-500', cssValue: '#a855f7' },
  { id: 'pink', label: 'Pushti', className: 'text-pink-500', cssValue: '#ec4899' },
] as const;

export type TextColorId = (typeof TEXT_COLORS)[number]['id'];

const COLOR_CLASS = new Map<string, string>(TEXT_COLORS.map((c) => [c.id, c.className]));

export function colorClassName(id: string): string {
  return COLOR_CLASS.get(id) ?? '';
}

const INLINE_WRAPPERS: Record<InlineFormat, string> = {
  bold: '**',
  italic: '_',
  strike: '~~',
  underline: '__',
  code: '`',
};

export interface FormatEditResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Tanlangan matnga inline formatni qo'llaydi yoki olib tashlaydi (toggle).
 * Hech narsa tanlanmagan bo'lsa, kursor o'rniga bo'sh belgilar juftini qo'yadi.
 */
export function toggleInlineFormat(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: InlineFormat,
): FormatEditResult {
  const marker = INLINE_WRAPPERS[format];
  const len = marker.length;
  const selected = text.slice(selectionStart, selectionEnd);

  const before = text.slice(Math.max(0, selectionStart - len), selectionStart);
  const after = text.slice(selectionEnd, selectionEnd + len);

  // Allaqachon formatlangan bo'lsa - olib tashlaymiz
  if (before === marker && after === marker) {
    return {
      text: text.slice(0, selectionStart - len) + selected + text.slice(selectionEnd + len),
      selectionStart: selectionStart - len,
      selectionEnd: selectionEnd - len,
    };
  }

  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length > len * 2) {
    const inner = selected.slice(len, -len);
    return {
      text: text.slice(0, selectionStart) + inner + text.slice(selectionEnd),
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  const wrapped = `${marker}${selected}${marker}`;
  return {
    text: text.slice(0, selectionStart) + wrapped + text.slice(selectionEnd),
    selectionStart: selectionStart + len,
    selectionEnd: selectionStart + len + selected.length,
  };
}

/** Tanlangan matnni rangga o'raydi. */
export function applyTextColor(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  color: TextColorId,
): FormatEditResult {
  const selected = text.slice(selectionStart, selectionEnd);
  const open = `{c:${color}}`;
  const wrapped = `${open}${selected}{/c}`;
  return {
    text: text.slice(0, selectionStart) + wrapped + text.slice(selectionEnd),
    selectionStart: selectionStart + open.length,
    selectionEnd: selectionStart + open.length + selected.length,
  };
}

const BLOCK_PREFIX: Record<BlockFormat, string> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  quote: '> ',
  bullet: '- ',
};

/** Kursor turgan satrga blok formatini qo'yadi/olib tashlaydi. */
export function toggleBlockFormat(
  text: string,
  selectionStart: number,
  format: BlockFormat,
): FormatEditResult {
  const lineStart = text.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const lineEndRaw = text.indexOf('\n', selectionStart);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  const line = text.slice(lineStart, lineEnd);
  const prefix = BLOCK_PREFIX[format];

  // Boshqa blok prefikslarini tozalaymiz
  const stripped = line.replace(/^(#{1,3}\s|>\s|-\s)/, '');
  const nextLine = line.startsWith(prefix) ? stripped : prefix + stripped;
  const delta = nextLine.length - line.length;

  return {
    text: text.slice(0, lineStart) + nextLine + text.slice(lineEnd),
    selectionStart: Math.max(lineStart, selectionStart + delta),
    selectionEnd: Math.max(lineStart, selectionStart + delta),
  };
}

// ---------------------------------------------------------------------------
// Tokenizer — render uchun
// ---------------------------------------------------------------------------

export interface InlineToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
}

export interface RichBlock {
  type: 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet';
  tokens: InlineToken[];
}

const INLINE_PATTERN = /(\*\*)([\s\S]+?)\1|(__)([\s\S]+?)\3|(~~)([\s\S]+?)\5|(`)([^`]+?)\7|_([^_\n]+?)_|\{c:([a-z]+)\}([\s\S]*?)\{\/c\}/g;

function tokenizeInline(input: string, inherited: Omit<InlineToken, 'text'> = {}): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ ...inherited, text: input.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined) {
      tokens.push(...tokenizeInline(match[2], { ...inherited, bold: true }));
    } else if (match[4] !== undefined) {
      tokens.push(...tokenizeInline(match[4], { ...inherited, underline: true }));
    } else if (match[6] !== undefined) {
      tokens.push(...tokenizeInline(match[6], { ...inherited, strike: true }));
    } else if (match[8] !== undefined) {
      tokens.push({ ...inherited, text: match[8], code: true });
    } else if (match[9] !== undefined) {
      tokens.push(...tokenizeInline(match[9], { ...inherited, italic: true }));
    } else if (match[11] !== undefined) {
      tokens.push(...tokenizeInline(match[11], { ...inherited, color: match[10] }));
    }

    lastIndex = INLINE_PATTERN.lastIndex;
  }

  if (lastIndex < input.length) {
    tokens.push({ ...inherited, text: input.slice(lastIndex) });
  }

  return tokens.filter((token) => token.text.length > 0);
}

/** Formatlangan matnni render qilinadigan bloklarga ajratadi. */
export function parseRichText(content: string): RichBlock[] {
  if (!content) return [];

  return content.split('\n').map<RichBlock>((line) => {
    if (line.startsWith('### ')) return { type: 'h3', tokens: tokenizeInline(line.slice(4)) };
    if (line.startsWith('## ')) return { type: 'h2', tokens: tokenizeInline(line.slice(3)) };
    if (line.startsWith('# ')) return { type: 'h1', tokens: tokenizeInline(line.slice(2)) };
    if (line.startsWith('> ')) return { type: 'quote', tokens: tokenizeInline(line.slice(2)) };
    if (line.startsWith('- ')) return { type: 'bullet', tokens: tokenizeInline(line.slice(2)) };
    return { type: 'paragraph', tokens: tokenizeInline(line) };
  });
}

/** Formatlash belgilarini olib tashlab, sof matn qaytaradi (preview/qidiruv uchun). */
export function stripRichText(content: string): string {
  return parseRichText(content)
    .map((block) => block.tokens.map((token) => token.text).join(''))
    .join('\n');
}
