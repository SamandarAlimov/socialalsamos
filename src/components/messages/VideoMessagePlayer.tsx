import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface VideoMessagePlayerProps {
  url: string;
  isMine?: boolean;
  className?: string;
  autoPlay?: boolean;
}

export function VideoMessagePlayer({ url, isMine, className, autoPlay = false }: VideoMessagePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Intersection Observer for autoplay
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsVisible(entry.isIntersecting);
        
        if (autoPlay) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            video.play().catch(() => {});
            setIsPlaying(true);
          } else {
            video.pause();
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

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
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
    resetControlsTimeout();
  }, [isPlaying]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
    resetControlsTimeout();
  }, [isMuted]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    video.currentTime = percentage * duration;
    resetControlsTimeout();
  };

  const openFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
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
      ref={containerRef}
      className={cn(
        "relative rounded-2xl overflow-hidden bg-black group cursor-pointer",
        "max-w-[260px] aspect-square",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={togglePlayPause}
    >
      {/* Circular video container - Telegram style */}
      <div className="relative w-full h-full rounded-2xl overflow-hidden">
        <video
          ref={videoRef}
          src={url}
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
          playsInline
          muted={isMuted}
          preload="auto"
          loop
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
          </div>
        )}

        {/* Play/Pause Overlay */}
        {!isPlaying && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/30"
          >
            <motion.div 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
            >
              <Play className="h-8 w-8 text-white ml-1" fill="white" />
            </motion.div>
          </motion.div>
        )}

        {/* Duration badge - top right */}
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
          <span className="text-[10px] text-white/90 tabular-nums font-medium">
            {formatTime(duration - currentTime)}
          </span>
        </div>

        {/* Mute button - bottom left */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: showControls || !isPlaying ? 1 : 0 }}
          onClick={toggleMute}
          className="absolute bottom-2 left-2 h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </motion.button>

        {/* Progress bar - bottom */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: showControls || !isPlaying ? 1 : 0 }}
          className="absolute bottom-0 left-0 right-0 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            className="h-1 bg-white/30 rounded-full cursor-pointer"
            onClick={handleSeek}
          >
            <motion.div 
              className="h-full bg-white rounded-full"
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </motion.div>

        {/* Fullscreen button - bottom right */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: showControls || !isPlaying ? 1 : 0 }}
          onClick={openFullscreen}
          className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
        >
          <Maximize2 className="h-4 w-4" />
        </motion.button>
      </div>
    </div>
  );
}
