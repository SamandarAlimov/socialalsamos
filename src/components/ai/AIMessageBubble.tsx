import {
  ExternalLink,
  FileArchive,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Music2,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIAttachmentMeta, AIMessage } from './types';
import {
  AIMessageBubble as AIMessageBubbleV2,
  AIThinkingBubble,
} from './AIMessageBubbleV2';

function formatBytes(value?: number) {
  if (!value || value <= 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function extension(name: string) {
  const clean = name.split('?')[0];
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index + 1).toUpperCase().slice(0, 6) : 'FILE';
}

function attachmentKind(file: AIAttachmentMeta) {
  const type = (file.type || '').toLowerCase();
  const ext = extension(file.name).toLowerCase();
  if (type.includes('image') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (type.includes('video') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (type.includes('audio') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (type.includes('code') || ['js', 'jsx', 'ts', 'tsx', 'py', 'dart', 'sql', 'json', 'html', 'css', 'sh', 'md', 'yaml', 'yml'].includes(ext)) return 'code';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  return 'file';
}

function cleanUserText(message: AIMessage) {
  if (!message.attachments?.length) return message.content;
  const generatedLines = new Set(
    message.attachments.map((file) => `[${file.type}] ${file.name}: ${file.url}`),
  );
  return message.content
    .split('\n')
    .filter((line) => !generatedLines.has(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function FileMeta({ file }: { file: AIAttachmentMeta }) {
  const kind = attachmentKind(file);
  const Icon =
    kind === 'code'
      ? FileCode2
      : kind === 'archive'
        ? FileArchive
        : kind === 'audio'
          ? Music2
          : FileText;

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/35"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">{file.name}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>{extension(file.name)}</span>
          {formatBytes(file.size) && <><span>·</span><span>{formatBytes(file.size)}</span></>}
        </span>
      </span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function AttachmentPreview({ file }: { file: AIAttachmentMeta }) {
  const kind = attachmentKind(file);

  if (kind === 'image') {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group relative block w-[min(300px,78vw)] overflow-hidden rounded-2xl border border-border/70 bg-muted/30 shadow-sm"
      >
        <div className="flex min-h-36 items-center justify-center bg-muted/25">
          <img src={file.url} alt={file.name} loading="lazy" className="max-h-64 w-full object-contain" />
        </div>
        <div className="flex items-center gap-2 border-t border-border/50 bg-card/95 px-3 py-2">
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{file.name}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
        </div>
      </a>
    );
  }

  if (kind === 'video') {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group block w-[min(330px,80vw)] overflow-hidden rounded-2xl border border-border/70 bg-black shadow-sm"
      >
        <div className="relative aspect-video bg-black">
          <video src={file.url} muted playsInline preload="metadata" className="h-full w-full object-contain" />
          <span className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur">
            <Video className="h-4 w-4" />
          </span>
        </div>
        <div className="flex items-center gap-2 bg-card px-3 py-2 text-foreground">
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{file.name}</span>
          <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
        </div>
      </a>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="w-[min(340px,82vw)] rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/70">
            <Music2 className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold">{file.name}</p>
            <p className="text-[9px] text-muted-foreground">{formatBytes(file.size) || 'Audio'}</p>
          </div>
        </div>
        <audio src={file.url} controls preload="metadata" className="h-8 w-full" />
      </div>
    );
  }

  return <FileMeta file={file} />;
}

function UserMessageBubble({ message }: { message: AIMessage }) {
  const text = cleanUserText(message);
  const files = message.attachments ?? [];

  return (
    <div className="mb-5 flex min-w-0 flex-col items-end gap-2 overflow-hidden">
      {text && (
        <div className="min-w-0 max-w-[88%] overflow-hidden rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-background shadow-sm sm:max-w-[82%]">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{text}</p>
        </div>
      )}

      {files.length > 0 && (
        <div
          className={cn(
            'grid max-w-[88%] gap-2 sm:max-w-[82%]',
            files.length > 1 && 'sm:grid-cols-2',
          )}
        >
          {files.map((file) => <AttachmentPreview key={`${file.url}-${file.name}`} file={file} />)}
        </div>
      )}
    </div>
  );
}

interface Props {
  message: AIMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

export function AIMessageBubble(props: Props) {
  if (props.message.role === 'user') return <UserMessageBubble message={props.message} />;
  return <AIMessageBubbleV2 {...props} />;
}

export { AIThinkingBubble };
