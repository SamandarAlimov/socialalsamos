import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Film,
  Hand,
  Heart,
  History,
  Leaf,
  Loader2,
  PartyPopper,
  PawPrint,
  Search,
  Smile,
  Sparkles,
  Star,
  ThumbsUp,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { StickerView } from '@/components/stickers/StickerView';
import { useStickers } from '@/hooks/useStickers';
import type { StickerItem } from '@/lib/stickers';

interface StickerStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (sticker: StickerItem) => void;
  /** GIF bo'limini ko'rsatish (matnli postda kerak bo'lmasligi mumkin). */
  allowGif?: boolean;
}

/** Paket kaliti -> professional vektor ikonka. Emoji ikonkalar ishlatilmaydi. */
const PACK_ICONS: Record<string, LucideIcon> = {
  reactions: ThumbsUp,
  emotions: Smile,
  love: Heart,
  party: PartyPopper,
  animals: PawPrint,
  gestures: Hand,
  food: UtensilsCrossed,
  nature: Leaf,
};

type SectionId = string;

const RECENT_SECTION = '__recent__';
const FAVORITE_SECTION = '__favorite__';
const GIF_SECTION = '__gif__';
const LONG_PRESS_MS = 450;

export function StickerStudio({
  open,
  onOpenChange,
  onSelect,
  allowGif = true,
}: StickerStudioProps) {
  const {
    packs,
    recents,
    favorites,
    stickersForPack,
    search,
    searchGiphy,
    markUsed,
    isFavorite,
    toggleFavorite,
  } = useStickers();

  const [query, setQuery] = useState('');
  const [section, setSection] = useState<SectionId>(packs[0]?.id ?? RECENT_SECTION);
  const [searchResults, setSearchResults] = useState<StickerItem[]>([]);
  const [giphyResults, setGiphyResults] = useState<StickerItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  // Oyna yopilganda holatni tozalaymiz — keyingi ochilish toza bo'ladi.
  useEffect(() => {
    if (open) return;
    setQuery('');
    setSearchResults([]);
    setGiphyResults([]);
  }, [open]);

  // Bo'lim almashganda ro'yxat boshiga qaytamiz.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [section, trimmedQuery]);

  // Qidiruv (debounce 250 ms)
  useEffect(() => {
    if (!open) return;

    if (!trimmedQuery) {
      setSearchResults([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const timer = window.setTimeout(async () => {
      const [stickerHits, giphyHits] = await Promise.all([
        search(trimmedQuery),
        allowGif && section === GIF_SECTION
          ? searchGiphy(trimmedQuery, 'gifs')
          : searchGiphy(trimmedQuery, 'stickers'),
      ]);

      if (cancelled) return;
      const seen = new Set(stickerHits.map((s) => s.key));
      setSearchResults([...stickerHits, ...giphyHits.filter((s) => !seen.has(s.key))]);
      setIsLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, trimmedQuery, section, allowGif, search, searchGiphy]);

  // GIF bo'limi: qidiruvsiz ochilganda trend GIF lar
  useEffect(() => {
    if (!open || section !== GIF_SECTION || trimmedQuery) return;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const results = await searchGiphy('', 'gifs');
      if (cancelled) return;
      setGiphyResults(results);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, section, trimmedQuery, searchGiphy]);

  const visibleStickers = useMemo<StickerItem[]>(() => {
    if (isSearching) return searchResults;
    if (section === RECENT_SECTION) return recents;
    if (section === FAVORITE_SECTION) return favorites;
    if (section === GIF_SECTION) return giphyResults;
    return stickersForPack(section);
  }, [
    isSearching,
    searchResults,
    section,
    recents,
    favorites,
    giphyResults,
    stickersForPack,
  ]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePressStart = useCallback(
    (sticker: StickerItem) => {
      longPressFired.current = false;
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        longPressFired.current = true;
        toggleFavorite(sticker);
        // Yengil haptik javob — qo'llab-quvvatlanmasa jim o'tadi.
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(12);
          } catch {
            // e'tiborsiz
          }
        }
      }, LONG_PRESS_MS);
    },
    [clearLongPress, toggleFavorite],
  );

  const handleSelect = useCallback(
    (sticker: StickerItem) => {
      clearLongPress();
      // Uzoq bosish sevimliga qo'shdi — bu tanlash hisoblanmaydi.
      if (longPressFired.current) {
        longPressFired.current = false;
        return;
      }
      markUsed(sticker);
      onSelect(sticker);
      onOpenChange(false);
    },
    [clearLongPress, markUsed, onSelect, onOpenChange],
  );

  const sectionTitle = useMemo(() => {
    if (isSearching) return 'Qidiruv natijalari';
    if (section === RECENT_SECTION) return 'Oxirgi ishlatilgan';
    if (section === FAVORITE_SECTION) return 'Sevimlilar';
    if (section === GIF_SECTION) return 'Trenddagi GIF lar';
    return packs.find((p) => p.id === section)?.name ?? 'Stikerlar';
  }, [isSearching, section, packs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] max-h-[680px] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full">
        {/* Sarlavha — nozik gradient bilan premium ko'rinish */}
        <DialogHeader className="shrink-0 space-y-3 border-b border-border bg-gradient-to-b from-primary/[0.07] to-transparent px-4 pb-3 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            Stiker studiyasi
          </DialogTitle>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Stiker, emoji yoki GIF qidirish..."
              className="h-10 rounded-xl pl-9 pr-9"
            />
            {query.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Qidiruvni tozalash"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-lg"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* Chap rels: professional vektor ikonkalar */}
          <nav
            aria-label="Stiker to‘plamlari"
            className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto overscroll-contain border-r border-border bg-muted/30 py-3"
          >
            <RailButton
              icon={History}
              label="Oxirgi ishlatilgan"
              active={!isSearching && section === RECENT_SECTION}
              badge={recents.length}
              onClick={() => setSection(RECENT_SECTION)}
            />
            <RailButton
              icon={Star}
              label="Sevimlilar"
              active={!isSearching && section === FAVORITE_SECTION}
              badge={favorites.length}
              onClick={() => setSection(FAVORITE_SECTION)}
            />

            <span className="my-1 h-px w-6 bg-border" aria-hidden />

            {packs.map((pack) => (
              <RailButton
                key={pack.id}
                icon={PACK_ICONS[pack.id] ?? Smile}
                label={pack.name}
                active={!isSearching && section === pack.id}
                onClick={() => setSection(pack.id)}
              />
            ))}

            {allowGif && (
              <>
                <span className="my-1 h-px w-6 bg-border" aria-hidden />
                <RailButton
                  icon={Film}
                  label="GIF"
                  active={!isSearching && section === GIF_SECTION}
                  onClick={() => setSection(GIF_SECTION)}
                />
              </>
            )}
          </nav>

          {/* O'ng panel: yagona, to'g'ri ishlaydigan scroll konteyneri */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {sectionTitle}
              </span>
              {visibleStickers.length > 0 && (
                <span className="text-xs text-muted-foreground">{visibleStickers.length}</span>
              )}
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]"
            >
              {isLoading && visibleStickers.length === 0 ? (
                <StickerSkeletonGrid />
              ) : visibleStickers.length === 0 ? (
                <EmptyState section={section} isSearching={isSearching} />
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {visibleStickers.map((sticker, index) => {
                    const favorite = isFavorite(sticker);
                    return (
                      <button
                        key={`${sticker.key}-${index}`}
                        type="button"
                        title={sticker.name}
                        onClick={() => handleSelect(sticker)}
                        onPointerDown={() => handlePressStart(sticker)}
                        onPointerUp={clearLongPress}
                        onPointerLeave={clearLongPress}
                        onPointerCancel={clearLongPress}
                        onContextMenu={(event) => event.preventDefault()}
                        className={cn(
                          'group relative flex aspect-square items-center justify-center rounded-2xl',
                          'bg-muted/40 transition-all duration-150',
                          'hover:bg-primary/10 hover:shadow-sm active:scale-90',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        )}
                      >
                        <StickerView sticker={sticker} size={56} />
                        {favorite && (
                          <Star
                            className="absolute right-1 top-1 h-3 w-3 fill-amber-400 text-amber-400"
                            aria-hidden
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {isLoading && visibleStickers.length > 0 && (
                <div className="flex justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            <p className="shrink-0 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              Sevimliga qo‘shish uchun stikerni bosib turing
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface RailButtonProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

function RailButton({ icon: Icon, label, active, badge, onClick }: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
        active
          ? 'bg-primary/15 text-primary shadow-sm'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {typeof badge === 'number' && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function StickerSkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {Array.from({ length: 20 }).map((_, index) => (
        <div
          key={index}
          className="aspect-square animate-pulse rounded-2xl bg-muted"
          style={{ animationDelay: `${index * 25}ms` }}
        />
      ))}
    </div>
  );
}

function EmptyState({ section, isSearching }: { section: SectionId; isSearching: boolean }) {
  const { Icon, title, hint } = isSearching
    ? {
        Icon: Search,
        title: 'Hech narsa topilmadi',
        hint: 'Boshqa so‘z bilan urinib ko‘ring',
      }
    : section === FAVORITE_SECTION
      ? {
          Icon: Star,
          title: 'Sevimlilar bo‘sh',
          hint: 'Stikerni bosib turib sevimliga qo‘shing',
        }
      : section === RECENT_SECTION
        ? {
            Icon: History,
            title: 'Tarix bo‘sh',
            hint: 'Ishlatilgan stikerlar shu yerda saqlanadi',
          }
        : {
            Icon: Sparkles,
            title: 'Stiker yo‘q',
            hint: 'Boshqa to‘plamni tanlang',
          };

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
