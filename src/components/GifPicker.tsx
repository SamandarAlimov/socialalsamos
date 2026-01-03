import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface GifResult {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  trigger: React.ReactNode;
  className?: string;
}

const TRENDING_GIFS: GifResult[] = [
  { id: '1', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif', preview: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/200w.gif', width: 200, height: 200 },
  { id: '2', url: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif', preview: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/200w.gif', width: 200, height: 150 },
  { id: '3', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', preview: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/200w.gif', width: 200, height: 200 },
  { id: '4', url: 'https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif', preview: 'https://media.giphy.com/media/5VKbvrjxpVJCM/200w.gif', width: 200, height: 200 },
  { id: '5', url: 'https://media.giphy.com/media/3oz8xLd9DJq2l2VFtu/giphy.gif', preview: 'https://media.giphy.com/media/3oz8xLd9DJq2l2VFtu/200w.gif', width: 200, height: 150 },
  { id: '6', url: 'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif', preview: 'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/200w.gif', width: 200, height: 200 },
  { id: '7', url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif', preview: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/200w.gif', width: 200, height: 150 },
  { id: '8', url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif', preview: 'https://media.giphy.com/media/5GoVLqeAOo6PK/200w.gif', width: 200, height: 200 },
];

const CATEGORIES = ['Trending', 'Reactions', 'Love', 'Celebrate', 'Sad', 'Funny', 'Animals', 'Sports'];

export function GifPicker({ onSelect, trigger, className }: GifPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>(TRENDING_GIFS);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Trending');

  const searchGifs = useCallback(async (query: string) => {
    if (!query.trim()) {
      setGifs(TRENDING_GIFS);
      return;
    }

    setIsLoading(true);
    
    // Simulated search - in production, integrate with Tenor/GIPHY API
    setTimeout(() => {
      const filteredGifs = TRENDING_GIFS.filter((_, i) => i % 2 === 0);
      setGifs(filteredGifs);
      setIsLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchGifs(search);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search, searchGifs]);

  const handleSelect = (gif: GifResult) => {
    onSelect(gif.url);
    setOpen(false);
    setSearch('');
  };

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    if (category === 'Trending') {
      setGifs(TRENDING_GIFS);
    } else {
      setSearch(category.toLowerCase());
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent 
        className={cn("w-80 p-0 bg-popover border border-border shadow-lg z-50", className)}
        align="end"
        sideOffset={8}
      >
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GIFs..."
              className="pl-9 pr-8 h-9"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearch('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-hidden border-b border-border">
          {CATEGORIES.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs whitespace-nowrap h-7 px-2"
              onClick={() => handleCategoryClick(category)}
            >
              {category}
            </Button>
          ))}
        </div>

        <ScrollArea className="h-64">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : gifs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No GIFs found
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 p-2">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => handleSelect(gif)}
                  className="relative aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <img
                    src={gif.preview}
                    alt="GIF"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-2 border-t border-border text-center">
          <span className="text-[10px] text-muted-foreground">Powered by GIPHY</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
