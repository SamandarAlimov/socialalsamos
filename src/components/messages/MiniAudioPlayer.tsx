import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { Button } from '@/components/ui/button';
import { Play, Pause, X, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export function MiniAudioPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    currentTime, 
    duration, 
    progress, 
    togglePlayback, 
    stop,
    seek 
  } = useAudioPlayer();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    seek(newTime);
  };

  // Don't render if no track
  if (!currentTrack) {
    return null;
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex-shrink-0 z-20 overflow-hidden"
    >
      <div className="bg-primary/5 border-b border-primary/20">
        {/* Progress bar at top */}
        <div 
          className="h-0.5 bg-primary/10 cursor-pointer relative group"
          onClick={handleProgressClick}
        >
          <div 
            className="absolute inset-y-0 left-0 bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
            
            <div className="px-4 py-2 flex items-center gap-3">
              {/* Album art / Music icon */}
              <div className="relative">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-gradient-to-br from-primary/20 to-primary/5",
                  isPlaying && "animate-pulse"
                )}>
                  <Music2 className="w-5 h-5 text-primary" />
                </div>
                
                {/* Playing indicator */}
                {isPlaying && (
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {[1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        className="w-0.5 bg-primary rounded-full"
                        animate={{
                          height: ['3px', '8px', '3px'],
                        }}
                        transition={{
                          duration: 0.5,
                          repeat: Infinity,
                          delay: i * 0.1,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentTrack.artist}
                </p>
              </div>

              {/* Time */}
              <div className="text-xs text-muted-foreground font-medium tabular-nums hidden sm:block">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full hover:bg-primary/10"
                  onClick={togglePlayback}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 fill-current" />
                  ) : (
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  )}
                </Button>
                
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
  );
}
