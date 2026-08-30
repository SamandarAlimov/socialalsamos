import db from '@/lib/supabaseAny';

type DraftListener = () => void;
const listeners = new Set<DraftListener>();

const LOCAL_DRAFT_PREFIX = 'alsamos:message-draft:v2';

export interface MessageDraftSnapshot {
  content: string;
  updated_at: string | null;
  /**
   * Empty content is a deliberate tombstone, not "missing data".
   * Keeping the tombstone lets a successful send win over an older delayed save
   * after refresh and across devices.
   */
  cleared?: boolean;
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

function normalizeSnapshot(
  content: unknown,
  updatedAt: unknown,
  cleared?: unknown
): MessageDraftSnapshot | null {
  if (typeof content !== 'string') return null;

  const isCleared = cleared === true || content.trim().length === 0;
  return {
    content: isCleared ? '' : content,
    updated_at: typeof updatedAt === 'string' ? updatedAt : null,
    cleared: isCleared,
  };
}

function readLocalDraftState(
  userId: string,
  conversationId: string
): MessageDraftSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(localDraftKey(userId, conversationId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<MessageDraftSnapshot>;
    // v1 local drafts with actual text remain fully compatible.
    if (typeof parsed.content !== 'string') return null;
    if (!parsed.content.trim() && parsed.cleared !== true) return null;

    return normalizeSnapshot(parsed.content, parsed.updated_at, parsed.cleared);
  } catch {
    return null;
  }
}

function writeLocalDraftState(
  userId: string,
  conversationId: string,
  snapshot: MessageDraftSnapshot
): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      localDraftKey(userId, conversationId),
      JSON.stringify({
        content: snapshot.cleared ? '' : snapshot.content,
        updated_at: snapshot.updated_at,
        cleared: snapshot.cleared === true,
      })
    );
  } catch {
    // Storage quota/private mode: server persistence may still succeed.
  }
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNewer(a: string | null, b: string | null): boolean {
  return timestamp(a) > timestamp(b);
}

/**
 * Deterministic last-write-wins merge used by web and covered by regression
 * tests. A clear tombstone participates exactly like a normal draft.
 */
export function resolveMessageDraftSnapshot(
  local: MessageDraftSnapshot | null,
  server: MessageDraftSnapshot | null
): MessageDraftSnapshot | null {
  if (!local) return server;
  if (!server) return local;
  return isNewer(local.updated_at, server.updated_at) ? local : server;
}

function isActiveDraft(snapshot: MessageDraftSnapshot | null): snapshot is MessageDraftSnapshot {
  return Boolean(snapshot && snapshot.cleared !== true && snapshot.content.trim());
}

async function persistServerSnapshot(
  userId: string,
  conversationId: string,
  snapshot: MessageDraftSnapshot
): Promise<void> {
  const { error } = await db.from('message_drafts').upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      content: snapshot.cleared ? '' : snapshot.content,
      updated_at: snapshot.updated_at || new Date().toISOString(),
    },
    { onConflict: 'user_id,conversation_id' }
  );

  if (error) throw error;
}

export function getLocalMessageDrafts(
  userId: string,
  conversationIds: string[]
): Map<string, MessageDraftSnapshot> {
  const result = new Map<string, MessageDraftSnapshot>();

  for (const conversationId of conversationIds) {
    const draft = readLocalDraftState(userId, conversationId);
    if (isActiveDraft(draft)) result.set(conversationId, draft);
  }

  return result;
}

export async function loadMessageDrafts(
  userId: string,
  conversationIds: string[]
): Promise<Map<string, MessageDraftSnapshot>> {
  const result = new Map<string, MessageDraftSnapshot>();
  if (conversationIds.length === 0) return result;

  const localById = new Map<string, MessageDraftSnapshot>();
  for (const conversationId of conversationIds) {
    const local = readLocalDraftState(userId, conversationId);
    if (local) localById.set(conversationId, local);
  }

  const { data, error } = await db
    .from('message_drafts')
    .select('conversation_id, content, updated_at')
    .eq('user_id', userId)
    .in('conversation_id', conversationIds);

  if (error) {
    console.warn('Server message drafts are unavailable; local fallback is active:', error);
    for (const [conversationId, local] of localById) {
      if (isActiveDraft(local)) result.set(conversationId, local);
    }
    return result;
  }

  const serverById = new Map<string, MessageDraftSnapshot>();
  for (const row of data || []) {
    const snapshot = normalizeSnapshot(row.content, row.updated_at);
    if (snapshot) serverById.set(row.conversation_id, snapshot);
  }

  const repairs: Promise<void>[] = [];

  for (const conversationId of conversationIds) {
    const local = localById.get(conversationId) || null;
    const server = serverById.get(conversationId) || null;
    const winner = resolveMessageDraftSnapshot(local, server);

    if (!winner) continue;

    writeLocalDraftState(userId, conversationId, winner);
    if (isActiveDraft(winner)) result.set(conversationId, winner);

    // Local offline edits/clears that are newer than the server are repaired
    // best-effort. The database monotonic timestamp guard prevents stale writes
    // from resurrecting an older draft afterwards.
    if (local && winner === local && (!server || isNewer(local.updated_at, server.updated_at))) {
      repairs.push(
        persistServerSnapshot(userId, conversationId, local).catch((syncError) => {
          console.warn('Local draft state could not be synced yet:', syncError);
        })
      );
    }
  }

  if (repairs.length > 0) await Promise.all(repairs);
  return result;
}

export async function loadMessageDraft(
  userId: string,
  conversationId: string
): Promise<string> {
  const drafts = await loadMessageDrafts(userId, [conversationId]);
  return drafts.get(conversationId)?.content ?? '';
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

  const snapshot: MessageDraftSnapshot = {
    content,
    updated_at: new Date().toISOString(),
    cleared: false,
  };
  writeLocalDraftState(userId, conversationId, snapshot);

  try {
    await persistServerSnapshot(userId, conversationId, snapshot);
  } catch (error) {
    console.warn('Draft saved locally; server sync will retry later:', error);
  }

  messageDraftsEmitter.emit();
}

export async function clearMessageDraft(
  userId: string,
  conversationId: string
): Promise<void> {
  // Telegram-style clear is a versioned tombstone, not DELETE. DELETE loses the
  // ordering information and allows an older delayed UPSERT to resurrect the
  // draft after a successful send.
  const tombstone: MessageDraftSnapshot = {
    content: '',
    updated_at: new Date().toISOString(),
    cleared: true,
  };
  writeLocalDraftState(userId, conversationId, tombstone);

  try {
    await persistServerSnapshot(userId, conversationId, tombstone);
  } catch (error) {
    console.warn('Draft cleared locally; server tombstone sync will retry later:', error);
  }

  messageDraftsEmitter.emit();
}
