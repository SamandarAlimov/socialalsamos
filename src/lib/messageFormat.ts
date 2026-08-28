/**
 * Telegram uslubidagi matn formatlash va "maqola" (article) formati.
 *
 * Qo'llab-quvvatlanadigan inline belgilar:
 *   **qalin**            -> bold
 *   __kursiv__           -> italic
 *   ++tagi chizilgan++   -> underline
 *   ~~o'chirilgan~~      -> strikethrough
 *   `kod`                -> monospace
 *   ||spoiler||          -> yashirin matn
 *   [nomi](https://...)  -> havola
 *
 * Blok belgilari:
 *   # Sarlavha / ## Kichik sarlavha
 *   > iqtibos
 *   - ro'yxat / 1. raqamli ro'yxat
 *   ``` kod bloki ```
 *   ---  -> ajratuvchi chiziq
 */

export type InlineNodeType =
  | 'text'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'spoiler'
  | 'link';

export interface InlineNode {
  type: InlineNodeType;
  text?: string;
  href?: string;
  children?: InlineNode[];
}

export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'quote'
  | 'bullet'
  | 'ordered'
  | 'pre'
  | 'divider';

export interface Block {
  type: BlockType;
  text: string;
  language?: string;
  index?: number;
}

interface InlinePattern {
  type: InlineNodeType;
  regex: RegExp;
  raw?: boolean;
}

// Tartib muhim: avval kod va spoiler, keyin qolganlari
const INLINE_PATTERNS: InlinePattern[] = [
  { type: 'code', regex: /`([^`\n]+)`/, raw: true },
  { type: 'spoiler', regex: /\|\|([\s\S]+?)\|\|/ },
  { type: 'bold', regex: /\*\*([\s\S]+?)\*\*/ },
  { type: 'italic', regex: /__([\s\S]+?)__/ },
  { type: 'underline', regex: /\+\+([\s\S]+?)\+\+/ },
  { type: 'strike', regex: /~~([\s\S]+?)~~/ },
];

const LINK_REGEX = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/;

/** Matnni inline formatlash daraxtiga aylantiradi */
export function parseInline(text: string): InlineNode[] {
  if (!text) return [];

  let best: {
    index: number;
    length: number;
    node: InlineNode;
  } | null = null;

  const linkMatch = LINK_REGEX.exec(text);
  if (linkMatch) {
    best = {
      index: linkMatch.index,
      length: linkMatch[0].length,
      node: { type: 'link', href: linkMatch[2], children: parseInline(linkMatch[1]) },
    };
  }

  for (const pattern of INLINE_PATTERNS) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    if (best && match.index >= best.index) continue;

    best = {
      index: match.index,
      length: match[0].length,
      node: pattern.raw
        ? { type: pattern.type, text: match[1] }
        : { type: pattern.type, children: parseInline(match[1]) },
    };
  }

  if (!best) {
    return [{ type: 'text', text }];
  }

  const nodes: InlineNode[] = [];
  if (best.index > 0) {
    nodes.push({ type: 'text', text: text.slice(0, best.index) });
  }
  nodes.push(best.node);

  const rest = text.slice(best.index + best.length);
  if (rest) nodes.push(...parseInline(rest));

  return nodes;
}

/** Matnni bloklarga ajratadi (maqola va iqtiboslar uchun) */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  if (!text) return blocks;

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  let orderedIndex = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    // Kod bloki
    if (trimmed.startsWith('```')) {
      flushParagraph();
      const language = trimmed.slice(3).trim();
      const buffer: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buffer.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'pre', text: buffer.join('\n'), language: language || undefined });
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      orderedIndex = 0;
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      flushParagraph();
      blocks.push({ type: 'divider', text: '' });
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      blocks.push({ type: 'heading2', text: trimmed.slice(3).trim() });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushParagraph();
      blocks.push({ type: 'heading1', text: trimmed.slice(2).trim() });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      blocks.push({ type: 'quote', text: trimmed.slice(2).trim() });
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph();
      blocks.push({ type: 'bullet', text: trimmed.slice(2).trim() });
      continue;
    }

    const orderedMatch = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      orderedIndex += 1;
      blocks.push({ type: 'ordered', text: orderedMatch[2], index: Number(orderedMatch[1]) || orderedIndex });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

/** Formatlash belgilarini olib tashlaydi (chat ro'yxatidagi preview uchun) */
export function stripFormatting(text: string): string {
  if (!text) return '';

  return text
    .replace(LINK_REGEX, '$1')
    .replace(/[`]{1,3}/g, '')
    .replace(/\|\|/g, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\+\+/g, '')
    .replace(/~~/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s+/gm, '')
    .trim();
}

/** Formatlash belgisi bormi? */
export function hasFormatting(text: string): boolean {
  if (!text) return false;
  return stripFormatting(text) !== text.trim();
}

/* ------------------------------ Maqola (article) ------------------------------ */

export const ARTICLE_PREFIX = '[ARTICLE]';
export const ARTICLE_SUFFIX = '[/ARTICLE]';

export interface ArticleData {
  title: string;
  body: string;
  cover?: string | null;
  createdAt?: string;
}

const ARTICLE_REGEX = /\[ARTICLE\]([\s\S]*?)\[\/ARTICLE\]/;

export function buildArticlePayload(article: ArticleData): string {
  const payload: ArticleData = {
    title: article.title.trim(),
    body: article.body,
    cover: article.cover || null,
    createdAt: article.createdAt || new Date().toISOString(),
  };

  return ARTICLE_PREFIX + JSON.stringify(payload) + ARTICLE_SUFFIX;
}

export function parseArticlePayload(content: string): ArticleData | null {
  if (!content) return null;

  const match = ARTICLE_REGEX.exec(content);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as Partial<ArticleData>;
    if (!parsed || typeof parsed.body !== 'string') return null;

    return {
      title: (parsed.title || 'Maqola').toString(),
      body: parsed.body,
      cover: parsed.cover || null,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function isArticleMessage(content: string): boolean {
  return Boolean(content) && ARTICLE_REGEX.test(content);
}

/** Taxminiy o'qish vaqti (daqiqa) */
export function estimateReadingMinutes(body: string): number {
  const words = stripFormatting(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

/** Maqoladan qisqa parcha */
export function articleExcerpt(body: string, maxLength = 140): string {
  const clean = stripFormatting(body).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1).trimEnd() + '\u2026';
}

/* ------------------------------ Toolbar yordamchilari ------------------------------ */

export interface WrapResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Tanlangan matnni belgilar bilan o'rab qo'yadi (masalan ** ... **) */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  marker: string,
  markerEnd?: string,
): WrapResult {
  const closing = markerEnd || marker;
  const selected = value.slice(start, end) || 'matn';
  const next = value.slice(0, start) + marker + selected + closing + value.slice(end);

  return {
    value: next,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + selected.length,
  };
}

/** Qator boshiga prefiks qo'yadi (iqtibos, ro'yxat, sarlavha) */
export function prefixLine(value: string, start: number, prefix: string): WrapResult {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);

  return {
    value: next,
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length,
  };
}
