import { tokenizeHttpUrls } from '@/lib/ai/links';

export type RichTextLinkToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'link'; href: string; value: string; label?: string; internalPath: string | null };

const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const SOCIAL_TOKEN_RE = /(@[A-Za-z0-9_]+)|(#[\p{L}\p{N}_]+)/gu;

function normalizeWholeWebTarget(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const tokens = tokenizeHttpUrls(value);
  if (
    tokens.length === 1 &&
    tokens[0].type === 'url' &&
    tokens[0].value === value
  ) {
    return tokens[0].href;
  }

  return null;
}

export function resolveAlsamosInternalPath(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (hostname !== 'alsamos.com' && hostname !== 'www.alsamos.com') return null;

    const path = `${url.pathname || '/'}${url.search}${url.hash}`;
    return path === '/' ? '/home' : path;
  } catch {
    return null;
  }
}

function pushSocialTokens(target: RichTextLinkToken[], text: string) {
  if (!text) return;

  SOCIAL_TOKEN_RE.lastIndex = 0;
  let cursor = 0;

  for (const match of text.matchAll(SOCIAL_TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      target.push({ type: 'text', value: text.slice(cursor, start) });
    }

    if (match[1]) {
      target.push({ type: 'mention', value: match[1].slice(1) });
    } else if (match[2]) {
      target.push({ type: 'hashtag', value: match[2].slice(1) });
    }

    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    target.push({ type: 'text', value: text.slice(cursor) });
  }
}

function pushPlainSegment(target: RichTextLinkToken[], text: string) {
  if (!text) return;

  for (const token of tokenizeHttpUrls(text)) {
    if (token.type === 'url') {
      target.push({
        type: 'link',
        href: token.href,
        value: token.value,
        internalPath: resolveAlsamosInternalPath(token.href),
      });
    } else {
      pushSocialTokens(target, token.value);
    }
  }
}

/**
 * Tokenizes comments/posts without executing HTML.
 *
 * Supports:
 * - https://example.com
 * - http://example.com
 * - example.com / www.example.com
 * - [label](https://example.com)
 * - @mentions and #hashtags
 *
 * Alsamos canonical links are marked with an internalPath so React Router can
 * navigate without a page reload or leaving the platform.
 */
export function tokenizeRichTextLinks(text: string): RichTextLinkToken[] {
  if (!text) return [];

  const tokens: RichTextLinkToken[] = [];
  MARKDOWN_LINK_RE.lastIndex = 0;
  let cursor = 0;

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const target = normalizeWholeWebTarget(match[2]);
    if (!target) continue;

    const start = match.index ?? 0;
    if (start > cursor) {
      pushPlainSegment(tokens, text.slice(cursor, start));
    }

    tokens.push({
      type: 'link',
      href: target,
      value: match[2],
      label: match[1],
      internalPath: resolveAlsamosInternalPath(target),
    });

    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    pushPlainSegment(tokens, text.slice(cursor));
  }

  return tokens;
}
