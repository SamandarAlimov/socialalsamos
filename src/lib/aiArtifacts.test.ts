import { describe, expect, it } from 'vitest';

import type { AIMessage } from '@/components/ai/types';
import { extractArtifacts } from './aiArtifacts';

const at = new Date('2026-09-17T00:00:00Z');

function user(content: string, id = 'user-1'): AIMessage {
  return { id, role: 'user', content, timestamp: at };
}

function assistant(content: string, extra: Partial<AIMessage> = {}, id = 'assistant-1'): AIMessage {
  return { id, role: 'assistant', content, timestamp: at, ...extra };
}

describe('AI artifact extraction', () => {
  it('keeps generated images in chat instead of auto-promoting them to artifacts', () => {
    const artifacts = extractArtifacts([
      user('Minimalistik texnologik poster yarat.'),
      assistant('Poster tayyor.', {
        images: ['https://example.com/poster.png'],
        tools: [
          {
            id: 'tool-image',
            name: 'generate_image',
            label: 'Rasm yaratish',
            status: 'done',
            startedAt: at.getTime(),
            finishedAt: at.getTime(),
          },
        ],
      }),
    ]);

    expect(artifacts).toEqual([]);
  });

  it('keeps generated videos in chat instead of auto-promoting them to artifacts', () => {
    const artifacts = extractArtifacts([
      user('Qisqa video yarat.'),
      assistant('Video tayyor.', {
        videos: ['https://example.com/video.mp4'],
        tools: [
          {
            id: 'tool-video',
            name: 'generate_video',
            label: 'Video yaratish',
            status: 'done',
            startedAt: at.getTime(),
            finishedAt: at.getTime(),
          },
        ],
      }),
    ]);

    expect(artifacts).toEqual([]);
  });

  it('does not turn ordinary explanatory text into an artifact', () => {
    const artifacts = extractArtifacts([
      user('Bu mavzuni tushuntirib ber.'),
      assistant('# Javob\n\nBu oddiy chat javobi.\n\nYana bir necha satr izoh bor.'),
    ]);

    expect(artifacts).toEqual([]);
  });

  it('creates a code artifact only for a substantial requested code deliverable', () => {
    const artifacts = extractArtifacts([
      user('TypeScriptda foydalanuvchini tekshiradigan funksiya yoz.'),
      assistant([
        'Mana mustaqil kod:',
        '```ts',
        'type User = {',
        '  id: string;',
        '  active: boolean;',
        '};',
        '',
        'export function canEnter(user: User) {',
        '  return Boolean(user.id && user.active);',
        '}',
        '```',
      ].join('\n')),
    ]);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ kind: 'code', language: 'ts' });
  });

  it('creates a document artifact only for a substantial requested document deliverable', () => {
    const artifacts = extractArtifacts([
      user('Markdown formatida loyiha brief hujjati yarat.'),
      assistant([
        '```markdown',
        '# Alsamos brief',
        '',
        '## Maqsad',
        'Yagona AI workspace yaratish.',
        '',
        '## Auditoriya',
        'Kundalik foydalanuvchilar.',
        '',
        '## Natija',
        'Qayta ishlatiladigan loyiha hujjati.',
        '```',
      ].join('\n')),
    ]);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ kind: 'document', language: 'markdown', title: 'Alsamos brief' });
  });
});
