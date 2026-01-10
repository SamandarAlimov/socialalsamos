import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface VoiceMessagePlayerProps {
  url: string;
  duration?: number;
  isMine?: boolean;
  autoPlay?: boolean;
}

export function VoiceMessagePlayer({ url, duration, isMine, autoPlay = false }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVisible, setIsVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // Generate stable waveform bars based on URL
  const waveformBars = useMemo(() => {
    const seed = url.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 40 }).map((_, i) => {
      // Create a more natural waveform pattern
      const baseHeight = 25 + ((seed * (i + 1) * 7) % 60);
      const variation = Math.sin((i / 40) * Math.PI * 4) * 15;
      return Math.min(95, Math.max(15, baseHeight + variation));
    });
  }, [url]);

  // Intersection Observer for autoplay
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsVisible(entry.isIntersecting);
        
        if (autoPlay && audioRef.current) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            audioRef.current.play().catch(() => {});
            setIsPlaying(true);
          } else {
            audioRef.current.pause();
            setIsPlaying(false);
          }
        }
      },
      { threshold: [0, 0.5, 1] }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [autoPlay]);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration || duration || 0);
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
  }, [url, duration]);

  // Smooth animation for progress
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

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || totalDuration === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * totalDuration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cyclePlaybackRate = () => {
    if (!audioRef.current) return;
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    audioRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "flex items-center gap-3 min-w-[220px] max-w-[280px]",
        isMine ? "text-primary-foreground" : "text-foreground"
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
        {/* Waveform visualization */}
        <div 
          className="flex items-center gap-[2px] h-8 cursor-pointer"
          onClick={handleWaveformClick}
        >
          {waveformBars.map((height, i) => {
            const barProgress = (i / waveformBars.length) * 100;
            const isFilled = barProgress <= progress;
            const isActive = isPlaying && Math.abs(barProgress - progress) < 3;
            
            return (
              <motion.div
                key={i}
                className={cn(
                  "w-[2px] rounded-full transition-colors duration-75",
                  isFilled
                    ? isMine ? "bg-primary-foreground" : "bg-primary"
                    : isMine ? "bg-primary-foreground/30" : "bg-muted-foreground/30"
                )}
                animate={{
                  height: `${height}%`,
                  scaleY: isActive ? 1.25 : 1,
                }}
                transition={{ duration: 0.1 }}
              />
            );
          })}
        </div>
        
        {/* Time and playback rate */}
        <div className="flex justify-between items-center mt-1">
          <span className={cn(
            "text-[11px] tabular-nums",
            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {isPlaying ? formatTime(currentTime) : formatTime(totalDuration)}
          </span>
          
          <button
            onClick={cyclePlaybackRate}
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors",
              isMine 
                ? "text-primary-foreground/70 hover:bg-primary-foreground/10" 
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}
