import { useState } from 'react';
import { FileText, Download, FileArchive, FileImage, FileVideo, FileAudio, FileCode, FileSpreadsheet, Play } from 'lucide-react';
import { VideoMessagePlayer } from './messages/VideoMessagePlayer';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { AudioFilePlayer } from './messages/AudioFilePlayer';
import { TelegramImageViewer } from './messages/TelegramImageViewer';
import { cn } from '@/lib/utils';

interface MessageAttachmentProps {
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  name?: string;
  isMine?: boolean;
  autoPlay?: boolean;
  senderName?: string;
  size?: number;
}

const DOC_ICONS: Array<{ test: RegExp; icon: typeof FileText }> = [
  { test: /\.(zip|rar|7z|tar|gz)$/i, icon: FileArchive },
  { test: /\.(png|jpe?g|gif|webp|svg|heic|bmp)$/i, icon: FileImage },
  { test: /\.(mp4|mov|mkv|avi|webm)$/i, icon: FileVideo },
  { test: /\.(mp3|wav|ogg|m4a|flac)$/i, icon: FileAudio },
  { test: /\.(js|ts|tsx|jsx|json|py|java|c|cpp|go|rs|html|css|sh)$/i, icon: FileCode },
  { test: /\.(xls|xlsx|csv)$/i, icon: FileSpreadsheet },
];

function docIconFor(fileName: string) {
  for (const entry of DOC_ICONS) {
    if (entry.test.test(fileName)) return entry.icon;
  }
  return FileText;
}

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value < 10 && unitIndex > 0 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}

async function downloadFile(url: string, fileName: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function MessageAttachment({
  url,
  type,
  name,
  isMine,
  autoPlay = false,
  senderName,
  size,
}: MessageAttachmentProps) {
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Check if it's a GIF
  const isGif = url.includes('giphy.com') || url.includes('.gif') || url.includes('[media:gif:');

  // Check if it's a music/audio file (not voice message)
  const isVoiceMessage = name?.toLowerCase().includes('voice') || url.includes('voice') || !name;
  const isMusicFile = type === 'audio' && name && !isVoiceMessage;

  if (type === 'image' || isGif) {
    const actualUrl = url.startsWith('[media:gif:')
      ? url.replace('[media:gif:', '').replace(']', '')
      : url;

    return (
      <>
        <div
          className={cn(
            'group relative w-full max-w-[320px] cursor-pointer overflow-hidden rounded-2xl bg-muted/50',
            !imageLoaded && 'min-h-[140px] animate-pulse'
          )}
          onClick={() => setShowFullscreen(true)}
        >
          <img
            src={actualUrl}
            alt={name || 'Rasm'}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            className="block h-auto max-h-[420px] w-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
          />

          {isGif && (
            <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
              GIF
            </span>
          )}

          {/* Telegram-style download affordance on hover */}
          <button
            type="button"
            aria-label="Yuklab olish"
            onClick={(e) => {
              e.stopPropagation();
              downloadFile(actualUrl, name || actualUrl.split('/').pop() || 'image');
            }}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>

        <TelegramImageViewer
          open={showFullscreen}
          url={actualUrl}
          name={name}
          onClose={() => setShowFullscreen(false)}
        />
      </>
    );
  }

  if (type === 'video') {
    // Check if video was recorded from webcam (TelegramMediaRecorder uses 'video_' prefix)
    const isWebcamRecording = url.includes('/video_') || url.includes('video_');
    return (
      <div className="w-full max-w-[320px] overflow-hidden rounded-2xl">
        <VideoMessagePlayer
          url={url}
          isMine={isMine}
          autoPlay={autoPlay}
          isWebcamRecording={isWebcamRecording}
        />
      </div>
    );
  }

  if (type === 'audio') {
    // Use AudioFilePlayer for music files, VoiceMessagePlayer for voice messages
    if (isMusicFile) {
      return <AudioFilePlayer url={url} name={name} isMine={isMine} senderName={senderName} />;
    }
    return <VoiceMessagePlayer url={url} isMine={isMine} autoPlay={autoPlay} />;
  }

  // Document type - Telegram-style file row
  const fileName = name || url.split('/').pop() || 'Document';
  const fileExtension = fileName.split('.').pop()?.toUpperCase() || 'FILE';
  const DocIcon = docIconFor(fileName);
  const prettySize = formatBytes(size);

  return (
    <div
      className={cn(
        'flex min-w-[220px] max-w-[320px] items-center gap-3 rounded-2xl p-2.5 transition-colors',
        isMine ? 'bg-primary-foreground/10' : 'bg-muted'
      )}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95',
          isMine ? 'bg-primary-foreground/20' : 'bg-primary/10'
        )}
        aria-label={fileName}
      >
        <DocIcon className={cn('h-5 w-5', isMine ? 'text-primary-foreground' : 'text-primary')} />
      </a>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[14px] font-medium',
            isMine ? 'text-primary-foreground' : 'text-foreground'
          )}
          title={fileName}
        >
          {fileName}
        </p>
        <p
          className={cn(
            'mt-0.5 truncate text-[11px]',
            isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {[prettySize, fileExtension].filter(Boolean).join(' \u00b7 ')}
        </p>
      </div>

      <button
        type="button"
        aria-label="Yuklab olish"
        onClick={(e) => {
          e.stopPropagation();
          downloadFile(url, fileName);
        }}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
          isMine
            ? 'text-primary-foreground/80 hover:bg-primary-foreground/15'
            : 'text-muted-foreground hover:bg-foreground/10'
        )}
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}
