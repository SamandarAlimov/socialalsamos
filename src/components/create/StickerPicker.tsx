import { useMemo, useState } from 'react';
import { Search, Sticker } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { STICKER_PACKS, searchEmojis, animatedEmojiUrls } from '@/lib/animatedEmoji';

interface StickerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (sticker: StickerData) => void;
}

export interface StickerData {
  id: string;
  /** Emoji glyph (kept for backwards compatibility with existing renderers). */
  url: string;
  /** Animated sticker image URL. */
  animatedUrl: string;
  category: string;
  name: string;
}

export function StickerPicker({ open, onOpenChange, onSelect }: StickerPickerProps) {
  const [search, setSearch] = useState('');
  const [packId, setPackId] = useState(STICKER_PACKS[0].id);

  const stickers = useMemo(() => {
    if (search.trim()) return searchEmojis(search);
    return STICKER_PACKS.find((p) => p.id === packId)?.stickers ?? [];
  }, [search, packId]);

  const handleSelect = (emoji: string) => {
    onSelect({
      id: emoji,
      url: emoji,
      animatedUrl: animatedEmojiUrls(emoji)[0],
      category: packId,
      name: emoji,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sticker className="h-5 w-5" />
            Stiker qo'shish
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 pt-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Stiker qidirish..."
              className="pl-9"
            />
          </div>

          {/* Animated pack tabs */}
          {!search.trim() && (
            <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
              {STICKER_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => setPackId(pack.id)}
                  title={pack.name}
                  className={cn(
                    'h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-xl transition-colors',
                    packId === pack.id ? 'bg-primary/15' : 'hover:bg-secondary'
                  )}
                >
                  <AnimatedEmoji emoji={pack.icon} size={24} />
                </button>
              ))}
            </div>
          )}

          <ScrollArea className="h-64">
            <div className="grid grid-cols-4 gap-2 pr-2">
              {stickers.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => handleSelect(emoji)}
                  className="aspect-square flex items-center justify-center hover:bg-secondary rounded-xl transition-colors active:scale-95"
                >
                  <AnimatedEmoji emoji={emoji} size={64} />
                </button>
              ))}
            </div>
            {stickers.length === 0 && (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Stiker topilmadi
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
