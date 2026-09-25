import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';

import { EmojiText } from '@/components/emoji/EmojiText';
import { StoryHighlightComposerDialog } from '@/components/stories/StoryHighlightComposerDialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useStoryHighlights, type StoryHighlight, type StoryHighlightItem } from '@/hooks/useStoryHighlights';
import { cn } from '@/lib/utils';
import { StoryViewer } from './StoryViewer';

interface StoryHighlightsProps {
  userId: string;
  className?: string;
}

const NAME_TOKEN = '{' + '{name}' + '}';

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
    return <img src={url} alt={highlight.name} loading="lazy" className="h-full w-full object-cover" />;
  }

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
  const {
    highlights,
    isLoading,
    isOwnProfile,
    createHighlight,
    updateHighlight,
    deleteHighlight,
  } = useStoryHighlights(userId);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<StoryHighlight | null>(null);
  const [deletingHighlight, setDeletingHighlight] = useState<StoryHighlight | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState<StoryHighlight | null>(null);

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
    if (highlight.items && highlight.items.length > 0) {
      setSelectedHighlight(highlight);
    }
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

  if (highlights.length === 0 && !isOwnProfile) {
    return null;
  }

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
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 rounded-full px-3 text-xs font-medium"
              onClick={() => setShowCreateDialog(true)}
            >
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
            <span
              className="absolute -right-12 -top-16 h-40 w-40 rounded-full opacity-40 blur-3xl"
              style={{ background: 'linear-gradient(135deg, rgba(217,70,239,.34), rgba(99,102,241,.18))' }}
            />
            <span className="relative rounded-full bg-gradient-to-tr from-amber-300 via-fuchsia-500 to-violet-600 p-[2px] shadow-md">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-background bg-background/95">
                <Plus className="h-5 w-5 text-foreground" />
              </span>
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-sm font-semibold tracking-[-0.01em] text-foreground">
                {t('profile.highlights.createTitle', { defaultValue: 'Tanlangan yarating' })}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {t('profile.highlights.createHintPremium', {
                  defaultValue: 'Storylarni bir joyga jamlang, nom bering va alohida muqova bilan bezang.',
                })}
              </span>
            </span>
          </button>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-1 pt-0.5 scrollbar-hidden">
            {isOwnProfile ? (
              <button
                type="button"
                onClick={() => setShowCreateDialog(true)}
                className="flex flex-shrink-0 flex-col items-center gap-2"
                aria-label={t('profile.highlights.new', { defaultValue: 'Yangi' })}
              >
                <span className="rounded-full bg-gradient-to-tr from-amber-300 via-fuchsia-500 to-violet-600 p-[2px] shadow-sm">
                  <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-background bg-background transition group-hover:bg-muted">
                    <Plus className="h-6 w-6 text-foreground" />
                  </span>
                </span>
                <span className="max-w-[76px] truncate text-xs font-medium text-muted-foreground">
                  {t('profile.highlights.new', { defaultValue: 'Yangi' })}
                </span>
              </button>
            ) : null}

            {highlights.map((highlight) => (
              <div
                key={highlight.id}
                className="group relative flex flex-shrink-0 flex-col items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => openHighlightViewer(highlight)}
                  className="relative rounded-full bg-gradient-to-tr from-amber-300 via-fuchsia-500 to-violet-600 p-[2px] shadow-sm transition-transform active:scale-[0.97]"
                  aria-label={highlight.name}
                >
                  <span className="block h-[72px] w-[72px] overflow-hidden rounded-full border-[3px] border-background bg-muted">
                    <HighlightCover highlight={highlight} />
                  </span>
                </button>

                <span className="flex max-w-[78px] items-center overflow-hidden whitespace-nowrap text-xs font-medium text-foreground">
                  <EmojiText text={highlight.name} size={13} className="truncate" />
                </span>

                {isOwnProfile ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground"
                        aria-label={t('common.more', { defaultValue: "Ko'proq" })}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44 rounded-2xl p-1.5">
                      <DropdownMenuItem className="rounded-xl" onClick={() => openEditDialog(highlight)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('common.edit', { defaultValue: 'Tahrirlash' })}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeletingHighlight(highlight)}
                        className="rounded-xl text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('common.delete', { defaultValue: "O'chirish" })}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
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

      <StoryHighlightComposerDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setEditingHighlight(null);
        }}
        mode="edit"
        userId={userId}
        highlight={editingHighlight}
        createHighlight={createHighlight}
        updateHighlight={updateHighlight}
      />

      <AlertDialog
        open={!!deletingHighlight}
        onOpenChange={(open) => !open && setDeletingHighlight(null)}
      >
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('profile.highlights.deleteTitle', { defaultValue: "Tanlanganni o'chirasizmi?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('profile.highlights.deleteDescription', {
                defaultValue: '“' + NAME_TOKEN + '” butunlay o\'chiriladi. Story\'lar arxivda qoladi.',
                name: deletingHighlight?.name || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">
              {t('common.cancel', { defaultValue: 'Bekor qilish' })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteHighlight}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', { defaultValue: "O'chirish" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedHighlight && selectedHighlight.items && selectedHighlight.items.length > 0 ? (
        <StoryViewer
          storyGroup={{
            user_id: userId,
            username: null,
            display_name: selectedHighlight.name,
            avatar_url: (() => {
              const coverItem = resolveCoverItem(selectedHighlight);
              if (selectedHighlight.cover_url && coverItem?.media_type !== 'video') {
                return selectedHighlight.cover_url;
              }
              return selectedHighlight.items.find((item) => item.media_type !== 'video')?.media_url || null;
            })(),
            is_verified: false,
            stories: selectedHighlight.items.map((item) => ({
              id: item.story_id,
              user_id: userId,
              media_url: item.media_url,
              media_type: item.media_type,
              caption: item.caption,
              views_count: 0,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              created_at: item.created_at,
            })),
            all_story_ids: selectedHighlight.items.map((item) => item.story_id),
          }}
          allGroups={[]}
          onClose={() => setSelectedHighlight(null)}
        />
      ) : null}
    </>
  );
}
