import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Sparkles } from 'lucide-react';

import { EmojiText } from '@/components/emoji/EmojiText';
import { StoryHighlightActions } from '@/components/stories/StoryHighlightActions';
import { StoryHighlightComposerDialog } from '@/components/stories/StoryHighlightComposerDialog';
import { StoryHighlightEditDialog } from '@/components/stories/StoryHighlightEditDialog';
import { StoryHighlightPlayback } from '@/components/stories/StoryHighlightPlayback';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useStoryHighlights, type StoryHighlight, type StoryHighlightItem } from '@/hooks/useStoryHighlights';
import { cn } from '@/lib/utils';

interface StoryHighlightsProps {
  userId: string;
  className?: string;
}

const NAME_TOKEN = '{' + '{name}' + '}';
const HIGHLIGHT_LONG_PRESS_MS = 480;
const HIGHLIGHT_LONG_PRESS_MOVE_TOLERANCE = 12;

function resolveCoverItem(highlight: StoryHighlight): StoryHighlightItem | undefined {
  if (highlight.cover_url) {
    const matched = highlight.items?.find((item) => item.media_url === highlight.cover_url);
    if (matched) return matched;
  }
  return highlight.items?.[0];
}

function HighlightCover({ highlight }: { highlight: StoryHighlight }) {
  const fallbackItem = highlight.items?.[0];
  const coverItem = resolveCoverItem(highlight);
  const url = highlight.cover_url || fallbackItem?.media_url || null;
  const mediaType = coverItem?.media_type || (highlight.cover_url ? 'image' : fallbackItem?.media_type) || null;

  if (url && mediaType === 'video') {
    return <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  }
  if (url) return <img src={url} alt={highlight.name} loading="lazy" className="h-full w-full object-cover" />;

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background:
          'radial-gradient(circle at 24% 20%, rgba(255,255,255,.76), transparent 28%), radial-gradient(circle at 82% 76%, rgba(217,70,239,.38), transparent 35%), linear-gradient(135deg, #f7c8dd 0%, #c4b5fd 52%, #8b5cf6 100%)',
      }}
    >
      <span className="text-xl font-semibold text-white drop-shadow-sm">
        <EmojiText text={highlight.name.slice(0, 2)} size={22} />
      </span>
    </div>
  );
}

export function StoryHighlights({ userId, className }: StoryHighlightsProps) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const {
    highlights,
    isLoading,
    isOwnProfile,
    createHighlight,
    updateHighlight,
    syncHighlightItems,
    deleteHighlight,
    removeStoryFromHighlight,
  } = useStoryHighlights(userId);

  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<StoryHighlight | null>(null);
  const [deletingHighlight, setDeletingHighlight] = useState<StoryHighlight | null>(null);
  const [actionHighlight, setActionHighlight] = useState<StoryHighlight | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState<StoryHighlight | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPointerRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressHighlightClickRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfileUsername(data?.username || null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const sharedHighlightId = searchParams.get('highlight');
    if (!sharedHighlightId || selectedHighlight) return;
    const sharedHighlight = highlights.find((highlight) => highlight.id === sharedHighlightId);
    if (sharedHighlight?.items?.length) setSelectedHighlight(sharedHighlight);
  }, [highlights, searchParams, selectedHighlight]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const clearHighlightLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressPointerRef.current = null;
  };

  const handleHighlightPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    highlight: StoryHighlight,
  ) => {
    if (!isOwnProfile || event.button !== 0) return;

    clearHighlightLongPress();
    suppressHighlightClickRef.current = false;
    longPressPointerRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };

    longPressTimerRef.current = setTimeout(() => {
      suppressHighlightClickRef.current = true;
      longPressTimerRef.current = null;
      longPressPointerRef.current = null;
      setActionHighlight(highlight);
    }, HIGHLIGHT_LONG_PRESS_MS);
  };

  const handleHighlightPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = longPressPointerRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance > HIGHLIGHT_LONG_PRESS_MOVE_TOLERANCE) clearHighlightLongPress();
  };

  const handleHighlightPointerEnd = () => {
    clearHighlightLongPress();
  };

  const handleDeleteHighlight = async () => {
    if (!deletingHighlight) return;
    await deleteHighlight(deletingHighlight.id);
    setDeletingHighlight(null);
  };

  const openEditDialog = (highlight: StoryHighlight) => {
    setEditingHighlight(highlight);
    setShowEditDialog(true);
  };

  const openHighlightViewer = (highlight: StoryHighlight) => {
    if (highlight.items && highlight.items.length > 0) setSelectedHighlight(highlight);
  };

  if (isLoading) {
    return (
      <div className={cn('flex gap-4 overflow-x-auto pb-4 scrollbar-hidden', className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-shrink-0 flex-col items-center gap-2">
            <Skeleton className="h-[76px] w-[76px] rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (highlights.length === 0 && !isOwnProfile) return null;

  return (
    <>
      <section className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-muted text-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
              {t('profile.highlights.title', { defaultValue: 'Tanlanganlar' })}
            </h2>
          </div>
          {isOwnProfile && highlights.length > 0 ? (
            <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full px-3 text-xs font-medium" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t('profile.highlights.new', { defaultValue: 'Yangi' })}
            </Button>
          ) : null}
        </div>

        {highlights.length === 0 && isOwnProfile ? (
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[26px] border border-border/70 bg-gradient-to-br from-muted/45 via-background to-muted/25 p-4 text-left shadow-sm transition hover:border-foreground/20 hover:shadow-md"
          >
            <span className="absolute -right-12 -top-16 h-40 w-40 rounded-full opacity-40 blur-3xl" style={{ background: 'linear-gradient(135deg, rgba(217,70,239,.34), rgba(99,102,241,.18))' }} />
            <span className="relative rounded-full bg-gradient-to-tr from-amber-300 via-fuchsia-500 to-violet-600 p-[2px] shadow-md">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-background bg-background/95">
                <Plus className="h-5 w-5 text-foreground" />
              </span>
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-sm font-semibold tracking-[-0.01em] text-foreground">
                {t('profile.highlights.createTitle', { defaultValue: 'Tanlangan yarating' })}
              </span>
            </span>
          </button>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-1 pt-0.5 scrollbar-hidden">
            {isOwnProfile ? (
              <button type="button" onClick={() => setShowCreateDialog(true)} className="flex flex-shrink-0 flex-col items-center gap-2" aria-label={t('profile.highlights.new', { defaultValue: 'Yangi' })}>
                <span className="rounded-full bg-gradient-to-tr from-amber-300 via-fuchsia-500 to-violet-600 p-[2px] shadow-sm">
                  <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-background bg-background">
                    <Plus className="h-6 w-6 text-foreground" />
                  </span>
                </span>
                <span className="max-w-[76px] truncate text-xs font-medium text-muted-foreground">
                  {t('profile.highlights.new', { defaultValue: 'Yangi' })}
                </span>
              </button>
            ) : null}

            {highlights.map((highlight) => (
              <div key={highlight.id} className="group relative flex flex-shrink-0 flex-col items-center gap-2">
                <button
                  type="button"
                  onPointerDown={(event) => handleHighlightPointerDown(event, highlight)}
                  onPointerMove={handleHighlightPointerMove}
                  onPointerUp={handleHighlightPointerEnd}
                  onPointerCancel={handleHighlightPointerEnd}
                  onPointerLeave={handleHighlightPointerEnd}
                  onContextMenu={(event) => {
                    if (isOwnProfile) event.preventDefault();
                  }}
                  onClick={(event) => {
                    if (suppressHighlightClickRef.current) {
                      event.preventDefault();
                      suppressHighlightClickRef.current = false;
                      return;
                    }
                    openHighlightViewer(highlight);
                  }}
                  className="relative select-none rounded-full bg-gradient-to-tr from-amber-300 via-fuchsia-500 to-violet-600 p-[2px] shadow-sm transition-transform active:scale-[0.97]"
                  style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                  aria-label={highlight.name}
                >
                  <span className="block h-[72px] w-[72px] overflow-hidden rounded-full border-[3px] border-background bg-muted">
                    <HighlightCover highlight={highlight} />
                  </span>
                </button>

                <span className="flex max-w-[78px] items-center overflow-hidden whitespace-nowrap text-xs font-medium text-foreground">
                  <EmojiText text={highlight.name} size={13} className="truncate" />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <StoryHighlightComposerDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        mode="create"
        userId={userId}
        createHighlight={createHighlight}
        updateHighlight={updateHighlight}
      />

      <StoryHighlightEditDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setEditingHighlight(null);
        }}
        userId={userId}
        highlight={editingHighlight}
        updateHighlight={updateHighlight}
        syncHighlightItems={syncHighlightItems}
      />

      <StoryHighlightActions
        open={Boolean(actionHighlight)}
        onOpenChange={(open) => !open && setActionHighlight(null)}
        highlight={actionHighlight}
        username={profileUsername}
        onEdit={openEditDialog}
        onDelete={setDeletingHighlight}
      />

      <AlertDialog open={!!deletingHighlight} onOpenChange={(open) => !open && setDeletingHighlight(null)}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('profile.highlights.deleteTitle', { defaultValue: "Tanlanganni o'chirasizmi?" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('profile.highlights.deleteDescription', {
                defaultValue: '“' + NAME_TOKEN + '” butunlay o\'chiriladi. Story\'lar arxivda qoladi.',
                name: deletingHighlight?.name || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{t('common.cancel', { defaultValue: 'Bekor qilish' })}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHighlight} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete', { defaultValue: "O'chirish" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedHighlight && selectedHighlight.items?.length ? (
        <StoryHighlightPlayback
          highlight={selectedHighlight}
          isOwnProfile={isOwnProfile}
          onClose={() => setSelectedHighlight(null)}
          onEdit={openEditDialog}
          onRemoveStory={removeStoryFromHighlight}
        />
      ) : null}
    </>
  );
}
