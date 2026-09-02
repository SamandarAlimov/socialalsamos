import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatTrackDuration, type PostMusic } from '@/lib/postMarkers';
import { PostAudioPlayer } from '@/components/PostAudioPlayer';

interface PostMusicCardProps {
  music: PostMusic;
  className?: string;
  startSeconds?: number;
  endSeconds?: number | null;
  volume?: number;
}

/** Feed va profil uchun bir xil premium musiqa player. */
export function PostMusicCard({
  music,
  className,
  startSeconds = 0,
  endSeconds = null,
  volume = 1,
}: PostMusicCardProps) {
  const { t } = useTranslation();
  const duration = formatTrackDuration(music.durationSeconds);
  const artist =
    music.artist ??
    t('post.music.unknownArtist', { defaultValue: 'Noma’lum ijrochi' });
  const subtitle = [artist, duration].filter(Boolean).join(' · ');

  return (
    <PostAudioPlayer
      src={music.audioUrl}
      title={music.title}
      subtitle={subtitle}
      coverUrl={music.coverUrl}
      startSeconds={startSeconds}
      endSeconds={endSeconds}
      durationSeconds={music.durationSeconds}
      initialVolume={volume}
      className={cn(className)}
    />
  );
}
