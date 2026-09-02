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
}

/**
 * Search, Notifications va boshqa compact post previewlar uchun bitta renderer.
 * Video hech qachon <img src=".mp4"> sifatida chizilmaydi.
 */
export function PostMediaThumbnail({
  url,
  mediaType,
  poster,
  onClick,
  className,
  mediaClassName,
  ariaLabel = 'Postni ochish',
}: PostMediaThumbnailProps) {
  const { resolvedUrl, isResolving } = useResolvedPostMediaUrl(url);
  const { resolvedUrl: resolvedPoster } = useResolvedPostMediaUrl(poster || '');
  const [failed, setFailed] = useState(false);
  const isVideo = useMemo(
    () => isPostVideoMedia(url, mediaType),
    [mediaType, url],
  );

  useEffect(() => setFailed(false), [resolvedUrl, resolvedPoster]);

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
      {isResolving ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : failed || !resolvedUrl ? (
        isVideo ? (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900">
            <Play className="h-5 w-5 fill-white text-white" />
          </div>
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )
      ) : isVideo ? (
        <>
          <video
            src={resolvedUrl}
            poster={resolvedPoster || undefined}
            muted
            playsInline
            preload="metadata"
            className={cn('h-full w-full object-cover', mediaClassName)}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (!resolvedPoster && video.duration > 0) {
                try {
                  video.currentTime = Math.min(
                    0.08,
                    Math.max(0, video.duration - 0.05),
                  );
                } catch {
                  // Safari ba'zan metadata bosqichida seek'ni bloklaydi.
                }
              }
            }}
            onError={() => setFailed(true)}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </span>
        </>
      ) : (
        <img
          src={resolvedUrl}
          alt=""
          loading="lazy"
          className={cn('h-full w-full object-cover', mediaClassName)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
