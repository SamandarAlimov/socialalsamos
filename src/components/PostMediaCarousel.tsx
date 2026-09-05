import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VideoPlayer } from '@/components/VideoPlayer';
import { MediaFrame } from '@/components/media/MediaFrame';
import { ImageLightbox } from '@/components/media/ImageLightbox';
import { resolveTouchAxis, type TouchAxis } from '@/lib/touchGesture';

interface PostMediaCarouselProps {
  mediaUrls: string[];
  mediaType: string;
  mediaKinds?: Array<'image' | 'video'>;
  posters?: Array<string | null | undefined>;
  altTexts?: Array<string | null | undefined>;
  overlays?: Array<ReactNode>;
}

export function PostMediaCarousel({
  mediaUrls,
  mediaType,
  mediaKinds,
  posters,
  altTexts,
  overlays,
}: PostMediaCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
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

  const isVideoAt = useCallback(
    (index: number) => {
      const url = mediaUrls[index] ?? '';
      if (mediaKinds?.[index] === 'video') return true;
      if (mediaKinds?.[index] === 'image') return false;

      return (
        isVideoType ||
        /\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)(?:[?#].*)?$/i.test(url)
      );
    },
    [isVideoType, mediaKinds, mediaUrls],
  );

  const imageEntries = useMemo(
    () =>
      mediaUrls
        .map((url, sourceIndex) => ({
          url,
          sourceIndex,
          alt: altTexts?.[sourceIndex] || `Post media ${sourceIndex + 1}`,
        }))
        .filter((item) => !isVideoAt(item.sourceIndex)),
    [altTexts, isVideoAt, mediaUrls],
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

  const goToPrevious = (event: React.MouseEvent) => {
    event.stopPropagation();
    setCurrentIndex((previous) => (previous > 0 ? previous - 1 : previous));
  };

  const goToNext = (event: React.MouseEvent) => {
    event.stopPropagation();
    setCurrentIndex((previous) =>
      previous < mediaUrls.length - 1 ? previous + 1 : previous,
    );
  };

  const currentMedia = mediaUrls[currentIndex] ?? '';
  const isCurrentVideo = currentMedia ? isVideoAt(currentIndex) : false;
  const naturalRatio = ratios[currentIndex] ?? (isReel ? 9 / 16 : undefined);

  useEffect(() => {
    setFailedIndexes(new Set());
    setCurrentIndex(0);
  }, [mediaUrls.join('|')]);

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

  if (failedIndexes.size >= mediaUrls.length) return null;

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

    // Faqat carouselning real gorizontal swipe'i parent page gesture'idan
    // ajratiladi. Vertikal gesture native feed scroll bo'lib qoladi.
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
        if (dx < 0 && currentIndex < mediaUrls.length - 1) {
          setCurrentIndex((index) => index + 1);
        } else if (dx > 0 && currentIndex > 0) {
          setCurrentIndex((index) => index - 1);
        }
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

  return (
    <div className="relative group w-full">
      {/* Main Media Display */}
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
            key={currentMedia}
            src={currentMedia}
            poster={posters?.[currentIndex] ?? undefined}
            aspectMode="auto"
            muted={true}
            autoPlay={false}
            className="rounded-none w-full h-full"
            onPlaybackError={() => {
              setFailedIndexes((previous) => {
                if (previous.has(currentIndex)) return previous;
                const next = new Set(previous);
                next.add(currentIndex);
                return next;
              });
            }}
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
              key={currentMedia}
              src={currentMedia}
              alt={altTexts?.[currentIndex] || `Post media ${currentIndex + 1}`}
              className="h-full w-full select-none object-contain"
              loading="lazy"
              draggable={false}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth && image.naturalHeight) {
                  setRatios((previous) => ({
                    ...previous,
                    [currentIndex]:
                      image.naturalWidth / image.naturalHeight,
                  }));
                }
              }}
            />
          </button>
        )}

        {overlays?.[currentIndex]}

        {/* Navigation Arrows - Only show if multiple media and not zoomed */}
        {mediaUrls.length > 1 && (
          <>
            {currentIndex > 0 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-sm border-0 hover:bg-black/70 shadow-lg z-10"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-5 w-5 text-white" />
              </Button>
            )}
            {currentIndex < mediaUrls.length - 1 && (
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

        {/* Media Counter */}
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

      {/* Dot Indicators - Only show if multiple media */}
      {mediaUrls.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3">
          {mediaUrls.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(index);
              }}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                index === currentIndex
                  ? "w-5 bg-foreground/80"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
