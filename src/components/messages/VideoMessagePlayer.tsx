import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoMessagePlayerProps {
  url: string;
  isMine?: boolean;
  className?: string;
}

export function VideoMessagePlayer({ url, isMine, className }: VideoMessagePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      video.currentTime = 0;
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
    resetControlsTimeout();
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
    resetControlsTimeout();
  }, [isMuted]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    video.currentTime = percentage * duration;
    resetControlsTimeout();
  };

  const openFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.requestFullscreen) {
      video.requestFullscreen();
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const handleMouseMove = () => {
    resetControlsTimeout();
  };

  return (
    <div 
      className={cn(
        "relative rounded-xl overflow-hidden bg-black group cursor-pointer",
        "max-w-[280px] aspect-[9/16]",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={url}
        className="w-full h-full object-cover"
        playsInline
        muted={isMuted}
        preload="metadata"
        onClick={togglePlayPause}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
        </div>
      )}

      {/* Play/Pause Overlay */}
      {!isPlaying && !isLoading && (
        <button
          onClick={togglePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-black/30"
        >
          <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center transition-transform hover:scale-110">
            <Play className="h-7 w-7 text-white ml-1" fill="white" />
          </div>
        </button>
      )}

      {/* Controls Overlay */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent transition-opacity",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Progress Bar */}
        <div 
          className="h-1 bg-white/30 rounded-full mb-2 cursor-pointer"
          onClick={handleSeek}
        >
          <div 
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={togglePlayPause}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>

          <span className="text-[10px] text-white/80 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white hover:bg-white/20"
            onClick={openFullscreen}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
