import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Trash2, 
  Sparkles, 
  Music, 
  Scissors,
  X,
  Sticker,
  Pencil,
  Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FILTERS, MUSIC_TRACKS } from './filters/FilterData';
import { useIsMobile } from '@/hooks/use-mobile';

interface MediaFile {
  id: string;
  file?: File;
  url: string;
  type: 'image' | 'video' | 'audio';
  filter?: string;
  musicTrack?: typeof MUSIC_TRACKS[0];
  musicStartTime?: number;
  aspectRatio?: number; // width / height
}

interface ResponsiveMediaPreviewProps {
  mediaFiles: MediaFile[];
  currentMediaIndex: number;
  onSetCurrentIndex: (index: number) => void;
  onRemoveMedia: (id: string) => void;
  onRemoveMusic: () => void;
  onOpenFilters: () => void;
  onOpenMusic: () => void;
  onOpenEditor?: () => void;
  onOpenStickers?: () => void;
  onOpenDrawing?: () => void;
  variant?: 'post' | 'story' | 'reel';
  onMediaAspectRatioDetected?: (id: string, ratio: number) => void;
}

// Detect aspect ratio from media element
function getMediaAspectRatio(naturalWidth: number, naturalHeight: number): number {
  return naturalWidth / naturalHeight;
}

// Get container style based on detected or preferred aspect ratio
function getContainerStyle(
  aspectRatio: number | undefined,
  variant: 'post' | 'story' | 'reel',
  isMobile: boolean
): { aspectRatio?: string; maxHeight: string; maxWidth?: string } {
  // Use original aspect ratio if detected
  if (aspectRatio) {
    const isPortrait = aspectRatio < 1;
    const isLandscape = aspectRatio > 1;
    const isSquare = Math.abs(aspectRatio - 1) < 0.1;

    if (isSquare) {
      return { aspectRatio: '1', maxHeight: isMobile ? '400px' : '500px' };
    } else if (isPortrait) {
      // Portrait: limit height, allow natural width
      return { 
        aspectRatio: `${aspectRatio}`, 
        maxHeight: isMobile ? '500px' : '600px',
        maxWidth: isMobile ? '100%' : '400px'
      };
    } else {
      // Landscape: limit width, allow natural height
      return { 
        aspectRatio: `${aspectRatio}`, 
        maxHeight: isMobile ? '300px' : '450px' 
      };
    }
  }

  // Default fallback based on variant
  if (variant === 'story' || variant === 'reel') {
    return { aspectRatio: '9/16', maxHeight: isMobile ? '500px' : '600px', maxWidth: '340px' };
  }
  return { aspectRatio: '1', maxHeight: isMobile ? '400px' : '500px' };
}

export function ResponsiveMediaPreview({
  mediaFiles,
  currentMediaIndex,
  onSetCurrentIndex,
  onRemoveMedia,
  onRemoveMusic,
  onOpenFilters,
  onOpenMusic,
  onOpenEditor,
  onOpenStickers,
  onOpenDrawing,
  variant = 'post',
  onMediaAspectRatioDetected
}: ResponsiveMediaPreviewProps) {
  const isMobile = useIsMobile();
  const currentMedia = mediaFiles[currentMediaIndex];
  const [mediaAspectRatios, setMediaAspectRatios] = useState<Record<string, number>>({});

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>, mediaId: string) => {
    const img = e.currentTarget;
    const ratio = getMediaAspectRatio(img.naturalWidth, img.naturalHeight);
    setMediaAspectRatios(prev => ({ ...prev, [mediaId]: ratio }));
    onMediaAspectRatioDetected?.(mediaId, ratio);
  }, [onMediaAspectRatioDetected]);

  const handleVideoLoad = useCallback((e: React.SyntheticEvent<HTMLVideoElement>, mediaId: string) => {
    const video = e.currentTarget;
    const ratio = getMediaAspectRatio(video.videoWidth, video.videoHeight);
    setMediaAspectRatios(prev => ({ ...prev, [mediaId]: ratio }));
    onMediaAspectRatioDetected?.(mediaId, ratio);
  }, [onMediaAspectRatioDetected]);

  if (!currentMedia) return null;

  const detectedRatio = currentMedia.aspectRatio || mediaAspectRatios[currentMedia.id];
  const containerStyle = getContainerStyle(detectedRatio, variant, isMobile);

  return (
    <div className="space-y-4">
      {/* Main Preview */}
      <div 
        className={cn(
          "relative rounded-2xl overflow-hidden bg-muted mx-auto w-full"
        )}
        style={{
          aspectRatio: containerStyle.aspectRatio,
          maxHeight: containerStyle.maxHeight,
          maxWidth: containerStyle.maxWidth
        }}
      >
        {currentMedia.type === 'video' ? (
          <video
            src={currentMedia.url}
            className="w-full h-full object-contain"
            controls
            playsInline
            onLoadedMetadata={(e) => handleVideoLoad(e, currentMedia.id)}
            style={{ filter: FILTERS.find(f => f.id === currentMedia.filter)?.style }}
          />
        ) : (
          <img
            src={currentMedia.url}
            alt="Preview"
            className="w-full h-full object-contain"
            onLoad={(e) => handleImageLoad(e, currentMedia.id)}
            style={{ filter: FILTERS.find(f => f.id === currentMedia.filter)?.style }}
          />
        )}

        {/* Aspect Ratio Badge */}
        {detectedRatio && (
          <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 text-xs flex items-center gap-1">
            <Maximize2 className="h-3 w-3" />
            {detectedRatio > 1.5 ? '16:9' : detectedRatio < 0.7 ? '9:16' : Math.abs(detectedRatio - 1) < 0.1 ? '1:1' : detectedRatio.toFixed(2)}
          </div>
        )}

        {/* Music Overlay */}
        {currentMedia.musicTrack && (
          <div className={cn(
            "absolute left-3 right-3 bg-background/90 backdrop-blur-sm rounded-xl p-2 flex items-center gap-2",
            isMobile ? "bottom-3" : "bottom-4 p-3 gap-3"
          )}>
            <div className={cn(
              "bg-primary rounded-lg flex items-center justify-center",
              isMobile ? "w-8 h-8" : "w-10 h-10"
            )}>
              <Music className={cn(isMobile ? "h-4 w-4" : "h-5 w-5", "text-primary-foreground")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("font-medium truncate", isMobile && "text-sm")}>{currentMedia.musicTrack.name}</p>
              <p className={cn("text-muted-foreground truncate", isMobile ? "text-xs" : "text-sm")}>{currentMedia.musicTrack.artist}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onRemoveMusic} className={cn(isMobile && "h-8 w-8")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Delete Button */}
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "absolute top-2 right-2",
            isMobile && "h-8 w-8"
          )}
          onClick={() => onRemoveMedia(currentMedia.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        {/* Navigation Arrows */}
        {mediaFiles.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "absolute left-2 top-1/2 -translate-y-1/2",
                isMobile && "h-8 w-8"
              )}
              onClick={() => onSetCurrentIndex(Math.max(0, currentMediaIndex - 1))}
              disabled={currentMediaIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2",
                isMobile && "h-8 w-8"
              )}
              onClick={() => onSetCurrentIndex(Math.min(mediaFiles.length - 1, currentMediaIndex + 1))}
              disabled={currentMediaIndex === mediaFiles.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Dots Indicator */}
        {mediaFiles.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {mediaFiles.map((_, i) => (
              <button
                key={i}
                onClick={() => onSetCurrentIndex(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i === currentMediaIndex ? "bg-primary" : "bg-foreground/30"
                )}
              />
            ))}
          </div>
        )}

        {/* Side Tools (Story/Reel) */}
        {(variant === 'story' || variant === 'reel') && (
          <div className="absolute top-12 right-2 flex flex-col gap-2">
            <Button variant="secondary" size="icon" onClick={onOpenFilters} className={cn(isMobile && "h-9 w-9")}>
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" onClick={onOpenMusic} className={cn(isMobile && "h-9 w-9")}>
              <Music className="h-4 w-4" />
            </Button>
            {onOpenEditor && currentMedia.type === 'video' && (
              <Button variant="secondary" size="icon" onClick={onOpenEditor} className={cn(isMobile && "h-9 w-9")}>
                <Scissors className="h-4 w-4" />
              </Button>
            )}
            {onOpenStickers && (
              <Button variant="secondary" size="icon" onClick={onOpenStickers} className={cn(isMobile && "h-9 w-9")}>
                <Sticker className="h-4 w-4" />
              </Button>
            )}
            {onOpenDrawing && (
              <Button variant="secondary" size="icon" onClick={onOpenDrawing} className={cn(isMobile && "h-9 w-9")}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Thumbnail Strip */}
      {mediaFiles.length > 1 && (
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2 justify-center">
            {mediaFiles.map((media, i) => (
              <button
                key={media.id}
                onClick={() => onSetCurrentIndex(i)}
                className={cn(
                  "relative rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors",
                  isMobile ? "w-14 h-14" : "w-16 h-16",
                  i === currentMediaIndex ? "border-primary" : "border-transparent"
                )}
              >
                {media.type === 'video' ? (
                  <>
                    <video src={media.url} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                      <Play className="h-4 w-4" />
                    </div>
                  </>
                ) : (
                  <img src={media.url} alt="" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Media Tools Bar (Post variant) */}
      {variant === 'post' && (
        <div className="flex gap-2 overflow-x-auto pb-2 justify-center">
          <Button
            variant="outline"
            size={isMobile ? "sm" : "default"}
            onClick={onOpenFilters}
            className="flex-shrink-0 gap-2"
          >
            <Sparkles className="h-4 w-4" />
            <span className={cn(isMobile && "hidden sm:inline")}>Filters</span>
          </Button>
          <Button
            variant="outline"
            size={isMobile ? "sm" : "default"}
            onClick={onOpenMusic}
            className="flex-shrink-0 gap-2"
          >
            <Music className="h-4 w-4" />
            <span className={cn(isMobile && "hidden sm:inline")}>Music</span>
          </Button>
          {onOpenEditor && currentMedia.type === 'video' && (
            <Button
              variant="outline"
              size={isMobile ? "sm" : "default"}
              onClick={onOpenEditor}
              className="flex-shrink-0 gap-2"
            >
              <Scissors className="h-4 w-4" />
              <span className={cn(isMobile && "hidden sm:inline")}>Edit</span>
            </Button>
          )}
          {onOpenStickers && (
            <Button
              variant="outline"
              size={isMobile ? "sm" : "default"}
              onClick={onOpenStickers}
              className="flex-shrink-0 gap-2"
            >
              <Sticker className="h-4 w-4" />
              <span className={cn(isMobile && "hidden sm:inline")}>Stickers</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
