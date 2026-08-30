export const BASE_MESSAGE_SELECT = `
  *,
  sender:profiles!messages_sender_id_fkey (
    id,
    username,
    display_name,
    avatar_url
  )
`;

export interface MessageInsertArgs {
  conversationId: string;
  senderId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  replyToId?: string | null;
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
  locationPayload?: Record<string, unknown>;
  liveLocationExpiresAt?: string;
}

export function buildMessageInsertPayload({
  conversationId,
  senderId,
  content,
  mediaUrl,
  mediaType,
  replyToId,
  clientMessageId,
  metadata,
  locationPayload,
  liveLocationExpiresAt,
}: MessageInsertArgs): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    media_url: mediaUrl,
    media_type: mediaType,
  };

  // Oddiy xabar reply schema/cache holatiga umuman bog'lanmasin.
  if (replyToId) payload.reply_to_id = replyToId;
  if (clientMessageId) payload.client_message_id = clientMessageId;
  if (metadata && Object.keys(metadata).length > 0) payload.metadata = metadata;
  if (locationPayload) payload.location_payload = locationPayload;
  if (liveLocationExpiresAt) payload.live_location_expires_at = liveLocationExpiresAt;

  return payload;
}

type QueryResult<T> = {
  data: T | null;
  error: unknown | null;
};

function errorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error === 'object') {
    const value = error as Record<string, unknown>;
    return [value.code, value.message, value.details, value.hint]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }
  return String(error).toLowerCase();
}

/**
 * Faqat reply_to_id schema/cache nomutanosibligi aniq bo'lsa fallback qilamiz.
 * Tarmoq yoki noma'lum xatoda ikkinchi insert duplicate xabar yaratishi mumkin.
 */
export function isReplyCompatibilityError(error: unknown): boolean {
  const text = errorText(error);
  if (!text.includes('reply_to_id')) return false;

  return (
    text.includes('schema cache') ||
    text.includes('column') ||
    text.includes('does not exist') ||
    text.includes('pgrst204') ||
    text.includes('42703')
  );
}

export async function insertMessageWithReplyFallback<T>(
  payload: Record<string, unknown>,
  insert: (nextPayload: Record<string, unknown>) => Promise<QueryResult<T>>
): Promise<QueryResult<T> & { usedFallback: boolean }> {
  const first = await insert(payload);

  if (
    !first.error ||
    !payload.reply_to_id ||
    !isReplyCompatibilityError(first.error)
  ) {
    return { ...first, usedFallback: false };
  }

  const fallbackPayload = { ...payload };
  delete fallbackPayload.reply_to_id;

  const fallback = await insert(fallbackPayload);
  return { ...fallback, usedFallback: true };
}

export async function hydrateReplyTargets<
  T extends { reply_to_id?: string | null },
  R extends { id: string },
>(
  rows: T[],
  fetchReplies: (replyIds: string[]) => Promise<QueryResult<R[]>>
): Promise<Array<T & { reply_to: R | null }>> {
  if (rows.length === 0) return [];

  const replyIds = Array.from(
    new Set(rows.map((row) => row.reply_to_id).filter((id): id is string => Boolean(id)))
  );

  if (replyIds.length === 0) {
    return rows.map((row) => ({ ...row, reply_to: null }));
  }

  const { data, error } = await fetchReplies(replyIds);

  // Reply preview optional enhancement: xatosi core tarixni yo'q qilmasligi shart.
  if (error) {
    return rows.map((row) => ({ ...row, reply_to: null }));
  }

  const replyMap = new Map<string, R>();
  for (const reply of data || []) replyMap.set(reply.id, reply);

  return rows.map((row) => ({
    ...row,
    reply_to: row.reply_to_id ? replyMap.get(row.reply_to_id) ?? null : null,
  }));
}

export function appendRealtimeMessage<T extends { id: string }>(
  current: T[],
  incoming: T
): T[] {
  if (current.some((message) => message.id === incoming.id)) return current;
  return [...current, incoming];
}

export function replaceOptimisticMessage<
  T extends { id: string; tempId?: string; status?: string },
>(
  current: T[],
  tempId: string,
  persisted: T
): T[] {
  return current.map((message) =>
    message.tempId === tempId
      ? ({ ...persisted, status: 'sent' } as T)
      : message
  );
}
