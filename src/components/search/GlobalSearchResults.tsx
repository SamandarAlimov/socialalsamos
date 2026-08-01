import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe, BookOpen, Newspaper, ImageIcon, PlayCircle, LayoutGrid,
  ExternalLink, AlertCircle, Loader2, Clock, KeyRound,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

// ── Stable contract mirrored from supabase/functions/global-search ──────────
export type GlobalCategory = 'all' | 'web' | 'wikipedia' | 'news' | 'images' | 'videos';

export interface GlobalSearchResult {
  id: string;
  type: 'web' | 'wikipedia' | 'news' | 'image' | 'video';
  title: string;
  snippet: string;
  url: string;
  displayUrl: string;
  thumbnailUrl: string | null;
  source: string;
  publishedAt: string | null;
  author: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

interface GlobalSearchResponse {
  query: string;
  category: GlobalCategory;
  page: number;
  totalEstimated: number;
  tookMs: number;
  results: GlobalSearchResult[];
  error: { code: string; message: string } | null;
}

const SUB_TABS: { key: GlobalCategory; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'Hammasi', icon: LayoutGrid },
  { key: 'web', label: 'Veb', icon: Globe },
  { key: 'wikipedia', label: 'Wikipedia', icon: BookOpen },
  { key: 'news', label: 'Yangiliklar', icon: Newspaper },
  { key: 'images', label: 'Rasmlar', icon: ImageIcon },
  { key: 'videos', label: 'Videolar', icon: PlayCircle },
];

const PAGE_SIZE = 20;

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function GlobalSearchResults({ query, locale = 'uz' }: { query: string; locale?: 'uz' | 'ru' | 'en' }) {
  const [category, setCategory] = useState<GlobalCategory>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<GlobalSearchResult[]>([]);
  const [meta, setMeta] = useState<{ tookMs: number; total: number } | null>(null);
  const [error, setError] = useState<GlobalSearchResponse['error']>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);

  const debouncedQuery = useDebounce(query.trim(), 400);

  const runSearch = useCallback(async (nextPage: number, replace: boolean) => {
    if (!debouncedQuery) {
      setItems([]); setMeta(null); setError(null);
      return;
    }
    const ticket = ++requestRef.current;
    replace ? setLoading(true) : setLoadingMore(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<GlobalSearchResponse>('global-search', {
        body: { query: debouncedQuery, category, page: nextPage, pageSize: PAGE_SIZE, locale },
      });
      if (ticket !== requestRef.current) return;
      if (fnError || !data) {
        setError({ code: 'NETWORK_ERROR', message: "Qidiruv xizmatiga ulanib bo'lmadi." });
        if (replace) setItems([]);
        return;
      }
      setError(data.error);
      setMeta({ tookMs: data.tookMs, total: data.totalEstimated });
      setItems((prev) => (replace ? data.results : [...prev, ...data.results]));
    } catch {
      if (ticket === requestRef.current) {
        setError({ code: 'NETWORK_ERROR', message: "Qidiruv xizmatiga ulanib bo'lmadi." });
      }
    } finally {
      if (ticket === requestRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [debouncedQuery, category, locale]);

  useEffect(() => {
    setPage(1);
    runSearch(1, true);
  }, [runSearch]);

  const grouped = useMemo(() => {
    if (category !== 'all') return null;
    const buckets: Record<string, GlobalSearchResult[]> = {};
    items.forEach((r) => { (buckets[r.type] ||= []).push(r); });
    return buckets;
  }, [items, category]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    runSearch(next, false);
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          const active = category === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setCategory(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border',
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-muted/40 text-muted-foreground border-border/30 hover:bg-muted/70',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Meta line */}
      {!loading && meta && items.length > 0 && (
        <p className="text-[11px] text-muted-foreground px-0.5">
          {items.length} ta natija · {meta.tookMs} ms
        </p>
      )}

      {loading && <ResultsSkeleton category={category} />}

      {!loading && error && items.length === 0 && <ErrorState error={error} />}

      {!loading && !error && items.length === 0 && debouncedQuery && (
        <div className="py-14 text-center">
          <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">"{debouncedQuery}" bo'yicha natija topilmadi.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          {category === 'all' && grouped ? (
            <div className="space-y-7">
              {(['wikipedia', 'web', 'news', 'image', 'video'] as const).map((type) =>
                grouped[type]?.length ? (
                  <section key={type}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                      {type === 'wikipedia' ? 'Wikipedia'
                        : type === 'web' ? 'Veb'
                        : type === 'news' ? 'Yangiliklar'
                        : type === 'image' ? 'Rasmlar' : 'Videolar'}
                    </h3>
                    {type === 'image'
                      ? <ImageGrid items={grouped[type]} />
                      : type === 'video'
                        ? <VideoGrid items={grouped[type]} />
                        : <div className="space-y-4">{grouped[type].map((r) => <SerpRow key={r.id} item={r} />)}</div>}
                  </section>
                ) : null,
              )}
            </div>
          ) : category === 'images' ? (
            <ImageGrid items={items} />
          ) : category === 'videos' ? (
            <VideoGrid items={items} />
          ) : (
            <div className="space-y-5">{items.map((r) => <SerpRow key={r.id} item={r} />)}</div>
          )}

          {category !== 'all' && (
            <div className="pt-2 flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="rounded-xl">
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Ko'proq yuklash
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── SERP row (web / wikipedia / news) ──────────────────────────────────────
function SerpRow({ item }: { item: GlobalSearchResult }) {
  const date = formatDate(item.publishedAt);
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-2xl p-3 -mx-1 hover:bg-muted/40 transition-colors"
    >
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt={item.title}
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-xl object-cover bg-muted"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
          {item.displayUrl}
          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
        </p>
        <h4 className="text-[15px] font-medium text-primary leading-snug line-clamp-2 group-hover:underline">
          {item.title}
        </h4>
        {item.snippet && (
          <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">{item.snippet}</p>
        )}
        {(date || item.author) && (
          <p className="text-[11px] text-muted-foreground/80 mt-1 flex items-center gap-1.5">
            {date && <><Clock className="h-3 w-3" />{date}</>}
            {item.author && <span className="truncate">· {item.author}</span>}
          </p>
        )}
      </div>
    </a>
  );
}

// ── Image grid ─────────────────────────────────────────────────────────────
function ImageGrid({ items }: { items: GlobalSearchResult[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {items.map((r) => (
        <a
          key={r.id}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-2xl overflow-hidden bg-muted/40 border border-border/30"
        >
          <div className="aspect-square overflow-hidden bg-muted">
            <img
              src={r.thumbnailUrl || r.url}
              alt={r.title}
              loading="lazy"
              className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          </div>
          <p className="text-[11px] text-muted-foreground truncate px-2.5 py-2">{r.title || r.displayUrl}</p>
        </a>
      ))}
    </div>
  );
}

// ── Video grid ─────────────────────────────────────────────────────────────
function VideoGrid({ items }: { items: GlobalSearchResult[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((r) => {
        const duration = formatDuration(r.durationSeconds);
        return (
          <a
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl overflow-hidden bg-card/60 border border-border/30 backdrop-blur-sm"
          >
            <div className="relative aspect-video bg-muted overflow-hidden">
              {r.thumbnailUrl && (
                <img
                  src={r.thumbnailUrl}
                  alt={r.title}
                  loading="lazy"
                  className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity">
                <PlayCircle className="h-10 w-10 text-white drop-shadow" />
              </div>
              {duration && (
                <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-medium">
                  {duration}
                </span>
              )}
            </div>
            <div className="p-3">
              <h4 className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{r.title}</h4>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                {r.author || r.source}{formatDate(r.publishedAt) ? ` · ${formatDate(r.publishedAt)}` : ''}
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
}

// ── States ─────────────────────────────────────────────────────────────────
function ErrorState({ error }: { error: { code: string; message: string } }) {
  const missingKey = error.code === 'PROVIDER_NOT_CONFIGURED';
  const Icon = missingKey ? KeyRound : AlertCircle;
  return (
    <div className="p-5 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm text-center">
      <Icon className="h-6 w-6 text-muted-foreground mx-auto mb-2.5" />
      <p className="text-sm font-medium text-foreground mb-1">
        {missingKey ? 'Provayder sozlanmagan' : 'Qidiruv vaqtincha mavjud emas'}
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">{error.message}</p>
    </div>
  );
}

function ResultsSkeleton({ category }: { category: GlobalCategory }) {
  if (category === 'images') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
      </div>
    );
  }
  if (category === 'videos') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-2xl" />)}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-16 w-16 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
