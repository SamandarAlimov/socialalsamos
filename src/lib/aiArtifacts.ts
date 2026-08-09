import type { AIMessage } from '@/components/ai/types';

export type AIArtifact = {
  id: string;
  messageId: string;
  kind: 'code' | 'image' | 'document';
  title: string;
  language?: string;
  content: string;
  createdAt: Date;
};

const EXT_BY_LANG: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  json: 'json',
  html: 'html',
  css: 'css',
  sql: 'sql',
  bash: 'sh',
  sh: 'sh',
  markdown: 'md',
  md: 'md',
  yaml: 'yml',
  yml: 'yml',
};

export function extensionFor(a: AIArtifact): string {
  if (a.kind === 'document') return 'md';
  return EXT_BY_LANG[(a.language || '').toLowerCase()] || 'txt';
}

const CODE_BLOCK = /```(\w+)?\n([\s\S]*?)```/g;

/** Anything substantial the assistant produced becomes a standalone artifact. */
export function extractArtifacts(messages: AIMessage[]): AIArtifact[] {
  const out: AIArtifact[] = [];

  for (const msg of messages) {
    if (msg.role !== 'assistant' || msg.error) continue;

    if (msg.imageUrl) {
      out.push({
        id: `${msg.id}:image`,
        messageId: msg.id,
        kind: 'image',
        title: 'Yaratilgan rasm',
        content: msg.imageUrl,
        createdAt: msg.timestamp,
      });
    }

    let match: RegExpExecArray | null;
    let index = 0;
    CODE_BLOCK.lastIndex = 0;
    let plain = msg.content;

    while ((match = CODE_BLOCK.exec(msg.content)) !== null) {
      const language = match[1] || 'text';
      const code = match[2].trim();
      plain = plain.replace(match[0], '');
      // Only sizable blocks deserve their own panel entry.
      if (code.split('\n').length < 12) continue;
      out.push({
        id: `${msg.id}:code:${index}`,
        messageId: msg.id,
        kind: 'code',
        title: `${language} kod (${code.split('\n').length} qator)`,
        language,
        content: code,
        createdAt: msg.timestamp,
      });
      index += 1;
    }

    const prose = plain.trim();
    if (prose.length > 1200) {
      const firstLine = prose.split('\n').find((l) => l.trim().length > 0) || 'Hujjat';
      out.push({
        id: `${msg.id}:doc`,
        messageId: msg.id,
        kind: 'document',
        title: firstLine.replace(/^#+\s*/, '').slice(0, 60),
        content: prose,
        createdAt: msg.timestamp,
      });
    }
  }

  return out;
}
