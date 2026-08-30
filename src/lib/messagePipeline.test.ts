import { describe, expect, it, vi } from 'vitest';
import {
  appendRealtimeMessage,
  BASE_MESSAGE_SELECT,
  buildMessageInsertPayload,
  hydrateReplyTargets,
  insertMessageWithReplyFallback,
  replaceOptimisticMessage,
} from './messagePipeline';

describe('Messages regression pipeline', () => {
  it('send: keeps normal messages independent from reply schema', () => {
    const payload = buildMessageInsertPayload({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Salom',
    });

    expect(payload).toMatchObject({
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      content: 'Salom',
    });
    expect(payload).not.toHaveProperty('reply_to_id');
    expect(BASE_MESSAGE_SELECT).not.toContain('reply_to:messages');
  });

  it('send/reply: retries without reply metadata only for reply schema compatibility errors', async () => {
    const calls: Record<string, unknown>[] = [];
    const insert = vi.fn(async (payload: Record<string, unknown>) => {
      calls.push(payload);
      if (calls.length === 1) {
        return {
          data: null,
          error: {
            code: 'PGRST204',
            message: "Could not find the 'reply_to_id' column in the schema cache",
          },
        };
      }
      return {
        data: { id: 'persisted-1', content: 'Reply' },
        error: null,
      };
    });

    const result = await insertMessageWithReplyFallback(
      buildMessageInsertPayload({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Reply',
        replyToId: 'message-0',
      }),
      insert
    );

    expect(result.error).toBeNull();
    expect(result.usedFallback).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveProperty('reply_to_id', 'message-0');
    expect(calls[1]).not.toHaveProperty('reply_to_id');
  });

  it('send: never retries generic failures that could duplicate a persisted message', async () => {
    const insert = vi.fn(async () => ({
      data: null,
      error: { message: 'network connection lost' },
    }));

    const result = await insertMessageWithReplyFallback(
      buildMessageInsertPayload({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Reply',
        replyToId: 'message-0',
      }),
      insert
    );

    expect(result.usedFallback).toBe(false);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('fetch: reply hydration failure never hides the core message history', async () => {
    const rows = [
      { id: 'm1', content: 'Birinchi', reply_to_id: null },
      { id: 'm2', content: 'Ikkinchi', reply_to_id: 'm1' },
    ];

    const hydrated = await hydrateReplyTargets(rows, async () => ({
      data: null,
      error: { message: 'relationship unavailable' },
    }));

    expect(hydrated).toHaveLength(2);
    expect(hydrated.map((message) => message.id)).toEqual(['m1', 'm2']);
    expect(hydrated[0].reply_to).toBeNull();
    expect(hydrated[1].reply_to).toBeNull();
  });

  it('reply: hydrates reply previews without changing the core message row', async () => {
    const rows = [
      { id: 'm2', content: 'Javob', reply_to_id: 'm1', status: 'sent' },
    ];

    const hydrated = await hydrateReplyTargets(rows, async (ids) => {
      expect(ids).toEqual(['m1']);
      return {
        data: [{ id: 'm1', content: 'Original' }],
        error: null,
      };
    });

    expect(hydrated[0]).toMatchObject({
      id: 'm2',
      content: 'Javob',
      status: 'sent',
      reply_to: { id: 'm1', content: 'Original' },
    });
  });

  it('realtime: appends each server message only once', () => {
    const existing = [{ id: 'm1', content: 'Old' }];
    const incoming = { id: 'm2', content: 'New' };

    const once = appendRealtimeMessage(existing, incoming);
    const twice = appendRealtimeMessage(once, incoming);

    expect(once.map((message) => message.id)).toEqual(['m1', 'm2']);
    expect(twice).toBe(once);
    expect(twice).toHaveLength(2);
  });

  it('send: replaces optimistic message instead of leaving duplicate temp rows', () => {
    const optimistic = [
      {
        id: 'temp-1',
        tempId: 'temp-1',
        content: 'Salom',
        status: 'sending',
      },
    ];
    const persisted = {
      id: 'm1',
      content: 'Salom',
      status: 'sent',
    };

    const next = replaceOptimisticMessage(optimistic, 'temp-1', persisted);

    expect(next).toEqual([
      {
        id: 'm1',
        content: 'Salom',
        status: 'sent',
      },
    ]);
  });
});
