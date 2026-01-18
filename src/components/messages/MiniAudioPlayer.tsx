import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { Button } from '@/components/ui/button';
import { Play, Pause, X, Music2, Video, SkipBack, SkipForward, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useCallback } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function MiniAudioPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    isBuffering,
    currentTime, 
    duration, 
    progress, 
    playbackSpeed,
    togglePlayback, 
    stop,
    seek,
    seekByDelta,
    setPlaybackSpeed
  } = useAudioPlayer();

  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    seek(newTime);
  }, [duration, seek]);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    
    const getClientX = (ev: MouseEvent | TouchEvent) => {
      return 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
    };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!progressBarRef.current) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clientX = getClientX(ev);
      const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setDragProgress(percentage * 100);
    };

    const handleEnd = (ev: MouseEvent | TouchEvent) => {
      if (!progressBarRef.current) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clientX = 'changedTouches' in ev ? ev.changedTouches[0].clientX : ev.clientX;
      const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = percentage * duration;
      seek(newTime);
      setIsDragging(false);
      
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);
  }, [duration, seek]);

  // Don't render if no track
  if (!currentTrack) {
    return null;
  }

  const displayProgress = isDragging ? dragProgress : progress;
  const isVideoTrack = currentTrack.type === 'video';

  return (
    <AnimatePresence>
      <motion.div
        key="mini-player"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="flex-shrink-0 z-20 overflow-hidden"
      >
        <div className="bg-gradient-to-r from-primary/8 via-primary/5 to-primary/8 backdrop-blur-sm border-b border-primary/15">
          {/* Progress bar at top - interactive */}
          <div 
            ref={progressBarRef}
            className="h-1 bg-primary/10 cursor-pointer relative group"
            onClick={handleProgressClick}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            {/* Buffering indicator */}
            {isBuffering && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              />
            )}
            
            {/* Progress fill */}
            <motion.div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary/80"
              style={{ width: `${displayProgress}%` }}
              transition={{ duration: isDragging ? 0 : 0.1 }}
            />
            
            {/* Hover expand effect */}
            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            {/* Drag handle */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${displayProgress}% - 6px)` }}
              animate={{ scale: isDragging ? 1.3 : 1 }}
            />
          </div>
              
          <div className="px-3 py-2 flex items-center gap-3">
            {/* Album art / Media type icon */}
            <div className="relative flex-shrink-0">
              <motion.div 
                className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden",
                  "bg-gradient-to-br from-primary/25 to-primary/10",
                  "shadow-sm"
                )}
                animate={isPlaying ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                {currentTrack.thumbnailUrl ? (
                  <img 
                    src={currentTrack.thumbnailUrl} 
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : isVideoTrack ? (
                  <Video className="w-5 h-5 text-primary" />
                ) : (
                  <Music2 className="w-5 h-5 text-primary" />
                )}
              </motion.div>
              
              {/* Playing indicator dots */}
              {isPlaying && !isBuffering && (
                <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-[2px]">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-[3px] bg-primary rounded-full"
                      animate={{
                        height: ['4px', '10px', '4px'],
                      }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Track info */}
            <div className="flex-1 min-w-0 pr-2">
              <motion.p 
                className="text-sm font-semibold truncate text-foreground leading-tight"
                key={currentTrack.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {currentTrack.title}
              </motion.p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {currentTrack.artist}
              </p>
            </div>

            {/* Time display */}
            <div className="text-[11px] text-muted-foreground font-medium tabular-nums hidden sm:flex items-center gap-1">
              <span>{formatTime(currentTime)}</span>
              <span className="opacity-50">/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5">
              {/* Skip backward */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-primary/10 hidden sm:flex"
                onClick={() => seekByDelta(-10)}
              >
                <SkipBack className="h-3.5 w-3.5" />
              </Button>

              {/* Play/Pause */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 rounded-full",
                  "bg-primary/10 hover:bg-primary/20",
                  "transition-all duration-200"
                )}
                onClick={togglePlayback}
                disabled={isBuffering}
              >
                {isBuffering ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5 fill-primary text-primary" />
                ) : (
                  <Play className="h-5 w-5 fill-primary text-primary ml-0.5" />
                )}
              </Button>

              {/* Skip forward */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-primary/10 hidden sm:flex"
                onClick={() => seekByDelta(10)}
              >
                <SkipForward className="h-3.5 w-3.5" />
              </Button>

              {/* Playback speed */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-primary/10 text-xs font-bold"
                  >
                    {playbackSpeed}x
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[80px]">
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <DropdownMenuItem
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={cn(
                        "justify-center font-medium",
                        speed === playbackSpeed && "bg-primary/10 text-primary"
                      )}
                    >
                      {speed}x
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                onClick={stop}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}