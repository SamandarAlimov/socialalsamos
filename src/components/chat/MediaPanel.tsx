import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Film, Loader2, Search, Smile, Sticker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { snapAspectRatio } from '@/lib/linkEmbed';
import { useStickerPacks } from '@/hooks/useStickerPacks';
import {
  EMOJI_CATEGORIES,
  getRecentEmojis,
  pushRecentEmoji,
  searchEmojis,
} from '@/lib/animatedEmoji';

type PanelTab = 'gif' | 'sticker' | 'emoji';

interface GiphyItem {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title?: string;
}

interface MediaPanelProps {
  /** Emoji kompozitor matniga qo'shiladi */
  onSelectEmoji: (emoji: string) => void;
  /** GIF / stiker alohida xabar sifatida yuboriladi. Berilmasa, faqat emoji ko'rinadi. */
  onSendMedia?: (url: string, kind: 'gif' | 'sticker') => void;
  trigger?: React.ReactNode;
  className?: string;
}

const TABS: { id: PanelTab; label: string; icon: React.ElementType }[] = [
  { id: 'gif', label: 'GIF', icon: Film },
  { id: 'sticker', label: 'Stikerlar', icon: Sticker },
  { id: 'emoji', label: 'Emoji', icon: Smile },
];

/**
 * Telegramdagi yagona media paneli: yuqorida **GIF | Stikerlar | Emoji**
 * switcher, pastda tanlangan bo'lim mazmuni.
 *
 * - Stikerlar bo'limida eng yuqorida "Tez-tez ishlatiladigan" qatori turadi
 *   (`sticker_usage` jadvali + localStorage), keyin o'z stiker paketlarimiz
 *   (`sticker_packs` / `stickers` jadvallari), so'ng Giphy natijalari.
 * - GIF va tashqi stikerlar `giphy-search` edge funksiyasidan olinadi.
 * - To'rdagi har bir katak mediasining HAQIQIY nisbatida ko'rsatiladi.
 */
export function MediaPanel({ onSelectEmoji, onSendMedia, trigger, className }: MediaPanelProps) {
  const canSendMedia = Boolean(onSendMedia);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>(canSendMedia ? 'gif' : 'emoji');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState<string>(EMOJI_CATEGORIES[0].key);
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => getRecentEmojis());

  // Stiker paketlari va tez-tez ishlatiladigan stikerlar
  const { packs, recent: recentStickers, registerUse } = useStickerPacks(
    tab === 'gif' ? 'gif' : 'sticker'
  );

  const tabs = useMemo(() => (canSendMedia ? TABS : TABS.filter((t) => t.id === 'emoji')), [
    canSendMedia,
  ]);

  const fetchItems = useCallback(
    async (tabId: PanelTab, search: string) => {
      if (tabId === 'emoji') return;

      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('giphy-search', {
          body: {
            query: search,
            type: tabId === 'sticker' ? 'stickers' : 'gifs',
            limit: 24,
          },
        });

        if (error) throw error;
        setItems(Array.isArray(data?.gifs) ? (data.gifs as GiphyItem[]) : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Bo'lim yoki qidiruv o'zgarsa ro'yxat yangilanadi (debounce bilan)
  useEffect(() => {
    if (!open || tab === 'emoji') return;

    const timer = setTimeout(() => {
      void fetchItems(tab, query.trim());
    }, query.trim() ? 300 : 0);

    return () => clearTimeout(timer);
  }, [open, tab, query, fetchItems]);

  // Bo'lim almashganda qidiruv tozalanadi
  useEffect(() => {
    setQuery('');
    setItems([]);
  }, [tab]);

  const handleEmoji = (emoji: string) => {
    pushRecentEmoji(emoji);
    setRecentEmojis(getRecentEmojis());
    onSelectEmoji(emoji);
    setOpen(false);
  };

  /** Stiker/GIF yuborish + "tez-tez ishlatiladigan" hisobini oshirish */
  const sendMedia = (url: string, kind: 'gif' | 'sticker', stickerId?: string | null) => {
    if (!onSendMedia) return;
    onSendMedia(url, kind);
    void registerUse(url, kind, stickerId ?? null);
    setOpen(false);
  };

  const visibleEmojis = useMemo(() => {
    if (query.trim()) return searchEmojis(query);
    if (emojiCategory === 'recent') return recentEmojis;
    return EMOJI_CATEGORIES.find((c) => c.key === emojiCategory)?.emojis ?? [];
  }, [query, emojiCategory, recentEmojis]);

  const showLibrary = !query.trim();
  const kind: 'gif' | 'sticker' = tab === 'sticker' ? 'sticker' : 'gif';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className={className} aria-label="Emoji, stiker, GIF">
            <Smile className="h-5 w-5" />
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-[340px] overflow-hidden p-0" align="end" sideOffset={8}>
        {/* Telegramdek switcher */}
        {tabs.length > 1 && (
          <div className="flex items-center gap-1 border-b border-border p-1.5">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors',
                  tab === item.id
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Qidirish */}
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === 'gif' ? 'GIF qidirish' : tab === 'sticker' ? 'Stiker qidirish' : 'Qidirish'
              }
              className="h-9 pl-8"
            />
          </div>
        </div>

        {tab === 'emoji' ? (
          <>
            <div className="grid h-56 grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain p-2">
              {visibleEmojis.map((emoji, i) => (
                <button
                  key={emoji + '-' + i}
                  type="button"
                  onClick={() => handleEmoji(emoji)}
                  className="tg-transition flex h-9 w-9 items-center justify-center rounded-lg text-[26px] leading-none hover:bg-accent active:scale-90"
                  title={emoji}
                >
                  <span className="select-none leading-none">{emoji}</span>
                </button>
              ))}
              {visibleEmojis.length === 0 && (
                <div className="col-span-8 flex h-full items-center justify-center text-xs text-muted-foreground">
                  Topilmadi
                </div>
              )}
            </div>

            {!query.trim() && (
              <div className="scrollbar-hide flex items-center gap-0.5 overflow-x-auto border-t border-border px-2 py-1.5">
                {recentEmojis.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEmojiCategory('recent')}
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
                      emojiCategory === 'recent'
                        ? 'bg-primary/15 text-primary'
                        : 'hover:bg-accent'
                    )}
                    title="Oxirgi"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                )}
                {EMOJI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setEmojiCategory(cat.key)}
                    title={cat.label}
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[18px] leading-none transition-colors',
                      emojiCategory === cat.key ? 'bg-primary/15' : 'hover:bg-accent'
                    )}
                  >
                    <span className="select-none leading-none">{cat.icon}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="h-64 space-y-3 overflow-y-auto overscroll-contain p-2">
            {/* Telegramdagidek "Tez-tez ishlatiladigan" bo'limi */}
            {showLibrary && recentStickers.length > 0 && (
              <section>
                <h4 className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Tez-tez ishlatiladigan
                </h4>
                <div className="grid grid-cols-4 gap-1.5">
                  {recentStickers.slice(0, 8).map((item) => (
                    <button
                      key={item.fileUrl}
                      type="button"
                      onClick={() => sendMedia(item.fileUrl, item.kind, item.stickerId)}
                      className={cn(
                        'aspect-square overflow-hidden rounded-lg transition-opacity hover:opacity-80',
                        item.kind === 'sticker' ? 'bg-transparent' : 'bg-muted'
                      )}
                      title="Tez-tez ishlatiladigan"
                    >
                      <img
                        src={item.fileUrl}
                        alt=""
                        loading="lazy"
                        className={cn(
                          'h-full w-full',
                          item.kind === 'sticker' ? 'object-contain' : 'object-cover'
                        )}
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* O'z stiker paketlarimiz (Supabase) */}
            {showLibrary &&
              tab === 'sticker' &&
              packs
                .filter((pack) => pack.stickers.length > 0)
                .map((pack) => (
                  <section key={pack.id}>
                    <h4 className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {pack.title}
                    </h4>
                    <div className="grid grid-cols-4 gap-1.5">
                      {pack.stickers.map((sticker) => (
                        <button
                          key={sticker.id}
                          type="button"
                          onClick={() => sendMedia(sticker.fileUrl, 'sticker', sticker.id)}
                          className="aspect-square overflow-hidden rounded-lg transition-opacity hover:opacity-80"
                          title={sticker.emoji || pack.title}
                        >
                          <img
                            src={sticker.thumbUrl || sticker.fileUrl}
                            alt={sticker.emoji || ''}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}

            {/* Giphy natijalari */}
            <section>
              {showLibrary && (
                <h4 className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tab === 'sticker' ? 'Ommabop stikerlar' : 'Ommabop GIF'}
                </h4>
              )}
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                  {tab === 'sticker' ? 'Stiker topilmadi' : 'GIF topilmadi'}
                </div>
              ) : (
                <div className="columns-2 gap-1.5 [column-fill:_balance]">
                  {items.map((item) => {
                    const ratio =
                      item.width > 0 && item.height > 0
                        ? snapAspectRatio(item.width / item.height) || item.width / item.height
                        : 1;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => sendMedia(item.url, kind)}
                        className={cn(
                          'mb-1.5 block w-full overflow-hidden rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary',
                          tab === 'sticker' ? 'bg-transparent' : 'bg-muted'
                        )}
                        style={{ aspectRatio: String(ratio) }}
                        title={item.title || (tab === 'sticker' ? 'Stiker' : 'GIF')}
                      >
                        <img
                          src={item.preview}
                          alt={item.title || ''}
                          loading="lazy"
                          className={cn(
                            'h-full w-full',
                            tab === 'sticker' ? 'object-contain' : 'object-cover'
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {tab !== 'emoji' && (
          <div className="border-t border-border p-1.5 text-center">
            <span className="text-[10px] text-muted-foreground">Powered by GIPHY</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default MediaPanel;
