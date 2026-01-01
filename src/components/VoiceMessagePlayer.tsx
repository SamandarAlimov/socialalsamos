import { useState, useRef, useEffect, useMemo } from 'react';
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

  // Generate stable waveform bars (not random on every render)
  const waveformBars = useMemo(() => {
    // Create a pseudo-random but stable waveform based on URL
    const seed = url.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 32 }).map((_, i) => {
      // Deterministic "random" height based on seed and index
      const height = 20 + ((seed * (i + 1) * 7) % 80);
      return height;
    });
  }, [url]);

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

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || totalDuration === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * totalDuration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className={cn(
      "flex items-center gap-3 min-w-[200px]",
      isMine ? "text-primary-foreground" : "text-foreground"
    )}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 rounded-full flex-shrink-0",
          isMine 
            ? "hover:bg-primary-foreground/20 text-primary-foreground bg-primary-foreground/10" 
            : "hover:bg-accent bg-accent/50"
        )}
        onClick={togglePlayback}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        {/* Waveform visualization */}
        <div 
          className="flex items-center gap-[2px] h-8 cursor-pointer"
          onClick={handleWaveformClick}
        >
          {waveformBars.map((height, i) => {
            const barProgress = (i / waveformBars.length) * 100;
            const isFilled = barProgress <= progress;
            const isActive = isPlaying && Math.abs(barProgress - progress) < 5;
            
            return (
              <div
                key={i}
                className={cn(
                  "w-[3px] rounded-full transition-all duration-75",
                  isFilled
                    ? isMine ? "bg-primary-foreground" : "bg-primary"
                    : isMine ? "bg-primary-foreground/30" : "bg-muted-foreground/30",
                  isActive && "scale-y-110"
                )}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
        
        {/* Time display */}
        <div className="flex justify-between mt-1">
          <span className={cn(
            "text-[11px] tabular-nums",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {formatTime(currentTime)}
          </span>
          <span className={cn(
            "text-[11px] tabular-nums",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {formatTime(totalDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}
