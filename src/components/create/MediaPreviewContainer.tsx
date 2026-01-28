import { useCallback, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Music, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FILTERS, MUSIC_TRACKS } from './filters/FilterData';
import { AspectRatioPicker, getAspectRatioLabel } from './AspectRatioPicker';

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
  selectedAspectRatio?: string;
  onAspectRatioChange?: (ratioId: string, ratioValue: number) => void;
}

// Detect aspect ratio from media element
function getMediaAspectRatio(naturalWidth: number, naturalHeight: number): number {
  return naturalWidth / naturalHeight;
}

// Get container style based on selected or detected aspect ratio
function getContainerStyle(
  selectedRatio: string,
  selectedRatioValue: number,
  detectedRatio: number | undefined,
  isMobile: boolean,
  variant: 'post' | 'story' | 'reel'
): React.CSSProperties {
  // Use selected ratio if not 'original', otherwise use detected
  const effectiveRatio = selectedRatio === 'original' 
    ? (detectedRatio || 1) 
    : selectedRatioValue;

  const isPortrait = effectiveRatio < 0.9;
  const isLandscape = effectiveRatio > 1.1;

  // For stories and reels, use 9:16 default if no ratio
  if (!effectiveRatio && (variant === 'story' || variant === 'reel')) {
    return { aspectRatio: '9/16', maxHeight: isMobile ? '450px' : '550px' };
  }

  if (isPortrait) {
    return { 
      aspectRatio: `${effectiveRatio}`, 
      maxHeight: isMobile ? '500px' : '600px',
    };
  } else if (isLandscape) {
    return { 
      aspectRatio: `${effectiveRatio}`, 
      maxHeight: isMobile ? '300px' : '400px' 
    };
  } else {
    return { 
      aspectRatio: `${effectiveRatio}`, 
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
  variant = 'post',
  selectedAspectRatio = 'original',
  onAspectRatioChange
}: MediaPreviewContainerProps) {
  const [detectedRatio, setDetectedRatio] = useState<number | undefined>(media?.aspectRatio);
  const [selectedRatioValue, setSelectedRatioValue] = useState<number>(1);

  // Reset detected ratio when media changes
  useEffect(() => {
    if (media?.aspectRatio) {
      setDetectedRatio(media.aspectRatio);
    }
  }, [media?.aspectRatio]);

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

  const handleAspectRatioSelect = useCallback((ratioId: string, ratioValue: number) => {
    setSelectedRatioValue(ratioValue);
    onAspectRatioChange?.(ratioId, ratioValue);
  }, [onAspectRatioChange]);

  if (!media) return null;

  const containerStyle = getContainerStyle(
    selectedAspectRatio, 
    selectedRatioValue, 
    detectedRatio || media.aspectRatio, 
    isMobile, 
    variant
  );

  // Determine if we need to crop (user selected different ratio than original)
  const isCropping = selectedAspectRatio !== 'original';
  const objectFit = isCropping ? 'cover' : 'contain';

  return (
    <div 
      className="relative rounded-2xl overflow-hidden bg-muted mx-auto w-full"
      style={containerStyle}
    >
      {media.type === 'video' ? (
        <video
          src={media.url}
          className="w-full h-full"
          style={{ objectFit, filter: FILTERS.find(f => f.id === media.filter)?.style }}
          controls
          playsInline
          onLoadedMetadata={handleVideoLoad}
        />
      ) : (
        <img
          src={media.url}
          alt="Preview"
          className="w-full h-full"
          style={{ objectFit, filter: FILTERS.find(f => f.id === media.filter)?.style }}
          onLoad={handleImageLoad}
        />
      )}

      {/* Aspect Ratio Picker - Top Left */}
      {onAspectRatioChange && (
        <div className="absolute top-2 left-2 z-10">
          <AspectRatioPicker
            selectedRatio={selectedAspectRatio}
            originalRatio={detectedRatio}
            onSelectRatio={handleAspectRatioSelect}
          />
        </div>
      )}

      {/* Current Ratio Badge - Top Center (when picker not available) */}
      {!onAspectRatioChange && (detectedRatio || media.aspectRatio) && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 text-xs font-medium">
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