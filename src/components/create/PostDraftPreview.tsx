import {
  BarChart3,
  CalendarClock,
  File,
  Globe2,
  Lock,
  MapPin,
  Music2,
  Users,
  UsersRound,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RichText } from '@/components/RichText';
import type { Attachment } from '@/hooks/usePostAttachments';
import type { PostVisibility } from '@/hooks/usePosts';
import type { PollInput } from '@/lib/polls';
import type { PostLocationInput, PostMusicInput } from '@/lib/postMeta';
import type { AlsamosRichTextDocument } from '@/lib/richTextDocument';

interface PreviewCollaborator {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface PostDraftPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  author: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
  };
  content: string;
  formattedContent: AlsamosRichTextDocument | null;
  attachments: Attachment[];
  visibility: PostVisibility;
  poll: PollInput | null;
  location: PostLocationInput | null;
  music: PostMusicInput | null;
  collaborators: PreviewCollaborator[];
  scheduledAt: Date | null;
}

function visibilityMeta(visibility: PostVisibility) {
  if (visibility === 'private') {
    return { label: 'Faqat men', Icon: Lock };
  }
  if (visibility === 'friends') {
    return { label: 'Do‘stlar', Icon: UsersRound };
  }
  return { label: 'Hamma', Icon: Globe2 };
}

function formatScheduledDate(date: Date): string {
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function MediaTile({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === 'image' && attachment.previewUrl) {
    return (
      <img
        src={attachment.previewUrl}
        alt={attachment.altText || attachment.file.name}
        className="h-full w-full object-cover"
      />
    );
  }

  if (attachment.kind === 'video' && attachment.previewUrl) {
    return (
      <video
        src={attachment.previewUrl}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  }

  if (attachment.kind === 'audio') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60 p-4 text-center">
        <Music2 className="h-6 w-6 text-primary" />
        <p className="line-clamp-2 text-xs font-medium">{attachment.file.name}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60 p-4 text-center">
      <File className="h-6 w-6 text-primary" />
      <p className="line-clamp-2 text-xs font-medium">{attachment.file.name}</p>
    </div>
  );
}

export function PostDraftPreview({
  open,
  onOpenChange,
  author,
  content,
  formattedContent,
  attachments,
  visibility,
  poll,
  location,
  music,
  collaborators,
  scheduledAt,
}: PostDraftPreviewProps) {
  const { label: visibilityLabel, Icon: VisibilityIcon } = visibilityMeta(visibility);
  const media = attachments.slice(0, 4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 bg-background/90 px-5 py-4 backdrop-blur">
          <div>
            <DialogTitle className="text-base">Post preview</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Publishdan oldingi lokal ko‘rinish. Hech narsa serverga yuborilmaydi.
            </p>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/25 p-3 sm:p-5">
          <article className="mx-auto overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <header className="flex items-center gap-3 px-4 py-4">
              <Avatar className="h-11 w-11 border border-border/60">
                <AvatarImage src={author.avatarUrl ?? ''} />
                <AvatarFallback>
                  {(author.displayName || author.username || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{author.displayName}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">@{author.username}</span>
                  <span>·</span>
                  <VisibilityIcon className="h-3.5 w-3.5" />
                  <span>{visibilityLabel}</span>
                </div>
              </div>

              {scheduledAt && (
                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
                  <CalendarClock className="h-3 w-3" />
                  {formatScheduledDate(scheduledAt)}
                </span>
              )}
            </header>

            {(content.trim() || formattedContent) && (
              <div className="px-4 pb-4">
                <RichText
                  content={content}
                  formattedContent={formattedContent}
                  className="text-[15px] leading-relaxed"
                />
              </div>
            )}

            {media.length > 0 && (
              <div
                className={
                  media.length === 1
                    ? 'aspect-[4/3] overflow-hidden bg-black'
                    : 'grid aspect-square grid-cols-2 gap-px overflow-hidden bg-border'
                }
              >
                {media.map((attachment) => (
                  <div key={attachment.id} className="relative min-h-0 min-w-0 overflow-hidden bg-black">
                    <MediaTile attachment={attachment} />
                  </div>
                ))}
                {attachments.length > 4 && (
                  <div className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                    +{attachments.length - 4}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 px-4 py-4">
              {poll && (
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{poll.question}</p>
                      <div className="mt-2 space-y-1.5">
                        {poll.options.slice(0, 5).map((option, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-border/50 bg-background px-3 py-2 text-xs"
                          >
                            {option.emoji ? option.emoji + ' ' : ''}
                            {option.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {location && (
                <div className="flex items-center gap-3 rounded-2xl bg-muted/35 p-3">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {location.place?.name ?? location.label ?? 'Joylashuv'}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {location.mode === 'live'
                        ? 'Real vaqtli joylashuv'
                        : location.place?.address ??
                          `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                    </p>
                  </div>
                </div>
              )}

              {music && (
                <div className="flex items-center gap-3 rounded-2xl bg-muted/35 p-3">
                  <Music2 className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {music.track?.title ?? 'Musiqa'}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {music.track?.artist ?? 'Katalog treki'}
                    </p>
                  </div>
                </div>
              )}

              {collaborators.length > 0 && (
                <div className="rounded-2xl bg-muted/35 p-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold">
                      {collaborators.length} hammuallif
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {collaborators.map((person) => (
                      <span
                        key={person.id}
                        className="rounded-full bg-background px-2 py-1 text-[10px]"
                      >
                        @{person.username}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
