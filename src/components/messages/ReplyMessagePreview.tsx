import { Reply, Image, Video, Mic, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReplyTarget {
  id: string;
  content: string | null;
  media_url?: string | null;
  media_type?: string | null;
  is_deleted?: boolean | null;
  sender_id?: string | null;
  sender?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url?: string | null;
  } | null;
}

interface ReplyMessagePreviewProps {
  reply: ReplyTarget;
  isMine: boolean;
  onJump?: (messageId: string) => void;
}

function mediaLabel(type?: string | null): { text: string; icon: typeof FileText } | null {
  if (!type) return null;
  if (type === 'image') return { text: 'Rasm', icon: Image };
  if (type === 'video') return { text: 'Video xabar', icon: Video };
  if (type === 'audio') return { text: 'Ovozli xabar', icon: Mic };
  if (type === 'sticker') return { text: 'Stiker', icon: Image };
  if (type === 'gif') return { text: 'GIF', icon: Video };
  return { text: 'Fayl', icon: FileText };
}

export function ReplyMessagePreview({ reply, isMine, onJump }: ReplyMessagePreviewProps) {
  const senderName =
    reply.sender?.display_name || reply.sender?.username || 'Foydalanuvchi';
  const media = mediaLabel(reply.media_type);
  const Icon = media?.icon || Reply;

  const text = reply.is_deleted
    ? "Xabar o'chirilgan"
    : reply.content?.trim() || media?.text || 'Xabar';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onJump?.(reply.id);
      }}
      className={cn(
        'mb-1.5 flex w-full min-w-0 items-stretch overflow-hidden rounded-lg text-left transition-opacity',
        onJump && 'hover:opacity-90 active:opacity-75',
        isMine ? 'bg-primary-foreground/10' : 'bg-muted/70'
      )}
      aria-label="Javob berilgan xabarga o'tish"
    >
      <span
        className={cn(
          'w-[3px] shrink-0 rounded-full',
          isMine ? 'bg-primary-foreground/75' : 'bg-primary'
        )}
      />
      <span className="min-w-0 flex-1 px-2 py-1.5">
        <span
          className={cn(
            'block truncate text-[11px] font-semibold',
            isMine ? 'text-primary-foreground' : 'text-primary'
          )}
        >
          {senderName}
        </span>
        <span
          className={cn(
            'mt-0.5 flex min-w-0 items-center gap-1 text-[11px]',
            isMine ? 'text-primary-foreground/75' : 'text-muted-foreground'
          )}
        >
          {media && <Icon className="h-3 w-3 shrink-0" />}
          <span className={cn('truncate', reply.is_deleted && 'italic')}>{text}</span>
        </span>
      </span>
    </button>
  );
}
