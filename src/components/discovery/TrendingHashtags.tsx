import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface Hashtag {
  tag: string;
  count: number;
}

export function TrendingHashtags() {
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchHashtags() {
      setIsLoading(true);
      
      // Fetch posts content and extract hashtags
      const { data: posts } = await supabase
        .from('posts')
        .select('content')
        .eq('visibility', 'public')
        .not('content', 'is', null);
      
      if (posts) {
        const hashtagCounts: Record<string, number> = {};
        posts.forEach(post => {
          const matches = post.content?.match(/#\w+/g) || [];
          matches.forEach(tag => {
            const cleanTag = tag.toLowerCase().replace('#', '');
            hashtagCounts[cleanTag] = (hashtagCounts[cleanTag] || 0) + 1;
          });
        });
        
        const sortedHashtags = Object.entries(hashtagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12);
        
        setHashtags(sortedHashtags);
      }
      
      // If no hashtags found, show defaults
      if (!hashtags.length) {
        setHashtags([
          { tag: 'fyp', count: 2500 },
          { tag: 'viral', count: 1800 },
          { tag: 'trending', count: 1200 },
          { tag: 'comedy', count: 890 },
          { tag: 'dance', count: 750 },
          { tag: 'music', count: 620 },
          { tag: 'food', count: 540 },
          { tag: 'travel', count: 480 },
        ]);
      }
      
      setIsLoading(false);
    }

    fetchHashtags();
  }, []);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Hash className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Trending Hashtags</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Hash className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">Trending Hashtags</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {hashtags.map((item) => (
          <Badge
            key={item.tag}
            variant="secondary"
            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors py-2 px-4 text-sm"
            onClick={() => {
              triggerHaptic('light');
              navigate(`/search?q=%23${item.tag}`);
            }}
          >
            <TrendingUp className="h-3 w-3 mr-1" />
            #{item.tag}
            <span className="ml-2 text-xs opacity-70">{formatCount(item.count)}</span>
          </Badge>
        ))}
      </div>
    </section>
  );
}
