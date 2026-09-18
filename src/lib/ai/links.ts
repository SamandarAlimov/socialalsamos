export type HttpUrlToken =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string; href: string };

const WEB_URL_RE =
  /(?:https?:\/\/|www\.)[^\s<>"'`]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:com|org|net|io|ai|app|dev|co|uz|ru|me|info|biz|xyz|site|online|tech|store|cloud|gg|tv|ly|so|sh|pro|edu|gov|uk|de|fr|jp|cn|in|ca|au|us|eu|travel|museum|agency|shop|world|news|live|design|space|website|company|finance|digital|solutions)(?::\d{2,5})?(?:\/[^\s<>"'`]*)?/gi;

function trimTrailingPunctuation(raw: string): { url: string; suffix: string } {
  let url = raw;
  let suffix = '';

  while (/[.,;!?]$/.test(url)) {
    suffix = url.slice(-1) + suffix;
    url = url.slice(0, -1);
  }

  const pairs: Array<[string, string]> = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ];

  for (const [open, close] of pairs) {
    while (url.endsWith(close)) {
      const opens = [...url].filter((char) => char === open).length;
      const closes = [...url].filter((char) => char === close).length;
      if (closes <= opens) break;
      suffix = close + suffix;
      url = url.slice(0, -1);
    }
  }

  return { url, suffix };
}

function normalizedHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function tokenizeHttpUrls(text: string): HttpUrlToken[] {
  if (!text) return [{ type: 'text', value: '' }];

  const tokens: HttpUrlToken[] = [];
  WEB_URL_RE.lastIndex = 0;
  let cursor = 0;

  for (const match of text.matchAll(WEB_URL_RE)) {
    const start = match.index ?? 0;
    const previous = start > 0 ? text[start - 1] : '';

    // Do not turn the domain part of an email address into a standalone link.
    if (previous === '@') continue;

    if (start > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, start) });
    }

    const raw = match[0];
    const { url, suffix } = trimTrailingPunctuation(raw);
    if (url) tokens.push({ type: 'url', value: url, href: normalizedHref(url) });
    if (suffix) tokens.push({ type: 'text', value: suffix });

    cursor = start + raw.length;
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', value: text.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', value: text }];
}

export function detectHttpUrls(text: string): string[] {
  return Array.from(
    new Set(
      tokenizeHttpUrls(text)
        .filter((token): token is Extract<HttpUrlToken, { type: 'url' }> => token.type === 'url')
        .map((token) => token.href),
    ),
  );
}
