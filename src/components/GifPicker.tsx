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
import { supabase } from '@/integrations/supabase/client';

interface GifResult {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title?: string;
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  trigger: React.ReactNode;
  className?: string;
}

const CATEGORIES = ['Trending', 'Reactions', 'Love', 'Celebrate', 'Sad', 'Funny', 'Animals', 'Sports'];

export function GifPicker({ onSelect, trigger, className }: GifPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Trending');

  const fetchGifs = useCallback(async (query: string = '') => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('giphy-search', {
        body: { query, type: 'gifs', limit: 24 }
      });

      if (error) throw error;
      
      setGifs(data.gifs || []);
    } catch (error) {
      console.error('Error fetching GIFs:', error);
      setGifs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchGifs('');
    }
  }, [open, fetchGifs]);

  useEffect(() => {
    if (!open) return;
    
    const debounce = setTimeout(() => {
      fetchGifs(search);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search, fetchGifs, open]);

  const handleSelect = (gif: GifResult) => {
    onSelect(gif.url);
    setOpen(false);
    setSearch('');
  };

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    if (category === 'Trending') {
      setSearch('');
      fetchGifs('');
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
                onClick={() => {
                  setSearch('');
                  fetchGifs('');
                }}
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
                    alt={gif.title || 'GIF'}
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
