import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Music, X, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FILTERS, MUSIC_TRACKS } from './filters/FilterData';

interface MediaFile {
  id: string;
  file?: File;
  url: string;
  type: 'image' | 'video' | 'audio';
  filter?: string;
  musicTrack?: typeof MUSIC_TRACKS[0];
  musicStartTime?: number;
  aspectRatio?: number;
}

interface MediaPreviewContainerProps {
  media: MediaFile | undefined;
  isMobile: boolean;
  onAspectRatioDetected: (ratio: number) => void;
  onRemove: () => void;
  onRemoveMusic: () => void;
  variant?: 'post' | 'story' | 'reel';
}

// Detect aspect ratio from media element
function getMediaAspectRatio(naturalWidth: number, naturalHeight: number): number {
  return naturalWidth / naturalHeight;
}

// Get aspect ratio label
function getAspectRatioLabel(ratio: number): string {
  if (ratio > 1.7) return '16:9';
  if (ratio > 1.2) return '4:3';
  if (Math.abs(ratio - 1) < 0.1) return '1:1';
  if (ratio < 0.6) return '9:16';
  if (ratio < 0.8) return '3:4';
  return ratio.toFixed(2);
}

// Get container style based on detected aspect ratio - preserves original dimensions
function getContainerStyle(
  aspectRatio: number | undefined,
  isMobile: boolean,
  variant: 'post' | 'story' | 'reel'
): React.CSSProperties {
  // For stories and reels, if no aspect ratio detected, use 9:16 default
  if (!aspectRatio) {
    if (variant === 'story' || variant === 'reel') {
      return { aspectRatio: '9/16', maxHeight: isMobile ? '450px' : '550px' };
    }
    return { aspectRatio: '1', maxHeight: isMobile ? '350px' : '450px' };
  }

  // Use detected aspect ratio - preserve original dimensions
  const isPortrait = aspectRatio < 0.9;
  const isLandscape = aspectRatio > 1.1;

  if (isPortrait) {
    // Portrait media (9:16, 3:4, etc.)
    return { 
      aspectRatio: `${aspectRatio}`, 
      maxHeight: isMobile ? '500px' : '600px',
    };
  } else if (isLandscape) {
    // Landscape media (16:9, 4:3, etc.)
    return { 
      aspectRatio: `${aspectRatio}`, 
      maxHeight: isMobile ? '300px' : '400px' 
    };
  } else {
    // Square-ish media
    return { 
      aspectRatio: `${aspectRatio}`, 
      maxHeight: isMobile ? '380px' : '480px' 
    };
  }
}

export function MediaPreviewContainer({
  media,
  isMobile,
  onAspectRatioDetected,
  onRemove,
  onRemoveMusic,
  variant = 'post'
}: MediaPreviewContainerProps) {
  const [detectedRatio, setDetectedRatio] = useState<number | undefined>(media?.aspectRatio);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const ratio = getMediaAspectRatio(img.naturalWidth, img.naturalHeight);
    setDetectedRatio(ratio);
    onAspectRatioDetected(ratio);
  }, [onAspectRatioDetected]);

  const handleVideoLoad = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const ratio = getMediaAspectRatio(video.videoWidth, video.videoHeight);
    setDetectedRatio(ratio);
    onAspectRatioDetected(ratio);
  }, [onAspectRatioDetected]);

  if (!media) return null;

  const containerStyle = getContainerStyle(detectedRatio || media.aspectRatio, isMobile, variant);

  return (
    <div 
      className="relative rounded-2xl overflow-hidden bg-muted mx-auto w-full"
      style={containerStyle}
    >
      {media.type === 'video' ? (
        <video
          src={media.url}
          className="w-full h-full object-contain"
          controls
          playsInline
          onLoadedMetadata={handleVideoLoad}
          style={{ filter: FILTERS.find(f => f.id === media.filter)?.style }}
        />
      ) : (
        <img
          src={media.url}
          alt="Preview"
          className="w-full h-full object-contain"
          onLoad={handleImageLoad}
          style={{ filter: FILTERS.find(f => f.id === media.filter)?.style }}
        />
      )}

      {/* Aspect Ratio Badge */}
      {(detectedRatio || media.aspectRatio) && (
        <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 text-xs flex items-center gap-1">
          <Maximize2 className="h-3 w-3" />
          {getAspectRatioLabel(detectedRatio || media.aspectRatio!)}
        </div>
      )}

      {/* Music Overlay */}
      {media.musicTrack && (
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
            <p className={cn("font-medium truncate", isMobile && "text-sm")}>{media.musicTrack.name}</p>
            <p className={cn("text-muted-foreground truncate", isMobile ? "text-xs" : "text-sm")}>{media.musicTrack.artist}</p>
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
        className={cn("absolute top-2 right-2", isMobile && "h-8 w-8")}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}