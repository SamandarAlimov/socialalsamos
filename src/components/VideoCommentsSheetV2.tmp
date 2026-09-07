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
 * - mobile/tablet-small: Instagram/YouTube-style draggable bottom sheet;
 * - desktop/tablet-wide: right side panel that does not cover the player.
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
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="dark flex h-[72dvh] max-h-[780px] min-h-[420px] flex-col overflow-hidden rounded-t-[30px] border-x-0 border-b-0 border-t border-white/10 bg-neutral-950 text-white shadow-[0_-24px_80px_rgba(0,0,0,.55)]">
          <div className="mx-auto mt-2.5 h-1 w-11 shrink-0 rounded-full bg-white/30" />
          <DrawerHeader className="relative shrink-0 border-b border-white/8 px-4 pb-3 pt-2 text-center">
            <DrawerTitle className="text-[15px] font-semibold text-white">
              Izohlar{commentsCount > 0 ? ` · ${commentsCount}` : ''}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute right-2 top-0 h-9 w-9 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Izohlarni yopish"
            >
              <X className="h-4.5 w-4.5" />
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
