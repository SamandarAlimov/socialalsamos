import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Smile, Search, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import {
  EMOJI_CATEGORIES,
  getRecentEmojis,
  pushRecentEmoji,
  searchEmojis,
} from '@/lib/animatedEmoji';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger?: React.ReactNode;
  className?: string;
}

export function EmojiPicker({ onSelect, trigger, className }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string>(EMOJI_CATEGORIES[0].key);
  const [recent, setRecent] = useState<string[]>(() => getRecentEmojis());

  const handleSelect = (emoji: string) => {
    pushRecentEmoji(emoji);
    setRecent(getRecentEmojis());
    onSelect(emoji);
    setIsOpen(false);
  };

  const visible = useMemo(() => {
    if (query.trim()) return searchEmojis(query);
    if (activeKey === 'recent') return recent;
    return EMOJI_CATEGORIES.find((c) => c.key === activeKey)?.emojis ?? [];
  }, [query, activeKey, recent]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className={className}>
            <Smile className="h-5 w-5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0 overflow-hidden" align="end">
        {/* Search */}
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Emoji qidirish..."
              className="pl-8 h-9"
            />
          </div>
        </div>

        {/* Emoji grid */}
        <div className="p-2 grid grid-cols-8 gap-0.5 h-56 overflow-y-auto overscroll-contain">
          {visible.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={() => handleSelect(emoji)}
              className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent active:scale-90 transition-all"
            >
              <AnimatedEmoji emoji={emoji} size={28} playOnHover />
            </button>
          ))}
          {visible.length === 0 && (
            <div className="col-span-8 flex items-center justify-center h-full text-xs text-muted-foreground">
              Topilmadi
            </div>
          )}
        </div>

        {/* Category bar */}
        {!query.trim() && (
          <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-border overflow-x-auto">
            {recent.length > 0 && (
              <button
                onClick={() => setActiveKey('recent')}
                className={cn(
                  'h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors',
                  activeKey === 'recent' ? 'bg-primary/15 text-primary' : 'hover:bg-accent'
                )}
                title="Oxirgi"
              >
                <Clock className="h-4 w-4" />
              </button>
            )}
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveKey(cat.key)}
                title={cat.label}
                className={cn(
                  'h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors',
                  activeKey === cat.key ? 'bg-primary/15' : 'hover:bg-accent'
                )}
              >
                <AnimatedEmoji emoji={cat.icon} size={20} />
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
