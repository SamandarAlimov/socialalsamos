import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Play, Plus, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useStoryHighlights, type StoryHighlight } from '@/hooks/useStoryHighlights';
import { cn } from '@/lib/utils';

interface AddToHighlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: {
    id: string;
    media_url: string;
    media_type: string;
    caption: string | null;
  } | null;
}

function HighlightThumb({ highlight }: { highlight: StoryHighlight }) {
  const firstItem = highlight.items?.[0];
  const coverItem = highlight.cover_url
    ? highlight.items?.find((item) => item.media_url === highlight.cover_url)
    : firstItem;
  const url = highlight.cover_url || firstItem?.media_url || null;
  const mediaType = coverItem?.media_type || (highlight.cover_url ? 'image' : firstItem?.media_type) || null;

  if (url && mediaType === 'video') {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  }

  if (url) {
    return <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />;
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center text-lg font-semibold text-white"
      style={{
        background:
          'radial-gradient(circle at 22% 20%, rgba(255,255,255,.78), transparent 28%), linear-gradient(135deg, #f472b6 0%, #8b5cf6 58%, #4f46e5 100%)',
      }}
    >
      {highlight.name.trim().slice(0, 2).toUpperCase() || '✦'}
    </div>
  );
}

export function AddToHighlightDialog({ open, onOpenChange, story }: AddToHighlightDialogProps) {
  const { highlights, createHighlight, addStoryToHighlight } = useStoryHighlights();
  const [selectedHighlightId, setSelectedHighlightId] = useState<string>('');
  const [newHighlightName, setNewHighlightName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedHighlightId('');
    setNewHighlightName('');
  }, [open, story?.id]);

  const selectedHighlight = useMemo(
    () => highlights.find((highlight) => highlight.id === selectedHighlightId) ?? null,
    [highlights, selectedHighlightId],
  );

  const close = () => {
    if (isAdding) return;
    setSelectedHighlightId('');
    setNewHighlightName('');
    onOpenChange(false);
  };

  const handleAddToHighlight = async () => {
    if (!story || isAdding || !selectedHighlightId) return;

    setIsAdding(true);
    try {
      if (selectedHighlightId === 'new') {
        const name = newHighlightName.trim();
        if (!name) return;

        const created = await createHighlight(
          name,
          story.media_type === 'video' ? undefined : story.media_url,
          [
            {
              story_id: story.id,
              media_url: story.media_url,
              media_type: story.media_type,
              caption: story.caption,
            },
          ],
        );
        if (!created) return;
      } else {
        const added = await addStoryToHighlight(
          selectedHighlightId,
          story.id,
          story.media_url,
          story.media_type,
          story.caption || undefined,
        );
        if (!added) return;
      }

      setSelectedHighlightId('');
      setNewHighlightName('');
      onOpenChange(false);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      {story && !open ? (
        <button
          type="button"
          data-story-interactive="true"
          onClick={() => onOpenChange(true)}
          className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 z-50 ml-[62px] flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3.5 text-xs font-semibold text-white shadow-xl backdrop-blur-xl transition hover:bg-black/55 sm:ml-[74px]"
          aria-label="Storini Tanlanganlarga qo‘shish"
        >
          <Sparkles className="h-4 w-4" />
          Tanlanganlar
        </button>
      ) : null}

      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
        <DialogContent className="max-h-[min(86dvh,760px)] w-[calc(100vw-20px)] max-w-lg overflow-hidden rounded-[30px] border-border/70 bg-background p-0 shadow-2xl sm:w-full">
          <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 text-left sm:px-6">
            <div className="flex items-center gap-3 pr-8">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-semibold tracking-[-0.025em]">
                  Tanlanganlarga qo‘shish
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs leading-relaxed sm:text-sm">
                  Storini mavjud Tanlanganga qo‘shing yoki yangisini yarating.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
            {story ? (
              <div className="mb-5 flex items-center gap-3 rounded-[22px] border border-border/70 bg-muted/25 p-3">
                <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {story.media_type === 'video' ? (
                    <>
                      <video
                        src={story.media_url}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                        <Play className="h-2.5 w-2.5 fill-current" />
                      </span>
                    </>
                  ) : (
                    <img src={story.media_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Hozirgi story</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Profilingizda doimiy ko‘rinishi uchun Tanlanganlarga saqlang.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Tanlanganni tanlang</p>
              {selectedHighlight ? (
                <span className="max-w-[52%] truncate rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {selectedHighlight.name}
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setSelectedHighlightId('new')}
                aria-pressed={selectedHighlightId === 'new'}
                className="flex min-w-0 flex-col items-center gap-2 rounded-2xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-dashed bg-background transition',
                    selectedHighlightId === 'new'
                      ? 'border-foreground ring-2 ring-foreground/10'
                      : 'border-muted-foreground/35',
                  )}
                >
                  <Plus className="h-6 w-6 text-foreground" />
                </span>
                <span className="max-w-[78px] truncate text-xs font-medium text-foreground">Yangi</span>
              </button>

              {highlights.map((highlight) => {
                const selected = selectedHighlightId === highlight.id;
                return (
                  <button
                    key={highlight.id}
                    type="button"
                    onClick={() => setSelectedHighlightId(highlight.id)}
                    aria-pressed={selected}
                    className="flex min-w-0 flex-col items-center gap-2 rounded-2xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        'relative rounded-full bg-gradient-to-tr from-amber-300 via-fuchsia-500 to-violet-600 p-[2px] transition',
                        selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                      )}
                    >
                      <span className="block h-[72px] w-[72px] overflow-hidden rounded-full border-[3px] border-background bg-muted">
                        <HighlightThumb highlight={highlight} />
                      </span>
                      {selected ? (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-background shadow-sm">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </span>
                    <span className="max-w-[82px] truncate text-xs font-medium text-foreground">
                      {highlight.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedHighlightId === 'new' ? (
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="new-highlight-name" className="text-sm font-semibold text-foreground">
                    Yangi Tanlangan nomi
                  </label>
                  <span className="text-xs tabular-nums text-muted-foreground">{newHighlightName.length}/50</span>
                </div>
                <Input
                  id="new-highlight-name"
                  value={newHighlightName}
                  onChange={(event) => setNewHighlightName(event.target.value)}
                  placeholder="Masalan: Sayohat, Ish, Oila..."
                  maxLength={50}
                  className="h-12 rounded-2xl border-border/80 px-4 text-base"
                  autoFocus
                />
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border/60 bg-background/95 px-5 py-4 backdrop-blur-xl sm:px-6">
            <Button
              type="button"
              onClick={() => void handleAddToHighlight()}
              disabled={
                isAdding ||
                !selectedHighlightId ||
                (selectedHighlightId === 'new' && !newHighlightName.trim())
              }
              className="h-12 w-full rounded-2xl bg-foreground text-base font-semibold text-background shadow-lg shadow-black/5 hover:bg-foreground/90"
            >
              {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {selectedHighlightId === 'new' ? 'Yaratish va qo‘shish' : 'Tanlanganlarga qo‘shish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
