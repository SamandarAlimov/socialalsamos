import { describe, expect, it } from 'vitest';

import { detectHttpUrls, tokenizeHttpUrls } from './links';

describe('AI web link detection', () => {
  it('recognizes bare domains and normalizes them to HTTPS', () => {
    expect(detectHttpUrls('alsamos.com github.com chatgpt.com')).toEqual([
      'https://alsamos.com',
      'https://github.com',
      'https://chatgpt.com',
    ]);
  });

  it('preserves explicit schemes and paths', () => {
    expect(detectHttpUrls('https://alsamos.com/ai and github.com/openai')).toEqual([
      'https://alsamos.com/ai',
      'https://github.com/openai',
    ]);
  });

  it('does not linkify the domain portion of an email address', () => {
    expect(detectHttpUrls('mail me at user@example.com')).toEqual([]);
  });

  it('keeps punctuation outside the clickable token', () => {
    const tokens = tokenizeHttpUrls('Open chatgpt.com, then alsamos.com.');
    expect(tokens).toEqual([
      { type: 'text', value: 'Open ' },
      { type: 'url', value: 'chatgpt.com', href: 'https://chatgpt.com' },
      { type: 'text', value: ', then ' },
      { type: 'url', value: 'alsamos.com', href: 'https://alsamos.com' },
      { type: 'text', value: '.' },
    ]);
  });
});
