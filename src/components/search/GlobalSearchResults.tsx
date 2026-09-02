import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, BookOpen, Newspaper, ImageIcon, PlayCircle, LayoutGrid, ExternalLink, AlertCircle, Loader2, Clock, DatabaseZap } from 'lucide-react';
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
  engine?: string;
  providers?: string[];
  summary?: string | null;
  searchSuggestionHtml?: string | null;
  searchQueries?: string[];
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
  const navigate = useNavigate();
  const [category, setCategory] = useState<GlobalCategory>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<GlobalSearchResult[]>([]);
  const [meta, setMeta] = useState<{ tookMs: number; total: number; engine?: string } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [searchSuggestionHtml, setSearchSuggestionHtml] = useState<string | null>(null);
  const [error, setError] = useState<GlobalSearchResponse['error']>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounce(query.trim(), 250);

  const runSearch = useCallback(async (nextPage: number, replace: boolean) => {
    if (!debouncedQuery) {
      setItems([]); setMeta(null); setSummary(null); setSearchSuggestionHtml(null); setError(null);
      return;
    }
    const ticket = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    replace ? setLoading(true) : setLoadingMore(true);
    try {
      const response = await fetch('/api/global-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          query: debouncedQuery,
          category,
          page: nextPage,
          pageSize: PAGE_SIZE,
          locale,
        }),
      });

      const data = (await response.json().catch(() => null)) as GlobalSearchResponse | null;

      if (ticket !== requestRef.current) return;

      if (!data) {
        setError({
          code: 'NETWORK_ERROR',
          message: "Global Search serveridan yaroqli javob kelmadi.",
        });
        if (replace) setItems([]);
        return;
      }

      if (!response.ok && !data.error) {
        setError({
          code: 'NETWORK_ERROR',
          message: "Global Search serveriga ulanib bo'lmadi.",
        });
        if (replace) setItems([]);
        return;
      }
      setError(data.error);
      setMeta({ tookMs: data.tookMs, total: data.totalEstimated, engine: data.engine });
      if (replace) {
        setSummary(data.summary || null);
        setSearchSuggestionHtml(data.searchSuggestionHtml || null);
      }
      setItems((prev) => (replace ? data.results : [...prev, ...data.results]));
    } catch (requestError) {
      if (controller.signal.aborted) return;
      if (ticket === requestRef.current) {
        setError({ code: 'NETWORK_ERROR', message: "Qidiruv xizmatiga ulanib bo'lmadi." });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (ticket === requestRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [debouncedQuery, category, locale]);

  useEffect(() => {
    setPage(1);
    runSearch(1, true);

    return () => {
      abortRef.current?.abort();
    };
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

  const openInApp = useCallback(
    (url: string) => {
      navigate('/web?url=' + encodeURIComponent(url));
    },
    [navigate],
  );

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
          {meta.engine
            ? ` · ${
                meta.engine.startsWith('federated:')
                  ? 'jonli internet · bir nechta manba'
                  : meta.engine.startsWith('instant-find-it:firecrawl-')
                    ? 'jonli internet · Firecrawl'
                    : meta.engine.startsWith('yacy-') || meta.engine === 'duckduckgo-html'
                      ? 'internet fallback'
                      : meta.engine
              }`
            : ''}
        </p>
      )}

      {!loading && searchSuggestionHtml && (
        <div
          className="overflow-hidden rounded-xl border border-border/30 bg-card/50 px-3 py-2"
          // Google Search grounding returns this render-ready Search Suggestions
          // fragment and requires it to be shown with grounded results.
          dangerouslySetInnerHTML={{ __html: searchSuggestionHtml }}
        />
      )}

      {!loading && summary && items.length > 0 && category === 'all' && (
        <div className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-4">
          <div className="mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Internetdan qisqa ko'rinish</span>
          </div>
          <p className="line-clamp-5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {summary}
          </p>
        </div>
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
                      ? <ImageGrid items={grouped[type]} onOpen={openInApp} />
                      : type === 'video'
                        ? <VideoGrid items={grouped[type]} onOpen={openInApp} />
                        : <div className="space-y-4">{grouped[type].map((r) => <SerpRow key={r.id} item={r} onOpen={openInApp} />)}</div>}
                  </section>
                ) : null,
              )}
            </div>
          ) : category === 'images' ? (
            <ImageGrid items={items} onOpen={openInApp} />
          ) : category === 'videos' ? (
            <VideoGrid items={items} onOpen={openInApp} />
          ) : (
            <div className="space-y-5">{items.map((r) => <SerpRow key={r.id} item={r} onOpen={openInApp} />)}</div>
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
function SerpRow({
  item,
  onOpen,
}: {
  item: GlobalSearchResult;
  onOpen: (url: string) => void;
}) {
  const date = formatDate(item.publishedAt);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onOpen(item.url)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(item.url);
      }}
      className="group -mx-1 flex cursor-pointer gap-3 rounded-2xl p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={item.title}
    >
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-xl bg-muted object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              {item.displayUrl}
            </p>
            <h4 className="line-clamp-2 text-[15px] font-medium leading-snug text-link group-hover:underline">
              {item.title}
            </h4>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              window.open(item.url, '_blank', 'noopener,noreferrer');
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Yangi tabda ochish"
            title="Yangi tabda ochish"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>

        {item.snippet && (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {item.snippet}
          </p>
        )}

        {(date || item.author) && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            {date && (
              <>
                <Clock className="h-3 w-3" />
                {date}
              </>
            )}
            {item.author && <span className="truncate">· {item.author}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Image grid ─────────────────────────────────────────────────────────────
function ImageGrid({
  items,
  onOpen,
}: {
  items: GlobalSearchResult[];
  onOpen: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {items.map((r) => (
        <div
          key={r.id}
          role="link"
          tabIndex={0}
          onClick={() => onOpen(r.url)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onOpen(r.url);
          }}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border/30 bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={r.title || r.displayUrl}
        >
          <div className="aspect-square overflow-hidden bg-muted">
            <img
              src={r.thumbnailUrl || r.url}
              alt={r.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </div>
          <p className="truncate px-2.5 py-2 pr-9 text-[11px] text-muted-foreground">
            {r.title || r.displayUrl}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              window.open(r.url, '_blank', 'noopener,noreferrer');
            }}
            className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground"
            aria-label="Yangi tabda ochish"
            title="Yangi tabda ochish"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Video grid ─────────────────────────────────────────────────────────────
function VideoGrid({
  items,
  onOpen,
}: {
  items: GlobalSearchResult[];
  onOpen: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((r) => {
        const duration = formatDuration(r.durationSeconds);
        return (
          <div
            key={r.id}
            role="link"
            tabIndex={0}
            onClick={() => onOpen(r.url)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onOpen(r.url);
            }}
            className="group cursor-pointer overflow-hidden rounded-2xl border border-border/30 bg-card/60 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={r.title}
          >
            <div className="relative aspect-video overflow-hidden bg-muted">
              {r.thumbnailUrl && (
                <img
                  src={r.thumbnailUrl}
                  alt={r.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
                <PlayCircle className="h-10 w-10 text-white drop-shadow" />
              </div>
              {duration && (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {duration}
                </span>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(r.url, '_blank', 'noopener,noreferrer');
                }}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur transition hover:bg-black/70"
                aria-label="Yangi tabda ochish"
                title="Yangi tabda ochish"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <h4 className="line-clamp-2 text-sm font-medium leading-snug text-link">
                {r.title}
              </h4>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {r.author || r.source}
                {formatDate(r.publishedAt) ? ` · ${formatDate(r.publishedAt)}` : ''}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── States ─────────────────────────────────────────────────────────────────
function ErrorState({ error }: { error: { code: string; message: string } }) {
  const setupState =
    error.code === 'INDEX_EMPTY' ||
    error.code === 'INDEX_UNAVAILABLE' ||
    error.code === 'SEARCH_API_KEY_MISSING' ||
    error.code === 'SEARCH_PROVIDER_NOT_CONFIGURED';
  const Icon = setupState ? DatabaseZap : AlertCircle;

  const title =
    error.code === 'SEARCH_PROVIDER_NOT_CONFIGURED'
      ? 'Realtime Search provider ulanmagan'
      : error.code === 'SEARCH_API_KEY_MISSING'
        ? 'Internet Search kaliti serverga ulanmagan'
      : error.code === 'INDEX_EMPTY'
        ? 'Alsamos web indeksi kengaymoqda'
        : error.code === 'INDEX_UNAVAILABLE'
          ? 'Global Search backend hali deploy qilinmagan'
          : error.code === 'NETWORK_ERROR'
            ? 'Global Search Edge Function topilmadi'
            : error.code === 'NO_RESULTS'
              ? 'Natija topilmadi'
              : 'Internet qidiruvi vaqtincha mavjud emas';

  return (
    <div className="p-5 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm text-center">
      <Icon className="h-6 w-6 text-muted-foreground mx-auto mb-2.5" />
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
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
