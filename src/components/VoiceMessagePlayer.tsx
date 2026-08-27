import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useAudioPlayer, MediaTrack } from '@/contexts/AudioPlayerContext';

interface VoiceMessagePlayerProps {
  url: string;
  duration?: number;
  isMine?: boolean;
  autoPlay?: boolean;
  senderName?: string;
  messageId?: string;
  onPlay?: () => void;
  /** Ketma-ket ijro uchun suhbatdagi barcha media xabarlar */
  allMediaTracks?: MediaTrack[];
}

const VOICE_LABEL = 'Ovozli xabar';
const BAR_COUNT = 44;

export function VoiceMessagePlayer({
  url,
  duration,
  isMine,
  senderName,
  messageId,
  onPlay,
  allMediaTracks = [],
}: VoiceMessagePlayerProps) {
  const {
    currentTrack,
    isPlaying: globalIsPlaying,
    currentTime: globalCurrentTime,
    duration: globalDuration,
    play,
    pause,
    resume,
    seek,
    setPlaylist,
  } = useAudioPlayer();

  const isThisTrack = currentTrack?.url === url;
  const isPlaying = isThisTrack && globalIsPlaying;
  const currentTime = isThisTrack ? globalCurrentTime : 0;
  const playingDuration = isThisTrack ? globalDuration : 0;

  const [localDuration, setLocalDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(!duration);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [listened, setListened] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // URL asosida barqaror waveform (har safar bir xil ko'rinadi)
  const waveformBars = useMemo(() => {
    const seed = url.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: BAR_COUNT }).map((_, i) => {
      const baseHeight = 25 + ((seed * (i + 1) * 7) % 60);
      const variation = Math.sin((i / BAR_COUNT) * Math.PI * 4) * 15;
      return Math.min(95, Math.max(18, baseHeight + variation));
    });
  }, [url]);

  // Metadata (davomiylik) yuklash
  useEffect(() => {
    if (!isThisTrack && !duration) {
      const audio = new Audio(url);

      const handleLoadedMetadata = () => {
        setLocalDuration(audio.duration);
        setIsLoading(false);
      };
      const handleCanPlay = () => setIsLoading(false);

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('canplay', handleCanPlay);

      return () => {
        audio.pause();
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('canplay', handleCanPlay);
      };
    }
    setIsLoading(false);
  }, [url, duration, isThisTrack]);

  // Bir marta eshitilgandan keyin "yangi" nuqtasi o'chadi (Telegramdek)
  useEffect(() => {
    if (isPlaying) setListened(true);
  }, [isPlaying]);

  const buildTrack = useCallback(
    (): MediaTrack => ({
      id: messageId || url,
      url,
      name: VOICE_LABEL,
      artist: senderName || 'Foydalanuvchi',
      title: VOICE_LABEL,
      senderName,
      type: 'audio',
    }),
    [messageId, url, senderName]
  );

  const togglePlayback = useCallback(() => {
    if (isLoading) return;

    if (isThisTrack) {
      if (globalIsPlaying) pause();
      else resume();
      return;
    }

    const track = buildTrack();
    if (allMediaTracks.length > 0) {
      const startIndex = allMediaTracks.findIndex((t) => t.url === url);
      if (startIndex >= 0) setPlaylist(allMediaTracks, startIndex);
      else play(track);
    } else {
      play(track);
    }
    onPlay?.();
  }, [
    isLoading,
    isThisTrack,
    globalIsPlaying,
    pause,
    resume,
    play,
    setPlaylist,
    buildTrack,
    url,
    onPlay,
    allMediaTracks,
  ]);

  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const totalDuration = isThisTrack ? playingDuration : localDuration;
      if (totalDuration === 0) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const percentage = (e.clientX - rect.left) / rect.width;
      const newTime = Math.max(0, Math.min(totalDuration, percentage * totalDuration));

      if (isThisTrack) {
        seek(newTime);
      } else {
        play(buildTrack());
        setTimeout(() => seek(newTime), 120);
      }
    },
    [isThisTrack, playingDuration, localDuration, seek, play, buildTrack]
  );

  const cyclePlaybackRate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rates = [1, 1.5, 2];
      const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
      setPlaybackRate(nextRate);
      const el = document.querySelector('audio');
      if (el instanceof HTMLAudioElement) el.playbackRate = nextRate;
    },
    [playbackRate]
  );

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = isThisTrack ? playingDuration : localDuration;
  const displayTime = isThisTrack ? currentTime : 0;
  const progress = totalDuration > 0 ? (displayTime / totalDuration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-w-[220px] max-w-[280px] items-center gap-2.5',
        isMine ? 'text-primary-foreground' : 'text-foreground'
      )}
    >
      {/* Play / Pause */}
      <button
        type="button"
        onClick={togglePlayback}
        disabled={isLoading}
        aria-label={isPlaying ? "To'xtatish" : 'Eshitish'}
        className={cn(
          'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors',
          isMine
            ? 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25'
            : 'bg-muted text-foreground hover:bg-muted/70',
          isLoading && 'opacity-50'
        )}
      >
        {isLoading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="ml-0.5 h-5 w-5" />
        )}

        {/* Eshitilmagan xabar belgisi */}
        {!listened && !isMine && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* Waveform */}
        <div
          className="flex h-8 cursor-pointer items-center gap-[2px]"
          onClick={handleWaveformClick}
          role="slider"
          aria-label="Ovoz pozitsiyasi"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
        >
          {waveformBars.map((height, i) => {
            const barProgress = (i / waveformBars.length) * 100;
            const isFilled = barProgress <= progress;
            const isActive = isPlaying && Math.abs(barProgress - progress) < 3;

            return (
              <motion.div
                key={i}
                className={cn(
                  'w-[2px] rounded-full transition-colors duration-75',
                  isFilled
                    ? isMine
                      ? 'bg-primary-foreground'
                      : 'bg-foreground/80'
                    : isMine
                      ? 'bg-primary-foreground/30'
                      : 'bg-muted-foreground/30'
                )}
                animate={{ height: `${height}%`, scaleY: isActive ? 1.25 : 1 }}
                transition={{ duration: 0.1 }}
              />
            );
          })}
        </div>

        {/* Vaqt va tezlik */}
        <div className="mt-0.5 flex items-center justify-between">
          <span
            className={cn(
              'flex items-center gap-1 text-[11px] tabular-nums',
              isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            <Mic className="h-3 w-3" />
            {isPlaying || displayTime > 0 ? formatTime(displayTime) : formatTime(totalDuration)}
          </span>

          {(isPlaying || playbackRate !== 1) && (
            <button
              type="button"
              onClick={cyclePlaybackRate}
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                isMine
                  ? 'text-primary-foreground/80 hover:bg-primary-foreground/15'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {playbackRate}x
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
