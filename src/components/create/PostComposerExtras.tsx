import {
  BarChart3,
  CalendarClock,
  MapPin,
  Music2,
  Sticker as StickerIcon,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { MAX_COLLABORATORS } from '@/lib/postComposer';
import type { PollInput } from '@/lib/polls';
import type { PostLocationInput, PostMusicInput } from '@/lib/postMeta';
import type { CollaboratorProfile } from '@/lib/postDraft';
import { CreateListRow } from '@/components/create/CreateListRow';

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
 * hammuallif, rejalashtirish va stikerlar.
 *
 * Barcha qatorlar CreateListRow orqali chiziladi, ya'ni o'lchov va ajratkichlar
 * bitta joyda boshqariladi. Har bir qatorning o'ng tomonida joriy qiymat
 * turadi — shunda foydalanuvchi ro'yxatni ochmasdan nima tanlanganini ko'radi.
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
        <CreateListRow
          icon={BarChart3}
          label={poll.question}
          description={poll.options.length + ' variant'}
          active
          onClick={onEditPoll}
          onRemove={onRemovePoll}
          removeLabel="So‘rovnomani olib tashlash"
        />
      )}

      {location && (
        <CreateListRow
          icon={MapPin}
          label={location.place?.name ?? location.label ?? 'Joylashuv'}
          description={
            location.mode === 'live'
              ? 'Jonli joylashuv'
              : location.place?.address ?? 'Aniq nuqta'
          }
          active
          onClick={onEditLocation}
          onRemove={onRemoveLocation}
          removeLabel="Joylashuvni olib tashlash"
        />
      )}

      {music && (
        <CreateListRow
          icon={Music2}
          label={music.track?.title ?? 'Musiqa'}
          value={music.track?.artist ?? 'Katalog'}
          active
          onClick={onEditMusic}
          onRemove={onRemoveMusic}
          removeLabel="Musiqani olib tashlash"
        />
      )}

      {collaborators.length > 0 && (
        <CreateListRow
          icon={Users}
          label={collaborators.map((item) => '@' + item.username).join(', ')}
          value={collaborators.length + '/' + MAX_COLLABORATORS}
          active
          onClick={onEditCollaborators}
        />
      )}

      {scheduledAt && (
        <CreateListRow
          icon={CalendarClock}
          label="Rejalashtirilgan"
          value={formatScheduledDate(scheduledAt)}
          active
          onClick={onEditSchedule}
          onRemove={onRemoveSchedule}
          removeLabel="Rejani olib tashlash"
        />
      )}

      {stickerCount > 0 && (
        <CreateListRow
          icon={StickerIcon}
          label="Stikerlar"
          value={stickerCount + ' ta'}
          emphasizeValue
          active
          onClick={onEditStickers}
        />
      )}
    </div>
  );
}

export default PostComposerExtras;
