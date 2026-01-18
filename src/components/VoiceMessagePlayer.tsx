import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useAudioPlayer, MediaTrack } from '@/contexts/AudioPlayerContext';

interface VoiceMessagePlayerProps {
  url: string;
  duration?: number;
  isMine?: boolean;
  autoPlay?: boolean;
  senderName?: string;
  messageId?: string;
  onPlay?: () => void;
}

export function VoiceMessagePlayer({ 
  url, 
  duration, 
  isMine, 
  autoPlay = false, 
  senderName, 
  messageId,
  onPlay 
}: VoiceMessagePlayerProps) {
  const { 
    currentTrack, 
    isPlaying: globalIsPlaying, 
    currentTime: globalCurrentTime, 
    duration: globalDuration,
    play, 
    pause, 
    resume, 
    seek 
  } = useAudioPlayer();
  
  // Check if this is the currently playing track
  const isThisTrack = currentTrack?.url === url;
  const isPlaying = isThisTrack && globalIsPlaying;
  const currentTime = isThisTrack ? globalCurrentTime : 0;
  const playingDuration = isThisTrack ? globalDuration : 0;

  const [localDuration, setLocalDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(!duration);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate stable waveform bars based on URL
  const waveformBars = useMemo(() => {
    const seed = url.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 40 }).map((_, i) => {
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
        
        if (autoPlay && entry.isIntersecting && entry.intersectionRatio > 0.5 && !isThisTrack) {
          // Auto-play via global player
          const track: MediaTrack = {
            id: messageId || url,
            url,
            name: 'Voice message',
            artist: senderName || 'Unknown',
            title: 'Voice message',
            senderName,
            type: 'audio'
          };
          play(track);
        }
      },
      { threshold: [0, 0.5, 1] }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [autoPlay, isThisTrack, messageId, url, senderName, play]);

  // Load metadata for duration display when not playing
  useEffect(() => {
    if (!isThisTrack && !duration) {
      const audio = new Audio(url);
      
      const handleLoadedMetadata = () => {
        setLocalDuration(audio.duration);
        setIsLoading(false);
      };
      
      const handleCanPlay = () => {
        setIsLoading(false);
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('canplay', handleCanPlay);

      return () => {
        audio.pause();
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('canplay', handleCanPlay);
      };
    } else {
      setIsLoading(false);
    }
  }, [url, duration, isThisTrack]);

  const togglePlayback = useCallback(() => {
    if (isLoading) return;

    if (isThisTrack) {
      if (globalIsPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      // Play via global player
      const track: MediaTrack = {
        id: messageId || url,
        url,
        name: 'Voice message',
        artist: senderName || 'Unknown',
        title: 'Voice message',
        senderName,
        type: 'audio'
      };
      play(track);
      onPlay?.();
    }
  }, [isLoading, isThisTrack, globalIsPlaying, pause, resume, play, messageId, url, senderName, onPlay]);

  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const totalDuration = isThisTrack ? playingDuration : localDuration;
    if (totalDuration === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * totalDuration;
    
    if (isThisTrack) {
      seek(newTime);
    } else {
      // Start playing from this position
      const track: MediaTrack = {
        id: messageId || url,
        url,
        name: 'Voice message',
        artist: senderName || 'Unknown',
        title: 'Voice message',
        senderName,
        type: 'audio'
      };
      play(track);
      setTimeout(() => seek(newTime), 100);
    }
  }, [isThisTrack, playingDuration, localDuration, seek, play, messageId, url, senderName]);

  const cyclePlaybackRate = useCallback(() => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    
    // TODO: Update playback rate in global player if this is current track
  }, [playbackRate]);

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = isThisTrack ? playingDuration : localDuration;
  const displayTime = isThisTrack ? currentTime : 0;
  const progress = totalDuration > 0 ? (displayTime / totalDuration) * 100 : 0;

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
            {isPlaying ? formatTime(displayTime) : formatTime(totalDuration)}
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