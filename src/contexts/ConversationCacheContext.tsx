import { createContext, useMemo, type ReactNode } from 'react';
import { useConversations as useBaseConversations } from '../hooks/useMessages';

export type ConversationListController = ReturnType<typeof useBaseConversations>;

export interface ConversationCacheValue {
  active: ConversationListController;
  archived: ConversationListController;
}

export const ConversationCacheContext = createContext<ConversationCacheValue | null>(null);

/**
 * Keeps the expensive conversation-list queries and realtime subscriptions mounted
 * for the whole authenticated session. Route changes therefore reuse the same data
 * instead of rebuilding active/archive lists from scratch every time Messages (or a
 * profile action that can start a chat) mounts again.
 */
export function ConversationCacheProvider({ children }: { children: ReactNode }) {
  const active = useBaseConversations(undefined, false);
  const archived = useBaseConversations(undefined, true);

  const value = useMemo<ConversationCacheValue>(
    () => ({ active, archived }),
    [active, archived],
  );

  return (
    <ConversationCacheContext.Provider value={value}>
      {children}
    </ConversationCacheContext.Provider>
  );
}
