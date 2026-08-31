import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useVideoScrubPreview } from '@/hooks/useVideoScrubPreview';
import { formatMediaTime } from '@/lib/videoFormat';

/**
 * YouTube uslubidagi timeline.
 *
 * • Surilayotganda aynan o'sha soniyadagi kadr preview qilib ko'rsatiladi.
 * • Timeline tepasida "eng ko'p ko'rilgan qism" grafigi chiqadi.
 * • Sichqoncha ham, barmoq ham (pointer events) bir xil ishlaydi.
 */

export interface VideoScrubBarProps {
  src?: string;
  duration: number;
  currentTime: number;
  bufferedSeconds?: number;
  /** 0..1 oralig'idagi qiymatlar; bo'sh bo'lsa grafik chizilmaydi. */
  heatmap?: number[];
  onSeek: (time: number) => void;
  onScrubStateChange?: (isScrubbing: boolean) => void;
  enablePreview?: boolean;
  showHeatmap?: boolean;
  className?: string;
  playedClassName?: string;
  thumbClassName?: string;
}

const HEATMAP_VIEW_W = 100;
const HEATMAP_VIEW_H = 40;

function buildHeatmapPath(points: number[]): string {
  if (points.length < 2) return '';
  const step = HEATMAP_VIEW_W / (points.length - 1);
  const coords = points.map((value, index) => [
    index * step,
    HEATMAP_VIEW_H - Math.max(0.04, Math.min(1, value)) * HEATMAP_VIEW_H,
  ] as const);

  let d = `M 0 ${HEATMAP_VIEW_H} L ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  d += ` L ${HEATMAP_VIEW_W} ${HEATMAP_VIEW_H} Z`;
  return d;
}

export function VideoScrubBar({
  src,
  duration,
  currentTime,
  bufferedSeconds = 0,
  heatmap,
  onSeek,
  onScrubStateChange,
  enablePreview = true,
  showHeatmap = true,
  className,
  playedClassName = 'bg-primary',
  thumbClassName = 'bg-primary',
}: VideoScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [pointerRatio, setPointerRatio] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const {
    canvasRef,
    requestFrame,
    previewWidth,
    previewHeight,
  } = useVideoScrubPreview(src, enablePreview && !!src);

  const isActive = isHovering || isScrubbing;
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const bufferedRatio = duration > 0 ? Math.min(1, Math.max(0, bufferedSeconds / duration)) : 0;
  const previewTime = pointerRatio * duration;

  const heatmapPath = useMemo(
    () => (showHeatmap && heatmap && heatmap.length > 1 ? buildHeatmapPath(heatmap) : ''),
    [heatmap, showHeatmap],
  );

  const ratioFromClientX = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    setTrackWidth(rect.width);
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const updatePreview = useCallback(
    (ratio: number) => {
      setPointerRatio(ratio);
      if (enablePreview && duration > 0) requestFrame(ratio * duration);
    },
    [duration, enablePreview, requestFrame],
  );

  const setScrubbing = useCallback(
    (value: boolean) => {
      setIsScrubbing(value);
      onScrubStateChange?.(value);
    },
    [onScrubStateChange],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const ratio = ratioFromClientX(event.clientX);
    updatePreview(ratio);
    setScrubbing(true);
    if (duration > 0) onSeek(ratio * duration);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const ratio = ratioFromClientX(event.clientX);
    if (isScrubbing) {
      event.stopPropagation();
      updatePreview(ratio);
      if (duration > 0) onSeek(ratio * duration);
      return;
    }
    if (event.pointerType === 'mouse') {
      setIsHovering(true);
      updatePreview(ratio);
    }
  };

  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setScrubbing(false);
  };

  const clampedPreviewLeft = trackWidth
    ? Math.min(
        Math.max(pointerRatio * trackWidth, previewWidth / 2 + 4),
        Math.max(previewWidth / 2 + 4, trackWidth - previewWidth / 2 - 4),
      )
    : pointerRatio * 100;

  return (
    <div className={cn('relative select-none', className)}>
      {/* Eng ko'p ko'rilgan qism (most replayed) */}
      {heatmapPath && (
        <svg
          viewBox={`0 0 ${HEATMAP_VIEW_W} ${HEATMAP_VIEW_H}`}
          preserveAspectRatio="none"
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-[10px] left-0 h-9 w-full transition-all duration-200',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
          )}
        >
          <defs>
            <linearGradient id="alsamos-heatmap" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.85" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <path d={heatmapPath} fill="url(#alsamos-heatmap)" className="text-white" />
        </svg>
      )}

      {/* Kadr preview kartasi */}
      {isActive && duration > 0 && enablePreview && (
        <div
          className="pointer-events-none absolute bottom-8 z-30 flex flex-col items-center gap-1"
          style={{
            left: trackWidth ? `${clampedPreviewLeft}px` : `${pointerRatio * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="overflow-hidden rounded-lg border border-white/25 bg-black shadow-2xl">
            <canvas
              ref={canvasRef}
              width={previewWidth}
              height={previewHeight}
              className="block"
              style={{ width: previewWidth, height: previewHeight }}
            />
          </div>
          <span className="rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            {formatMediaTime(previewTime)}
          </span>
        </div>
      )}

      {/* Timeline */}
      <div
        ref={trackRef}
        role="slider"
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.round(currentTime)}
        tabIndex={0}
        className="group relative flex h-5 cursor-pointer touch-none items-center"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setIsHovering(true);
        }}
        onPointerLeave={() => {
          if (!isScrubbing) setIsHovering(false);
        }}
      >
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-full bg-white/25 transition-all duration-150',
            isActive ? 'h-[5px]' : 'h-[3px]',
          )}
        >
          <div
            className="absolute inset-y-0 left-0 bg-white/40"
            style={{ width: `${bufferedRatio * 100}%` }}
          />
          <div
            className={cn('absolute inset-y-0 left-0', playedClassName)}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div
          className={cn(
            'absolute -translate-x-1/2 rounded-full shadow-lg transition-all duration-150',
            thumbClassName,
            isActive ? 'h-3.5 w-3.5 opacity-100' : 'h-3 w-3 opacity-0',
          )}
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
