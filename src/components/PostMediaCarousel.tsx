import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PostMediaCarouselProps {
  mediaUrls: string[];
  mediaType: string;
}

export function PostMediaCarousel({ mediaUrls, mediaType }: PostMediaCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < mediaUrls.length - 1 ? prev + 1 : prev));
  };

  const isVideo = (url: string) => {
    return mediaType === 'video' || url.match(/\.(mp4|webm|mov)$/i);
  };

  if (mediaUrls.length === 0) return null;

  return (
    <div className="relative group">
      {/* Main Media Display */}
      <div className="relative overflow-hidden aspect-[4/3] md:aspect-video bg-black/5">
        {isVideo(mediaUrls[currentIndex]) ? (
          <video
            key={mediaUrls[currentIndex]}
            src={mediaUrls[currentIndex]}
            controls
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          <img
            key={mediaUrls[currentIndex]}
            src={mediaUrls[currentIndex]}
            alt={`Post media ${currentIndex + 1}`}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        )}

        {/* Navigation Arrows - Only show if multiple media */}
        {mediaUrls.length > 1 && (
          <>
            {currentIndex > 0 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm shadow-lg"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {currentIndex < mediaUrls.length - 1 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm shadow-lg"
                onClick={goToNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </>
        )}

        {/* Media Counter */}
        {mediaUrls.length > 1 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full font-medium">
            {currentIndex + 1}/{mediaUrls.length}
          </div>
        )}
      </div>

      {/* Dot Indicators - Only show if multiple media */}
      {mediaUrls.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {mediaUrls.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(index);
              }}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                index === currentIndex 
                  ? "w-4 bg-primary" 
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
