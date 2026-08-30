import { describe, expect, it } from 'vitest';
import {
  buildLocationMessageFields,
  buildPollMessageFields,
  parseMessageLocation,
  parseMessagePoll,
} from './messageStructuredPayload';

describe('cross-app structured message compatibility', () => {
  it('reads legacy web location text', () => {
    expect(
      parseMessageLocation({
        content: '📍 LOCATION:41.31,69.28|Toshkent',
      })
    ).toMatchObject({
      latitude: 41.31,
      longitude: 69.28,
      address: 'Toshkent',
    });
  });

  it('reads Flutter location content when media_type is location', () => {
    expect(
      parseMessageLocation({
        content: 'Current location\n41.31,69.28',
        media_type: 'location',
      })
    ).toMatchObject({
      latitude: 41.31,
      longitude: 69.28,
      label: 'Current location',
    });
  });

  it('builds canonical location with backward-compatible coordinates', () => {
    const built = buildLocationMessageFields({
      latitude: 41.31,
      longitude: 69.28,
      address: 'Toshkent',
    });
    expect(built.mediaType).toBe('location');
    expect(built.mediaUrl).toBe('41.31,69.28');
    expect(built.metadata.location).toMatchObject({
      latitude: 41.31,
      longitude: 69.28,
    });
  });

  it('reads Flutter metadata poll', () => {
    expect(
      parseMessagePoll({
        media_type: 'poll',
        content: 'Savol\n- A\n- B',
        metadata: {
          poll: {
            question: 'Savol',
            options: [
              { id: 'a', text: 'A', votes: 0 },
              { id: 'b', text: 'B', votes: 0 },
            ],
            multiple: false,
          },
        },
      })
    ).toMatchObject({
      question: 'Savol',
      options: [{ id: 'a', text: 'A', votes: 0 }, { id: 'b', text: 'B', votes: 0 }],
    });
  });

  it('falls back to poll text used by older clients', () => {
    expect(
      parseMessagePoll({
        media_type: 'poll',
        content: 'Qaysi?\n- Bir\n- Ikki',
      })
    ).toMatchObject({
      question: 'Qaysi?',
      options: [{ text: 'Bir' }, { text: 'Ikki' }],
    });
  });

  it('builds one canonical poll format for both clients', () => {
    const built = buildPollMessageFields({
      question: 'Qaysi?',
      options: ['Bir', 'Ikki'],
    });
    expect(built.mediaType).toBe('poll');
    expect(built.metadata.poll.options).toHaveLength(2);
  });
});
