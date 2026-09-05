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

function CommentsHeader({
  commentsCount,
  onClose,
  desktop = false,
}: {
  commentsCount: number;
  onClose: () => void;
  desktop?: boolean;
}) {
  const title = commentsCount > 0 ? commentsCount + ' ta izoh' : 'Izohlar';

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MessageCircle className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          {desktop ? (
            <SheetTitle className="truncate text-base font-semibold text-foreground">{title}</SheetTitle>
          ) : (
            <DrawerTitle className="truncate text-base font-semibold text-foreground">{title}</DrawerTitle>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Izohlar va javoblar
          </p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Izohlarni yopish"
      >
        <X className="h-4.5 w-4.5" />
      </Button>
    </div>
  );
}

/**
 * Mobile: Instagram/TikTok uslubidagi bottom sheet.
 * Tablet/Desktop: video surface theme bilan uyg'un, o'ng tomondan keladigan
 * compact comments panel. Light rejimda oq/neytral, dark rejimda qora surface.
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
        <DrawerContent className="flex h-[74dvh] max-h-[760px] flex-col overflow-hidden rounded-t-[28px] border-border/70 bg-background text-foreground shadow-2xl dark:bg-neutral-950">
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/20" />
          <DrawerHeader className="shrink-0 border-b border-border/60 bg-background px-4 pb-3 pt-2 dark:bg-neutral-950">
            <CommentsHeader commentsCount={commentsCount} onClose={onClose} />
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-hidden bg-background dark:bg-neutral-950">
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
        <SheetHeader className="shrink-0 border-b border-border/60 bg-background px-4 py-3 text-left text-foreground dark:bg-neutral-950">
          <CommentsHeader
            commentsCount={commentsCount}
            onClose={onClose}
            desktop
          />
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden bg-background dark:bg-neutral-950">
          <CommentsSection postId={postId} layout="panel" />
        </div>
      </SheetContent>
    </Sheet>
  );
}