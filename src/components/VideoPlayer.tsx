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
  ChevronRight,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoPlayerContext } from '@/contexts/VideoPlayerContext';

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

// Settings panel state type
type SettingsPanel = 'main' | 'speed' | 'quality';

export function VideoPlayer({
  src,
  className,
  autoPlay = false,
  muted: initialMuted,
  loop = false,
  poster,
  aspectMode = 'auto',
  onEnded,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const seekBarRef = useRef<HTMLDivElement>(null);
  const seekPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const volumeHideTimer = useRef<ReturnType<typeof setTimeout>>();

  // Global mute/volume state shared across all players
  const { isMuted: globalMuted, volume: globalVolume, setMuted: setGlobalMuted, setVolume: setGlobalVolume } = useVideoPlayerContext();

  const [isPlaying, setIsPlaying] = useState(false);
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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('main');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  // Local volume slider display value
  const [localVolume, setLocalVolume] = useState(globalVolume * 100);

  const effectiveAspect = aspectMode === 'auto' ? detectedAspect : aspectMode;

  // Sync local volume from global
  useEffect(() => {
    setLocalVolume(globalVolume * 100);
  }, [globalVolume]);

  // ── Controls visibility ──────────────────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
        setShowSettings(false);
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
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // Apply global mute state on play
            video.muted = globalMuted;
            video.volume = globalVolume;
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
  }, [autoPlay, globalMuted, globalVolume]);

  // ── Sync global mute/volume to video element ─────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = globalMuted;
    video.volume = globalVolume;
  }, [globalMuted, globalVolume]);

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
    if (v.buffered.length > 0) {
      setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setIsLoading(false);
    // Apply global state
    v.muted = globalMuted;
    v.volume = globalVolume;

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

  const toggleMute = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = !globalMuted;
    setGlobalMuted(next);
    if (!next && globalVolume === 0) {
      setGlobalVolume(0.5);
    }
  }, [globalMuted, globalVolume, setGlobalMuted, setGlobalVolume]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value) / 100;
    setLocalVolume(parseFloat(e.target.value));
    setGlobalVolume(vol);
    if (vol === 0) setGlobalMuted(true);
    else setGlobalMuted(false);
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const v = videoRef.current;
    const bar = seekBarRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * duration;
    setProgress(ratio * 100);
    setCurrentTime(ratio * duration);
  };

  const handleSeekBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = seekBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekPreviewX(e.clientX - rect.left);
    setSeekPreviewTime(ratio * duration);
    setShowSeekPreview(true);

    // Draw frame preview on canvas
    const canvas = seekPreviewCanvasRef.current;
    const video = videoRef.current;
    if (canvas && video && duration > 0) {
      // We draw current frame scaled — for real thumbnail seek we'd need server-side sprites
      // This draws the current video frame as preview
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch (_) {}
      }
    }
  };

  const skip = useCallback((secs: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + secs));
    showControlsTemporarily();
  }, [duration, showControlsTemporarily]);

  const handlePlaybackRate = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setSettingsPanel('main');
  };

  const handleQuality = (q: string) => {
    setQuality(q);
    setSettingsPanel('main');
  };

  const handleFullscreen = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const focused = document.activeElement;
      if (!containerRef.current?.contains(focused) && focused !== containerRef.current) return;
      if (['INPUT', 'TEXTAREA'].includes((focused as HTMLElement)?.tagName)) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip(10); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-10); }
      if (e.key === 'm') { e.preventDefault(); toggleMute(); }
      if (e.key === 'f') { e.preventDefault(); handleFullscreen(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [togglePlay, skip, toggleMute, handleFullscreen]);

  // Close settings when controls hide
  useEffect(() => {
    if (!showControls) setShowSettings(false);
  }, [showControls]);

  // ── Aspect container class ───────────────────────────────────────────────
  const containerClass = cn(
    'relative overflow-hidden bg-black select-none outline-none group/player',
    effectiveAspect === 'portrait' && 'aspect-[9/16] max-h-[600px] mx-auto max-w-[340px] rounded-xl',
    effectiveAspect === 'landscape' && 'aspect-video w-full',
    effectiveAspect === 'square' && 'aspect-square max-w-[500px] mx-auto rounded-xl',
    className
  );

  const VolumeIcon = globalMuted || globalVolume === 0 ? VolumeX : globalVolume < 0.5 ? Volume1 : Volume2;
  const displayVolume = globalMuted ? 0 : localVolume;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={containerClass}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => {
        if (isPlaying) setShowControls(false);
        setShowVolumeSlider(false);
        setShowSeekPreview(false);
      }}
      onTouchStart={showControlsTemporarily}
      onClick={() => { if (!showSettings) togglePlay(); }}
    >
      {/* ── Video element ── */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={globalMuted}
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

      {/* ── Big center play/pause (click flash) ── */}
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
          'absolute inset-0 flex flex-col justify-end transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient */}
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />

        {/* Settings panel */}
        {showSettings && (
          <div
            className="absolute bottom-16 right-2 w-52 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Main panel */}
            {settingsPanel === 'main' && (
              <div className="py-1">
                <div className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                  Sozlamalar
                </div>

                {/* Subtitles row */}
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 transition-colors"
                  onClick={() => {
                    setSubtitlesEnabled(p => !p);
                    setShowSettings(false);
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Subtitles className="h-4 w-4 text-white/70" />
                    <span className="text-sm text-white">Subtitrlar</span>
                  </div>
                  <span className={cn('text-xs font-medium', subtitlesEnabled ? 'text-primary' : 'text-white/40')}>
                    {subtitlesEnabled ? 'Yoqiq' : 'O\'chiq'}
                  </span>
                </button>

                {/* Playback speed row */}
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 transition-colors"
                  onClick={() => setSettingsPanel('speed')}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-white/70 text-sm font-mono w-4">⚡</span>
                    <span className="text-sm text-white">Tezlik</span>
                  </div>
                  <div className="flex items-center gap-1 text-white/60 text-xs">
                    {playbackRate === 1 ? 'Oddiy' : `${playbackRate}x`}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </button>

                {/* Quality row */}
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 transition-colors"
                  onClick={() => setSettingsPanel('quality')}
                >
                  <div className="flex items-center gap-2.5">
                    <Settings className="h-4 w-4 text-white/70" />
                    <span className="text-sm text-white">Sifat</span>
                  </div>
                  <div className="flex items-center gap-1 text-white/60 text-xs">
                    {quality}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              </div>
            )}

            {/* Speed sub-panel */}
            {settingsPanel === 'speed' && (
              <div className="py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/10 transition-colors border-b border-white/10"
                  onClick={() => setSettingsPanel('main')}
                >
                  <ArrowLeft className="h-4 w-4 text-white/70" />
                  <span className="text-sm text-white font-medium">Ijro tezligi</span>
                </button>
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 transition-colors"
                    onClick={() => handlePlaybackRate(rate)}
                  >
                    <span className="text-sm text-white">
                      {rate === 1 ? 'Oddiy' : `${rate}x`}
                    </span>
                    {playbackRate === rate && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}

            {/* Quality sub-panel */}
            {settingsPanel === 'quality' && (
              <div className="py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/10 transition-colors border-b border-white/10"
                  onClick={() => setSettingsPanel('main')}
                >
                  <ArrowLeft className="h-4 w-4 text-white/70" />
                  <span className="text-sm text-white font-medium">Sifat</span>
                </button>
                {QUALITIES.map((q) => (
                  <button
                    key={q}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 transition-colors"
                    onClick={() => handleQuality(q)}
                  >
                    <span className="text-sm text-white">{q}</span>
                    {quality === q && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Controls bar */}
        <div className="relative z-10 px-3 pb-3 space-y-1">
          {/* ── Progress / Seek bar ── */}
          <div
            ref={seekBarRef}
            className="relative pt-5 pb-1 cursor-pointer group/seek"
            onMouseMove={handleSeekBarMouseMove}
            onMouseLeave={() => setShowSeekPreview(false)}
            onClick={handleSeekClick}
          >
            {/* Seek preview tooltip + mini canvas */}
            {showSeekPreview && (
              <div
                className="absolute bottom-8 flex flex-col items-center gap-1 pointer-events-none z-20"
                style={{ left: seekPreviewX, transform: 'translateX(-50%)' }}
              >
                {/* Mini preview canvas */}
                <div className="rounded-md overflow-hidden border border-white/20 shadow-xl bg-black">
                  <canvas
                    ref={seekPreviewCanvasRef}
                    width={112}
                    height={63}
                    className="block"
                  />
                </div>
                {/* Time label */}
                <div className="bg-black/90 text-white text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap">
                  {formatTime(seekPreviewTime)}
                </div>
              </div>
            )}

            {/* Track */}
            <div className="relative h-1 rounded-full bg-white/20 group-hover/seek:h-[5px] transition-all duration-150">
              {/* Buffered */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                style={{ width: `${buffered}%` }}
              />
              {/* Played */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-destructive"
                style={{ width: `${progress}%` }}
              />
              {/* Thumb dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-destructive shadow-lg opacity-0 group-hover/seek:opacity-100 transition-opacity"
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
                className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors relative group/btn"
                title="-10s"
              >
                <SkipBack className="h-4 w-4 text-white" />
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none">
                  -10s
                </span>
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="h-9 w-9 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                title={isPlaying ? 'Pauza (K)' : 'Ijro (K)'}
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
                className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors relative group/btn"
                title="+10s"
              >
                <SkipForward className="h-4 w-4 text-white" />
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none">
                  +10s
                </span>
              </button>

              {/* Volume */}
              <div
                className="flex items-center gap-1 relative"
                onMouseEnter={() => {
                  clearTimeout(volumeHideTimer.current);
                  setShowVolumeSlider(true);
                }}
                onMouseLeave={() => {
                  volumeHideTimer.current = setTimeout(() => setShowVolumeSlider(false), 300);
                }}
              >
                <button
                  onClick={toggleMute}
                  className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                  title={globalMuted ? 'Ovoz yoq (M)' : "Ovoz o'ch (M)"}
                >
                  <VolumeIcon className="h-4 w-4 text-white" />
                </button>

                {/* Volume slider (hover) */}
                <div
                  className={cn(
                    'flex items-center gap-1 transition-all duration-200 overflow-hidden',
                    showVolumeSlider ? 'w-24 opacity-100' : 'w-0 opacity-0 pointer-events-none'
                  )}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={displayVolume}
                    onChange={handleVolumeChange}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-1 accent-white cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, white ${displayVolume}%, rgba(255,255,255,0.3) ${displayVolume}%)`
                    }}
                  />
                  <span className="text-white text-[10px] w-6 text-right tabular-nums shrink-0">
                    {Math.round(displayVolume)}
                  </span>
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
                className={cn(
                  'h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors',
                  subtitlesEnabled ? 'bg-white/20' : ''
                )}
                title="Subtitrlar (C)"
                onClick={(e) => { e.stopPropagation(); setSubtitlesEnabled(p => !p); }}
              >
                <Subtitles className={cn('h-4 w-4', subtitlesEnabled ? 'text-white' : 'text-white/60')} />
              </button>

              {/* Settings */}
              <button
                className={cn(
                  'h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors',
                  showSettings ? 'bg-white/20' : ''
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettings(p => !p);
                  setSettingsPanel('main');
                }}
                title="Sozlamalar"
              >
                <Settings className={cn('h-4 w-4 text-white transition-transform duration-300', showSettings ? 'rotate-45' : '')} />
              </button>

              {/* Fullscreen */}
              <button
                onClick={handleFullscreen}
                className="h-8 w-8 flex items-center justify-center hover:bg-white/15 rounded-lg transition-colors"
                title={isFullscreen ? "To'liq ekrandan chiqish (F)" : "To'liq ekran (F)"}
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

      {/* Subtitles overlay (placeholder) */}
      {subtitlesEnabled && (
        <div className="absolute bottom-20 inset-x-4 flex justify-center pointer-events-none">
          <div className="bg-black/75 text-foreground text-sm px-3 py-1 rounded-md text-center max-w-xs">
            Subtitrlar faol (hozircha namuna)
          </div>
        </div>
      )}
    </div>
  );
}
