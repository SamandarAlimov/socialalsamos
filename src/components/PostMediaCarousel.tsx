import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VideoPlayer } from '@/components/VideoPlayer';
import { MediaFrame } from '@/components/media/MediaFrame';
import { ImageLightbox } from '@/components/media/ImageLightbox';
import { resolveTouchAxis, type TouchAxis } from '@/lib/touchGesture';
import { uniqueMediaCandidates } from '@/lib/mediaRecovery';

interface PostMediaCarouselProps {
  /** Primary URL for each logical media item. Kept for backward compatibility. */
  mediaUrls: string[];
  /** Ordered fallback URLs for each logical media item. */
  mediaCandidates?: string[][];
  mediaType: string;
  mediaKinds?: Array<'image' | 'video'>;
  posters?: Array<string | null | undefined>;
  altTexts?: Array<string | null | undefined>;
  overlays?: Array<ReactNode>;
}

export function PostMediaCarousel({
  mediaUrls,
  mediaCandidates,
  mediaType,
  mediaKinds,
  posters,
  altTexts,
  overlays,
}: PostMediaCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [candidateIndexes, setCandidateIndexes] = useState<Record<number, number>>({});
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [failedIndexes, setFailedIndexes] = useState<Set<number>>(() => new Set());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const swipeStartRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const swipeAxisRef = useRef<TouchAxis>('unknown');
  const didSwipeRef = useRef(false);
  const mediaFrameRef = useRef<HTMLDivElement | null>(null);

  const isReel = mediaType === 'reel' || mediaType === 'short';
  const isVideoType = mediaType === 'video' || isReel;

  const candidateSets = useMemo(
    () =>
      mediaUrls.map((url, index) =>
        uniqueMediaCandidates([...(mediaCandidates?.[index] ?? []), url]),
      ),
    [mediaCandidates, mediaUrls],
  );
  const mediaSourceKey = useMemo(
    () => candidateSets.map((items) => items.join('\u0001')).join('\u0002'),
    [candidateSets],
  );

  const activeUrlAt = useCallback(
    (index: number) => {
      const candidates = candidateSets[index] ?? [];
      const candidateIndex = candidateIndexes[index] ?? 0;
      return candidates[candidateIndex] ?? candidates[0] ?? mediaUrls[index] ?? '';
    },
    [candidateIndexes, candidateSets, mediaUrls],
  );

  const isVideoAt = useCallback(
    (index: number) => {
      const url = activeUrlAt(index) || mediaUrls[index] || '';
      if (mediaKinds?.[index] === 'video') return true;
      if (mediaKinds?.[index] === 'image') return false;

      return (
        isVideoType ||
        /\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)(?:[?#].*)?$/i.test(url)
      );
    },
    [activeUrlAt, isVideoType, mediaKinds, mediaUrls],
  );

  const imageEntries = useMemo(
    () =>
      mediaUrls
        .map((_, sourceIndex) => ({
          url: activeUrlAt(sourceIndex),
          sourceIndex,
          alt: altTexts?.[sourceIndex] || `Post media ${sourceIndex + 1}`,
        }))
        .filter(
          (item) =>
            Boolean(item.url) &&
            !failedIndexes.has(item.sourceIndex) &&
            !isVideoAt(item.sourceIndex),
        ),
    [activeUrlAt, altTexts, failedIndexes, isVideoAt, mediaUrls],
  );

  const openImageViewer = useCallback(
    (sourceIndex: number) => {
      const nextLightboxIndex = imageEntries.findIndex(
        (item) => item.sourceIndex === sourceIndex,
      );
      if (nextLightboxIndex < 0) return;

      setLightboxIndex(nextLightboxIndex);
      setLightboxOpen(true);
    },
    [imageEntries],
  );

  const findAvailableIndex = useCallback(
    (from: number, direction: -1 | 1) => {
      for (
        let index = from + direction;
        index >= 0 && index < mediaUrls.length;
        index += direction
      ) {
        if (!failedIndexes.has(index)) return index;
      }
      return -1;
    },
    [failedIndexes, mediaUrls.length],
  );

  const goToPrevious = (event: React.MouseEvent) => {
    event.stopPropagation();
    const previous = findAvailableIndex(currentIndex, -1);
    if (previous >= 0) setCurrentIndex(previous);
  };

  const goToNext = (event: React.MouseEvent) => {
    event.stopPropagation();
    const next = findAvailableIndex(currentIndex, 1);
    if (next >= 0) setCurrentIndex(next);
  };

  const currentMedia = activeUrlAt(currentIndex);
  const currentCandidateIndex = candidateIndexes[currentIndex] ?? 0;
  const isCurrentVideo = currentMedia ? isVideoAt(currentIndex) : false;
  const naturalRatio = ratios[currentIndex] ?? (isReel ? 9 / 16 : undefined);
  const allFailed = mediaUrls.length > 0 && failedIndexes.size >= mediaUrls.length;

  const advanceCurrentCandidate = useCallback(() => {
    const candidates = candidateSets[currentIndex] ?? [];
    const nextCandidateIndex = (candidateIndexes[currentIndex] ?? 0) + 1;

    if (nextCandidateIndex < candidates.length) {
      setCandidateIndexes((previous) => ({
        ...previous,
        [currentIndex]: nextCandidateIndex,
      }));
      return;
    }

    setFailedIndexes((previous) => {
      if (previous.has(currentIndex)) return previous;
      const next = new Set(previous);
      next.add(currentIndex);
      return next;
    });
  }, [candidateIndexes, candidateSets, currentIndex]);

  const retryAll = useCallback(() => {
    setCandidateIndexes({});
    setFailedIndexes(new Set());
    setRatios({});
    setCurrentIndex(0);
  }, []);

  useEffect(() => {
    retryAll();
  }, [mediaSourceKey, retryAll]);

  useEffect(() => {
    if (!failedIndexes.has(currentIndex)) return;

    const nextIndex = mediaUrls.findIndex((_, index) => !failedIndexes.has(index));
    if (nextIndex >= 0 && nextIndex !== currentIndex) {
      setCurrentIndex(nextIndex);
    }
  }, [currentIndex, failedIndexes, mediaUrls]);

  // Chrome/Edge touchpad pinch is exposed as Ctrl+wheel. On a post image that
  // gesture should open the media viewer instead of zooming the whole website.
  useEffect(() => {
    const node = mediaFrameRef.current;
    if (!node || isCurrentVideo || !currentMedia) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      openImageViewer(currentIndex);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [currentIndex, currentMedia, isCurrentVideo, openImageViewer]);

  if (mediaUrls.length === 0) return null;

  if (allFailed) {
    return (
      <div
        className="flex min-h-52 w-full flex-col items-center justify-center gap-3 bg-muted/30 px-5 py-8 text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">Media vaqtincha ochilmadi</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Saqlangan media ma'lumoti o'chirilmadi. Barcha mavjud manbalar sinaldi.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={retryAll}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Qayta urinish
        </Button>
      </div>
    );
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    didSwipeRef.current = false;
    swipeAxisRef.current = 'unknown';

    if (!isCurrentVideo && event.touches.length >= 2) {
      event.preventDefault();
      event.stopPropagation();
      swipeStartRef.current = null;
      openImageViewer(currentIndex);
      return;
    }

    if (event.touches.length === 1) {
      swipeStartRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        at: Date.now(),
      };
    } else {
      swipeStartRef.current = null;
    }
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    const touch = event.touches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (swipeAxisRef.current === 'unknown') {
      swipeAxisRef.current = resolveTouchAxis(dx, dy, {
        threshold: 8,
        horizontalRatio: 1.25,
      });
      if (swipeAxisRef.current === 'unknown') return;
    }

    if (swipeAxisRef.current === 'horizontal') {
      event.stopPropagation();
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    const changed = event.changedTouches[0];

    if (
      swipeAxisRef.current === 'horizontal' &&
      start &&
      changed &&
      mediaUrls.length > 1
    ) {
      event.stopPropagation();

      const dx = changed.clientX - start.x;
      const elapsed = Date.now() - start.at;

      if (Math.abs(dx) >= 44 && elapsed < 900) {
        didSwipeRef.current = true;
        const target = findAvailableIndex(currentIndex, dx < 0 ? 1 : -1);
        if (target >= 0) setCurrentIndex(target);
      }
    }

    swipeStartRef.current = null;
    swipeAxisRef.current = 'unknown';
  };

  const handleTouchCancel = () => {
    swipeStartRef.current = null;
    swipeAxisRef.current = 'unknown';
    didSwipeRef.current = false;
  };

  const previousAvailable = findAvailableIndex(currentIndex, -1);
  const nextAvailable = findAvailableIndex(currentIndex, 1);

  return (
    <div className="relative group w-full">
      <MediaFrame
        containerRef={mediaFrameRef}
        variant={isReel ? 'reel' : 'feed'}
        naturalRatio={naturalRatio}
        backdropUrl={
          isCurrentVideo
            ? posters?.[currentIndex] ?? null
            : currentMedia || null
        }
        className="touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {isCurrentVideo ? (
          <VideoPlayer
            key={`${currentIndex}:${currentCandidateIndex}:${currentMedia}`}
            src={currentMedia}
            poster={posters?.[currentIndex] ?? undefined}
            aspectMode="auto"
            muted={true}
            autoPlay={false}
            className="rounded-none w-full h-full"
            onPlaybackError={advanceCurrentCandidate}
            onAspectRatio={(ratio) => {
              if (ratio > 0 && Number.isFinite(ratio)) {
                setRatios((prev) => ({ ...prev, [currentIndex]: ratio }));
              }
            }}
          />
        ) : (
          <button
            type="button"
            aria-label="Rasmni to'liq ekranda ochish"
            className="relative z-[1] flex h-full w-full cursor-zoom-in items-center justify-center"
            onClick={(event) => {
              event.stopPropagation();
              if (didSwipeRef.current) {
                didSwipeRef.current = false;
                return;
              }
              openImageViewer(currentIndex);
            }}
          >
            <img
              key={`${currentIndex}:${currentCandidateIndex}:${currentMedia}`}
              src={currentMedia}
              alt={altTexts?.[currentIndex] || `Post media ${currentIndex + 1}`}
              className="h-full w-full select-none object-contain"
              loading="lazy"
              draggable={false}
              onError={advanceCurrentCandidate}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth && image.naturalHeight) {
                  setRatios((previous) => ({
                    ...previous,
                    [currentIndex]: image.naturalWidth / image.naturalHeight,
                  }));
                }
              }}
            />
          </button>
        )}

        {overlays?.[currentIndex]}

        {mediaUrls.length > 1 && (
          <>
            {previousAvailable >= 0 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-sm border-0 hover:bg-black/70 shadow-lg z-10"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-5 w-5 text-white" />
              </Button>
            )}
            {nextAvailable >= 0 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-sm border-0 hover:bg-black/70 shadow-lg z-10"
                onClick={goToNext}
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </Button>
            )}
          </>
        )}

        {mediaUrls.length > 1 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full font-medium z-10">
            {currentIndex + 1}/{mediaUrls.length}
          </div>
        )}
      </MediaFrame>

      <ImageLightbox
        open={lightboxOpen}
        images={imageEntries.map((item) => ({
          url: item.url,
          alt: item.alt,
        }))}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />

      {mediaUrls.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3">
          {mediaUrls.map((_, index) => (
            <button
              key={index}
              type="button"
              disabled={failedIndexes.has(index)}
              aria-label={`${index + 1}-media`}
              onClick={(event) => {
                event.stopPropagation();
                if (!failedIndexes.has(index)) setCurrentIndex(index);
              }}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                failedIndexes.has(index)
                  ? 'w-1.5 bg-muted-foreground/10'
                  : index === currentIndex
                    ? 'w-5 bg-foreground/80'
                    : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
