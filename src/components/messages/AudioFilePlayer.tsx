import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Play, Pause, Download, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioPlayer, MediaTrack } from '@/contexts/AudioPlayerContext';

interface AudioFilePlayerProps {
  url: string;
  name?: string;
  isMine?: boolean;
  senderName?: string;
}

const BAR_COUNT = 36;

/** URL asosida barqaror waveform (Math.random emas - har renderda sakramaydi) */
function useWaveform(url: string) {
  return useMemo(() => {
    const seed = url.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: BAR_COUNT }).map((_, i) => {
      const base = 30 + ((seed * (i + 3) * 13) % 55);
      const wave = Math.sin((i / BAR_COUNT) * Math.PI * 3) * 18;
      return Math.min(100, Math.max(22, base + wave));
    });
  }, [url]);
}

export function AudioFilePlayer({ url, name, isMine, senderName }: AudioFilePlayerProps) {
  const {
    currentTrack,
    isPlaying: globalIsPlaying,
    currentTime: globalCurrentTime,
    duration: globalDuration,
    progress: globalProgress,
    play,
    pause,
    resume,
    seek,
  } = useAudioPlayer();

  const isThisTrack = currentTrack?.url === url;
  const isPlaying = isThisTrack && globalIsPlaying;

  const [localDuration, setLocalDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const waveformRef = useRef<HTMLDivElement>(null);
  const bars = useWaveform(url);

  useEffect(() => {
    if (isThisTrack) {
      setIsLoading(false);
      return;
    }

    const audio = new Audio(url);
    const onMeta = () => {
      setLocalDuration(audio.duration);
      setIsLoading(false);
    };
    const onCanPlay = () => setIsLoading(false);

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [url, isThisTrack]);

  // "Ijrochi - Nomi" ko'rinishidagi fayl nomini ajratish
  const parseFileName = (fileName: string) => {
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    const dashMatch = nameWithoutExt.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) {
      return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
    }
    return { artist: senderName || "Noma'lum ijrochi", title: nameWithoutExt };
  };

  const rawFileName = name || decodeURIComponent(url.split('/').pop() || '') || 'Audio fayl';
  const { artist, title } = parseFileName(rawFileName);

  const buildTrack = useCallback(
    (): MediaTrack => ({
      id: url,
      url,
      name: rawFileName,
      artist,
      title,
      senderName,
      type: 'audio',
    }),
    [url, rawFileName, artist, title, senderName]
  );

  const togglePlayback = () => {
    if (isLoading) return;

    if (isThisTrack) {
      if (globalIsPlaying) pause();
      else resume();
    } else {
      play(buildTrack());
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    const targetDuration = isThisTrack ? globalDuration : localDuration;
    if (!targetDuration) return;

    const newTime = Math.max(0, Math.min(targetDuration, percentage * targetDuration));

    if (isThisTrack) {
      seek(newTime);
    } else {
      play(buildTrack());
      setTimeout(() => seek(newTime), 120);
    }
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayDuration = isThisTrack ? globalDuration : localDuration;
  const displayCurrentTime = isThisTrack ? globalCurrentTime : 0;
  const displayProgress = isThisTrack ? globalProgress : 0;

  return (
    <div
      className={cn(
        'flex min-w-[260px] max-w-[340px] items-center gap-3 rounded-2xl p-2.5',
        isMine ? 'bg-primary-foreground/10' : 'bg-muted/50 border border-border/50'
      )}
    >
      {/* Play / Pause (Telegramdek yumaloq tugma) */}
      <button
        type="button"
        onClick={togglePlayback}
        disabled={isLoading}
        aria-label={isPlaying ? "To'xtatish" : 'Eshitish'}
        className={cn(
          'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors',
          isMine
            ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
            : 'bg-muted text-foreground hover:bg-muted/70',
          isLoading && 'opacity-50'
        )}
      >
        {isLoading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="ml-0.5 h-5 w-5 fill-current" />
        )}
      </button>

      {/* Ma'lumot va waveform */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[14px] font-semibold leading-tight',
            isMine ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            'flex items-center gap-1 truncate text-[11px]',
            isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          <Music2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{artist}</span>
        </p>

        <div
          ref={waveformRef}
          className="mt-1 flex h-7 cursor-pointer items-center gap-[2px]"
          onClick={handleWaveformClick}
          role="slider"
          aria-label="Ijro pozitsiyasi"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(displayProgress)}
          tabIndex={0}
        >
          {bars.map((height, i) => {
            const isFilled = (i / bars.length) * 100 <= displayProgress;
            return (
              <span
                key={i}
                className={cn(
                  'w-[3px] rounded-full transition-colors duration-100',
                  isFilled
                    ? isMine
                      ? 'bg-primary-foreground'
                      : 'bg-foreground/80'
                    : isMine
                      ? 'bg-primary-foreground/30'
                      : 'bg-muted-foreground/30'
                )}
                style={{ height: `${height}%`, minHeight: '4px' }}
              />
            );
          })}
        </div>

        <div className="mt-0.5 flex justify-between">
          <span
            className={cn(
              'text-[10px] font-medium tabular-nums',
              isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {formatTime(displayCurrentTime)}
          </span>
          <span
            className={cn(
              'text-[10px] font-medium tabular-nums',
              isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {formatTime(displayDuration)}
          </span>
        </div>
      </div>

      {/* Yuklab olish */}
      <a
        href={url}
        download={rawFileName}
        aria-label="Yuklab olish"
        title="Yuklab olish"
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
          isMine
            ? 'text-primary-foreground/70 hover:bg-primary-foreground/20 hover:text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}
