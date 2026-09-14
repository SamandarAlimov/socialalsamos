import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Music2, Pause, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import { resolveStorageUrl } from '@/lib/mediaUpload';
import type { PostMusicInput } from '@/lib/postMeta';

interface CreateMusicPreviewProps {
  music?: PostMusicInput | null;
  enabled?: boolean;
  className?: string;
  compact?: boolean;
}

function clampVolume(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 1;
  return Math.min(1, Math.max(0, value ?? 1));
}

export function CreateMusicPreview({
  music,
  enabled = true,
  className,
  compact = false,
}: CreateMusicPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const track = music?.track ?? null;
  const startSeconds = Math.max(0, music?.startSeconds ?? 0);
  const endSeconds =
    typeof music?.endSeconds === 'number' && Number.isFinite(music.endSeconds)
      ? Math.max(startSeconds + 0.05, music.endSeconds)
      : null;
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

  const seekToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(startSeconds, Math.max(0, duration - 0.05));
  }, [startSeconds]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !enabled || !resolvedUrl) return;

    try {
      if (
        audio.currentTime < startSeconds - 0.1 ||
        (endSeconds != null && audio.currentTime >= endSeconds)
      ) {
        seekToStart();
      }
      await audio.play();
      setIsPlaying(true);
      setAutoplayBlocked(false);
    } catch {
      setIsPlaying(false);
      setAutoplayBlocked(true);
    }
  }, [enabled, endSeconds, resolvedUrl, seekToStart, startSeconds]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!enabled || !resolvedUrl) {
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

    return () => {
      audio.removeEventListener('loadedmetadata', startPlayback);
      audio.pause();
    };
  }, [enabled, play, resolvedUrl, seekToStart]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || endSeconds == null || audio.currentTime < endSeconds) return;
    seekToStart();
    void play();
  }, [endSeconds, play, seekToStart]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void play();
    else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [play]);

  if (!music || !track?.audioUrl) return null;

  return (
    <div className={cn('z-20', className)}>
      <audio
        ref={audioRef}
        src={resolvedUrl || undefined}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          seekToStart();
          void play();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <button
        type="button"
        onClick={togglePlayback}
        disabled={!resolvedUrl}
        title={autoplayBlocked ? 'Musiqani ijro etish' : isPlaying ? 'Musiqani pauza qilish' : 'Musiqani ijro etish'}
        aria-label={isPlaying ? 'Musiqani pauza qilish' : 'Musiqani ijro etish'}
        className={cn(
          'flex max-w-[220px] items-center gap-1.5 rounded-full bg-black/55 text-white shadow-sm backdrop-blur-xl transition hover:bg-black/70 disabled:opacity-50',
          compact ? 'h-8 w-8 justify-center p-0' : 'min-h-8 px-2.5 py-1 text-[10px] font-medium',
        )}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5 shrink-0" />
        ) : autoplayBlocked ? (
          <Play className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Music2 className="h-3.5 w-3.5 shrink-0" />
        )}
        {!compact && (
          <span className="truncate">{track.title || 'Musiqa'}</span>
        )}
      </button>
    </div>
  );
}
