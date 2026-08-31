import {
  BarChart3,
  CalendarClock,
  MapPin,
  Music2,
  Sticker as StickerIcon,
  Users,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { MAX_COLLABORATORS } from '@/lib/postComposer';
import type { PollInput } from '@/lib/polls';
import type { PostLocationInput, PostMusicInput } from '@/lib/postMeta';
import type { CollaboratorProfile } from '@/lib/postDraft';

export function formatScheduledDate(date: Date): string {
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

interface PostComposerExtrasProps {
  poll: PollInput | null;
  location: PostLocationInput | null;
  music: PostMusicInput | null;
  collaborators: CollaboratorProfile[];
  scheduledAt: Date | null;
  stickerCount: number;
  className?: string;
  onEditPoll: () => void;
  onRemovePoll: () => void;
  onEditLocation: () => void;
  onRemoveLocation: () => void;
  onEditMusic: () => void;
  onRemoveMusic: () => void;
  onEditCollaborators: () => void;
  onEditSchedule: () => void;
  onRemoveSchedule: () => void;
  onEditStickers: () => void;
}

/**
 * Postga ilova qilingan qo'shimchalar ro'yxati: so'rovnoma, joylashuv, musiqa,
 * hammuallif, rejalashtirish va stikerlar. Har bir qatorni bosib tahrirlash,
 * X orqali olib tashlash mumkin.
 *
 * Hech qanday qo'shimcha bo'lmasa komponent null qaytaradi, shuning uchun ota
 * komponentda shartli render kerak emas.
 */
export function PostComposerExtras({
  poll,
  location,
  music,
  collaborators,
  scheduledAt,
  stickerCount,
  className,
  onEditPoll,
  onRemovePoll,
  onEditLocation,
  onRemoveLocation,
  onEditMusic,
  onRemoveMusic,
  onEditCollaborators,
  onEditSchedule,
  onRemoveSchedule,
  onEditStickers,
}: PostComposerExtrasProps) {
  const hasExtras =
    Boolean(poll) ||
    Boolean(location) ||
    Boolean(music) ||
    collaborators.length > 0 ||
    Boolean(scheduledAt) ||
    stickerCount > 0;

  if (!hasExtras) return null;

  return (
    <div className={cn('border-t border-border/50', className)}>
      {poll && (
        <div className="flex min-h-12 items-center gap-3 px-4 py-2.5 sm:px-5">
          <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
          <button type="button" onClick={onEditPoll} className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-medium">{poll.question}</p>
            <p className="text-[10px] text-muted-foreground">{poll.options.length} variant</p>
          </button>
          <button
            type="button"
            onClick={onRemovePoll}
            aria-label="So‘rovnomani olib tashlash"
            className="p-1 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {location && (
        <div className="flex min-h-12 items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0 sm:px-5">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <button type="button" onClick={onEditLocation} className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-medium">
              {location.place?.name ?? location.label ?? 'Joylashuv'}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {location.mode === 'live'
                ? 'Jonli joylashuv'
                : location.place?.address ?? 'Aniq nuqta'}
            </p>
          </button>
          <button
            type="button"
            onClick={onRemoveLocation}
            aria-label="Joylashuvni olib tashlash"
            className="p-1 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {music && (
        <div className="flex min-h-12 items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0 sm:px-5">
          <Music2 className="h-4 w-4 shrink-0 text-primary" />
          <button type="button" onClick={onEditMusic} className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-medium">{music.track?.title ?? 'Musiqa'}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {music.track?.artist ?? 'Katalog'}
            </p>
          </button>
          <button
            type="button"
            onClick={onRemoveMusic}
            aria-label="Musiqani olib tashlash"
            className="p-1 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {collaborators.length > 0 && (
        <button
          type="button"
          onClick={onEditCollaborators}
          className="flex min-h-12 w-full items-center gap-3 border-t border-border/40 px-4 py-2.5 text-left first:border-t-0 sm:px-5"
        >
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {collaborators.map((item) => '@' + item.username).join(', ')}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {collaborators.length}/{MAX_COLLABORATORS}
          </span>
        </button>
      )}

      {scheduledAt && (
        <div className="flex min-h-12 items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0 sm:px-5">
          <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
          <button
            type="button"
            onClick={onEditSchedule}
            className="min-w-0 flex-1 truncate text-left text-xs font-medium"
          >
            {formatScheduledDate(scheduledAt)}
          </button>
          <button
            type="button"
            onClick={onRemoveSchedule}
            aria-label="Rejani olib tashlash"
            className="p-1 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {stickerCount > 0 && (
        <button
          type="button"
          onClick={onEditStickers}
          className="flex min-h-12 w-full items-center gap-3 border-t border-border/40 px-4 py-2.5 text-left first:border-t-0 sm:px-5"
        >
          <StickerIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 text-xs font-medium">{stickerCount} stiker</span>
          <span className="text-[10px] text-primary">Tahrirlash</span>
        </button>
      )}
    </div>
  );
}

export default PostComposerExtras;
