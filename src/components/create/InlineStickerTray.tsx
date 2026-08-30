import { useEffect, useMemo, useState } from 'react';
import { Heart, History, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useStickers } from '@/hooks/useStickers';
import { StickerView } from '@/components/stickers/StickerView';
import type { StickerItem } from '@/lib/stickers';

interface InlineStickerTrayProps {
  onSelect: (sticker: StickerItem) => void;
  disabled?: boolean;
}

const RECENTS = '__recent__';
const FAVORITES = '__favorites__';

export function InlineStickerTray({
  onSelect,
  disabled = false,
}: InlineStickerTrayProps) {
  const {
    packs,
    recents,
    favorites,
    stickersForPack,
    search,
    markUsed,
  } = useStickers();

  const [section, setSection] = useState<string>(packs[0]?.id ?? RECENTS);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(false);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void search(trimmed).then((items) => {
        if (cancelled) return;
        setResults(items);
        setLoading(false);
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, trimmed]);

  const visible = useMemo(() => {
    if (trimmed) return results;
    if (section === RECENTS) return recents;
    if (section === FAVORITES) return favorites;
    return stickersForPack(section);
  }, [favorites, recents, results, section, stickersForPack, trimmed]);

  const choose = (sticker: StickerItem) => {
    if (disabled) return;
    markUsed(sticker);
    onSelect(sticker);
  };

  return (
    <div className="min-h-0">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Stiker qidirish"
          className="h-10 w-full rounded-xl border border-border/60 bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary/40"
        />
      </div>

      {!trimmed && (
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          <button
            type="button"
            title="Oxirgi"
            aria-label="Oxirgi"
            onClick={() => setSection(RECENTS)}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition',
              section === RECENTS
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Sevimlilar"
            aria-label="Sevimlilar"
            onClick={() => setSection(FAVORITES)}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition',
              section === FAVORITES
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Heart className="h-4 w-4" />
          </button>

          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setSection(pack.id)}
              className={cn(
                'h-9 shrink-0 rounded-full px-3 text-xs font-medium transition',
                section === pack.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {pack.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 max-h-56 overflow-y-auto overscroll-contain pr-1">
        {loading && visible.length === 0 ? (
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 15 }).map((_, index) => (
              <div
                key={index}
                className="aspect-square animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Stiker topilmadi
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1.5">
            {visible.map((sticker, index) => (
              <button
                key={sticker.key + '-' + index}
                type="button"
                disabled={disabled}
                onClick={() => choose(sticker)}
                title={sticker.name}
                className="flex aspect-square items-center justify-center rounded-xl transition hover:bg-primary/10 active:scale-95 disabled:opacity-40"
              >
                <StickerView sticker={sticker} size={52} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
