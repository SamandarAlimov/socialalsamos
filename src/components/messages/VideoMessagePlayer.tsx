import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { MediaTrack } from '@/contexts/AudioPlayerContext';

interface VideoMessagePlayerProps {
  url: string;
  isMine?: boolean;
  className?: string;
  autoPlay?: boolean;
  messageId?: string;
  senderName?: string;
  /** Ketma-ket ijro uchun suhbatdagi barcha media xabarlar */
  allMediaTracks?: MediaTrack[];
  /** Video tugaganda keyingisiga o'tish uchun callback */
  onEnded?: () => void;
  /** Kamerada yozilgan bo'lsa oyna effekti berilади */
  isWebcamRecording?: boolean;
}

const SIZE = 240; // Telegram video note diametri
const RING = 3;

export function VideoMessagePlayer({
  url,
  className,
  messageId,
  onEnded,
  isWebcamRecording = false,
}: VideoMessagePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      video.currentTime = 0;
      setCurrentTime(0);
      onEnded?.();
    };
    const handleCanPlay = () => setIsLoading(false);
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
  }, [onEnded]);

  // Nazorat elementlarini avtomatik yashirish
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      // Telegramda video xabar bosilganda ovoz bilan ijro etiladi
      video.muted = false;
      setIsMuted(false);
      void video.play();
    }
    resetControlsTimeout();
  }, [isPlaying, resetControlsTimeout]);

  const toggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (!video) return;
      video.muted = !isMuted;
      setIsMuted(!isMuted);
      resetControlsTimeout();
    },
    [isMuted, resetControlsTimeout]
  );

  const openFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (video?.requestFullscreen) void video.requestFullscreen();
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const radius = SIZE / 2 - RING / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      ref={containerRef}
      data-message-id={messageId}
      data-message-interactive="true"
      className={cn(
        'relative aspect-square shrink-0 cursor-pointer select-none rounded-full shadow-[0_4px_18px_rgba(0,0,0,0.16)]',
        className
      )}
      style={{
        width: `min(${SIZE}px, 72vw)`,
        height: `min(${SIZE}px, 72vw)`,
        maxWidth: '100%',
      }}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={togglePlayPause}
    >
      {/* Doiraviy video (Telegram video note) */}
      <div className="relative h-full w-full overflow-hidden rounded-full bg-black">
        <video
          ref={videoRef}
          src={url}
          className="h-full w-full object-cover"
          style={isWebcamRecording ? { transform: 'scaleX(-1)' } : undefined}
          playsInline
          muted={isMuted}
          preload="metadata"
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}

        {!isPlaying && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/25"
          >
            <motion.span
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"
            >
              <Play className="ml-1 h-8 w-8 text-white" fill="white" />
            </motion.span>
          </motion.div>
        )}
      </div>

      {/* Aylana bo'ylab progress (Telegramdek) */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={RING}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          fill="none"
          stroke="#ffffff"
          strokeWidth={RING}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.15s linear' }}
        />
      </svg>

      {/* Qolgan vaqt */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-sm">
        <span className="text-[10px] font-medium tabular-nums text-white/90">
          {formatTime(Math.max(0, duration - currentTime))}
        </span>
      </div>

      {/* Ovoz tugmasi */}
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: showControls || !isPlaying ? 1 : 0 }}
        onClick={toggleMute}
        aria-label={isMuted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
        className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </motion.button>

      {/* To'liq ekran */}
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: showControls || !isPlaying ? 1 : 0 }}
        onClick={openFullscreen}
        aria-label="To'liq ekran"
        className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        <Maximize2 className="h-4 w-4" />
      </motion.button>
    </div>
  );
}
