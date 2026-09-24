import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Image as ImageIcon, Loader2, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import { resolveStorageUrl } from '@/lib/mediaUpload';

const VIDEO_PATTERN = /\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)(?:[?#].*)?$/i;

export function isPostVideoMedia(
  url: string | null | undefined,
  mediaType?: string | null,
): boolean {
  const type = (mediaType || '').toLowerCase();
  if (type === 'video' || type === 'reel' || type === 'short') return true;
  return Boolean(url && VIDEO_PATTERN.test(url));
}

export function useResolvedPostMediaUrl(url: string | null | undefined) {
  const [resolvedUrl, setResolvedUrl] = useState(url || '');
  const [isResolving, setIsResolving] = useState(Boolean(url?.startsWith('storage://')));

  useEffect(() => {
    let cancelled = false;

    if (!url) {
      setResolvedUrl('');
      setIsResolving(false);
      return;
    }

    if (!url.startsWith('storage://')) {
      setResolvedUrl(url);
      setIsResolving(false);
      return;
    }

    setIsResolving(true);
    void resolveStorageUrl(url)
      .then((resolved) => {
        if (!cancelled) setResolvedUrl(resolved);
      })
      .catch((error) => {
        console.warn('Post media URL resolve failed:', error);
        if (!cancelled) setResolvedUrl('');
      })
      .finally(() => {
        if (!cancelled) setIsResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { resolvedUrl, isResolving };
}

interface PostMediaThumbnailProps {
  url: string;
  mediaType?: string | null;
  poster?: string | null;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  className?: string;
  mediaClassName?: string;
  ariaLabel?: string;
  /** Profile grid kabi surface'larda markaziy play badge kerak bo'lmasligi mumkin. */
  showPlayOverlay?: boolean;
}

function seekVideoToPreviewFrame(video: HTMLVideoElement) {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return;

  const previewTime = Math.min(0.15, Math.max(0.04, video.duration * 0.03));
  if (video.currentTime >= previewTime - 0.01) return;

  try {
    video.currentTime = previewTime;
  } catch {
    // Browser hali seekable range bermagan bo'lsa onLoadedData yana urinadi.
  }
}

/**
 * Search, Notifications, Profile Videos va boshqa compact previewlar uchun
 * universal renderer.
 *
 * Video preview strategiyasi browserga bog'lanmaydi:
 *  1. canonical poster/thumbnail mavjud bo'lsa oddiy <img> bilan chiziladi;
 *  2. poster yo'q yoki ishlamasa, video element kichik preview frame'ga seek qiladi;
 *  3. media ham ishlamasa neytral video fallback ko'rsatiladi.
 *
 * Shu sabab Chrome/Android, Safari/iOS, Firefox va desktopda bir xil preview
 * hierarchy ishlaydi va poster bor videolarda video faylni bekorga preload qilmaymiz.
 */
export function PostMediaThumbnail({
  url,
  mediaType,
  poster,
  onClick,
  className,
  mediaClassName,
  ariaLabel = 'Postni ochish',
  showPlayOverlay = true,
}: PostMediaThumbnailProps) {
  const { resolvedUrl, isResolving } = useResolvedPostMediaUrl(url);
  const {
    resolvedUrl: resolvedPoster,
    isResolving: isPosterResolving,
  } = useResolvedPostMediaUrl(poster || '');
  const [mediaFailed, setMediaFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const isVideo = useMemo(
    () => isPostVideoMedia(url, mediaType),
    [mediaType, url],
  );

  useEffect(() => setMediaFailed(false), [resolvedUrl]);
  useEffect(() => setPosterFailed(false), [resolvedPoster]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onClick) return;
    event.stopPropagation();
    onClick(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onClick(event as unknown as MouseEvent<HTMLElement>);
  };

  const showLoading = isResolving || Boolean(isVideo && poster && isPosterResolving);
  const hasPoster = Boolean(isVideo && resolvedPoster && !posterFailed);

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden bg-muted ring-1 ring-border/60',
        onClick &&
          'cursor-pointer transition hover:ring-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      aria-label={onClick ? ariaLabel : undefined}
    >
      {showLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : isVideo ? (
        <>
          {hasPoster ? (
            <img
              src={resolvedPoster}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn('h-full w-full object-cover', mediaClassName)}
              onError={() => setPosterFailed(true)}
            />
          ) : !mediaFailed && resolvedUrl ? (
            <video
              src={resolvedUrl}
              muted
              playsInline
              preload="metadata"
              className={cn('h-full w-full object-cover', mediaClassName)}
              onLoadedMetadata={(event) => seekVideoToPreviewFrame(event.currentTarget)}
              onLoadedData={(event) => seekVideoToPreviewFrame(event.currentTarget)}
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-900">
              <Play className="h-5 w-5 fill-white text-white" />
            </div>
          )}

          {showPlayOverlay ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur">
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              </span>
            </span>
          ) : null}
        </>
      ) : mediaFailed || !resolvedUrl ? (
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      ) : (
        <img
          src={resolvedUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn('h-full w-full object-cover', mediaClassName)}
          onError={() => setMediaFailed(true)}
        />
      )}
    </div>
  );
}
