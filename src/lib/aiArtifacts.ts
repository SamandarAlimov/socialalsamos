import type { AIMessage } from '@/components/ai/types';

export type AIArtifactKind =
  | 'website'
  | 'component'
  | 'diagram'
  | 'graphic'
  | 'code'
  | 'document'
  | 'image'
  | 'video';

export type AIArtifact = {
  id: string;
  messageId: string;
  kind: AIArtifactKind;
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
  plaintext: 'txt',
  text: 'txt',
  txt: 'txt',
  csv: 'csv',
  yaml: 'yml',
  yml: 'yml',
  svg: 'svg',
  mermaid: 'mmd',
};

export function extensionFor(a: AIArtifact): string {
  if (a.kind === 'image') return 'png';
  if (a.kind === 'video') return 'mp4';
  if (a.kind === 'website') return 'html';
  if (a.kind === 'graphic') return 'svg';
  if (a.kind === 'diagram') return EXT_BY_LANG[(a.language || '').toLowerCase()] || 'mmd';
  if (a.kind === 'document') return EXT_BY_LANG[(a.language || '').toLowerCase()] || 'md';
  return EXT_BY_LANG[(a.language || '').toLowerCase()] || 'txt';
}

const CODE_BLOCK = /```([\w+-]+)?\n([\s\S]*?)```/g;
const DOC_LANGS = new Set(['markdown', 'md', 'plaintext', 'text', 'txt', 'csv']);
const COMPONENT_LANGS = new Set(['tsx', 'jsx']);
const MIN_CODE_LINES = 8;
const MIN_DOC_LINES = 8;
const MIN_STANDALONE_LINES = 8;

const CODE_INTENT =
  /(?:^|\s)(?:\/code|\/run)\b|\b(kod|code|script|skript|function|funksiya|component|komponent|fayl|file|migration|migratsiya|sql|api|endpoint|class|module|modul)\b.{0,90}\b(yoz|yarat|qil|tayyorla|build|create|write|generate|implement|make|создай|напиши|сделай)\b|\b(yoz|yarat|qil|tayyorla|build|create|write|generate|implement|make|создай|напиши|сделай)\b.{0,90}\b(kod|code|script|skript|function|funksiya|component|komponent|fayl|file|migration|migratsiya|sql|api|endpoint|class|module|modul)\b/i;

const DOC_INTENT =
  /(?:^|\s)(?:\/document|\/doc)\b|\b(hujjat|document|hisobot|report|shablon|template|markdown|md|plain text|matnli hujjat|reja hujjati|brief|spec|spetsifikatsiya|taqdimot|presentation)\b.{0,90}\b(yoz|yarat|tayyorla|qil|create|write|generate|make|создай|напиши|сделай)\b|\b(yoz|yarat|tayyorla|qil|create|write|generate|make|создай|напиши|сделай)\b.{0,90}\b(hujjat|document|hisobot|report|shablon|template|markdown|md|plain text|brief|spec|spetsifikatsiya|taqdimot|presentation)\b/i;

const APP_INTENT =
  /\b(sayt|website|web\s*site|landing\s*page|web\s*app|mini\s*app|dashboard|interactive|interaktiv|prototype|prototip|react\s*(?:app|component)|komponent|component|o['’]?yin|game|tool|kalkulyator|calculator)\b/i;

const DIAGRAM_INTENT =
  /\b(diagram|flowchart|flow\s*chart|sxema|schema|mind\s*map|architecture|arxitektura|sequence\s*diagram|mermaid|svg|vector|vektor)\b/i;

const BINARY_FILE_INTENT = /\b(xlsx|excel|docx|word|pdf|pptx|powerpoint)\b/i;

const titleFromContent = (text: string, fallback: string): string => {
  const heading = text.split('\n').find((line) => /^#{1,3}\s+\S/.test(line.trim()));
  if (heading) return heading.replace(/^#+\s*/, '').slice(0, 60);
  const htmlTitle = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (htmlTitle) return htmlTitle.slice(0, 60);
  const first = text.split('\n').find((line) => line.trim().length > 0);
  return (first || fallback).replace(/^#+\s*/, '').replace(/<[^>]+>/g, '').trim().slice(0, 60) || fallback;
};

function previousUserText(messages: AIMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i].content || '';
  }
  return '';
}

function isStandaloneHtml(body: string): boolean {
  return /<!doctype\s+html|<html\b|<body\b|<main\b|<section\b/i.test(body);
}

function pushArtifact(
  out: AIArtifact[],
  msg: AIMessage,
  index: number,
  kind: AIArtifactKind,
  body: string,
  language: string,
  fallbackTitle: string,
) {
  out.push({
    id: `${msg.id}:${kind}:${index}`,
    messageId: msg.id,
    kind,
    title: titleFromContent(body, fallbackTitle),
    language,
    content: body,
    createdAt: msg.timestamp,
  });
}

/**
 * Artifact = substantial, standalone, editable/reusable creation.
 *
 * Downloadable binary files (.xlsx/.docx/.pdf/.pptx), ordinary chat prose,
 * generated photos and videos are not auto-promoted. Those belong to the
 * Files/media flow. This mirrors the product distinction between "a file" and
 * "an editable creation".
 */
export function extractArtifacts(messages: AIMessage[]): AIArtifact[] {
  const out: AIArtifact[] = [];

  messages.forEach((msg, messageIndex) => {
    if (msg.role !== 'assistant' || msg.error) return;
    const userText = previousUserText(messages, messageIndex);
    const wantsCode = CODE_INTENT.test(userText);
    const wantsDocument = DOC_INTENT.test(userText);
    const wantsApp = APP_INTENT.test(userText);
    const wantsDiagram = DIAGRAM_INTENT.test(userText);
    const asksBinaryOnly = BINARY_FILE_INTENT.test(userText) && !wantsApp && !wantsCode && !wantsDocument && !wantsDiagram;

    if (asksBinaryOnly) return;
    if (!wantsCode && !wantsDocument && !wantsApp && !wantsDiagram) return;

    let match: RegExpExecArray | null;
    let index = 0;
    CODE_BLOCK.lastIndex = 0;

    while ((match = CODE_BLOCK.exec(msg.content)) !== null) {
      const language = (match[1] || 'text').toLowerCase();
      const body = match[2].trim();
      const lines = body.split('\n').length;
      if (!body) continue;

      if (language === 'html' && wantsApp && lines >= MIN_STANDALONE_LINES && isStandaloneHtml(body)) {
        pushArtifact(out, msg, index++, 'website', body, language, 'Website');
        continue;
      }

      if (COMPONENT_LANGS.has(language) && wantsApp && lines >= MIN_STANDALONE_LINES) {
        pushArtifact(out, msg, index++, 'component', body, language, 'Interactive component');
        continue;
      }

      if (language === 'svg' && (wantsDiagram || wantsApp) && lines >= 3) {
        pushArtifact(out, msg, index++, 'graphic', body, language, 'SVG graphic');
        continue;
      }

      if (language === 'mermaid' && wantsDiagram && lines >= 3) {
        pushArtifact(out, msg, index++, 'diagram', body, language, 'Diagram');
        continue;
      }

      if (DOC_LANGS.has(language)) {
        if (!wantsDocument || lines < MIN_DOC_LINES) continue;
        pushArtifact(out, msg, index++, 'document', body, language, 'Hujjat');
        continue;
      }

      if (!wantsCode || lines < MIN_CODE_LINES) continue;
      pushArtifact(out, msg, index++, 'code', body, language, `${language} kod`);
    }
  });

  return out;
}
