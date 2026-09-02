import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { VideoPlayer } from '@/components/VideoPlayer';
import { MediaFrame } from '@/components/media/MediaFrame';

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
  const swipeStartRef = useRef<{ x: number; y: number; at: number } | null>(null);

  // Pinch-to-zoom hook (for images)
  const {
    scale,
    translateX,
    translateY,
    isZoomed,
    handlers: zoomHandlers,
    resetZoom,
    containerRef: zoomContainerRef,
  } = usePinchZoom(3, 1);

  const isReel = mediaType === 'reel' || mediaType === 'short';
  const isVideoType = mediaType === 'video' || isReel;

  // Reset zoom when changing media
  useEffect(() => {
    resetZoom();
  }, [currentIndex, resetZoom]);

  const goToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isZoomed) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isZoomed) return;
    setCurrentIndex((prev) => (prev < mediaUrls.length - 1 ? prev + 1 : prev));
  };

  const isVideo = (url: string) => {
    return (
      isVideoType ||
      /\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)(?:[?#].*)?$/i.test(url)
    );
  };

  if (mediaUrls.length === 0) return null;

  const currentMedia = mediaUrls[currentIndex];

  const isCurrentVideo =
    mediaKinds?.[currentIndex] === 'video' ||
    (mediaKinds?.[currentIndex] !== 'image' && isVideo(currentMedia));

  // Transform style for zoomed content (images only)
  const zoomTransformStyle = {
    transform: `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`,
    transition: isZoomed ? 'none' : 'transform 0.3s ease-out',
  };

  const naturalRatio = ratios[currentIndex] ?? (isReel ? 9 / 16 : undefined);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!isCurrentVideo) zoomHandlers.onTouchStart(event);

    if (!isZoomed && event.touches.length === 1) {
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
    event.stopPropagation();
    if (!isCurrentVideo) zoomHandlers.onTouchMove(event);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();

    const start = swipeStartRef.current;
    const changed = event.changedTouches[0];
    const canSwipe =
      !isZoomed &&
      Boolean(start) &&
      Boolean(changed) &&
      mediaUrls.length > 1;

    if (canSwipe && start && changed) {
      const dx = changed.clientX - start.x;
      const dy = changed.clientY - start.y;
      const elapsed = Date.now() - start.at;
      const horizontalIntent = Math.abs(dx) > Math.abs(dy) * 1.25;

      if (horizontalIntent && Math.abs(dx) >= 44 && elapsed < 900) {
        if (dx < 0 && currentIndex < mediaUrls.length - 1) {
          setCurrentIndex((index) => index + 1);
        } else if (dx > 0 && currentIndex > 0) {
          setCurrentIndex((index) => index - 1);
        }
      }
    }

    swipeStartRef.current = null;
    if (!isCurrentVideo) zoomHandlers.onTouchEnd(event);
  };

  return (
    <div className="relative group w-full">
      {/* Main Media Display */}
      <MediaFrame
        containerRef={zoomContainerRef}
        variant={isReel ? 'reel' : 'feed'}
        naturalRatio={naturalRatio}
        className={cn(
          !isCurrentVideo && (isZoomed ? 'touch-none' : 'touch-pan-y'),
          isCurrentVideo && 'touch-pan-y',
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={!isCurrentVideo ? zoomHandlers.onDoubleClick : undefined}
        onWheel={!isCurrentVideo ? zoomHandlers.onWheel : undefined}
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
            onAspectRatio={(ratio) => {
              if (ratio > 0 && Number.isFinite(ratio)) {
                setRatios((prev) => ({ ...prev, [currentIndex]: ratio }));
              }
            }}
          />
        ) : (
          <>
            <img
              key={currentMedia}
              src={currentMedia}
              alt={altTexts?.[currentIndex] || `Post media ${currentIndex + 1}`}
              className="w-full h-full object-contain will-change-transform"
              style={zoomTransformStyle}
              loading="lazy"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setRatios((prev) => ({
                    ...prev,
                    [currentIndex]: img.naturalWidth / img.naturalHeight,
                  }));
                }
              }}
            />

            {/* Zoom indicator for images */}
            {isZoomed && (
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 z-20">
                <ZoomIn className="h-3 w-3" />
                {Math.round(scale * 100)}%
              </div>
            )}
          </>
        )}

        {overlays?.[currentIndex]}

        {/* Navigation Arrows - Only show if multiple media and not zoomed */}
        {mediaUrls.length > 1 && !isZoomed && (
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
        {mediaUrls.length > 1 && !isZoomed && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full font-medium z-10">
            {currentIndex + 1}/{mediaUrls.length}
          </div>
        )}

        {/* Zoom reset button when zoomed */}
        {isZoomed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetZoom();
            }}
            className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 z-20 hover:bg-black/80 transition-colors"
          >
            Yopish
          </button>
        )}
      </MediaFrame>

      {/* Dot Indicators - Only show if multiple media */}
      {mediaUrls.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3">
          {mediaUrls.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                if (isZoomed) return;
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
