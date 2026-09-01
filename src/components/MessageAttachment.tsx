import { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  FileArchive,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  ImageOff,
  ExternalLink,
  RotateCw,
} from 'lucide-react';
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

/**
 * Rasm ramkasining aniq kengligi (piksel).
 *
 * NEGA AYNAN PIKSEL, `w-full` EMAS: xabar bubble'i kengligini mazmuniga qarab
 * o'lchaydi (shrink-to-fit). Ichidagi element `width: 100%` so'rasa aylanma
 * bog'liqlik hosil bo'ladi - bubble rasmdan, rasm bubble'dan o'lcham kutadi.
 * Rasm yuklanmagan yoki URL buzuq bo'lsa uning tabiiy kengligi 0 bo'ladi va
 * butun karta ingichka chiziqqa yig'ilib qoladi. Aniq piksel kengligi bu
 * regressiyani butunlay yopadi.
 */
const IMAGE_FRAME_WIDTH = 320;
/** Yuklanmagan holatda joy band qilib turiladi - lenta sakramaydi */
const IMAGE_SKELETON_HEIGHT = 180;

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

/** Xato kartasida ko'rsatiladigan host (diagnostika uchun) */
function hostOf(url: string): string {
  try {
    return new URL(url, window.location.origin).hostname;
  } catch {
    return 'noma\u2018lum manba';
  }
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
  const [imageFailed, setImageFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // URL o'zgarsa holat tozalanadi (masalan xabar tahrirlanganda)
  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
    setAttempt(0);
  }, [url]);

  // Check if it's a GIF
  const isGif = url.includes('giphy.com') || url.includes('.gif') || url.includes('[media:gif:');

  // Check if it's a music/audio file (not voice message)
  const isVoiceMessage = name?.toLowerCase().includes('voice') || url.includes('voice') || !name;
  const isMusicFile = type === 'audio' && name && !isVoiceMessage;

  if (type === 'image' || isGif) {
    const actualUrl = url.startsWith('[media:gif:')
      ? url.replace('[media:gif:', '').replace(']', '')
      : url;

    // Keshdagi buzuq javobni chetlab o'tish uchun qayta urinishda parametr qo'shiladi
    const srcUrl =
      attempt > 0
        ? `${actualUrl}${actualUrl.includes('?') ? '&' : '?'}retry=${attempt}`
        : actualUrl;

    const retry = () => {
      setImageFailed(false);
      setImageLoaded(false);
      setAttempt((value) => value + 1);
    };

    /* Rasm yuklanmasa: ilgari hech qanday belgi yo'q edi - karta shunchaki
       yig'ilib qolardi va sababi ko'rinmasdi. Endi aniq xato holati,
       qayta urinish va "yangi oynada ochish" bor: ochilgan havola brauzerda
       haqiqiy xatoni (403 / 404 / expired) ko'rsatadi. */
    if (imageFailed) {
      return (
        <div
          className={cn(
            'flex flex-col items-start gap-2 rounded-2xl p-3',
            isMine ? 'bg-primary-foreground/10' : 'bg-muted'
          )}
          style={{ width: IMAGE_FRAME_WIDTH, maxWidth: '100%' }}
        >
          <div className="flex items-center gap-2">
            <ImageOff
              className={cn('h-4 w-4 shrink-0', isMine ? 'text-primary-foreground/80' : 'text-muted-foreground')}
            />
            <div className="min-w-0">
              <p
                className={cn(
                  'text-[13px] font-medium leading-tight',
                  isMine ? 'text-primary-foreground' : 'text-foreground'
                )}
              >
                Rasm yuklanmadi
              </p>
              <p
                className={cn(
                  'truncate text-[11px]',
                  isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                )}
                title={actualUrl}
              >
                {hostOf(actualUrl)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                retry();
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                isMine
                  ? 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25'
                  : 'bg-background text-foreground hover:bg-foreground/10'
              )}
            >
              <RotateCw className="h-3 w-3" />
              Qayta urinish
            </button>
            <a
              href={actualUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                isMine
                  ? 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25'
                  : 'bg-background text-foreground hover:bg-foreground/10'
              )}
            >
              <ExternalLink className="h-3 w-3" />
              Yangi oynada
            </a>
          </div>
        </div>
      );
    }

    return (
      <>
        <div
          className="group relative cursor-pointer overflow-hidden rounded-2xl bg-muted/50"
          /* Aniq kenglik: bubble qisqarsa ham karta chiziqqa aylanmaydi.
             Yuklanmagan paytda balandlik ham band - lenta sakramaydi. */
          style={{
            width: IMAGE_FRAME_WIDTH,
            maxWidth: '100%',
            minHeight: imageLoaded ? undefined : IMAGE_SKELETON_HEIGHT,
          }}
          onClick={() => setShowFullscreen(true)}
        >
          {!imageLoaded && (
            <span className="absolute inset-0 animate-pulse rounded-2xl bg-muted" aria-hidden="true" />
          )}

          <img
            src={srcUrl}
            alt={name || 'Rasm'}
            /* `lazy` EMAS: chat lentasi transform/contain qatlamlari ichida
               bo'lgani uchun lazy kuzatuvchi ba'zan ishga tushmay, bo'sh
               ramka qoldirardi. */
            loading="eager"
            decoding="async"
            draggable={false}
            onLoad={() => {
              setImageLoaded(true);
              setImageFailed(false);
            }}
            onError={() => setImageFailed(true)}
            className="relative block h-auto max-h-[420px] w-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
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
      <div
        className="overflow-hidden rounded-2xl"
        /* Rasm bilan bir xil sabab: `w-full` shrink-to-fit bubble ichida
           yig'ilib qolardi. */
        style={{ width: IMAGE_FRAME_WIDTH, maxWidth: '100%' }}
      >
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
