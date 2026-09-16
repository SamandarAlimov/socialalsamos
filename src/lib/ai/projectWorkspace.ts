import type { AIConversation } from '@/components/ai/types';

function matchesConversation(conversation: AIConversation, query: string): boolean {
  const clean = query.trim().toLowerCase();
  if (!clean) return true;
  return (
    conversation.title.toLowerCase().includes(clean) ||
    conversation.messages.some((message) => message.content.toLowerCase().includes(clean))
  );
}

/**
 * The global/recent chat list is intentionally independent from the active
 * project. Project chats live under their project and must not make the global
 * recent section jump around when a project is opened.
 */
export function sidebarGeneralConversations(
  conversations: AIConversation[],
  query = '',
): AIConversation[] {
  return conversations.filter((conversation) => !conversation.projectId && matchesConversation(conversation, query));
}

export function sidebarProjectConversations(
  conversations: AIConversation[],
  projectId: string,
  query = '',
): AIConversation[] {
  return conversations.filter(
    (conversation) => conversation.projectId === projectId && matchesConversation(conversation, query),
  );
}
