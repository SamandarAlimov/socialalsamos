import { Hash, Loader2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHashtagSearch, useTrendingHashtags } from '@/hooks/useHashtags';

interface HashtagSuggestionsProps {
  /** Faol hashtag so'rovi (# belgisidan keyingi matn). */
  query: string | null;
  onSelect: (tag: string) => void;
  className?: string;
}

function formatCount(count: number): string {
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
  return String(count);
}

/**
 * Hashtag avtoto'ldirish.
 *
 * Ilgari klient 200 ta postni yuklab, regex bilan skanerlardi — sekin va
 * noto'g'ri natija berardi. Endi `search_hashtags` / `trending_hashtags`
 * RPC lari ishlatiladi (pg_trgm indeksi bilan) va kirill/lotin ikkisi ham
 * qo'llab-quvvatlanadi.
 */
export function HashtagSuggestions({ query, onSelect, className }: HashtagSuggestionsProps) {
  const trimmed = (query ?? '').trim();
  const { suggestions, isLoading } = useHashtagSearch(trimmed);
  const { trending, isLoading: isLoadingTrending } = useTrendingHashtags(8);

  if (query === null) return null;

  const showTrending = trimmed.length === 0;
  const items = showTrending ? trending : suggestions;
  const loading = showTrending ? isLoadingTrending : isLoading;

  return (
    <div
      className={cn(
        'max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-border/60 bg-popover shadow-lg [-webkit-overflow-scrolling:touch]',
        className,
      )}
    >
      <p className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {showTrending ? (
          <>
            <TrendingUp className="h-3 w-3" /> Trenddagi hashtaglar
          </>
        ) : (
          <>
            <Hash className="h-3 w-3" /> Natijalar
          </>
        )}
      </p>

      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          {trimmed ? (
            <button
              type="button"
              onClick={() => onSelect(trimmed)}
              className="flex w-full items-center gap-2 text-left"
            >
              <Hash className="h-4 w-4 text-primary" />
              <span>
                Yangi hashtag: <span className="font-medium text-foreground">#{trimmed}</span>
              </span>
            </button>
          ) : (
            'Hozircha hashtag yo\u2018q'
          )}
        </div>
      )}

      <ul className="pb-1.5">
        {items.map((item) => (
          <li key={item.id ?? item.tag}>
            <button
              type="button"
              onClick={() => onSelect(item.tag)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-muted"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Hash className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">#{item.tag}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatCount(item.posts_count ?? 0)} post
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
