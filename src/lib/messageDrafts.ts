import db from '@/lib/supabaseAny';

type DraftListener = () => void;
const listeners = new Set<DraftListener>();

const LOCAL_DRAFT_PREFIX = 'alsamos:message-draft:v1';

export interface MessageDraftSnapshot {
  content: string;
  updated_at: string | null;
}

export const messageDraftsEmitter = {
  emit() {
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: DraftListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

function localDraftKey(userId: string, conversationId: string): string {
  return `${LOCAL_DRAFT_PREFIX}:${userId}:${conversationId}`;
}

function readLocalDraft(userId: string, conversationId: string): MessageDraftSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(localDraftKey(userId, conversationId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<MessageDraftSnapshot>;
    if (typeof parsed.content !== 'string' || !parsed.content.trim()) return null;

    return {
      content: parsed.content,
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : null,
    };
  } catch {
    return null;
  }
}

function writeLocalDraft(
  userId: string,
  conversationId: string,
  snapshot: MessageDraftSnapshot
): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      localDraftKey(userId, conversationId),
      JSON.stringify(snapshot)
    );
  } catch {
    // Storage quota/private mode: server persistence may still succeed.
  }
}

function removeLocalDraft(userId: string, conversationId: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(localDraftKey(userId, conversationId));
  } catch {
    // Ignore local storage failures.
  }
}

function isNewer(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return new Date(a).getTime() > new Date(b).getTime();
}

export function getLocalMessageDrafts(
  userId: string,
  conversationIds: string[]
): Map<string, MessageDraftSnapshot> {
  const result = new Map<string, MessageDraftSnapshot>();

  for (const conversationId of conversationIds) {
    const draft = readLocalDraft(userId, conversationId);
    if (draft) result.set(conversationId, draft);
  }

  return result;
}

export async function loadMessageDrafts(
  userId: string,
  conversationIds: string[]
): Promise<Map<string, MessageDraftSnapshot>> {
  const result = getLocalMessageDrafts(userId, conversationIds);
  if (conversationIds.length === 0) return result;

  const { data, error } = await db
    .from('message_drafts')
    .select('conversation_id, content, updated_at')
    .eq('user_id', userId)
    .in('conversation_id', conversationIds);

  if (error) {
    console.warn('Server message drafts are unavailable; local fallback is active:', error);
    return result;
  }

  for (const row of data || []) {
    if (typeof row.content !== 'string' || !row.content.trim()) continue;

    const serverDraft: MessageDraftSnapshot = {
      content: row.content,
      updated_at: row.updated_at ?? null,
    };
    const localDraft = result.get(row.conversation_id);

    if (!localDraft || !isNewer(localDraft.updated_at, serverDraft.updated_at)) {
      result.set(row.conversation_id, serverDraft);
      writeLocalDraft(userId, row.conversation_id, serverDraft);
    }
  }

  return result;
}

export async function loadMessageDraft(userId: string, conversationId: string): Promise<string> {
  const localDraft = readLocalDraft(userId, conversationId);
  const { data, error } = await db
    .from('message_drafts')
    .select('content, updated_at')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error) {
    console.warn('Server message draft is unavailable; local fallback is active:', error);
    return localDraft?.content ?? '';
  }

  const serverDraft =
    typeof data?.content === 'string' && data.content.trim()
      ? ({
          content: data.content,
          updated_at: data.updated_at ?? null,
        } satisfies MessageDraftSnapshot)
      : null;

  if (localDraft && (!serverDraft || isNewer(localDraft.updated_at, serverDraft.updated_at))) {
    // Best-effort backfill: when migration/connectivity becomes available,
    // a locally saved draft automatically returns to server sync.
    const { error: syncError } = await db.from('message_drafts').upsert(
      {
        user_id: userId,
        conversation_id: conversationId,
        content: localDraft.content,
        updated_at: localDraft.updated_at || new Date().toISOString(),
      },
      { onConflict: 'user_id,conversation_id' }
    );
    if (syncError) {
      console.warn('Local draft could not be synced yet:', syncError);
    }
    return localDraft.content;
  }

  if (serverDraft) {
    writeLocalDraft(userId, conversationId, serverDraft);
    return serverDraft.content;
  }

  return '';
}

export async function saveMessageDraft(
  userId: string,
  conversationId: string,
  content: string
): Promise<void> {
  if (!content.trim()) {
    await clearMessageDraft(userId, conversationId);
    return;
  }

  const updatedAt = new Date().toISOString();
  writeLocalDraft(userId, conversationId, {
    content,
    updated_at: updatedAt,
  });

  const { error } = await db.from('message_drafts').upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      content,
      updated_at: updatedAt,
    },
    { onConflict: 'user_id,conversation_id' }
  );

  if (error) {
    console.warn('Draft saved locally; server sync will retry later:', error);
  }

  messageDraftsEmitter.emit();
}

export async function clearMessageDraft(userId: string, conversationId: string): Promise<void> {
  removeLocalDraft(userId, conversationId);

  const { error } = await db
    .from('message_drafts')
    .delete()
    .eq('user_id', userId)
    .eq('conversation_id', conversationId);

  if (error) {
    console.warn('Local draft cleared; server draft cleanup is pending:', error);
  }

  messageDraftsEmitter.emit();
}
