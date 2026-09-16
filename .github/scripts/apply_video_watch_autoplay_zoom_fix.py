from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:160]!r}")
    write(path, text.replace(old, new, 1))


# Persist YouTube-style autoplay. Enabled by default, user choice remembered.
write(
    "src/lib/videoPlaybackPreference.ts",
    """const MUTED_KEY = 'alsamos:videos-muted';
const AUTOPLAY_KEY = 'alsamos:videos-autoplay';

export function readVideosMutedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeVideosMutedPreference(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Storage can be unavailable in private/embedded contexts.
  }
}

export function readVideosAutoplayPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(AUTOPLAY_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeVideosAutoplayPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTOPLAY_KEY, enabled ? '1' : '0');
  } catch {
    // Storage can be unavailable in private/embedded contexts.
  }
}
""",
)

# Add mouse / pen pan support after zoom.
replace_once(
    "src/hooks/usePinchZoom.ts",
    """    onTouchEnd: (e: React.TouchEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
""",
    """    onTouchEnd: (e: React.TouchEvent) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
""",
)
replace_once(
    "src/hooks/usePinchZoom.ts",
    """  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const isZoomed = state.scale > 1;
""",
    """  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const pointerDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    translateX: number;
    translateY: number;
  } | null>(null);
  const isZoomed = state.scale > 1;
""",
)
replace_once(
    "src/hooks/usePinchZoom.ts",
    "  const onDoubleClick = useCallback((e: React.MouseEvent) => {",
    """  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isZoomed || (e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    pointerDrag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      translateX: state.translateX,
      translateY: state.translateY,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [isZoomed, state.translateX, state.translateY]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== e.pointerId || !isZoomed) return;
    e.preventDefault();
    const clamped = clampTranslation(
      drag.translateX + (e.clientX - drag.startX),
      drag.translateY + (e.clientY - drag.startY),
      state.scale,
    );
    setState((previous) => ({
      ...previous,
      translateX: clamped.x,
      translateY: clamped.y,
    }));
  }, [clampTranslation, isZoomed, state.scale]);

  const finishPointerDrag = useCallback((e: React.PointerEvent) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    pointerDrag.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    finishPointerDrag(e);
  }, [finishPointerDrag]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    finishPointerDrag(e);
  }, [finishPointerDrag]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {""",
)
replace_once(
    "src/hooks/usePinchZoom.ts",
    "    handlers: { onTouchStart, onTouchMove, onTouchEnd, onDoubleClick, onWheel },",
    """    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onDoubleClick,
      onWheel,
    },""",
)
replace_once(
    "src/hooks/usePinchZoom.ts",
    """    onDoubleClick,
    onTouchEnd,
    onTouchMove,
    onTouchStart,
    onWheel,
""",
    """    onDoubleClick,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchEnd,
    onTouchMove,
    onTouchStart,
    onWheel,
""",
)

# Watch player imports and state.
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """import {
  readVideosMutedPreference,
  writeVideosMutedPreference,
} from '@/lib/videoPlaybackPreference';
""",
    """import {
  readVideosAutoplayPreference,
  readVideosMutedPreference,
  writeVideosAutoplayPreference,
  writeVideosMutedPreference,
} from '@/lib/videoPlaybackPreference';
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """  const upNext = useMemo(
    () => videos.filter((item) => item.id !== activeVideoId),
    [activeVideoId, videos],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
""",
    """  const upNext = useMemo(
    () => videos.filter((item) => item.id !== activeVideoId),
    [activeVideoId, videos],
  );
  const nextVideo = upNext[0] ?? null;

  const videoRef = useRef<HTMLVideoElement>(null);
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """  const desiredPausedRef = useRef(initialPlayback?.paused ?? false);
  const zoom = usePinchZoom(2.5, 1, playerRef);
""",
    """  const desiredPausedRef = useRef(initialPlayback?.paused ?? false);
  const autoAdvanceRef = useRef(false);
  const zoom = usePinchZoom(2.5, 1, playerRef);
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """  const [isMuted, setIsMuted] = useState(mutedRef.current);
  const [speed, setSpeed] = useState(1);
""",
    """  const [isMuted, setIsMuted] = useState(mutedRef.current);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(readVideosAutoplayPreference);
  const [speed, setSpeed] = useState(1);
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitCover, setFitCover] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
""",
    """  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """  const closeWithPlayback = useCallback(() => {
    const playback = publishPlayback();
    onClose(playback);
  }, [onClose, publishPlayback]);

  useEffect(() => {
""",
    """  const closeWithPlayback = useCallback(() => {
    const playback = publishPlayback();
    onClose(playback);
  }, [onClose, publishPlayback]);

  const advanceToNextVideo = useCallback((playback?: VideoPlaybackSnapshot) => {
    if (!nextVideo) return false;
    autoAdvanceRef.current = true;
    onSelectVideo(nextVideo.id, playback ?? publishPlayback());
    return true;
  }, [nextVideo, onSelectVideo, publishPlayback]);

  useEffect(() => {
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """  useEffect(() => {
    mutedRef.current = isMuted;
    writeVideosMutedPreference(isMuted);
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    speedRef.current = speed;
""",
    """  useEffect(() => {
    mutedRef.current = isMuted;
    writeVideosMutedPreference(isMuted);
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    writeVideosAutoplayPreference(isAutoplayEnabled);
  }, [isAutoplayEnabled]);

  useEffect(() => {
    speedRef.current = speed;
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """  useEffect(() => {
    const playback = initialPlaybackRef.current ?? { time: 0, paused: false };
    pendingPlaybackRef.current = playback;
""",
    """  useEffect(() => {
    const playback = autoAdvanceRef.current
      ? { time: 0, paused: false }
      : initialPlaybackRef.current ?? { time: 0, paused: false };
    autoAdvanceRef.current = false;
    pendingPlaybackRef.current = playback;
""",
)

# Speed controls: keep click-cycle and add YouTube < / > keyboard stepping.
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """  const toggleFullscreen = useCallback(async () => {
""",
    """  const stepSpeed = useCallback((direction: -1 | 1) => {
    setSpeed((current) => {
      const index = PLAYBACK_RATES.indexOf(current as (typeof PLAYBACK_RATES)[number]);
      const nextIndex = Math.min(
        PLAYBACK_RATES.length - 1,
        Math.max(0, Math.max(index, 0) + direction),
      );
      return PLAYBACK_RATES[nextIndex];
    });
    revealControls();
  }, [revealControls]);

  const toggleFullscreen = useCallback(async () => {
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const digitTarget = resolveVideoDigitSeekTarget(
""",
    """      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        advanceToNextVideo();
        return;
      }

      const digitTarget = resolveVideoDigitSeekTarget(
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """        case 'm': event.preventDefault(); setIsMuted((value) => !value); break;
        case 'f': event.preventDefault(); void toggleFullscreen(); break;
""",
    """        case 'm': event.preventDefault(); setIsMuted((value) => !value); break;
        case '>': event.preventDefault(); stepSpeed(1); break;
        case '<': event.preventDefault(); stepSpeed(-1); break;
        case 'f': event.preventDefault(); void toggleFullscreen(); break;
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    "  }, [closeWithPlayback, duration, handleSeek, keyboardEnabled, seekBy, toggleFullscreen, togglePlay]);",
    "  }, [advanceToNextVideo, closeWithPlayback, duration, handleSeek, keyboardEnabled, seekBy, stepSpeed, toggleFullscreen, togglePlay]);",
)

# Up-next label reflects autoplay state.
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    "<p className=\"mt-0.5 text-[11px] text-muted-foreground\">Avtomatik o‘tish o‘chirilgan</p>",
    "<p className=\"mt-0.5 text-[11px] text-muted-foreground\">{isAutoplayEnabled ? 'Avtomatik o‘tish yoqilgan' : 'Avtomatik o‘tish o‘chirilgan'}</p>",
)

# Route pointer motion to the zoom hook; while zoomed, dragging owns the surface.
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """          onPointerMove={revealControls}
          onWheel={zoom.handlers.onWheel}
""",
    """          onPointerMove={(event) => {
            revealControls();
            zoom.handlers.onPointerMove(event);
          }}
          onWheel={zoom.handlers.onWheel}
""",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """          onPointerDown={(event) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (target?.closest('button, a, input, textarea, select, [role=\"slider\"], [data-video-interactive=\"true\"]')) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            startHold();
          }}
          onPointerUp={(event) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (target?.closest('button, a, input, textarea, select, [role=\"slider\"], [data-video-interactive=\"true\"]')) return;
            if (!endHold()) registerTap(event.clientX, event.clientY);
          }}
          onPointerCancel={() => endHold()}
          onPointerLeave={() => endHold()}
""",
    """          onPointerDown={(event) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (target?.closest('button, a, input, textarea, select, [role=\"slider\"], [data-video-interactive=\"true\"]')) return;
            if (zoom.isZoomed) {
              endHold();
              zoom.handlers.onPointerDown(event);
              return;
            }
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            startHold();
          }}
          onPointerUp={(event) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (target?.closest('button, a, input, textarea, select, [role=\"slider\"], [data-video-interactive=\"true\"]')) return;
            if (zoom.isZoomed) {
              zoom.handlers.onPointerUp(event);
              endHold();
              return;
            }
            if (!endHold()) registerTap(event.clientX, event.clientY);
          }}
          onPointerCancel={(event) => {
            zoom.handlers.onPointerCancel(event);
            endHold();
          }}
          onPointerLeave={() => endHold()}
""",
)

# Remove the top fit/cover button that looks like a zoom control.
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    "{aspectKind !== 'landscape' && !fitCover && posterUrl && (",
    "{aspectKind !== 'landscape' && posterUrl && (",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    "className={cn('relative z-[1] h-full w-full will-change-transform', fitCover ? 'object-cover' : 'object-contain')}",
    "className=\"relative z-[1] h-full w-full object-contain will-change-transform\"",
)
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """            <div className={cn('flex items-center gap-2', showControls ? 'pointer-events-auto' : 'pointer-events-none')}>
              <Button variant="ghost" size="sm" onClick={cycleSpeed} className="h-9 rounded-full bg-black/30 px-3 text-xs font-semibold text-white">{speed}x</Button>
              <Button variant="ghost" size="icon" onClick={() => setFitCover((value) => !value)} className="h-10 w-10 rounded-full bg-black/30 text-white" aria-label="Sig‘dirish">{fitCover ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}</Button>
            </div>
""",
    """            <div className={cn('flex items-center gap-2', showControls ? 'pointer-events-auto' : 'pointer-events-none')}>
              <Button variant="ghost" size="sm" onClick={cycleSpeed} className="h-9 rounded-full bg-black/30 px-3 text-xs font-semibold text-white">{speed}x</Button>
            </div>
""",
)

# Autoplay into the first ranked Up Next item; if disabled/no next item, expose replay.
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """            onEnded={(event) => {
              // No autoplay/auto-next: stop on the current item and expose replay.
              const endTime = event.currentTarget.duration || duration;
              desiredPausedRef.current = true;
              setCurrentTime(endTime);
              setIsEnded(true);
              setIsPlaying(false);
              onPlaybackChange?.(activeVideoId, { time: endTime, paused: true });
              setShowControls(true);
              if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            }}
""",
    """            onEnded={(event) => {
              const endTime = event.currentTarget.duration || duration;
              const playback = { time: endTime, paused: true };
              desiredPausedRef.current = true;
              setCurrentTime(endTime);
              setIsPlaying(false);
              onPlaybackChange?.(activeVideoId, playback);

              if (isAutoplayEnabled && advanceToNextVideo(playback)) return;

              setIsEnded(true);
              setShowControls(true);
              if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            }}
""",
)

# YouTube-style autoplay toggle sits next to fullscreen.
replace_once(
    "src/components/video/VideoWatchPanel.tsx",
    """              <Button variant="ghost" size="icon" onClick={() => void toggleFullscreen()} className="h-9 w-9 rounded-full text-white hover:bg-white/15" aria-label="To‘liq ekran">{isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</Button>
""",
    """              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsAutoplayEnabled((value) => !value)}
                  className="h-9 w-10 rounded-full text-white hover:bg-white/15"
                  aria-label={isAutoplayEnabled ? 'Avtomatik ijroni o‘chirish' : 'Avtomatik ijroni yoqish'}
                  aria-pressed={isAutoplayEnabled}
                  title={isAutoplayEnabled ? 'Avtomatik ijro yoqilgan' : 'Avtomatik ijro o‘chirilgan'}
                >
                  <span className={cn('relative block h-4 w-7 rounded-full transition-colors', isAutoplayEnabled ? 'bg-white/90' : 'bg-white/35')}>
                    <span className={cn('absolute top-0.5 h-3 w-3 rounded-full transition-transform', isAutoplayEnabled ? 'translate-x-3.5 bg-black' : 'translate-x-0.5 bg-white')} />
                  </span>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void toggleFullscreen()} className="h-9 w-9 rounded-full text-white hover:bg-white/15" aria-label="To‘liq ekran">{isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</Button>
              </div>
""",
)

# Regression test for desktop zoom panning.
write(
    "src/hooks/usePinchZoom.test.tsx",
    """import type React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePinchZoom } from './usePinchZoom';

describe('usePinchZoom', () => {
  it('allows a zoomed desktop video to be panned with the mouse', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      width: 300,
      height: 200,
      toJSON: () => ({}),
    });
    Object.defineProperty(container, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(container, 'hasPointerCapture', { configurable: true, value: vi.fn(() => true) });
    Object.defineProperty(container, 'releasePointerCapture', { configurable: true, value: vi.fn() });

    const targetRef = { current: container } as React.RefObject<HTMLDivElement>;
    const { result } = renderHook(() => usePinchZoom(2.5, 1, targetRef));

    act(() => {
      result.current.handlers.onWheel({
        ctrlKey: true,
        deltaY: -100,
        clientX: 150,
        clientY: 100,
        preventDefault: vi.fn(),
      } as unknown as React.WheelEvent);
    });
    expect(result.current.isZoomed).toBe(true);

    act(() => {
      result.current.handlers.onPointerDown({
        pointerType: 'mouse',
        pointerId: 7,
        button: 0,
        clientX: 150,
        clientY: 100,
        currentTarget: container,
        preventDefault: vi.fn(),
      } as unknown as React.PointerEvent);
      result.current.handlers.onPointerMove({
        pointerType: 'mouse',
        pointerId: 7,
        clientX: 180,
        clientY: 120,
        currentTarget: container,
        preventDefault: vi.fn(),
      } as unknown as React.PointerEvent);
    });

    expect(result.current.translateX).toBeGreaterThan(0);
    expect(result.current.translateY).toBeGreaterThan(0);

    act(() => {
      result.current.handlers.onPointerUp({
        pointerType: 'mouse',
        pointerId: 7,
        currentTarget: container,
      } as unknown as React.PointerEvent);
    });
  });
});
""",
)
