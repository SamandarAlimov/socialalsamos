import { useState } from 'react';
import { Search, X, Loader2, Sticker } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface StickerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (sticker: StickerData) => void;
}

export interface StickerData {
  id: string;
  url: string;
  category: string;
  name: string;
}

const STICKER_CATEGORIES = [
  'All', 'Emoji', 'Love', 'Funny', 'Sad', 'Celebration', 'Animals', 'Food', 'Weather', 'Travel'
];

// Built-in stickers (emoji-based for demo, can be replaced with actual sticker images)
const STICKERS: StickerData[] = [
  // Emoji stickers
  { id: 's1', url: '❤️', category: 'Love', name: 'Heart' },
  { id: 's2', url: '💕', category: 'Love', name: 'Hearts' },
  { id: 's3', url: '😍', category: 'Love', name: 'Heart Eyes' },
  { id: 's4', url: '💋', category: 'Love', name: 'Kiss' },
  { id: 's5', url: '🥰', category: 'Love', name: 'Smiling Hearts' },
  { id: 's6', url: '💝', category: 'Love', name: 'Gift Heart' },
  { id: 's7', url: '😂', category: 'Funny', name: 'Laugh' },
  { id: 's8', url: '🤣', category: 'Funny', name: 'ROFL' },
  { id: 's9', url: '😜', category: 'Funny', name: 'Wink' },
  { id: 's10', url: '🤪', category: 'Funny', name: 'Zany' },
  { id: 's11', url: '😎', category: 'Funny', name: 'Cool' },
  { id: 's12', url: '🤡', category: 'Funny', name: 'Clown' },
  { id: 's13', url: '😢', category: 'Sad', name: 'Crying' },
  { id: 's14', url: '😭', category: 'Sad', name: 'Sobbing' },
  { id: 's15', url: '💔', category: 'Sad', name: 'Broken Heart' },
  { id: 's16', url: '😔', category: 'Sad', name: 'Pensive' },
  { id: 's17', url: '🎉', category: 'Celebration', name: 'Party' },
  { id: 's18', url: '🎊', category: 'Celebration', name: 'Confetti' },
  { id: 's19', url: '🥳', category: 'Celebration', name: 'Party Face' },
  { id: 's20', url: '🎂', category: 'Celebration', name: 'Birthday' },
  { id: 's21', url: '🎈', category: 'Celebration', name: 'Balloon' },
  { id: 's22', url: '🏆', category: 'Celebration', name: 'Trophy' },
  { id: 's23', url: '🐶', category: 'Animals', name: 'Dog' },
  { id: 's24', url: '🐱', category: 'Animals', name: 'Cat' },
  { id: 's25', url: '🦁', category: 'Animals', name: 'Lion' },
  { id: 's26', url: '🐼', category: 'Animals', name: 'Panda' },
  { id: 's27', url: '🦋', category: 'Animals', name: 'Butterfly' },
  { id: 's28', url: '🦄', category: 'Animals', name: 'Unicorn' },
  { id: 's29', url: '🍕', category: 'Food', name: 'Pizza' },
  { id: 's30', url: '🍔', category: 'Food', name: 'Burger' },
  { id: 's31', url: '🍦', category: 'Food', name: 'Ice Cream' },
  { id: 's32', url: '🍩', category: 'Food', name: 'Donut' },
  { id: 's33', url: '☀️', category: 'Weather', name: 'Sun' },
  { id: 's34', url: '🌈', category: 'Weather', name: 'Rainbow' },
  { id: 's35', url: '❄️', category: 'Weather', name: 'Snow' },
  { id: 's36', url: '⚡', category: 'Weather', name: 'Lightning' },
  { id: 's37', url: '✈️', category: 'Travel', name: 'Plane' },
  { id: 's38', url: '🏖️', category: 'Travel', name: 'Beach' },
  { id: 's39', url: '🗼', category: 'Travel', name: 'Tower' },
  { id: 's40', url: '🌍', category: 'Travel', name: 'Earth' },
  // More emoji stickers
  { id: 's41', url: '⭐', category: 'Emoji', name: 'Star' },
  { id: 's42', url: '✨', category: 'Emoji', name: 'Sparkles' },
  { id: 's43', url: '🔥', category: 'Emoji', name: 'Fire' },
  { id: 's44', url: '💯', category: 'Emoji', name: '100' },
  { id: 's45', url: '👍', category: 'Emoji', name: 'Thumbs Up' },
  { id: 's46', url: '👏', category: 'Emoji', name: 'Clap' },
  { id: 's47', url: '🙌', category: 'Emoji', name: 'Hands Up' },
  { id: 's48', url: '💪', category: 'Emoji', name: 'Strong' },
];

export function StickerPicker({ open, onOpenChange, onSelect }: StickerPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredStickers = STICKERS.filter(sticker => {
    const matchesSearch = sticker.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || sticker.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSelect = (sticker: StickerData) => {
    onSelect(sticker);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sticker className="h-5 w-5" />
            Add Sticker
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 pt-2 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stickers..."
              className="pl-9"
            />
          </div>

          {/* Categories */}
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-1 pb-2">
              {STICKER_CATEGORIES.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? 'secondary' : 'ghost'}
                  size="sm"
                  className="text-xs h-8 px-3"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          </ScrollArea>

          {/* Stickers Grid */}
          <ScrollArea className="h-64">
            <div className="grid grid-cols-6 gap-2">
              {filteredStickers.map((sticker) => (
                <button
                  key={sticker.id}
                  onClick={() => handleSelect(sticker)}
                  className="aspect-square flex items-center justify-center text-3xl hover:bg-secondary rounded-lg transition-colors"
                  title={sticker.name}
                >
                  {sticker.url}
                </button>
              ))}
            </div>
            {filteredStickers.length === 0 && (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                No stickers found
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
