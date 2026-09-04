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
  size?: number;
};

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  images?: string[];
  videoUrl?: string;
  videos?: string[];
  error?: boolean;
  timestamp: Date;
  model?: string;
  mode?: AIMode;
  tools?: AIToolEvent[];
  sources?: AISource[];
  attachments?: AIAttachmentMeta[];
  notice?: string;
}

export interface AIProject {
  id: string;
  name: string;
  instructions: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIConversation {
  id: string;
  title: string;
  messages: AIMessage[];
  updatedAt: Date;
  pinned?: boolean;
  projectId?: string | null;
}

export interface AISettings {
  mode: AIMode;
  model: ModelId;
  toolGroups: ToolGroupId[];
}
