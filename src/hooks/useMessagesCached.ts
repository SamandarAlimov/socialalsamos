import { useContext, useMemo } from 'react';
import { ConversationCacheContext } from '@/contexts/ConversationCacheContext';

export * from './useMessages';

/**
 * Cached facade for conversation lists.
 *
 * The underlying active/archive hooks live once in ConversationCacheProvider,
 * outside route pages. Every consumer receives that shared state, so navigating
 * Home -> Messages -> Profile -> Messages does not restart the same Supabase
 * conversation queries or realtime subscriptions.
 */
export function useConversations(
  type?: 'private' | 'group' | 'channel',
  showArchived: boolean = false,
) {
  const cache = useContext(ConversationCacheContext);

  if (!cache) {
    throw new Error('useConversations must be used inside ConversationCacheProvider');
  }

  const source = showArchived ? cache.archived : cache.active;
  const conversations = useMemo(
    () => (type ? source.conversations.filter((conversation) => conversation.type === type) : source.conversations),
    [source.conversations, type],
  );

  return {
    ...source,
    conversations,
    // Creation always belongs to the live list, even if a caller is currently
    // looking at archived chats. This also guarantees one authoritative refresh.
    createPrivateConversation: cache.active.createPrivateConversation,
    createGroup: cache.active.createGroup,
    createChannel: cache.active.createChannel,
  };
}
