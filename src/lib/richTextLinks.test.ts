import { describe, expect, it } from 'vitest';

import {
  resolveAlsamosInternalPath,
  tokenizeRichTextLinks,
} from './richTextLinks';

describe('rich text comment links', () => {
  it('linkifies https, http and bare domains', () => {
    const links = tokenizeRichTextLinks(
      'https://alsamos.com http://alsamos.com alsamos.com',
    ).filter((token) => token.type === 'link');

    expect(links).toHaveLength(3);
    expect(links.map((token) => token.href)).toEqual([
      'https://alsamos.com',
      'http://alsamos.com',
      'https://alsamos.com',
    ]);
  });

  it('supports markdown-style links without leaving markdown punctuation behind', () => {
    const tokens = tokenizeRichTextLinks(
      '[Postni ochish](https://www.alsamos.com/post/c005e68a-8d55-440e-a354-6bcec74ee177)',
    );

    expect(tokens).toEqual([
      {
        type: 'link',
        href: 'https://www.alsamos.com/post/c005e68a-8d55-440e-a354-6bcec74ee177',
        value: 'https://www.alsamos.com/post/c005e68a-8d55-440e-a354-6bcec74ee177',
        label: 'Postni ochish',
        internalPath: '/post/c005e68a-8d55-440e-a354-6bcec74ee177',
      },
    ]);
  });

  it('routes Alsamos post, product and map links inside the SPA', () => {
    expect(
      resolveAlsamosInternalPath(
        'https://www.alsamos.com/post/c005e68a-8d55-440e-a354-6bcec74ee177',
      ),
    ).toBe('/post/c005e68a-8d55-440e-a354-6bcec74ee177');

    expect(
      resolveAlsamosInternalPath(
        'https://alsamos.com/marketplace/product/abc?variant=black#reviews',
      ),
    ).toBe('/marketplace/product/abc?variant=black#reviews');

    expect(
      resolveAlsamosInternalPath('https://alsamos.com/map?place=123'),
    ).toBe('/map?place=123');
  });

  it('keeps external sites external and does not linkify email domains', () => {
    expect(resolveAlsamosInternalPath('https://example.com/post/1')).toBeNull();

    const tokens = tokenizeRichTextLinks('mail user@example.com');
    expect(tokens.some((token) => token.type === 'link')).toBe(false);
  });
});
