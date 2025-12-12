import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceMessagePlayerProps {
  url: string;
  duration?: number;
  isMine?: boolean;
}

export function VoiceMessagePlayer({ url, duration, isMine }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(url);
    
    audioRef.current.onloadedmetadata = () => {
      setTotalDuration(audioRef.current?.duration || duration || 0);
    };

    audioRef.current.ontimeupdate = () => {
      setCurrentTime(audioRef.current?.currentTime || 0);
    };

    audioRef.current.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [url, duration]);

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className={cn(
      "flex items-center gap-2 min-w-[180px]",
      isMine ? "text-primary-foreground" : "text-foreground"
    )}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 rounded-full",
          isMine 
            ? "hover:bg-primary-foreground/20 text-primary-foreground" 
            : "hover:bg-accent"
        )}
        onClick={togglePlayback}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <div className="flex-1">
        {/* Waveform visualization (simplified) */}
        <div className="flex items-center gap-0.5 h-6">
          {Array.from({ length: 20 }).map((_, i) => {
            const height = Math.random() * 100;
            const filled = (i / 20) * 100 <= progress;
            return (
              <div
                key={i}
                className={cn(
                  "w-1 rounded-full transition-all",
                  filled
                    ? isMine ? "bg-primary-foreground" : "bg-primary"
                    : isMine ? "bg-primary-foreground/30" : "bg-muted-foreground/30"
                )}
                style={{ height: `${Math.max(20, height)}%` }}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-0.5">
          <span className={cn(
            "text-xs",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {formatTime(currentTime)}
          </span>
          <span className={cn(
            "text-xs",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {formatTime(totalDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}
