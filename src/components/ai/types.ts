export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  error?: boolean;
  timestamp: Date;
}

export interface AIConversation {
  id: string;
  title: string;
  messages: AIMessage[];
  updatedAt: Date;
  pinned?: boolean;
}
