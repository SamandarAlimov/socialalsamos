import { useState } from 'react';
import { cn } from '@/lib/utils';
import { VideoPost } from '@/hooks/useVideoPosts';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatCompactNumber, formatMediaTime, deriveVideoTitle } from '@/lib/videoFormat';

/**
 * YouTube "Keyingi videolar" ro'yxatidagi bitta element.
 * Thumbnail sifatida videoning birinchi kadri ishlatiladi (poster bo'lmasa).
 */
export interface VideoUpNextItemProps {
  video: VideoPost;
  isActive?: boolean;
  onClick: () => void;
  onProfileClick?: () => void;
}

export function VideoUpNextItem({ video, isActive, onClick, onProfileClick }: VideoUpNextItemProps) {
  const [duration, setDuration] = useState<number | null>(null);
  const url = video.media_urls?.[0] || '';
  const poster = video.media_urls?.[1];
  const title = deriveVideoTitle(video.content, video.profile?.username);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full gap-3 px-3 py-2.5 text-left transition-colors active:bg-muted/60',
        isActive && 'bg-muted/50',
      )}
    >
      <div className="relative aspect-video w-[152px] shrink-0 overflow-hidden rounded-xl bg-black">
        <video
          src={url ? `${url}#t=0.5` : undefined}
          poster={poster}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value)) setDuration(value);
          }}
        />
        {duration !== null && (
          <span className="absolute bottom-1 right-1 rounded bg-black/85 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-white">
            {formatMediaTime(duration)}
          </span>
        )}
        {isActive && (
          <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Hozir
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{title}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            role="link"
            tabIndex={0}
            onClick={(event) => {
              if (!onProfileClick) return;
              event.stopPropagation();
              onProfileClick();
            }}
            onKeyDown={(event) => {
              if (!onProfileClick) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.stopPropagation();
                onProfileClick();
              }
            }}
            className="flex items-center gap-1.5"
          >
            <Avatar className="h-4 w-4">
              <AvatarImage src={video.profile?.avatar_url || ''} />
              <AvatarFallback className="text-[8px]">
                {video.profile?.username?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-[11px] text-muted-foreground">
              @{video.profile?.username || 'user'}
            </span>
            {video.profile?.is_verified && <VerifiedBadge size="xs" />}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatCompactNumber(video.views_count || 0)} ko'rish · {formatCompactNumber(video.likes_count || 0)} like
        </p>
      </div>
    </button>
  );
}
