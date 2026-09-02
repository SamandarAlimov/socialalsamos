import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PostAudioPlayerProps {
  src?: string | null;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  className?: string;
  startSeconds?: number;
  endSeconds?: number | null;
  durationSeconds?: number | null;
  initialVolume?: number;
}

const SPEEDS = [1, 1.25, 1.5, 2];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

/**
 * Feed uchun premium audio controller.
 *
 * Native browser player o'rniga barcha postlarda bir xil UI beradi:
 * play/pause, seek timeline, elapsed/total, speed va volume/mute.
 * Bir post audio ijro etilganda boshqa PostAudioPlayer avtomatik pauza qiladi.
 */
export function PostAudioPlayer({
  src,
  title,
  subtitle,
  coverUrl,
  className,
  startSeconds = 0,
  endSeconds = null,
  durationSeconds = null,
  initialVolume = 1,
}: PostAudioPlayerProps) {
  const playerId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [currentTime, setCurrentTime] = useState(Math.max(0, startSeconds));
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(clamp(initialVolume, 0, 1));
  const [muted, setMuted] = useState(false);

  const segmentStart = Math.max(0, startSeconds);
  const knownDuration = duration > 0
    ? duration
    : durationSeconds && durationSeconds > 0
      ? durationSeconds
      : Math.max(segmentStart + 1, 1);
  const segmentEnd = useMemo(() => {
    if (endSeconds != null && endSeconds > segmentStart) {
      return Math.min(endSeconds, knownDuration);
    }
    return knownDuration;
  }, [endSeconds, knownDuration, segmentStart]);

  const timelineEnd = Math.max(segmentStart + 0.01, segmentEnd);
  const segmentLength = Math.max(0, timelineEnd - segmentStart);
  const elapsed = clamp(currentTime - segmentStart, 0, segmentLength);
  const progress = segmentLength > 0 ? clamp(elapsed / segmentLength, 0, 1) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = clamp(initialVolume, 0, 1);
    setVolume(clamp(initialVolume, 0, 1));
  }, [initialVolume]);

  useEffect(() => {
    const handleOtherPlayer = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const audio = audioRef.current;
      if (!audio || detail === playerId || audio.paused) return;
      audio.pause();
      setIsPlaying(false);
    };

    window.addEventListener('alsamos:post-audio-play', handleOtherPlayer);
    return () => window.removeEventListener('alsamos:post-audio-play', handleOtherPlayer);
  }, [playerId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    const upperBound =
      endSeconds != null && endSeconds > segmentStart
        ? Math.min(endSeconds, Number.isFinite(audio.duration) ? audio.duration : endSeconds)
        : audio.duration;

    if (
      audio.currentTime < segmentStart ||
      (Number.isFinite(upperBound) && audio.currentTime >= upperBound - 0.05)
    ) {
      audio.currentTime = segmentStart;
      setCurrentTime(segmentStart);
    }

    window.dispatchEvent(new CustomEvent('alsamos:post-audio-play', { detail: playerId }));
    setIsBuffering(true);
    try {
      await audio.play();
    } catch {
      setIsBuffering(false);
      setIsPlaying(false);
    }
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = clamp(value, segmentStart, timelineEnd);
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const cycleSpeed = () => {
    const index = SPEEDS.findIndex((item) => item === speed);
    setSpeed(SPEEDS[(index + 1) % SPEEDS.length]);
  };

  const toggleMute = () => {
    setMuted((current) => !current);
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-3 p-3.5">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-end justify-center gap-[2px] px-2 py-3" aria-hidden="true">
              {[45, 75, 55, 90, 62, 80, 48].map((height, index) => (
                <span
                  key={index}
                  className="w-[3px] rounded-full bg-muted-foreground/55"
                  style={{ height: height + '%' }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {src && (
          <button
            type="button"
            onClick={togglePlayback}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-[1.04] active:scale-95"
            aria-label={isPlaying ? "Pauza" : "Ijro etish"}
          >
            {isBuffering && !isPlaying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px]" />
            )}
          </button>
        )}
      </div>

      {src && (
        <div className="border-t border-border/50 px-3.5 pb-3 pt-2.5">
          <input
            type="range"
            min={segmentStart}
            max={timelineEnd}
            step="0.05"
            value={clamp(currentTime, segmentStart, timelineEnd)}
            onChange={(event) => handleSeek(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
            aria-label="Audio vaqt chizig'i"
            aria-valuetext={formatSeconds(elapsed) + ' / ' + formatSeconds(segmentLength)}
          />

          <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>{formatSeconds(elapsed)}</span>
            <span>{formatSeconds(segmentLength)}</span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={cycleSpeed}
              className="min-w-11 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold tabular-nums text-foreground transition hover:bg-muted"
              aria-label="Ijro tezligini o'zgartirish"
              title="Ijro tezligi"
            >
              {speed}×
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label={muted || volume === 0 ? 'Ovozni yoqish' : "Ovozni o'chirish"}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={muted ? 0 : volume}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setVolume(next);
                  if (next > 0) setMuted(false);
                }}
                className="hidden h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-foreground sm:block"
                aria-label="Audio ovoz balandligi"
              />
            </div>
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          const nextDuration =
            Number.isFinite(audio.duration) && audio.duration > 0
              ? audio.duration
              : durationSeconds ?? 0;
          setDuration(nextDuration);

          const safeStart = clamp(segmentStart, 0, Math.max(nextDuration, segmentStart));
          if (audio.currentTime < safeStart) {
            audio.currentTime = safeStart;
            setCurrentTime(safeStart);
          }
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          if (endSeconds != null && endSeconds > segmentStart && audio.currentTime >= endSeconds) {
            audio.pause();
            audio.currentTime = endSeconds;
            setCurrentTime(endSeconds);
            setIsPlaying(false);
            setIsBuffering(false);
            return;
          }
          setCurrentTime(audio.currentTime);
        }}
        onPlay={() => {
          setIsPlaying(true);
          setIsBuffering(false);
        }}
        onPause={() => {
          setIsPlaying(false);
          setIsBuffering(false);
        }}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onEnded={() => {
          setIsPlaying(false);
          setIsBuffering(false);
        }}
      />

      <span className="sr-only">Progress {Math.round(progress * 100)}%</span>
    </div>
  );
}

export default PostAudioPlayer;
