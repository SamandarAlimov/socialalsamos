import { createPortal } from 'react-dom';
import { MoreHorizontal, Pencil } from 'lucide-react';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import type { StoryHighlight, StoryHighlightItem } from '@/hooks/useStoryHighlights';
import { StoryViewer } from './StoryViewer';

interface StoryHighlightViewerProps {
  highlight: StoryHighlight;
  userId: string;
  username: string | null;
  ownerActions: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onClose: () => void;
  onEdit: (highlight: StoryHighlight) => void;
}

function resolveCoverItem(highlight: StoryHighlight): StoryHighlightItem | undefined {
  if (highlight.cover_url) {
    const matched = highlight.items?.find((item) => item.media_url === highlight.cover_url);
    if (matched) return matched;
  }
  return highlight.items?.[0];
}

export function StoryHighlightViewer({
  highlight,
  userId,
  username,
  ownerActions,
  menuOpen,
  onMenuOpenChange,
  onClose,
  onEdit,
}: StoryHighlightViewerProps) {
  const items = highlight.items || [];
  if (items.length === 0) return null;

  const coverItem = resolveCoverItem(highlight);
  const firstImage = items.find((item) => item.media_type !== 'video');

  const overlay = ownerActions && typeof document !== 'undefined'
    ? createPortal(
        <button
          type="button"
          onClick={() => onMenuOpenChange(true)}
          className="fixed right-[46px] z-[2050] flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/12 sm:right-[calc(50%-238px)]"
          style={{ top: 'max(38px, calc(env(safe-area-inset-top) + 28px))' }}
          aria-label="Tanlangan story amallari"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>,
        document.body,
      )
    : null;

  return (
    <>
      <StoryViewer
        storyGroup={{
          user_id: userId,
          username,
          display_name: highlight.name,
          avatar_url:
            highlight.cover_url && coverItem?.media_type !== 'video'
              ? highlight.cover_url
              : firstImage?.media_url || null,
          is_verified: false,
          stories: items.map((item) => ({
            id: item.story_id,
            user_id: userId,
            media_url: item.media_url,
            media_type: item.media_type,
            caption: item.caption,
            views_count: 0,
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            created_at: item.created_at,
          })),
          all_story_ids: items.map((item) => item.story_id),
        }}
        allGroups={[]}
        onClose={onClose}
      />

      {overlay}

      <Sheet open={menuOpen} onOpenChange={onMenuOpenChange}>
        <SheetContent
          side="bottom"
          hideDefaultClose
          className="left-1/2 right-auto w-[calc(100%-20px)] max-w-lg -translate-x-1/2 rounded-t-[28px] border-x border-t border-border/70 p-0 pb-[max(10px,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">Tanlangan story amallari</SheetTitle>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
          <div className="mt-2 overflow-hidden rounded-[22px] bg-background">
            <button
              type="button"
              className="flex min-h-14 w-full items-center gap-3 px-5 text-left text-[15px] font-medium"
              onClick={() => {
                onMenuOpenChange(false);
                onClose();
                onEdit(highlight);
              }}
            >
              <Pencil className="h-5 w-5" />
              Tanlanganni tahrirlash
            </button>
          </div>
          <p className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
            Storylarni qo‘shish yoki olib tashlash uchun Tanlanganni tahrirlash oynasidan foydalaning.
          </p>
          <SheetClose asChild>
            <button type="button" className="mx-3 h-12 w-[calc(100%-24px)] rounded-2xl bg-muted text-sm font-semibold">
              Bekor qilish
            </button>
          </SheetClose>
        </SheetContent>
      </Sheet>
    </>
  );
}
