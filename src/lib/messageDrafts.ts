import db from '@/lib/supabaseAny';

type DraftListener = () => void;
const listeners = new Set<DraftListener>();

export const messageDraftsEmitter = {
  emit() {
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: DraftListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export async function loadMessageDraft(userId: string, conversationId: string): Promise<string> {
  const { data, error } = await db
    .from('message_drafts')
    .select('content')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error) throw error;
  return typeof data?.content === 'string' ? data.content : '';
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

  const { error } = await db.from('message_drafts').upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,conversation_id' }
  );

  if (error) throw error;
  messageDraftsEmitter.emit();
}

export async function clearMessageDraft(userId: string, conversationId: string): Promise<void> {
  const { error } = await db
    .from('message_drafts')
    .delete()
    .eq('user_id', userId)
    .eq('conversation_id', conversationId);

  if (error) throw error;
  messageDraftsEmitter.emit();
}
