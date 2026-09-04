import type { AIMessage } from '@/components/ai/types';

export type AIArtifact = {
  id: string;
  messageId: string;
  kind: 'code' | 'image' | 'video' | 'document';
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
  dart: 'dart',
  json: 'json',
  html: 'html',
  css: 'css',
  sql: 'sql',
  bash: 'sh',
  sh: 'sh',
  markdown: 'md',
  md: 'md',
  csv: 'csv',
  yaml: 'yml',
  yml: 'yml',
  svg: 'svg',
};

export function extensionFor(a: AIArtifact): string {
  if (a.kind === 'image') return 'png';
  if (a.kind === 'video') return 'mp4';
  if (a.kind === 'document') return EXT_BY_LANG[(a.language || '').toLowerCase()] || 'md';
  return EXT_BY_LANG[(a.language || '').toLowerCase()] || 'txt';
}

const CODE_BLOCK = /```([\w+-]+)?\n([\s\S]*?)```/g;
const DOC_LANGS = new Set(['markdown', 'md', 'csv', 'html']);
const MIN_CODE_LINES = 8;
const MIN_DOC_LINES = 6;

const CODE_INTENT =
  /(?:^|\s)(?:\/code|\/run)\b|\b(kod|code|script|skript|function|funksiya|component|komponent|fayl|file|migration|migratsiya|sql|api|endpoint|class|module|modul)\b.{0,90}\b(yoz|yarat|qil|tayyorla|build|create|write|generate|implement|make|создай|напиши|сделай)\b|\b(yoz|yarat|qil|tayyorla|build|create|write|generate|implement|make|создай|напиши|сделай)\b.{0,90}\b(kod|code|script|skript|function|funksiya|component|komponent|fayl|file|migration|migratsiya|sql|api|endpoint|class|module|modul)\b/i;

const DOC_INTENT =
  /(?:^|\s)(?:\/document|\/doc)\b|\b(hujjat|document|hisobot|report|shablon|template|csv|markdown|md|html fayl|reja hujjati|brief|spec|spetsifikatsiya|taqdimot|presentation)\b.{0,90}\b(yoz|yarat|tayyorla|qil|create|write|generate|make|создай|напиши|сделай)\b|\b(yoz|yarat|tayyorla|qil|create|write|generate|make|создай|напиши|сделай)\b.{0,90}\b(hujjat|document|hisobot|report|shablon|template|csv|markdown|brief|spec|spetsifikatsiya|taqdimot|presentation)\b/i;

const titleFromContent = (text: string, fallback: string): string => {
  const heading = text.split('\n').find((line) => /^#{1,3}\s+\S/.test(line.trim()));
  if (heading) return heading.replace(/^#+\s*/, '').slice(0, 60);
  const first = text.split('\n').find((line) => line.trim().length > 0);
  return (first || fallback).replace(/^#+\s*/, '').slice(0, 60);
};

function previousUserText(messages: AIMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i].content || '';
  }
  return '';
}

function toolUsed(msg: AIMessage, name: string): boolean {
  return Boolean(msg.tools?.some((tool) => tool.name === name && tool.status === 'done'));
}

/**
 * Artifact = user asked for a reusable deliverable, not merely a long answer.
 * Explanatory prose, ordinary plans, and code snippets inside an explanation do
 * not automatically populate the artifact shelf.
 */
export function extractArtifacts(messages: AIMessage[]): AIArtifact[] {
  const out: AIArtifact[] = [];

  messages.forEach((msg, messageIndex) => {
    if (msg.role !== 'assistant' || msg.error) return;
    const userText = previousUserText(messages, messageIndex);

    const singleImage = msg.imageUrl;
    const imageUrls = [
      ...(singleImage ? [singleImage] : []),
      ...(msg.images ?? []),
    ].filter((url, index, all) => Boolean(url) && all.indexOf(url) === index);

    if (imageUrls.length > 0 || toolUsed(msg, 'generate_image')) {
      imageUrls.forEach((url, index) => {
        out.push({
          id: `${msg.id}:image:${index}`,
          messageId: msg.id,
          kind: 'image',
          title: imageUrls.length > 1 ? `Yaratilgan rasm ${index + 1}` : 'Yaratilgan rasm',
          content: url,
          createdAt: msg.timestamp,
        });
      });
    }

    const singleVideo = msg.videoUrl;
    const videoUrls = [
      ...(singleVideo ? [singleVideo] : []),
      ...(msg.videos ?? []),
    ].filter((url, index, all) => Boolean(url) && all.indexOf(url) === index);

    if (videoUrls.length > 0 || toolUsed(msg, 'generate_video')) {
      videoUrls.forEach((url, index) => {
        out.push({
          id: `${msg.id}:video:${index}`,
          messageId: msg.id,
          kind: 'video',
          title: videoUrls.length > 1 ? `Yaratilgan video ${index + 1}` : 'Yaratilgan video',
          content: url,
          createdAt: msg.timestamp,
        });
      });
    }

    const wantsCode = CODE_INTENT.test(userText);
    const wantsDocument = DOC_INTENT.test(userText);
    if (!wantsCode && !wantsDocument) return;

    let match: RegExpExecArray | null;
    let index = 0;
    CODE_BLOCK.lastIndex = 0;

    while ((match = CODE_BLOCK.exec(msg.content)) !== null) {
      const language = (match[1] || 'text').toLowerCase();
      const body = match[2].trim();
      const lines = body.split('\n').length;

      if (DOC_LANGS.has(language)) {
        if (!wantsDocument || lines < MIN_DOC_LINES) continue;
        out.push({
          id: `${msg.id}:doc:${index}`,
          messageId: msg.id,
          kind: 'document',
          title: titleFromContent(body, 'Hujjat'),
          language,
          content: body,
          createdAt: msg.timestamp,
        });
        index += 1;
        continue;
      }

      if (!wantsCode || lines < MIN_CODE_LINES) continue;
      out.push({
        id: `${msg.id}:code:${index}`,
        messageId: msg.id,
        kind: 'code',
        title: `${language} kod (${lines} qator)`,
        language,
        content: body,
        createdAt: msg.timestamp,
      });
      index += 1;
    }
  });

  return out;
}
