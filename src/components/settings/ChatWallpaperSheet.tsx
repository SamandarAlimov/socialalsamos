import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatWallpaperEditor } from './ChatWallpaperEditor';

interface ChatWallpaperSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Chat foni tanlash oynasi (chat ichidan yoki sozlamalardan chaqiriladi) */
export function ChatWallpaperSheet({ open, onOpenChange }: ChatWallpaperSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="px-4 pb-2 pt-4 text-left">
          <SheetTitle>Chat foni</SheetTitle>
          <SheetDescription>
            Fonni tanlang yoki o'z rasmingizni yuklang. Tanlov shu qurilmada saqlanadi.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-4 pb-6">
            <ChatWallpaperEditor />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default ChatWallpaperSheet;
