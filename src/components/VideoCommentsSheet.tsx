import { useEffect } from 'react';
import { MessageCircle } from 'lucide-react';

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
import './video-comments-sheet.css';

interface VideoCommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  commentsCount: number;
}

function DesktopHeader({ commentsCount }: { commentsCount: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MessageCircle className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <SheetTitle className="truncate text-base font-semibold">Izohlar</SheetTitle>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {commentsCount > 0 ? `${commentsCount} ta izoh` : 'Fikr va javoblar'}
        </p>
      </div>
    </div>
  );
}

/**
 * Video comments are intentionally isolated from the player.
 *
 * Mobile uses one viewport-height conversation surface. The player is never a
 * layout sibling above the comments while the drawer is open: the dark overlay
 * covers the feed and the drawer owns the usable viewport below the iOS safe
 * area. The comment list is the only scrolling region and the composer remains
 * a real flex footer, so opening the keyboard cannot push it below a snap-point
 * translated drawer.
 *
 * There is deliberately no close icon on mobile. Native sheet dismissal is via
 * swipe-down, backdrop, Escape/system back, matching the interaction users
 * expect from short-video comment surfaces.
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

    themeMeta?.setAttribute('content', '#0a0a0b');
    document.body.style.backgroundColor = '#0a0a0b';
    document.documentElement.style.backgroundColor = '#0a0a0b';

    return () => {
      if (themeMeta) {
        if (previousThemeColor === null) themeMeta.removeAttribute('content');
        else themeMeta.setAttribute('content', previousThemeColor);
      }
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
      >
        <DrawerContent
          data-video-comments-sheet="true"
          overlayClassName="bg-[#0a0a0b]"
          handleClassName="mt-2.5 h-[3px] w-10 bg-white/35"
          className="video-comments-premium dark flex h-[calc(100dvh-env(safe-area-inset-top,0px))] max-h-none flex-col overflow-hidden rounded-t-[24px] border-x-0 border-b-0 border-t border-white/[0.08] bg-[#0a0a0b] text-white shadow-[0_-14px_52px_rgba(0,0,0,.38)]"
        >
          <DrawerHeader className="shrink-0 border-b border-white/[0.07] px-4 pb-2.5 pt-1 text-center">
            <DrawerTitle className="text-[15px] font-semibold leading-6 tracking-[-0.01em] text-white">
              {commentsCount > 0 ? `Izohlar · ${commentsCount}` : 'Izohlar'}
            </DrawerTitle>
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
        className="video-comments-premium flex w-[min(440px,40vw)] min-w-[380px] flex-col overflow-hidden border-l border-border/70 bg-background p-0 text-foreground shadow-[-24px_0_70px_rgba(0,0,0,0.18)] dark:bg-neutral-950 sm:max-w-none"
        overlayClassName="bg-black/10 backdrop-blur-[0.5px] dark:bg-black/45"
        hideDefaultClose
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
          <DesktopHeader commentsCount={commentsCount} />
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CommentsSection postId={postId} layout="panel" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
