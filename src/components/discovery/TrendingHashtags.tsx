import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

interface Hashtag {
  tag: string;
  count: number;
}

interface TrendingHashtagsProps {
  /** Discover sahifasidagi refresh — o'zgarganda bo'lim qayta yuklanadi. */
  refreshKey?: number;
}

/** Baza bo'sh bo'lganda ko'rsatiladigan zaxira teglar. */
const FALLBACK_HASHTAGS: Hashtag[] = [
  { tag: 'fyp', count: 2500 },
  { tag: 'viral', count: 1800 },
  { tag: 'trending', count: 1200 },
  { tag: 'comedy', count: 890 },
  { tag: 'dance', count: 750 },
  { tag: 'music', count: 620 },
  { tag: 'food', count: 540 },
  { tag: 'travel', count: 480 },
];

function formatCount(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function TrendingHashtags({ refreshKey = 0 }: TrendingHashtagsProps) {
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);

  const fetchHashtags = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data: posts, error } = await supabase
        .from('posts')
        .select('content')
        .eq('visibility', 'public')
        .not('content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const counts: Record<string, number> = {};
      const rows = (posts ?? []) as Array<{ content: string | null }>;
      rows.forEach((post) => {
        const matches = post.content?.match(/#[\p{L}\p{N}_]+/gu) ?? [];
        matches.forEach((tag) => {
          const clean = tag.slice(1).toLowerCase();
          if (!clean) return;
          counts[clean] = (counts[clean] ?? 0) + 1;
        });
      });

      const sorted = Object.entries(counts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

      // MUHIM: ilgari bu yerda `hashtags.length` (stale state) tekshirilar edi,
      // shuning uchun zaxira teglar real ma'lumotni doim bosib ketardi.
      if (sorted.length > 0) {
        setHashtags(sorted);
        setIsFallback(false);
      } else {
        setHashtags(FALLBACK_HASHTAGS);
        setIsFallback(true);
      }
    } catch (error) {
      console.error('Trend hashtaglarni yuklashda xatolik:', error);
      setHashtags(FALLBACK_HASHTAGS);
      setIsFallback(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHashtags();
  }, [fetchHashtags, refreshKey]);

  const header = (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Hash className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">Trending Hashtags</h2>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          triggerHaptic('light');
          fetchHashtags();
        }}
        disabled={isLoading}
        aria-label="Trend hashtaglarni yangilash"
      >
        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
      </Button>
    </div>
  );

  if (isLoading && hashtags.length === 0) {
    return (
      <section aria-busy="true">
        {header}
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
      {header}
      <div className="flex flex-wrap gap-2">
        {hashtags.map((item) => (
          <button
            key={item.tag}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              navigate(`/search?q=${encodeURIComponent(`#${item.tag}`)}`);
            }}
            className={cn(
              'inline-flex items-center rounded-full bg-secondary text-secondary-foreground',
              'py-2 px-4 text-sm font-medium transition-colors',
              'hover:bg-primary hover:text-primary-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
            aria-label={`#${item.tag} bo'yicha qidirish`}
          >
            <TrendingUp className="h-3 w-3 mr-1" />
            #{item.tag}
            <span className="ml-2 text-xs opacity-70">{formatCount(item.count)}</span>
          </button>
        ))}
      </div>
      {isFallback && (
        <p className="mt-3 text-xs text-muted-foreground">
          Hozircha real trend yo'q — mashhur teglar ko'rsatilmoqda.
        </p>
      )}
    </section>
  );
}
