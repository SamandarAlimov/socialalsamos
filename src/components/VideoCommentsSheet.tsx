import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { CommentsSection } from '@/components/CommentsSection';

interface VideoCommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  commentsCount: number;
}

/**
 * Videos va Home endi bitta comments engine ishlatadi.
 * Shu bilan reply-to-reply, media/GIF, mention, like va realtime behavior
 * platforma bo'ylab bir xil qoladi.
 */
export function VideoCommentsSheet({
  isOpen,
  onClose,
  postId,
  commentsCount,
}: VideoCommentsSheetProps) {
  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[88dvh] overflow-hidden">
        <DrawerHeader className="shrink-0 border-b border-border pb-3">
          <div className="flex items-center justify-between gap-3">
            <DrawerTitle>
              {commentsCount > 0 ? commentsCount + ' ta izoh' : 'Izohlar'}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full"
              aria-label="Izohlarni yopish"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <CommentsSection postId={postId} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
