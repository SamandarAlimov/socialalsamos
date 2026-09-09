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
 * Video comments use a dedicated viewport surface:
 * - mobile: a fixed-height Instagram-style drawer. The video remains visibly
 *   separated above the rounded sheet instead of being covered by a full-height
 *   transformed drawer;
 * - desktop: a right panel that leaves the player visible.
 *
 * The previous mobile implementation used a 98dvh DrawerContent together with
 * fractional snap points. Vaul translated that full-height element downward for
 * the first snap, which also translated the composer below the viewport. A real
 * visible-height drawer keeps the list and composer in one stable flex layout,
 * so the input remains reachable before and after the keyboard opens.
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
      >
        <DrawerContent
          data-video-comments-sheet="true"
          overlayClassName="bg-transparent"
          handleClassName="mt-2 h-[3px] w-11 bg-white/45"
          className="video-comments-premium dark flex h-[66dvh] min-h-[380px] max-h-[calc(100dvh-max(76px,env(safe-area-inset-top,0px)))] flex-col overflow-hidden rounded-t-[28px] border-x-0 border-b-0 border-t border-white/10 bg-[#0b0b0c] text-white shadow-[0_-16px_54px_rgba(0,0,0,.42)]"
        >
          <DrawerHeader className="shrink-0 border-b border-white/[0.07] px-4 pb-2 pt-1 text-center">
            <DrawerTitle className="text-[15px] font-semibold leading-6 tracking-[-0.01em] text-white">
              Izohlar
            </DrawerTitle>
            {commentsCount > 0 && (
              <span className="sr-only">{commentsCount} ta izoh</span>
            )}
          </DrawerHeader>

          <div className="dark min-h-0 flex-1 overflow-hidden bg-[#0b0b0c] text-white [color-scheme:dark]">
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
