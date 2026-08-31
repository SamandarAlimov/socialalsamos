import type { ModelId, AIMode, ToolGroupId } from '@/lib/ai/capabilities';

export type AIToolStatus = 'running' | 'done' | 'error';

export type AISource = { title: string; url: string; snippet?: string };

export type AIToolEvent = {
  id: string;
  name: string;
  label: string;
  status: AIToolStatus;
  args?: Record<string, unknown>;
  summary?: string;
  data?: Record<string, unknown> | null;
  startedAt: number;
  finishedAt?: number;
};

export type AIAttachmentMeta = {
  url: string;
  name: string;
  type: string;
};

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  images?: string[];
  error?: boolean;
  timestamp: number;
  model?: string;
  mode?: AIMode;
  tools?: AIToolEvent[];
  sources?: AISource[];
  attachments?: AIAttachmentMeta[];
  notice?: string;
}

export interface AIConversation {
  id: string;
  title: string;
  messages: AIMessage[];
  updatedAt: number;
  pinned?: boolean;
}

export interface AISettings {
  mode: AIMode;
  model: ModelId;
  toolGroups: ToolGroupId[];
}
