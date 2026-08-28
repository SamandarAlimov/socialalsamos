import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Smile, Search, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
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

/**
 * Telegram uslubidagi emoji tanlagich.
 *
 * MUHIM (performance): to'r ichida CDN'dan rasm YUKLANMAYDI - tizim (native)
 * emoji glifi ishlatiladi. Animatsiyali Telegram emojilar faqat xabar
 * pufakchalari va reaksiyalarda ko'rsatiladi. Avval bu yerda har bir katak
 * uchun alohida rasm so'rovi ketardi (bir ochilishda 300+ so'rov) va shu
 * sababli tanlagich juda og'ir ochilardi.
 */
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
      <PopoverContent className="w-[340px] overflow-hidden p-0" align="end">
        {/* Qidirish */}
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Qidirish"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {/* Emojilar to'ri - native gliflar, so'rovsiz va tez */}
        <div className="grid h-56 grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain p-2">
          {visible.map((emoji, i) => (
            <button
              key={emoji + '-' + i}
              onClick={() => handleSelect(emoji)}
              className="tg-transition flex h-9 w-9 items-center justify-center rounded-lg text-[26px] leading-none hover:bg-accent active:scale-90"
              title={emoji}
            >
              <span className="select-none leading-none">{emoji}</span>
            </button>
          ))}
          {visible.length === 0 && (
            <div className="col-span-8 flex h-full items-center justify-center text-xs text-muted-foreground">
              Topilmadi
            </div>
          )}
        </div>

        {/* Kategoriyalar */}
        {!query.trim() && (
          <div className="scrollbar-hide flex items-center gap-0.5 overflow-x-auto border-t border-border px-2 py-1.5">
            {recent.length > 0 && (
              <button
                onClick={() => setActiveKey('recent')}
                className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
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
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[18px] leading-none transition-colors',
                  activeKey === cat.key ? 'bg-primary/15' : 'hover:bg-accent'
                )}
              >
                <span className="select-none leading-none">{cat.icon}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
