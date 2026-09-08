import { useEffect } from 'react';
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

const MOBILE_COMMENT_SNAP_POINTS = [0.64, 0.98];

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

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = themeMeta?.getAttribute('content') ?? null;
    const previousBodyBackground = document.body.style.backgroundColor;
    const previousHtmlBackground = document.documentElement.style.backgroundColor;

    themeMeta?.setAttribute('content', '#000000');
    document.body.style.backgroundColor = '#000000';
    document.documentElement.style.backgroundColor = '#000000';

    return () => {
      if (themeMeta && previousThemeColor) themeMeta.setAttribute('content', previousThemeColor);
      document.body.style.backgroundColor = previousBodyBackground;
      document.documentElement.style.backgroundColor = previousHtmlBackground;
    };
  }, [isOpen]);

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
          overlayClassName="bg-black/20 backdrop-blur-[0.5px]"
          handleClassName="mt-1.5 h-[3px] w-10 bg-white/45"
          className="dark flex h-[98dvh] max-h-[calc(100dvh-env(safe-area-inset-top,0px))] min-h-0 flex-col overflow-hidden rounded-t-[22px] border-x-0 border-b-0 border-t border-white/10 bg-[#09090a] text-white shadow-[0_-18px_60px_rgba(0,0,0,.5)]"
        >
          <DrawerHeader className="relative shrink-0 border-b border-white/[0.07] px-4 pb-1.5 pt-0.5 text-center">
            <DrawerTitle className="text-[13px] font-semibold leading-6 text-white">
              Izohlar{commentsCount > 0 ? ` · ${commentsCount}` : ''}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute right-2 top-[-2px] h-8 w-8 rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Izohlarni yopish"
            >
              <X className="h-4 w-4" />
            </Button>
          </DrawerHeader>

          <div className="dark min-h-0 flex-1 overflow-hidden bg-[#0a0a0b] text-white [color-scheme:dark]">
            <CommentsSection
              postId={postId}
              layout="panel"
              appearance="immersive"
              quickReactions
            />
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
