import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Captions,
  Check,
  ChevronRight,
  Gauge,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoPlayerContext } from '@/contexts/VideoPlayerContext';
import { VideoScrubBar } from '@/components/video/VideoScrubBar';

export interface VideoPlayerSource {
  src: string;
  label: string;
}

export interface VideoPlayerTrack {
  src: string;
  srcLang: string;
  label: string;
  default?: boolean;
}

interface VideoPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  poster?: string;
  aspectMode?: 'portrait' | 'landscape' | 'square' | 'auto';
  sources?: VideoPlayerSource[];
  tracks?: VideoPlayerTrack[];
  title?: string;
  onEnded?: () => void;
  onAspectRatio?: (ratio: number) => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const CONTROL_HIDE_MS = 2600;
const LONG_PRESS_MS = 480;
const DOUBLE_TAP_MS = 320;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
  }
  return minutes + ':' + String(rest).padStart(2, '0');
}

type SettingsPanel = 'main' | 'speed' | 'quality';
type GestureFlash =
  | { kind: 'back'; text: string }
  | { kind: 'forward'; text: string }
  | { kind: 'speed'; text: string }
  | { kind: 'play'; text: string }
  | null;

export function VideoPlayer({
  src,
  className,
  autoPlay = false,
  muted: initialMuted,
  loop = false,
  poster,
  aspectMode = 'auto',
  sources,
  tracks = [],
  title,
  onEnded,
  onAspectRatio,
}: VideoPlayerProps) {
  const playerId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; zone: 'left' | 'center' | 'right' } | null>(null);
  const lastPointerTypeRef = useRef<string>('mouse');
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const longPressActiveRef = useRef(false);
  const longPressOriginalRateRef = useRef(1);
  const resumeAfterSourceChangeRef = useRef(false);
  const restoreTimeAfterSourceChangeRef = useRef<number | null>(null);

  const {
    isMuted: globalMuted,
    volume: globalVolume,
    setMuted: setGlobalMuted,
    setVolume: setGlobalVolume,
  } = useVideoPlayerContext();

  const normalizedSources = useMemo<VideoPlayerSource[]>(() => {
    const list = sources?.length ? sources : [{ src, label: 'Original' }];
    if (!list.some((item) => item.src === src)) return [{ src, label: 'Original' }, ...list];
    return list;
  }, [sources, src]);

  const [sourceIndex, setSourceIndex] = useState(() =>
    Math.max(0, normalizedSources.findIndex((item) => item.src === src)),
  );
  const activeSource = normalizedSources[sourceIndex] ?? normalizedSources[0];

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedSeconds, setBufferedSeconds] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('main');
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [detectedRatio, setDetectedRatio] = useState(16 / 9);
  const [gestureFlash, setGestureFlash] = useState<GestureFlash>(null);

  useEffect(() => {
    setPlaybackError(false);
    setIsLoading(true);
  }, [activeSource?.src]);

  const flashGesture = useCallback((gesture: NonNullable<GestureFlash>, timeout = 650) => {
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    setGestureFlash(gesture);
    gestureTimerRef.current = setTimeout(() => setGestureFlash(null), timeout);
  }, []);

  const scheduleControlsHide = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused && !isScrubbing && !showSettings) {
        setShowControls(false);
        setShowVolumeSlider(false);
      }
    }, CONTROL_HIDE_MS);
  }, [isScrubbing, showSettings]);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  useEffect(() => {
    if (!autoPlay) return;
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.65, 1] },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [autoPlay, activeSource.src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = initialMuted ?? globalMuted;
    video.volume = globalVolume;
  }, [globalMuted, globalVolume, initialMuted, activeSource.src]);

  useEffect(() => {
    const pauseOther = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const video = videoRef.current;
      if (!video || detail === playerId || video.paused) return;
      video.pause();
    };
    window.addEventListener('alsamos:video-play', pauseOther);
    return () => window.removeEventListener('alsamos:video-play', pauseOther);
  }, [playerId]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setIsNativeFullscreen(active);
      if (active) {
        setShowControls(true);
        requestAnimationFrame(() => containerRef.current?.focus());
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isPseudoFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isPseudoFullscreen]);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (volumeHideTimerRef.current) clearTimeout(volumeHideTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      window.dispatchEvent(new CustomEvent('alsamos:video-play', { detail: playerId }));
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    showControlsTemporarily();
  }, [playerId, showControlsTemporarily]);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(time)) return;
    const next = Math.max(0, Math.min(video.duration || duration || 0, time));
    video.currentTime = next;
    setCurrentTime(next);
    showControlsTemporarily();
  }, [duration, showControlsTemporarily]);

  const skip = useCallback((seconds: number, showFlash = true) => {
    const video = videoRef.current;
    if (!video) return;
    seekTo(video.currentTime + seconds);
    if (showFlash) {
      flashGesture({
        kind: seconds < 0 ? 'back' : 'forward',
        text: (seconds < 0 ? '−' : '+') + Math.abs(seconds) + ' soniya',
      });
    }
  }, [flashGesture, seekTo]);

  const toggleMute = useCallback(() => {
    const next = !globalMuted;
    setGlobalMuted(next);
    if (!next && globalVolume === 0) setGlobalVolume(0.5);
    showControlsTemporarily();
  }, [globalMuted, globalVolume, setGlobalMuted, setGlobalVolume, showControlsTemporarily]);

  const changeVolume = useCallback((next: number) => {
    const value = Math.max(0, Math.min(1, next));
    setGlobalVolume(value);
    setGlobalMuted(value === 0);
    showControlsTemporarily();
  }, [setGlobalMuted, setGlobalVolume, showControlsTemporarily]);

  const changeRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    const value = Math.max(0.25, Math.min(2, rate));
    video.playbackRate = value;
    setPlaybackRate(value);
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const stepRate = useCallback((direction: 1 | -1) => {
    const index = PLAYBACK_RATES.findIndex((item) => item === playbackRate);
    const safeIndex = index >= 0 ? index : PLAYBACK_RATES.indexOf(1);
    const nextIndex = Math.max(0, Math.min(PLAYBACK_RATES.length - 1, safeIndex + direction));
    const next = PLAYBACK_RATES[nextIndex];
    changeRate(next);
    flashGesture({ kind: 'speed', text: next + '×' });
  }, [changeRate, flashGesture, playbackRate]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      setShowControls(true);
      return;
    }

    if (document.fullscreenElement === container) {
      document.exitFullscreen().catch(() => {});
      return;
    }

    if (document.fullscreenElement) return;

    if (typeof container.requestFullscreen === 'function') {
      container.requestFullscreen().catch(() => {
        // iPhone/iOS yoki cheklangan webview: custom controlsni saqlaydigan fallback.
        setIsPseudoFullscreen(true);
        setShowControls(true);
        requestAnimationFrame(() => container.focus());
      });
    } else {
      setIsPseudoFullscreen(true);
      setShowControls(true);
      requestAnimationFrame(() => container.focus());
    }
  }, [isPseudoFullscreen]);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !('pictureInPictureEnabled' in document)) return;
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else if ('requestPictureInPicture' in video) await video.requestPictureInPicture();
    } catch {
      // Browser yoki permission PiP'ni rad qilishi mumkin.
    }
  }, []);

  const setCaptions = useCallback((enabled: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    Array.from(video.textTracks).forEach((track, index) => {
      track.mode = enabled && index === 0 ? 'showing' : 'disabled';
    });
    setCaptionsEnabled(enabled);
  }, []);

  const handleQualityChange = useCallback((index: number) => {
    if (index === sourceIndex) {
      setSettingsPanel('main');
      return;
    }
    const video = videoRef.current;
    if (video) {
      restoreTimeAfterSourceChangeRef.current = video.currentTime;
      resumeAfterSourceChangeRef.current = !video.paused;
    }
    setSourceIndex(index);
    setSettingsPanel('main');
  }, [sourceIndex]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    setIsLoading(false);
    video.volume = globalVolume;
    video.muted = initialMuted ?? globalMuted;
    video.playbackRate = playbackRate;

    if (video.videoWidth && video.videoHeight) {
      const ratio = video.videoWidth / video.videoHeight;
      setDetectedRatio(ratio);
      onAspectRatio?.(ratio);
    }

    const restore = restoreTimeAfterSourceChangeRef.current;
    if (restore !== null) {
      video.currentTime = Math.min(restore, Math.max(0, video.duration - 0.05));
      restoreTimeAfterSourceChangeRef.current = null;
    }
    if (resumeAfterSourceChangeRef.current) {
      resumeAfterSourceChangeRef.current = false;
      video.play().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (video.buffered.length > 0) {
      setBufferedSeconds(video.buffered.end(video.buffered.length - 1));
    }
  };

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressActiveRef.current) {
      longPressActiveRef.current = false;
      changeRate(longPressOriginalRateRef.current);
      setGestureFlash(null);
      suppressClickRef.current = true;
    }
  }, [changeRate]);

  const handleSurfacePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    lastPointerTypeRef.current = event.pointerType;

    // Touchda focus olish inertial page scrollni uzishi mumkin. Keyboard/mouse
    // uchun focus kerak, touch gesture esa native scrollga tegmaydi.
    if (event.pointerType !== 'touch') {
      containerRef.current?.focus({ preventScroll: true });
      return;
    }
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    pointerMovedRef.current = false;
    longPressOriginalRateRef.current = playbackRate;
    longPressTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      longPressActiveRef.current = true;
      changeRate(2);
      flashGesture({ kind: 'speed', text: '2× tezlik' }, 60_000);
    }, LONG_PRESS_MS);
  };

  const handleSurfacePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !pointerStartRef.current) return;
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;
    if (Math.hypot(dx, dy) > 14) {
      pointerMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleSurfacePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;

    if (longPressActiveRef.current) {
      clearLongPress();
      return;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (pointerMovedRef.current) {
      pointerStartRef.current = null;
      lastTapRef.current = null;
      suppressClickRef.current = true;
      return;
    }
    pointerStartRef.current = null;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const zone: 'left' | 'center' | 'right' =
      ratio < 0.38 ? 'left' : ratio > 0.62 ? 'right' : 'center';
    const now = Date.now();
    const last = lastTapRef.current;

    if (last && last.zone === zone && now - last.time <= DOUBLE_TAP_MS) {
      suppressClickRef.current = true;
      lastTapRef.current = null;
      if (zone === 'left') skip(-10);
      else if (zone === 'right') skip(10);
      else {
        togglePlay();
        flashGesture({ kind: 'play', text: videoRef.current?.paused ? 'Pauza' : 'Ijro' });
      }
      return;
    }

    lastTapRef.current = { time: now, zone };
  };

  const handleSurfaceClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (lastPointerTypeRef.current === 'touch') {
      setShowControls((current) => !current);
      return;
    }
    if (!showSettings) togglePlay();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const focused = document.activeElement as HTMLElement | null;
      const isActive =
        document.fullscreenElement === container ||
        isPseudoFullscreen ||
        focused === container ||
        Boolean(focused && container.contains(focused));
      if (!isActive) return;

      const tag = focused?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || focused?.isContentEditable) return;

      const key = event.key.toLowerCase();
      const video = videoRef.current;
      if (!video) return;

      if (event.key === 'Escape' && isPseudoFullscreen) {
        event.preventDefault();
        setIsPseudoFullscreen(false);
        setShowControls(true);
      } else if (event.key === ' ' || key === 'k') {
        event.preventDefault();
        togglePlay();
      } else if (key === 'j') {
        event.preventDefault();
        skip(-10);
      } else if (key === 'l') {
        event.preventDefault();
        skip(10);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        skip(-5);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        skip(5);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        changeVolume(globalVolume + 0.05);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        changeVolume(globalVolume - 0.05);
      } else if (key === 'm') {
        event.preventDefault();
        toggleMute();
      } else if (key === 'f') {
        event.preventDefault();
        toggleFullscreen();
      } else if (key === 'c' && tracks.length > 0) {
        event.preventDefault();
        setCaptions(!captionsEnabled);
      } else if (event.key === '>' || (event.key === '.' && event.shiftKey)) {
        event.preventDefault();
        stepRate(1);
      } else if (event.key === '<' || (event.key === ',' && event.shiftKey)) {
        event.preventDefault();
        stepRate(-1);
      } else if (key === 'i') {
        event.preventDefault();
        void togglePictureInPicture();
      } else if (event.key === 'Home') {
        event.preventDefault();
        seekTo(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        seekTo(video.duration || duration);
      } else if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        const digit = Number(event.key);
        seekTo((digit / 10) * (video.duration || duration));
        flashGesture({ kind: 'forward', text: digit * 10 + '%' });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    captionsEnabled,
    changeVolume,
    duration,
    flashGesture,
    globalVolume,
    seekTo,
    setCaptions,
    skip,
    stepRate,
    toggleFullscreen,
    toggleMute,
    togglePictureInPicture,
    togglePlay,
    tracks.length,
    isPseudoFullscreen,
  ]);

  const effectiveRatio = useMemo(() => {
    if (aspectMode === 'portrait') return 9 / 16;
    if (aspectMode === 'landscape') return 16 / 9;
    if (aspectMode === 'square') return 1;
    return detectedRatio || 16 / 9;
  }, [aspectMode, detectedRatio]);

  const isFullscreen = isNativeFullscreen || isPseudoFullscreen;

  const VolumeIcon = globalMuted || globalVolume === 0
    ? VolumeX
    : globalVolume < 0.5
      ? Volume1
      : Volume2;

  const supportsPiP =
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    Boolean(document.pictureInPictureEnabled);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={title ? title + ' video player' : 'Video player'}
      className={cn(
        'group/player relative w-full overflow-hidden bg-black text-white outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-white/70',
        isNativeFullscreen && 'h-screen w-screen max-h-none max-w-none rounded-none',
        isPseudoFullscreen && 'fixed inset-0 z-[9999] h-[100dvh] w-screen max-h-none max-w-none rounded-none',
        className,
      )}
      style={{
        ...(isFullscreen ? {} : { aspectRatio: String(effectiveRatio) }),
        touchAction: isFullscreen ? 'none' : 'pan-y',
      }}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => {
        if (isPlaying && !showSettings && !isScrubbing) setShowControls(false);
        setShowVolumeSlider(false);
      }}
      onPointerDown={handleSurfacePointerDown}
      onPointerMove={handleSurfacePointerMove}
      onPointerUp={handleSurfacePointerUp}
      onPointerCancel={() => {
        pointerStartRef.current = null;
        pointerMovedRef.current = false;
        clearLongPress();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'touch') clearLongPress();
      }}
      onClick={handleSurfaceClick}
      onDoubleClick={(event) => {
        if (lastPointerTypeRef.current !== 'touch') {
          event.preventDefault();
          toggleFullscreen();
        }
      }}
    >
      <video
        ref={videoRef}
        key={activeSource.src}
        src={activeSource.src}
        poster={poster}
        muted={initialMuted ?? globalMuted}
        loop={loop}
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onWaiting={() => {
          if (!playbackError) setIsLoading(true);
        }}
        onCanPlay={() => {
          setPlaybackError(false);
          setIsLoading(false);
        }}
        onError={() => {
          setPlaybackError(true);
          setIsLoading(false);
          setIsPlaying(false);
        }}
        onPlay={() => {
          setIsPlaying(true);
          setIsLoading(false);
          window.dispatchEvent(new CustomEvent('alsamos:video-play', { detail: playerId }));
          showControlsTemporarily();
        }}
        onPause={() => {
          setIsPlaying(false);
          setShowControls(true);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setShowControls(true);
          onEnded?.();
        }}
      >
        {tracks.map((track) => (
          <track
            key={track.src + track.srcLang}
            src={track.src}
            srcLang={track.srcLang}
            label={track.label}
            default={track.default}
            kind="subtitles"
          />
        ))}
      </video>

      {isLoading && !playbackError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-white/85" />
        </div>
      )}

      {playbackError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950/92 px-6 text-white">
          <div className="max-w-xs text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold">Videoni yuklab bo‘lmadi</p>
            <p className="mt-1 text-xs leading-relaxed text-white/60">
              Media havolasi vaqtincha ishlamayapti yoki tarmoq uzildi.
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setPlaybackError(false);
                setIsLoading(true);
                const video = videoRef.current;
                if (video) {
                  video.load();
                  if (autoPlay) {
                    void video.play().catch(() => undefined);
                  }
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="mx-auto mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-black transition hover:bg-white/90"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Qayta urinish
            </button>
          </div>
        </div>
      )}

      {!isLoading && !playbackError && !isPlaying && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            togglePlay();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-xl ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105 hover:bg-black/70 active:scale-95"
          aria-label="Videoni ijro etish"
        >
          <Play className="h-7 w-7 translate-x-0.5 fill-current" />
        </button>
      )}

      {gestureFlash && (
        <div
          className={cn(
            'pointer-events-none absolute top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-black/60 px-4 py-3 text-white shadow-xl backdrop-blur-md',
            gestureFlash.kind === 'back' && 'left-[14%]',
            gestureFlash.kind === 'forward' && 'right-[14%]',
            (gestureFlash.kind === 'speed' || gestureFlash.kind === 'play') &&
              'left-1/2 -translate-x-1/2',
          )}
        >
          {gestureFlash.kind === 'back' ? (
            <RotateCcw className="h-6 w-6" />
          ) : gestureFlash.kind === 'forward' ? (
            <RotateCw className="h-6 w-6" />
          ) : gestureFlash.kind === 'speed' ? (
            <Gauge className="h-6 w-6" />
          ) : (
            <Play className="h-6 w-6 fill-current" />
          )}
          <span className="text-xs font-semibold tabular-nums">{gestureFlash.text}</span>
        </div>
      )}

      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-10 flex flex-col justify-end transition-opacity duration-200',
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/20" />

        {showSettings && (
          <div
            className="pointer-events-auto absolute bottom-16 right-3 z-40 w-60 overflow-hidden rounded-2xl border border-white/10 bg-black/90 shadow-2xl backdrop-blur-xl"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {settingsPanel === 'main' && (
              <div className="py-1.5">
                <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
                  Video sozlamalari
                </div>
                {tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCaptions(!captionsEnabled);
                      setShowSettings(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-white/10"
                  >
                    <span className="flex items-center gap-2.5">
                      <Captions className="h-4 w-4 text-white/70" />
                      Subtitrlar
                    </span>
                    <span className="text-xs text-white/60">{captionsEnabled ? 'Yoqiq' : 'O‘chiq'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSettingsPanel('speed')}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-white/10"
                >
                  <span className="flex items-center gap-2.5">
                    <Gauge className="h-4 w-4 text-white/70" />
                    Ijro tezligi
                  </span>
                  <span className="flex items-center gap-1 text-xs text-white/60">
                    {playbackRate === 1 ? 'Oddiy' : playbackRate + '×'}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => normalizedSources.length > 1 && setSettingsPanel('quality')}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2.5 text-sm',
                    normalizedSources.length > 1 ? 'hover:bg-white/10' : 'cursor-default opacity-65',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Settings className="h-4 w-4 text-white/70" />
                    Sifat
                  </span>
                  <span className="flex items-center gap-1 text-xs text-white/60">
                    {activeSource.label}
                    {normalizedSources.length > 1 && <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                </button>
              </div>
            )}

            {settingsPanel === 'speed' && (
              <div className="py-1.5">
                <button
                  type="button"
                  onClick={() => setSettingsPanel('main')}
                  className="flex w-full items-center gap-2 border-b border-white/10 px-3 py-2.5 text-sm font-medium hover:bg-white/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Ijro tezligi
                </button>
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      changeRate(rate);
                      setSettingsPanel('main');
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-white/10"
                  >
                    <span>{rate === 1 ? 'Oddiy' : rate + '×'}</span>
                    {playbackRate === rate && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}

            {settingsPanel === 'quality' && (
              <div className="py-1.5">
                <button
                  type="button"
                  onClick={() => setSettingsPanel('main')}
                  className="flex w-full items-center gap-2 border-b border-white/10 px-3 py-2.5 text-sm font-medium hover:bg-white/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Video sifati
                </button>
                {normalizedSources.map((source, index) => (
                  <button
                    key={source.src + source.label}
                    type="button"
                    onClick={() => handleQualityChange(index)}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-white/10"
                  >
                    <span>{source.label}</span>
                    {sourceIndex === index && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className={cn(
            'pointer-events-auto relative z-20 space-y-0.5 px-2.5 pb-2.5 sm:px-3 sm:pb-3',
            isFullscreen && 'px-4 pb-4 md:px-6 md:pb-5',
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <VideoScrubBar
            src={activeSource.src}
            duration={duration}
            currentTime={currentTime}
            bufferedSeconds={bufferedSeconds}
            onSeek={seekTo}
            onScrubStateChange={(value) => {
              setIsScrubbing(value);
              setShowControls(true);
              if (!value) scheduleControlsHide();
            }}
            enablePreview={duration > 0}
            showHeatmap={false}
            playedClassName="bg-red-500"
            thumbClassName="bg-red-500"
            className={cn(isFullscreen && 'mb-1')}
          />

          <div className="flex min-w-0 items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => skip(-10)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 active:scale-95"
                title="10 soniya orqaga (J)"
                aria-label="10 soniya orqaga"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 active:scale-95"
                title={isPlaying ? 'Pauza (K)' : 'Ijro (K)'}
                aria-label={isPlaying ? 'Pauza' : 'Ijro'}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="h-5 w-5 translate-x-0.5 fill-current" />
                )}
              </button>

              <button
                type="button"
                onClick={() => skip(10)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 active:scale-95"
                title="10 soniya oldinga (L)"
                aria-label="10 soniya oldinga"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              <div
                className="hidden items-center sm:flex"
                onMouseEnter={() => {
                  if (volumeHideTimerRef.current) clearTimeout(volumeHideTimerRef.current);
                  setShowVolumeSlider(true);
                }}
                onMouseLeave={() => {
                  volumeHideTimerRef.current = setTimeout(() => setShowVolumeSlider(false), 260);
                }}
              >
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"
                  title="Ovoz (M)"
                >
                  <VolumeIcon className="h-4 w-4" />
                </button>
                <div className={cn('overflow-hidden transition-all', showVolumeSlider ? 'w-24 opacity-100' : 'w-0 opacity-0')}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={globalMuted ? 0 : globalVolume}
                    onChange={(event) => changeVolume(Number(event.target.value))}
                    className="h-1 w-20 cursor-pointer accent-white"
                    aria-label="Ovoz balandligi"
                  />
                </div>
              </div>

              <span className="ml-1 truncate text-[11px] font-medium tabular-nums text-white/95 sm:text-xs">
                {formatTime(currentTime)}
                <span className="text-white/55"> / {formatTime(duration)}</span>
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={toggleMute}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15 sm:hidden"
                aria-label={globalMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}
              >
                <VolumeIcon className="h-4 w-4" />
              </button>

              {tracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCaptions(!captionsEnabled)}
                  className={cn(
                    'hidden h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15 sm:flex',
                    captionsEnabled && 'bg-white/15',
                  )}
                  title="Subtitrlar (C)"
                >
                  <Captions className="h-4 w-4" />
                </button>
              )}

              {supportsPiP && (
                <button
                  type="button"
                  onClick={() => void togglePictureInPicture()}
                  className="hidden h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15 md:flex"
                  title="Picture-in-Picture (I)"
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowSettings((current) => !current);
                  setSettingsPanel('main');
                  setShowControls(true);
                }}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15',
                  showSettings && 'bg-white/15',
                )}
                title="Sozlamalar"
              >
                <Settings className={cn('h-4 w-4 transition-transform', showSettings && 'rotate-45')} />
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"
                title={isFullscreen ? 'To‘liq ekrandan chiqish (F)' : 'To‘liq ekran (F)'}
                aria-label={isFullscreen ? 'To‘liq ekrandan chiqish' : 'To‘liq ekran'}
              >
                {isFullscreen ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {isPlaying ? 'Video ijro etilmoqda' : 'Video pauzada'}
      </div>
    </div>
  );
}
