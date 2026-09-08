import { MessageCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CommentsSection } from '@/components/CommentsSection';
import { useIsMobile } from '@/hooks/use-mobile';

interface VideoCommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  commentsCount: number;
}

const MOBILE_COMMENT_SNAP_POINTS = [0.66, 0.98];

function DesktopHeader({ commentsCount, onClose }: { commentsCount: number; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MessageCircle className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <SheetTitle className="truncate text-base font-semibold">
            {commentsCount > 0 ? `${commentsCount} ta izoh` : 'Izohlar'}
          </SheetTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Izohlar va javoblar</p>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9 rounded-full" aria-label="Izohlarni yopish">
        <X className="h-4.5 w-4.5" />
      </Button>
    </div>
  );
}

/**
 * Video comments are intentionally an immersive surface:
 * - mobile/tablet-small: Instagram-style two-stage drawer. It opens with video
 *   still visible above it, then can be dragged almost edge-to-edge for reading;
 * - desktop/tablet-wide: right side panel that does not cover the player.
 *
 * Opening this surface never changes the video's play state. A playing video keeps
 * playing; a user-paused video stays paused because VideosPage remains active.
 */
export function VideoCommentsSheet({
  isOpen,
  onClose,
  postId,
  commentsCount,
}: VideoCommentsSheetProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={(open) => !open && onClose()}
        shouldScaleBackground={false}
        snapPoints={MOBILE_COMMENT_SNAP_POINTS}
        fadeFromIndex={1}
      >
        <DrawerContent
          data-video-comments-sheet="true"
          overlayClassName="bg-black/25 backdrop-blur-[0.5px]"
          handleClassName="mt-2 h-1 w-9 bg-white/35"
          className="dark flex h-[98dvh] max-h-[98dvh] min-h-0 flex-col overflow-hidden rounded-t-[24px] border-x-0 border-b-0 border-t border-white/10 bg-neutral-950 text-white shadow-[0_-18px_60px_rgba(0,0,0,.48)]"
        >
          <style>{`
            [data-video-comments-sheet="true"] form[data-comment-composer="true"] {
              padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
            }
            [data-video-comments-sheet="true"] form[data-comment-composer="true"] > div {
              gap: 8px;
              align-items: center;
            }
            [data-video-comments-sheet="true"] form[data-comment-composer="true"] > div > button[type="submit"] {
              width: 36px;
              min-width: 36px;
              height: 36px;
              padding: 0;
              border-radius: 9999px;
              font-size: 0;
              background: rgb(255 255 255);
              color: rgb(10 10 10);
              box-shadow: none;
            }
            [data-video-comments-sheet="true"] form[data-comment-composer="true"] > div > button[type="submit"]::after {
              content: "↑";
              display: block;
              font-size: 20px;
              line-height: 1;
              font-weight: 800;
              transform: translateY(-1px);
            }
            [data-video-comments-sheet="true"] form[data-comment-composer="true"] > div > button[type="submit"]:disabled {
              opacity: 1;
              background: rgb(255 255 255 / 0.10);
              color: rgb(255 255 255 / 0.32);
            }
            [data-video-comments-sheet="true"] form[data-comment-composer="true"] > div > button[type="submit"]:has(svg)::after {
              display: none;
            }
          `}</style>

          <DrawerHeader className="relative shrink-0 border-b border-white/8 px-4 pb-2 pt-1 text-center">
            <DrawerTitle className="text-[14px] font-semibold leading-6 text-white">
              Izohlar{commentsCount > 0 ? ` · ${commentsCount}` : ''}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute right-2 top-0 h-8 w-8 rounded-full text-white/65 hover:bg-white/10 hover:text-white"
              aria-label="Izohlarni yopish"
            >
              <X className="h-4 w-4" />
            </Button>
          </DrawerHeader>

          <div className="dark min-h-0 flex-1 overflow-hidden bg-neutral-950 text-white [color-scheme:dark]">
            <CommentsSection postId={postId} layout="panel" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-[min(440px,40vw)] min-w-[380px] flex-col overflow-hidden border-l border-border/70 bg-background p-0 text-foreground shadow-[-24px_0_70px_rgba(0,0,0,0.18)] dark:bg-neutral-950 sm:max-w-none"
        overlayClassName="bg-black/10 backdrop-blur-[0.5px] dark:bg-black/45"
        hideDefaultClose
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
          <DesktopHeader commentsCount={commentsCount} onClose={onClose} />
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CommentsSection postId={postId} layout="panel" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
