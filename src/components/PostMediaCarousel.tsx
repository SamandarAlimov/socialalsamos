import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { VideoPlayer } from '@/components/VideoPlayer';

interface PostMediaCarouselProps {
  mediaUrls: string[];
  mediaType: string;
}

export function PostMediaCarousel({ mediaUrls, mediaType }: PostMediaCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

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
    return isVideoType || url.match(/\.(mp4|webm|mov)$/i);
  };

  if (mediaUrls.length === 0) return null;

  const currentMedia = mediaUrls[currentIndex];

  const isCurrentVideo = isVideo(currentMedia);

  // Transform style for zoomed content (images only)
  const zoomTransformStyle = {
    transform: `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`,
    transition: isZoomed ? 'none' : 'transform 0.3s ease-out',
  };

  return (
    <div className="relative group w-full">
      {/* Main Media Display */}
      <div
        ref={zoomContainerRef}
        className={cn(
          "relative overflow-hidden bg-black",
          isCurrentVideo ? "" : "touch-none aspect-square md:aspect-[4/3]"
        )}
        onTouchStart={!isCurrentVideo ? zoomHandlers.onTouchStart : undefined}
        onTouchMove={!isCurrentVideo ? zoomHandlers.onTouchMove : undefined}
        onTouchEnd={!isCurrentVideo ? zoomHandlers.onTouchEnd : undefined}
        onDoubleClick={!isCurrentVideo ? zoomHandlers.onDoubleClick : undefined}
        onWheel={!isCurrentVideo ? zoomHandlers.onWheel : undefined}
      >
        {isCurrentVideo ? (
          <VideoPlayer
            key={currentMedia}
            src={currentMedia}
            aspectMode={isReel ? 'portrait' : 'auto'}
            muted={true}
            autoPlay={false}
            className="rounded-none"
          />
        ) : (
          <>
            <img
              key={currentMedia}
              src={currentMedia}
              alt={`Post media ${currentIndex + 1}`}
              className="w-full h-full object-cover will-change-transform"
              style={zoomTransformStyle}
              loading="lazy"
              draggable={false}
            />

            {/* Zoom indicator for images */}
            {isZoomed && (
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 z-20">
                <ZoomIn className="h-3 w-3" />
                {Math.round(scale * 100)}%
              </div>
            )}

            {/* Double-tap hint for images (shows briefly) */}
            {!isZoomed && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white/70 text-[10px] px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Ikki marta bosib kattalashtiring
              </div>
            )}
          </>
        )}

        {/* Navigation Arrows - Only show if multiple media and not zoomed */}
        {mediaUrls.length > 1 && !isZoomed && (
          <>
            {currentIndex > 0 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-sm border-0 hover:bg-black/70 shadow-lg z-10"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-5 w-5 text-white" />
              </Button>
            )}
            {currentIndex < mediaUrls.length - 1 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-sm border-0 hover:bg-black/70 shadow-lg z-10"
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
      </div>

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
                  ? "w-5 bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark" 
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
