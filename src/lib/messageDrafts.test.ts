import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseAny', () => ({ default: {} }));

import {
  resolveMessageDraftSnapshot,
  type MessageDraftSnapshot,
} from './messageDrafts';

function snap(
  content: string,
  updated_at: string,
  cleared = false
): MessageDraftSnapshot {
  return { content, updated_at, cleared };
}

describe('message draft last-write-wins protocol', () => {
  it('keeps a newer clear tombstone over an older delayed save', () => {
    const staleSave = snap('already sent text', '2026-08-30T07:00:00.000Z');
    const clear = snap('', '2026-08-30T07:00:01.000Z', true);

    expect(resolveMessageDraftSnapshot(clear, staleSave)).toEqual(clear);
  });

  it('accepts a genuinely newer edit after an older clear', () => {
    const clear = snap('', '2026-08-30T07:00:00.000Z', true);
    const newerEdit = snap('new message', '2026-08-30T07:00:02.000Z');

    expect(resolveMessageDraftSnapshot(clear, newerEdit)).toEqual(newerEdit);
  });

  it('keeps offline local edits when the server has no state', () => {
    const local = snap('offline draft', '2026-08-30T07:00:03.000Z');
    expect(resolveMessageDraftSnapshot(local, null)).toEqual(local);
  });
});
