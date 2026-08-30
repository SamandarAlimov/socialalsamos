import { describe, expect, it } from 'vitest';
import { resolveAttachmentFileName } from './attachmentPreview';

describe('attachment chat-list file names', () => {
  it('prefers the first-class original filename', () => {
    expect(resolveAttachmentFileName({
      media_file_name: 'TAQDIMOT 2-mavsum.pptx',
      media_url: 'https://example.com/random.bin',
      metadata: { file_name: 'fallback.pdf' },
    })).toBe('TAQDIMOT 2-mavsum.pptx');
  });

  it('reads Flutter canonical file_name metadata', () => {
    expect(resolveAttachmentFileName({
      metadata: { file_name: 'Shartnoma 2026.pdf' },
    })).toBe('Shartnoma 2026.pdf');
  });

  it('recovers legacy web storage filenames', () => {
    expect(resolveAttachmentFileName({
      media_url:
        'https://x.supabase.co/storage/v1/object/public/media/u/chat/1725010000000-a1b2c3d4-hisobot-avgust.xlsx',
    })).toBe('hisobot-avgust.xlsx');
  });

  it('never invents a filename from an opaque URL', () => {
    expect(resolveAttachmentFileName({
      media_url: 'https://example.com/storage/object/no-extension',
    })).toBeNull();
  });
});
