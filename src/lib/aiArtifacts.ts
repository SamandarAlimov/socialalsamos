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
};

export function extensionFor(a: AIArtifact): string {
  if (a.kind === 'document') return EXT_BY_LANG[(a.language || '').toLowerCase()] || 'md';
  return EXT_BY_LANG[(a.language || '').toLowerCase()] || 'txt';
}

const CODE_BLOCK = /```([\w+-]+)?\n([\s\S]*?)```/g;

/** Kod bloki artefakt bo'lishi uchun minimal qator soni. */
const MIN_CODE_LINES = 16;

/** Hujjat sifatida ochiladigan bloklar (kod emas, lekin fayl bo'la oladi). */
const DOC_LANGS = new Set(['markdown', 'md', 'csv', 'html']);
const MIN_DOC_LINES = 12;

const titleFromContent = (text: string, fallback: string): string => {
  const heading = text.split('\n').find((line) => /^#{1,3}\s+\S/.test(line.trim()));
  if (heading) return heading.replace(/^#+\s*/, '').slice(0, 60);
  const first = text.split('\n').find((line) => line.trim().length > 0);
  return (first || fallback).replace(/^#+\s*/, '').slice(0, 60);
};

/**
 * Artefakt — bu ALOHIDA fayl sifatida ma'noga ega natija: kod fayli, yaratilgan
 * rasm yoki hujjat bloki.
 *
 * MUHIM: oddiy chat javobi (uzun bo'lsa ham) artefakt EMAS. Ilgari 1200 belgidan
 * uzun har qanday matn "hujjat" deb olinardi — shu sababli deyarli har bir javob
 * artefaktlar panelida ko'rinib ketardi. Endi faqat aniq belgilangan natijalar
 * artefakt bo'ladi.
 */
export function extractArtifacts(messages: AIMessage[]): AIArtifact[] {
  const out: AIArtifact[] = [];

  for (const msg of messages) {
    if (msg.role !== 'assistant' || msg.error) continue;

    // 1) Yaratilgan rasmlar — doim artefakt.
    const single = (msg as { imageUrl?: string }).imageUrl;
    const imageUrls = [
      ...(single ? [single] : []),
      ...((msg.images as string[] | undefined) ?? []),
    ].filter((url, index, all) => url && all.indexOf(url) === index);

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

    // 2) Kod va hujjat bloklari — faqat yetarlicha katta bo'lsa.
    let match: RegExpExecArray | null;
    let index = 0;
    CODE_BLOCK.lastIndex = 0;

    while ((match = CODE_BLOCK.exec(msg.content)) !== null) {
      const language = (match[1] || 'text').toLowerCase();
      const body = match[2].trim();
      const lines = body.split('\n').length;

      if (DOC_LANGS.has(language)) {
        if (lines < MIN_DOC_LINES) continue;
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

      if (lines < MIN_CODE_LINES) continue;
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
  }

  return out;
}
