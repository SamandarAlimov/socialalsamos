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
            <SheetTitle className="truncate text-base font-semibold">{title}</SheetTitle>
          ) : (
            <DrawerTitle className="truncate text-base font-semibold">{title}</DrawerTitle>
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
        className="h-9 w-9 shrink-0 rounded-full"
        aria-label="Izohlarni yopish"
      >
        <X className="h-4.5 w-4.5" />
      </Button>
    </div>
  );
}

/**
 * Mobile: Instagram/TikTok uslubidagi bottom sheet.
 * Tablet/Desktop: videoni katta oq drawer bilan bosib yubormaslik uchun
 * o'ng tomondan keladigan compact comments panel.
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
        <DrawerContent className="flex h-[74dvh] max-h-[760px] flex-col overflow-hidden rounded-t-[28px] border-border/70 bg-background">
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/20" />
          <DrawerHeader className="shrink-0 border-b border-border/60 px-4 pb-3 pt-2">
            <CommentsHeader commentsCount={commentsCount} onClose={onClose} />
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-hidden">
            <CommentsSection postId={postId} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="z-[10020] flex w-[min(430px,38vw)] min-w-[360px] flex-col overflow-hidden border-l border-border/70 bg-background p-0 shadow-2xl sm:max-w-none"
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
          <CommentsHeader
            commentsCount={commentsCount}
            onClose={onClose}
            desktop
          />
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <CommentsSection postId={postId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
