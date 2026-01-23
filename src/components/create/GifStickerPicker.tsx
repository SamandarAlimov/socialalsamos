import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, X, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface GifStickerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectGif: (gifUrl: string) => void;
  onSelectSticker: (stickerUrl: string) => void;
}

interface GifResult {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title?: string;
}

const CATEGORIES = ['Trending', 'Reactions', 'Love', 'Celebrate', 'Sad', 'Funny', 'Animals', 'Sports'];

export function GifStickerPicker({ open, onOpenChange, onSelectGif, onSelectSticker }: GifStickerPickerProps) {
  const [tab, setTab] = useState<'gif' | 'sticker'>('gif');
  const [search, setSearch] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [stickers, setStickers] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Trending');

  const fetchContent = useCallback(async (query: string = '', type: 'gifs' | 'stickers') => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('giphy-search', {
        body: { query, type, limit: 24 }
      });

      if (error) throw error;
      
      if (type === 'gifs') {
        setGifs(data.gifs || []);
      } else {
        setStickers(data.gifs || []); // API returns same structure
      }
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
      if (type === 'gifs') {
        setGifs([]);
      } else {
        setStickers([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchContent('', tab === 'gif' ? 'gifs' : 'stickers');
    }
  }, [open, tab, fetchContent]);

  useEffect(() => {
    if (!open) return;
    
    const debounce = setTimeout(() => {
      fetchContent(search, tab === 'gif' ? 'gifs' : 'stickers');
    }, 300);
    return () => clearTimeout(debounce);
  }, [search, tab, fetchContent, open]);

  const handleSelectGif = (gif: GifResult) => {
    onSelectGif(gif.url);
    onOpenChange(false);
    setSearch('');
  };

  const handleSelectSticker = (sticker: GifResult) => {
    onSelectSticker(sticker.url);
    onOpenChange(false);
    setSearch('');
  };

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    if (category === 'Trending') {
      setSearch('');
      fetchContent('', tab === 'gif' ? 'gifs' : 'stickers');
    } else {
      setSearch(category.toLowerCase());
    }
  };

  const currentItems = tab === 'gif' ? gifs : stickers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            GIFs & Stickers
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {/* Tabs */}
          <div className="px-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'gif' | 'sticker')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="gif">GIFs</TabsTrigger>
                <TabsTrigger value="sticker">Stickers</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Search */}
          <div className="px-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${tab === 'gif' ? 'GIFs' : 'stickers'}...`}
                className="pl-9 pr-8"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => {
                    setSearch('');
                    fetchContent('', tab === 'gif' ? 'gifs' : 'stickers');
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Categories */}
          <div className="flex gap-1 px-4 overflow-x-auto scrollbar-hidden">
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

          {/* Content */}
          <ScrollArea className="h-64 px-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : currentItems.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No {tab === 'gif' ? 'GIFs' : 'stickers'} found
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 pb-4">
                {currentItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => tab === 'gif' ? handleSelectGif(item) : handleSelectSticker(item)}
                    className="relative aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary bg-secondary"
                  >
                    <img
                      src={item.preview}
                      alt={item.title || (tab === 'gif' ? 'GIF' : 'Sticker')}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
