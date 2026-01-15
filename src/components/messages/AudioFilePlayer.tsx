import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Download, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioFilePlayerProps {
  url: string;
  name?: string;
  isMine?: boolean;
  senderName?: string;
}

export function AudioFilePlayer({ url, name, isMine, senderName }: AudioFilePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [url]);

  const updateProgress = useCallback(() => {
    if (audioRef.current && isPlaying) {
      setCurrentTime(audioRef.current.currentTime);
      animationRef.current = requestAnimationFrame(updateProgress);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateProgress);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, updateProgress]);

  const togglePlayback = () => {
    if (!audioRef.current || isLoading) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const fileName = name || url.split('/').pop() || 'Audio file';
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl transition-colors min-w-[220px] max-w-[300px]",
        isMine
          ? "bg-primary-foreground/10 hover:bg-primary-foreground/20"
          : "bg-muted hover:bg-muted/80"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-11 w-11 rounded-full flex-shrink-0 transition-all",
          isMine 
            ? "hover:bg-primary-foreground/20 text-primary-foreground bg-primary-foreground/10" 
            : "hover:bg-accent bg-accent/50",
          isLoading && "opacity-50"
        )}
        onClick={togglePlayback}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Music className={cn(
            "h-4 w-4 flex-shrink-0",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )} />
          <p className={cn(
            "text-sm font-medium truncate",
            isMine ? "text-primary-foreground" : "text-foreground"
          )}>
            {fileName}
          </p>
        </div>
        
        {/* Progress Bar */}
        <div 
          className={cn(
            "h-1 rounded-full overflow-hidden cursor-pointer",
            isMine ? "bg-primary-foreground/20" : "bg-muted-foreground/20"
          )}
          onClick={handleProgressClick}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-100",
              isMine ? "bg-primary-foreground" : "bg-primary"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between mt-1">
          <span className={cn(
            "text-[11px] tabular-nums",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {isPlaying ? formatTime(currentTime) : formatTime(duration)}
          </span>
          <span className={cn(
            "text-[11px] tabular-nums",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <a
        href={url}
        download={fileName}
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
          isMine
            ? "hover:bg-primary-foreground/20 text-primary-foreground/60"
            : "hover:bg-accent text-muted-foreground"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}
