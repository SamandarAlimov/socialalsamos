import { useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatTrackDuration, type PostMusic } from '@/lib/postMarkers';

interface PostMusicCardProps {
  music: PostMusic;
  className?: string;
  startSeconds?: number;
  endSeconds?: number | null;
  volume?: number;
}

/**
 * Postga bog'langan audio uchun premium ko'rinishdagi karta.
 * Ilgari bu joyda `[MUSIC]{...}` xom JSON matn bo'lib chiqardi.
 */
export function PostMusicCard({
  music,
  className,
  startSeconds = 0,
  endSeconds = null,
  volume = 1,
}: PostMusicCardProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = Math.min(1, Math.max(0, volume));

    const onLoaded = () => {
      if (startSeconds > 0 && startSeconds < audio.duration) {
        audio.currentTime = startSeconds;
      }
    };

    const onTime = () => {
      if (endSeconds != null && audio.currentTime >= endSeconds) {
        audio.pause();
        audio.currentTime = Math.max(0, startSeconds);
        setIsPlaying(false);
      }
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
    };
  }, [endSeconds, startSeconds, volume]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      if (
        audio.currentTime < startSeconds ||
        (endSeconds != null && audio.currentTime >= endSeconds)
      ) {
        audio.currentTime = Math.max(0, startSeconds);
      }
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  };

  const duration = formatTrackDuration(music.durationSeconds);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3',
        className,
      )}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
        {music.coverUrl ? (
          <img src={music.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/15">
            <Music2 className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{music.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {music.artist ?? t('post.music.unknownArtist', { defaultValue: 'Noma\u2019lum ijrochi' })}
          {duration ? ` \u00b7 ${duration}` : ''}
        </p>
      </div>

      {music.audioUrl && (
        <>
          <button
            type="button"
            onClick={toggle}
            aria-label={
              isPlaying
                ? t('post.music.pause', { defaultValue: 'To\u2019xtatish' })
                : t('post.music.play', { defaultValue: 'Tinglash' })
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
          </button>
          <audio
            ref={audioRef}
            src={music.audioUrl}
            preload="none"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
        </>
      )}
    </div>
  );
}
