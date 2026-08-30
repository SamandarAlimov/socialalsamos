import { describe, expect, it } from 'vitest';
import { markersToHtml } from '@/components/chat/RichComposer';

describe('Messages composer WYSIWYG regression', () => {
  it('renders block formatting without exposing transport markers', () => {
    const html = markersToHtml(
      '> quote\n- first\n1. ordered\n# Heading\n## Subheading\n---'
    );

    expect(html).toContain('data-block="quote"');
    expect(html).toContain('data-block="bullet"');
    expect(html).toContain('data-block="ordered"');
    expect(html).toContain('data-block="heading1"');
    expect(html).toContain('data-block="heading2"');
    expect(html).toContain('data-block="divider"');
    expect(html).not.toContain('> quote');
    expect(html).not.toContain('- first');
    expect(html).not.toContain('1. ordered');
    expect(html).not.toContain('# Heading');
  });

  it('renders inline markers as actual formatting tags', () => {
    const html = markersToHtml(
      '**bold** __italic__ ++underline++ ~~strike~~ `code` ||spoiler||'
    );

    expect(html).toContain('<b>bold</b>');
    expect(html).toContain('<i>italic</i>');
    expect(html).toContain('<u>underline</u>');
    expect(html).toContain('<s>strike</s>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('data-spoiler="true"');
  });
});
