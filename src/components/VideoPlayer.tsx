import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize2,
  Minimize2,
  Settings,
  Subtitles,
  SkipForward,
  SkipBack,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface VideoPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  poster?: string;
  /** portrait = 9:16 (reel), landscape = 16:9, square = 1:1, auto = detect */
  aspectMode?: 'portrait' | 'landscape' | 'square' | 'auto';
  onEnded?: () => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const QUALITIES = ['Auto', '1080p', '720p', '480p', '360p', '240p'];

function formatTime(seconds: number) {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoPlayer({
  src,
  className,
  autoPlay = false,
  muted: initialMuted = false,
  loop = false,
  poster,
  aspectMode = 'auto',
  onEnded,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const seekPreviewRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [quality, setQuality] = useState('Auto');
  const [seekPreviewX, setSeekPreviewX] = useState(0);
  const [seekPreviewTime, setSeekPreviewTime] = useState(0);
  const [showSeekPreview, setShowSeekPreview] = useState(false);
  const [detectedAspect, setDetectedAspect] = useState<'portrait' | 'landscape' | 'square'>('landscape');

  const effectiveAspect = aspectMode === 'auto' ? detectedAspect : aspectMode;

  // ── Controls visibility ──────────────────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 3000);
  }, []);

  // ── Intersection-observer autoplay ───────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && autoPlay) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.5, 1] }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [autoPlay]);

  // ── Fullscreen change ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Video event handlers ─────────────────────────────────────────────────
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    setProgress((v.currentTime / v.duration) * 100 || 0);

    // Buffered
    if (v.buffered.length > 0) {
      setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setIsLoading(false);

    if (v.videoWidth && v.videoHeight) {
      const ratio = v.videoWidth / v.videoHeight;
      if (ratio < 0.8) setDetectedAspect('portrait');
      else if (ratio > 1.2) setDetectedAspect('landscape');
      else setDetectedAspect('square');
    }
  };

  const handleWaiting = () => setIsLoading(true);
  const handleCanPlay = () => setIsLoading(false);

  const handleEnded = () => {
    setIsPlaying(false);
    setShowControls(true);
    onEnded?.();
  };

  // ── Controls ─────────────────────────────────────────────────────────────
  const togglePlay = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const next = !isMuted;
    v.muted = next;
    setIsMuted(next);
    if (!next && volume === 0) {
      setVolume(0.5);
      v.volume = 0.5;
    }
  };

  const handleVolumeChange = (val: number[]) => {
    const v = videoRef.current;
    if (!v) return;
    const vol = val[0] / 100;
    v.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
    v.muted = vol === 0;
  };

  const handleSeek = (val: number[]) => {
    const v = videoRef.current;
    if (!v) return;
    const time = (val[0] / 100) * duration;
    v.currentTime = time;
    setProgress(val[0]);
    setCurrentTime(time);
  };

  const handleSeekBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekPreviewX(e.clientX - rect.left);
    setSeekPreviewTime(ratio * duration);
    setShowSeekPreview(true);
  };

  const skip = (secs: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + secs));
    showControlsTemporarily();
  };

  const handlePlaybackRate = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== containerRef.current) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip(10); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-10); }
      if (e.key === 'm') toggleMute(e as any);
      if (e.key === 'f') handleFullscreen(e as any);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [togglePlay]);

  // ── Aspect container class ───────────────────────────────────────────────
  const containerClass = cn(
    'relative overflow-hidden bg-black select-none outline-none',
    effectiveAspect === 'portrait' && 'aspect-[9/16] max-h-[600px] mx-auto max-w-[340px] rounded-xl',
    effectiveAspect === 'landscape' && 'aspect-video w-full',
    effectiveAspect === 'square' && 'aspect-square max-w-[500px] mx-auto rounded-xl',
    className
  );

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={containerClass}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => { if (isPlaying) setShowControls(false); setShowVolumeSlider(false); setShowSeekPreview(false); }}
      onTouchStart={showControlsTemporarily}
      onClick={() => togglePlay()}
    >
      {/* ── Video element ── */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={isMuted}
        loop={loop}
        playsInline
        preload="metadata"
        className={cn(
          'w-full h-full',
          effectiveAspect === 'portrait' ? 'object-cover' : 'object-contain'
        )}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        onPlay={() => { setIsPlaying(true); showControlsTemporarily(); }}
        onPause={() => { setIsPlaying(false); setShowControls(true); }}
        onEnded={handleEnded}
      />

      {/* ── Loading spinner ── */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="h-10 w-10 text-white animate-spin opacity-80" />
        </div>
      )}

      {/* ── Big center play/pause ── */}
      {!isLoading && !isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-16 w-16 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20">
            <Play className="h-8 w-8 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* ── Controls overlay ── */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none',
          showControls ? 'opacity-100' : 'opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

        {/* Controls bar */}
        <div className="relative z-10 px-3 pb-3 space-y-1 pointer-events-auto">
          {/* ── Progress / Seek bar ── */}
          <div
            className="relative pt-4 pb-1 cursor-pointer"
            onMouseMove={handleSeekBarMouseMove}
            onMouseLeave={() => setShowSeekPreview(false)}
          >
            {/* Seek preview tooltip */}
            {showSeekPreview && (
              <div
                ref={seekPreviewRef}
                className="absolute bottom-8 bg-black/80 text-white text-xs px-2 py-1 rounded font-medium pointer-events-none -translate-x-1/2 whitespace-nowrap"
                style={{ left: seekPreviewX }}
              >
                {formatTime(seekPreviewTime)}
              </div>
            )}

            {/* Track */}
            <div className="relative h-1 rounded-full bg-white/25 group/seek hover:h-2 transition-all duration-150">
              {/* Buffered */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                style={{ width: `${buffered}%` }}
              />
              {/* Played */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[hsl(0_72%_51%)]"
                style={{ width: `${progress}%` }}
              />
              {/* Invisible slider on top */}
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progress}
                onChange={(e) => handleSeek([parseFloat(e.target.value)])}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
              {/* Thumb dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[hsl(0_72%_51%)] shadow opacity-0 group-hover/seek:opacity-100 transition-opacity"
                style={{ left: `${progress}%` }}
              />
            </div>
          </div>

          {/* ── Bottom row buttons ── */}
          <div className="flex items-center justify-between gap-1">
            {/* Left side */}
            <div className="flex items-center gap-0.5">
              {/* Skip back */}
              <button
                onClick={(e) => { e.stopPropagation(); skip(-10); }}
                className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                title="-10s"
              >
                <SkipBack className="h-4 w-4 text-white" />
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="h-9 w-9 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                title={isPlaying ? 'Pauza' : 'Ijro'}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 text-white fill-white" />
                ) : (
                  <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                )}
              </button>

              {/* Skip forward */}
              <button
                onClick={(e) => { e.stopPropagation(); skip(10); }}
                className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                title="+10s"
              >
                <SkipForward className="h-4 w-4 text-white" />
              </button>

              {/* Volume */}
              <div
                className="flex items-center gap-1 relative"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <button
                  onClick={toggleMute}
                  className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                  title={isMuted ? 'Ovoz yoq' : 'Ovoz o\'ch'}
                >
                  <VolumeIcon className="h-4.5 w-4.5 text-white" />
                </button>

                {/* Volume slider (appears on hover) */}
                <div
                  className={cn(
                    'absolute left-8 flex items-center bg-black/70 backdrop-blur-md rounded-full px-2 py-1 transition-all duration-200',
                    showVolumeSlider ? 'opacity-100 w-24 pointer-events-auto' : 'opacity-0 w-0 pointer-events-none overflow-hidden'
                  )}
                >
                  <Slider
                    value={[isMuted ? 0 : volume * 100]}
                    onValueChange={handleVolumeChange}
                    max={100}
                    step={1}
                    className="cursor-pointer [&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5 [&_[role=slider]]:bg-white [&_[role=slider]]:border-0 [&_.bg-primary]:bg-white"
                  />
                </div>
              </div>

              {/* Time */}
              <span className="text-white text-xs font-medium tabular-nums ml-1 select-none">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-0.5">
              {/* Subtitles (CC) */}
              <button
                className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors opacity-50 cursor-not-allowed"
                title="Subtitrlar (tez orada)"
                onClick={(e) => e.stopPropagation()}
              >
                <Subtitles className="h-4 w-4 text-white" />
              </button>

              {/* Settings */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                    onClick={(e) => e.stopPropagation()}
                    title="Sozlamalar"
                  >
                    <Settings className="h-4 w-4 text-white" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="end"
                  className="min-w-40 mb-1 bg-black/90 backdrop-blur-md border-white/10 text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Playback Speed */}
                  <DropdownMenuLabel className="text-xs text-white/60 uppercase tracking-wider">
                    Ijro tezligi
                  </DropdownMenuLabel>
                  {PLAYBACK_RATES.map((rate) => (
                    <DropdownMenuItem
                      key={rate}
                      onClick={() => handlePlaybackRate(rate)}
                      className={cn(
                        'cursor-pointer text-white hover:bg-white/10 focus:bg-white/10',
                        playbackRate === rate && 'text-primary font-semibold'
                      )}
                    >
                      {rate === 1 ? 'Oddiy' : `${rate}x`}
                      {playbackRate === rate && ' ✓'}
                    </DropdownMenuItem>
                  ))}

                  <DropdownMenuSeparator className="bg-white/10" />

                  {/* Quality */}
                  <DropdownMenuLabel className="text-xs text-white/60 uppercase tracking-wider">
                    Sifat
                  </DropdownMenuLabel>
                  {QUALITIES.map((q) => (
                    <DropdownMenuItem
                      key={q}
                      onClick={() => setQuality(q)}
                      className={cn(
                        'cursor-pointer text-white hover:bg-white/10 focus:bg-white/10',
                        quality === q && 'text-primary font-semibold'
                      )}
                    >
                      {q}
                      {quality === q && ' ✓'}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Fullscreen */}
              <button
                onClick={handleFullscreen}
                className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                title={isFullscreen ? 'To\'liq ekrandan chiqish' : 'To\'liq ekran'}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4 text-white" />
                ) : (
                  <Maximize2 className="h-4 w-4 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
