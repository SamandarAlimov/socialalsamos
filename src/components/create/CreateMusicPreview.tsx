import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Music2, Pause, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import { resolveStorageUrl } from '@/lib/mediaUpload';
import type { PostMusicInput } from '@/lib/postMeta';

interface CreateMusicPreviewProps {
  music?: PostMusicInput | null;
  enabled?: boolean;
  className?: string;
  compact?: boolean;
  /**
   * Video bilan ishlaganda parent media holatini beradi. Undefined bo‘lsa
   * komponent rasm/creator preview kabi mustaqil ishlaydi.
   */
  mediaPlaying?: boolean;
  mediaTimeSeconds?: number | null;
  /** Feed rasmlarida faqat ko‘rinib turgan post audio boshlashi uchun. */
  visibilityManaged?: boolean;
  autoPlay?: boolean;
}

const BACKGROUND_MUSIC_PLAY_EVENT = 'alsamos:background-music-play';

function clampVolume(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 1;
  return Math.min(1, Math.max(0, value ?? 1));
}

export function CreateMusicPreview({
  music,
  enabled = true,
  className,
  compact = false,
  mediaPlaying,
  mediaTimeSeconds = null,
  visibilityManaged = false,
  autoPlay = true,
}: CreateMusicPreviewProps) {
  const playerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isVisible, setIsVisible] = useState(!visibilityManaged);

  const track = music?.track ?? null;
  const startSeconds = Math.max(0, music?.startSeconds ?? 0);
  const endSeconds =
    typeof music?.endSeconds === 'number' && Number.isFinite(music.endSeconds)
      ? Math.max(startSeconds + 0.05, music.endSeconds)
      : null;
  const clipDuration =
    endSeconds != null ? Math.max(0.05, endSeconds - startSeconds) : null;
  const volume = clampVolume(music?.volume);

  const sourceIdentity = useMemo(
    () =>
      track
        ? [
            track.audioUrl,
            track.storageBucket ?? '',
            track.storageKey ?? '',
            music?.trackId ?? '',
          ].join('|')
        : music?.trackId ?? '',
    [music?.trackId, track],
  );

  useEffect(() => {
    let cancelled = false;
    setResolvedUrl('');
    setIsPlaying(false);
    setAutoplayBlocked(false);

    if (!enabled || !track?.audioUrl) return;

    void resolveStorageUrl(
      track.audioUrl,
      track.storageBucket ?? null,
      track.storageKey ?? null,
      60 * 60,
    )
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch((error) => {
        console.warn('Create music preview URL olinmadi:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, sourceIdentity, track?.audioUrl, track?.storageBucket, track?.storageKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!visibilityManaged) {
      setIsVisible(true);
      return;
    }

    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.6)),
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibilityManaged]);

  const seekToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(startSeconds, Math.max(0, duration - 0.05));
  }, [startSeconds]);

  const seekToMediaClock = useCallback(
    (mediaSeconds: number | null | undefined, force = false) => {
      const audio = audioRef.current;
      if (!audio || mediaSeconds == null || !Number.isFinite(mediaSeconds)) return;

      const offset = clipDuration
        ? Math.max(0, mediaSeconds) % clipDuration
        : Math.max(0, mediaSeconds);
      let target = startSeconds + offset;

      if (endSeconds != null) target = Math.min(target, endSeconds - 0.02);
      if (Number.isFinite(audio.duration)) {
        target = Math.min(target, Math.max(0, audio.duration - 0.02));
      }

      if (force || Math.abs(audio.currentTime - target) > 0.75) {
        audio.currentTime = Math.max(0, target);
      }
    },
    [clipDuration, endSeconds, startSeconds],
  );

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !enabled || !resolvedUrl || !isVisible) return;

    try {
      if (
        audio.currentTime < startSeconds - 0.1 ||
        (endSeconds != null && audio.currentTime >= endSeconds)
      ) {
        seekToStart();
      }
      window.dispatchEvent(
        new CustomEvent(BACKGROUND_MUSIC_PLAY_EVENT, { detail: playerId }),
      );
      await audio.play();
      setIsPlaying(true);
      setAutoplayBlocked(false);
    } catch {
      setIsPlaying(false);
      setAutoplayBlocked(true);
    }
  }, [enabled, endSeconds, isVisible, playerId, resolvedUrl, seekToStart, startSeconds]);

  useEffect(() => {
    const pauseOther = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const audio = audioRef.current;
      if (!audio || detail === playerId || audio.paused) return;
      audio.pause();
    };
    window.addEventListener(BACKGROUND_MUSIC_PLAY_EVENT, pauseOther);
    return () => window.removeEventListener(BACKGROUND_MUSIC_PLAY_EVENT, pauseOther);
  }, [playerId]);

  // Video bilan biriktirilganda music uning play/pause holatiga ergashadi.
  useEffect(() => {
    if (mediaPlaying === undefined) return;
    const audio = audioRef.current;
    if (!audio || !resolvedUrl) return;

    if (!enabled || !isVisible || !mediaPlaying) {
      audio.pause();
      return;
    }

    seekToMediaClock(mediaTimeSeconds, true);
    void play();
  }, [enabled, isVisible, mediaPlaying, mediaTimeSeconds, play, resolvedUrl, seekToMediaClock]);

  // Video timeupdate/seek bilan music driftini tuzatadi.
  useEffect(() => {
    if (mediaPlaying === undefined || !mediaPlaying) return;
    seekToMediaClock(mediaTimeSeconds);
  }, [mediaPlaying, mediaTimeSeconds, seekToMediaClock]);

  // Rasm yoki creator preview: media play state yo‘q bo‘lsa mustaqil ijro.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || mediaPlaying !== undefined) return;

    if (!enabled || !resolvedUrl || !isVisible || !autoPlay) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    const startPlayback = () => {
      seekToStart();
      void play();
    };

    if (audio.readyState >= 1) startPlayback();
    else audio.addEventListener('loadedmetadata', startPlayback, { once: true });

    return () => audio.removeEventListener('loadedmetadata', startPlayback);
  }, [autoPlay, enabled, isVisible, mediaPlaying, play, resolvedUrl, seekToStart]);

  useEffect(() => {
    if (isVisible) return;
    audioRef.current?.pause();
  }, [isVisible]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || endSeconds == null || audio.currentTime < endSeconds) return;

    if (mediaPlaying !== undefined && mediaTimeSeconds != null) {
      seekToMediaClock(mediaTimeSeconds, true);
      if (mediaPlaying) void play();
      return;
    }

    seekToStart();
    void play();
  }, [endSeconds, mediaPlaying, mediaTimeSeconds, play, seekToMediaClock, seekToStart]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (mediaPlaying !== undefined) seekToMediaClock(mediaTimeSeconds, true);
      void play();
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [mediaPlaying, mediaTimeSeconds, play, seekToMediaClock]);

  if (!music || !track?.audioUrl) return null;

  return (
    <div ref={rootRef} className={cn('z-20', className)}>
      <audio
        ref={audioRef}
        src={resolvedUrl || undefined}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          if (mediaPlaying !== undefined && mediaTimeSeconds != null) {
            seekToMediaClock(mediaTimeSeconds, true);
          } else {
            seekToStart();
          }
          if (mediaPlaying !== false) void play();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <button
        type="button"
        onClick={togglePlayback}
        disabled={!resolvedUrl}
        title={
          autoplayBlocked
            ? 'Musiqani ijro etish'
            : isPlaying
              ? 'Musiqani pauza qilish'
              : 'Musiqani ijro etish'
        }
        aria-label={isPlaying ? 'Musiqani pauza qilish' : 'Musiqani ijro etish'}
        className={cn(
          'flex max-w-[220px] items-center gap-1.5 rounded-full bg-black/55 text-white shadow-sm backdrop-blur-xl transition hover:bg-black/70 disabled:opacity-50',
          compact
            ? 'h-8 w-8 justify-center p-0'
            : 'min-h-8 px-2.5 py-1 text-[10px] font-medium',
        )}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5 shrink-0" />
        ) : autoplayBlocked ? (
          <Play className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Music2 className="h-3.5 w-3.5 shrink-0" />
        )}
        {!compact && <span className="truncate">{track.title || 'Musiqa'}</span>}
      </button>
    </div>
  );
}
