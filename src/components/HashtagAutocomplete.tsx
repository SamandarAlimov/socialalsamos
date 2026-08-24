import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Loader2, Hash, TrendingUp } from 'lucide-react';

interface TrendingHashtag {
  hashtag: string;
  count: number;
}

interface HashtagAutocompleteProps {
  query: string;
  onSelect: (hashtag: string) => void;
  onClose: () => void;
  position?: { top: number; left: number };
  className?: string;
}

export function HashtagAutocomplete({ 
  query, 
  onSelect, 
  onClose,
  position,
  className 
}: HashtagAutocompleteProps) {
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchHashtags = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    try {
      // Fetch posts content to extract hashtags
      const { data, error } = await supabase
        .from('posts')
        .select('content')
        .not('content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      // Extract all hashtags from posts
      const hashtagCounts: Record<string, number> = {};
      const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
      
      (data || []).forEach(post => {
        if (post.content) {
          const matches = post.content.match(hashtagRegex) || [];
          matches.forEach(match => {
            const tag = match.slice(1).toLowerCase();
            hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
          });
        }
      });

      // Convert to array and filter by query
      let allHashtags = Object.entries(hashtagCounts)
        .map(([hashtag, count]) => ({ hashtag, count }))
        .sort((a, b) => b.count - a.count);

      // Filter by search query if provided
      if (searchQuery) {
        allHashtags = allHashtags.filter(h => 
          h.hashtag.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      setHashtags(allHashtags.slice(0, 8));
      setSelectedIndex(0);
    } catch (error) {
      console.error('Error fetching hashtags:', error);
      setHashtags([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchHashtags(query);
    }, 150);

    return () => clearTimeout(debounceTimer);
  }, [query, fetchHashtags]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (hashtags.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % hashtags.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + hashtags.length) % hashtags.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (hashtags[selectedIndex]) {
            onSelect(hashtags[selectedIndex].hashtag);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hashtags, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (hashtags.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[200px] max-w-[280px]",
        className
      )}
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      {isLoading ? (
        <div className="flex items-center justify-center p-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Trending Hashtags</span>
          </div>
          <ul className="py-1">
            {hashtags.map((item, index) => (
              <li
                key={item.hashtag}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                  index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
                )}
                onClick={() => onSelect(item.hashtag)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Hash className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">#{item.hashtag}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {item.count} {item.count === 1 ? 'post' : 'posts'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}