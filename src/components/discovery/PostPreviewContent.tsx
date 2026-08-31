import { MapPin, Music2 } from 'lucide-react';
import {
  formatTrackDuration,
  parseLocationFromContent,
  parseMusicFromContent,
  type LegacyPostLocation,
  type PostMusic,
} from '@/lib/postMarkers';
import { cn } from '@/lib/utils';

/**
 * Post matni bazada maxsus markerlar bilan saqlanadi:
 *   [MUSIC]{"id":"...","title":"Ya'sin","audioUrl":"https://..."}
 *   [LOCATION]{"latitude":...,"longitude":...}
 *
 * Discover kartochkalari ilgari `post.content` ni to'g'ridan-to'g'ri chizardi,
 * shuning uchun foydalanuvchi xom JSON ni ko'rardi. Bu modul markerlarni
 * ajratib, o'rniga tartibli ko'rinish beradi.
 */

export interface PostPreview {
  text: string;
  music: PostMusic | null;
  location: LegacyPostLocation | null;
}

export function getPostPreview(content: string | null | undefined): PostPreview {
  const { music, cleanContent } = parseMusicFromContent(content ?? '');
  const { location, cleanContent: text } = parseLocationFromContent(cleanContent);

  return {
    text: (text ?? '').replace(/\s+/g, ' ').trim(),
    music,
    location,
  };
}

/** Rasm/alt kabi joylar uchun faqat toza matn. */
export function getPostPreviewText(
  content: string | null | undefined,
  fallback = 'Post',
): string {
  const { text, music, location } = getPostPreview(content);
  if (text) return text;
  if (music) return music.artist ? `${music.title} - ${music.artist}` : music.title;
  if (location) return location.label ?? 'Joylashuv';
  return fallback;
}

interface PostPreviewContentProps {
  content: string | null | undefined;
  /** Matn uchun qatorlar soni (tailwind line-clamp klassi). */
  clampClassName?: string;
  textClassName?: string;
  className?: string;
  compact?: boolean;
}

/**
 * Media rasmi bo'lmagan postlar uchun matnli preview.
 * Marker JSON hech qachon ko'rinmaydi.
 */
export function PostPreviewContent({
  content,
  clampClassName = 'line-clamp-5',
  textClassName = 'text-sm text-muted-foreground',
  className,
  compact = false,
}: PostPreviewContentProps) {
  const { text, music, location } = getPostPreview(content);
  const duration = music ? formatTrackDuration(music.durationSeconds) : null;

  const hasAnything = Boolean(text || music || location);

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 text-center',
        className,
      )}
    >
      {text && <p className={cn(clampClassName, textClassName)}>{text}</p>}

      {music && (
        <div
          className={cn(
            'flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-left',
            compact && 'gap-1.5 px-2 py-1',
          )}
        >
          <Music2
            className={cn('shrink-0 text-primary', compact ? 'h-3 w-3' : 'h-4 w-4')}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span
              className={cn(
                'block truncate font-medium text-foreground',
                compact ? 'text-[11px]' : 'text-xs',
              )}
            >
              {music.title}
            </span>
            {!compact && (music.artist || duration) && (
              <span className="block truncate text-[11px] text-muted-foreground">
                {[music.artist, duration].filter(Boolean).join(' - ')}
              </span>
            )}
          </span>
        </div>
      )}

      {location && (
        <div
          className={cn(
            'flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-1',
            compact && 'px-2 py-0.5',
          )}
        >
          <MapPin
            className={cn('shrink-0 text-muted-foreground', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')}
            aria-hidden="true"
          />
          <span
            className={cn(
              'truncate text-muted-foreground',
              compact ? 'text-[10px]' : 'text-[11px]',
            )}
          >
            {location.label ?? location.place?.name ?? 'Joylashuv'}
          </span>
        </div>
      )}

      {!hasAnything && (
        <p className={cn(textClassName, 'italic opacity-70')}>Matnsiz post</p>
      )}
    </div>
  );
}
