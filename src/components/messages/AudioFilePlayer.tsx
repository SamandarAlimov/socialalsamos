import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioPlayer, MediaTrack } from '@/contexts/AudioPlayerContext';

interface AudioFilePlayerProps {
  url: string;
  name?: string;
  isMine?: boolean;
  senderName?: string;
}

// Music note icon for audio files
const MusicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </svg>
);

// Waveform visualization component
const Waveform = ({ progress, isPlaying, isMine }: { progress: number; isPlaying: boolean; isMine?: boolean }) => {
  const bars = 32;
  
  return (
    <div className="flex items-center gap-[2px] h-8">
      {Array.from({ length: bars }).map((_, i) => {
        const isActive = (i / bars) * 100 <= progress;
        const barHeight = Math.sin((i / bars) * Math.PI * 3) * 0.5 + 0.5;
        const animatedHeight = isPlaying && isActive 
          ? `${20 + Math.random() * 80}%` 
          : `${barHeight * 100}%`;
        
        return (
          <div
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-all duration-150",
              isActive
                ? isMine 
                  ? "bg-primary-foreground" 
                  : "bg-primary"
                : isMine
                  ? "bg-primary-foreground/30"
                  : "bg-muted-foreground/30"
            )}
            style={{ 
              height: animatedHeight,
              minHeight: '4px'
            }}
          />
        );
      })}
    </div>
  );
};

export function AudioFilePlayer({ url, name, isMine, senderName }: AudioFilePlayerProps) {
  const { currentTrack, isPlaying: globalIsPlaying, currentTime: globalCurrentTime, duration: globalDuration, progress: globalProgress, play, pause, resume, seek } = useAudioPlayer();
  
  // Check if this is the currently playing track
  const isThisTrack = currentTrack?.url === url;
  const isPlaying = isThisTrack && globalIsPlaying;
  const currentTime = isThisTrack ? globalCurrentTime : 0;
  const duration = isThisTrack ? globalDuration : 0;
  const progress = isThisTrack ? globalProgress : 0;
  
  const [localDuration, setLocalDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const waveformRef = useRef<HTMLDivElement>(null);

  // Load metadata for duration display when not playing
  useEffect(() => {
    if (!isThisTrack) {
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        setLocalDuration(audio.duration);
        setIsLoading(false);
      });
      audio.addEventListener('canplay', () => {
        setIsLoading(false);
      });
      
      return () => {
        audio.pause();
      };
    } else {
      setIsLoading(false);
    }
  }, [url, isThisTrack]);

  // Parse filename to get title and artist
  const parseFileName = (fileName: string) => {
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    const dashMatch = nameWithoutExt.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) {
      return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
    }
    return { artist: senderName || 'Unknown Artist', title: nameWithoutExt };
  };

  const rawFileName = name || url.split('/').pop() || 'Audio file';
  const { artist, title } = parseFileName(rawFileName);

  const togglePlayback = () => {
    if (isLoading) return;

    if (isThisTrack) {
      if (globalIsPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      // Play this track using global player
      const track: MediaTrack = { 
        id: url, 
        url, 
        name: rawFileName, 
        artist, 
        title, 
        senderName,
        type: 'audio'
      };
      play(track);
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetDuration = isThisTrack ? globalDuration : localDuration;
    const newTime = percentage * targetDuration;
    
    if (isThisTrack) {
      seek(newTime);
    } else {
      // Start playing from this position
      const track: MediaTrack = { 
        id: url, 
        url, 
        name: rawFileName, 
        artist, 
        title, 
        senderName,
        type: 'audio'
      };
      play(track);
      setTimeout(() => seek(newTime), 100);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayDuration = isThisTrack ? duration : localDuration;
  const displayCurrentTime = isThisTrack ? currentTime : 0;
  const displayProgress = isThisTrack ? progress : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-2xl transition-all min-w-[280px] max-w-[360px]",
        isMine
          ? "bg-gradient-to-br from-primary-foreground/15 to-primary-foreground/5"
          : "bg-gradient-to-br from-muted to-muted/50 border border-border/50"
      )}
    >
      {/* Album Art / Play Button */}
      <div className="relative">
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center transition-all shadow-lg",
            isMine
              ? "bg-gradient-to-br from-primary-foreground/30 to-primary-foreground/10"
              : "bg-gradient-to-br from-primary/20 to-primary/5",
            isPlaying && "scale-95"
          )}
        >
          <MusicIcon className={cn(
            "w-6 h-6",
            isMine ? "text-primary-foreground/80" : "text-primary/80"
          )} />
        </div>
        
        {/* Play/Pause overlay button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute inset-0 w-12 h-12 rounded-xl opacity-0 hover:opacity-100 transition-opacity",
            isMine 
              ? "hover:bg-primary-foreground/30 text-primary-foreground" 
              : "hover:bg-primary/20 text-primary",
            isLoading && "opacity-50"
          )}
          onClick={togglePlayback}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="h-5 w-5 fill-current ml-0.5" />
          )}
        </Button>
      </div>

      {/* Track Info & Waveform */}
      <div className="flex-1 min-w-0">
        {/* Title & Artist */}
        <div className="mb-1.5">
          <p className={cn(
            "text-sm font-semibold truncate leading-tight",
            isMine ? "text-primary-foreground" : "text-foreground"
          )}>
            {title}
          </p>
          <p className={cn(
            "text-xs truncate",
            isMine ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            {artist}
          </p>
        </div>
        
        {/* Waveform Progress */}
        <div 
          ref={waveformRef}
          className="cursor-pointer py-1"
          onClick={handleWaveformClick}
        >
          <Waveform progress={displayProgress} isPlaying={isPlaying} isMine={isMine} />
        </div>

        {/* Time display */}
        <div className="flex justify-between mt-0.5">
          <span className={cn(
            "text-[10px] font-medium tabular-nums",
            isMine ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            {formatTime(displayCurrentTime)}
          </span>
          <span className={cn(
            "text-[10px] font-medium tabular-nums",
            isMine ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            {formatTime(displayDuration)}
          </span>
        </div>
      </div>

      {/* Download Button */}
      <a
        href={url}
        download={rawFileName}
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all",
          isMine
            ? "hover:bg-primary-foreground/20 text-primary-foreground/70 hover:text-primary-foreground"
            : "hover:bg-accent text-muted-foreground hover:text-foreground"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}
