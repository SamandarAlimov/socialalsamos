import type { InlineToken, RichBlock } from '@/lib/richText';

export const RICH_TEXT_DOCUMENT_KIND = 'alsamos-rich-text';
export const RICH_TEXT_DOCUMENT_VERSION = 1;

export interface AlsamosRichTextDocument {
  kind: typeof RICH_TEXT_DOCUMENT_KIND;
  version: typeof RICH_TEXT_DOCUMENT_VERSION;
  /** Stable app-owned render AST. */
  blocks: RichBlock[];
  /** Lexical serialized editor state for future editing/resume. */
  lexical?: unknown;
}

export function isAlsamosRichTextDocument(value: unknown): value is AlsamosRichTextDocument {
  if (!value || typeof value !== 'object') return false;
  const document = value as Partial<AlsamosRichTextDocument>;
  return (
    document.kind === RICH_TEXT_DOCUMENT_KIND &&
    document.version === RICH_TEXT_DOCUMENT_VERSION &&
    Array.isArray(document.blocks)
  );
}

export function normalizeAlsamosRichTextDocument(
  value: unknown,
): AlsamosRichTextDocument | null {
  if (!isAlsamosRichTextDocument(value)) return null;

  const blocks: RichBlock[] = value.blocks
    .filter((block): block is RichBlock => {
      if (!block || typeof block !== 'object') return false;
      const candidate = block as RichBlock;
      return (
        ['paragraph', 'h1', 'h2', 'h3', 'quote', 'bullet'].includes(candidate.type) &&
        Array.isArray(candidate.tokens)
      );
    })
    .map((block) => ({
      type: block.type,
      tokens: block.tokens
        .filter((token): token is InlineToken => Boolean(token) && typeof token.text === 'string')
        .map((token) => ({
          text: token.text,
          bold: Boolean(token.bold) || undefined,
          italic: Boolean(token.italic) || undefined,
          strike: Boolean(token.strike) || undefined,
          underline: Boolean(token.underline) || undefined,
          code: Boolean(token.code) || undefined,
          color: typeof token.color === 'string' ? token.color : undefined,
        })),
    }));

  return {
    kind: RICH_TEXT_DOCUMENT_KIND,
    version: RICH_TEXT_DOCUMENT_VERSION,
    blocks,
    lexical: value.lexical,
  };
}

export function richTextDocumentToPlainText(document: AlsamosRichTextDocument): string {
  return document.blocks
    .map((block) => block.tokens.map((token) => token.text).join(''))
    .join('\n');
}

export function hasRichTextFormatting(document: AlsamosRichTextDocument): boolean {
  return document.blocks.some(
    (block) =>
      block.type !== 'paragraph' ||
      block.tokens.some(
        (token) =>
          token.bold ||
          token.italic ||
          token.strike ||
          token.underline ||
          token.code ||
          Boolean(token.color),
      ),
  );
}
