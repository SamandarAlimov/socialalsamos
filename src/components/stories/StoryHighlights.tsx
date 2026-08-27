import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, MoreHorizontal, Pencil, Trash2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmojiText } from '@/components/emoji/EmojiText';
import { useStoryHighlights, StoryHighlight } from '@/hooks/useStoryHighlights';
import { StoryViewer } from './StoryViewer';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

interface StoryHighlightsProps {
  userId: string;
  className?: string;
}

// i18next interpolatsiya tokeni (kod ichida to'g'ridan-to'g'ri yozilmaydi)
const NAME_TOKEN = '{' + '{name}' + '}';

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
  const [newHighlightName, setNewHighlightName] = useState('');
  const [selectedHighlight, setSelectedHighlight] = useState<StoryHighlight | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleCreateHighlight = async () => {
    if (!newHighlightName.trim()) return;

    setIsSaving(true);
    await createHighlight(newHighlightName.trim());
    setNewHighlightName('');
    setShowCreateDialog(false);
    setIsSaving(false);
  };

  const handleEditHighlight = async () => {
    if (!editingHighlight || !newHighlightName.trim()) return;

    setIsSaving(true);
    await updateHighlight(editingHighlight.id, { name: newHighlightName.trim() });
    setNewHighlightName('');
    setShowEditDialog(false);
    setEditingHighlight(null);
    setIsSaving(false);
  };

  const handleDeleteHighlight = async () => {
    if (!deletingHighlight) return;
    await deleteHighlight(deletingHighlight.id);
    setDeletingHighlight(null);
  };

  const openEditDialog = (highlight: StoryHighlight) => {
    setEditingHighlight(highlight);
    setNewHighlightName(highlight.name);
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
            <Skeleton className="h-[72px] w-[72px] rounded-full" />
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
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('profile.highlights.title', { defaultValue: 'Tanlanganlar' })}
          </h2>
          {isOwnProfile && highlights.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 rounded-full text-xs"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('profile.highlights.new', { defaultValue: 'Yangi' })}
            </Button>
          )}
        </div>

        {highlights.length === 0 && isOwnProfile ? (
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/50">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {t('profile.highlights.createTitle', { defaultValue: 'Tanlangan yarating' })}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('profile.highlights.createHint', {
                  defaultValue: "Story'laringizni profilda doimiy saqlab qo\u2018ying",
                })}
              </span>
            </span>
          </button>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hidden">
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => setShowCreateDialog(true)}
                className="flex flex-shrink-0 flex-col items-center gap-2"
                aria-label={t('profile.highlights.new', { defaultValue: 'Yangi' })}
              >
                <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/50 transition-colors hover:border-primary hover:bg-primary/5">
                  <Plus className="h-6 w-6 text-muted-foreground" />
                </span>
                <span className="max-w-[72px] truncate text-xs text-muted-foreground">
                  {t('profile.highlights.new', { defaultValue: 'Yangi' })}
                </span>
              </button>
            )}

            {highlights.map((highlight) => {
              const itemCount = highlight.items?.length ?? 0;
              const cover = highlight.cover_url || highlight.items?.[0]?.media_url || null;

              return (
                <div
                  key={highlight.id}
                  className="group relative flex flex-shrink-0 flex-col items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => openHighlightViewer(highlight)}
                    className="relative"
                    aria-label={highlight.name}
                  >
                    <span
                      className={cn(
                        'flex h-[72px] w-[72px] items-center justify-center rounded-full p-[2px]',
                        itemCount > 0
                          ? 'bg-gradient-to-tr from-primary via-alsamos-orange-light to-primary/60'
                          : 'bg-muted',
                      )}
                    >
                      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted">
                        {cover ? (
                          <img
                            src={cover}
                            alt={highlight.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xl font-semibold text-muted-foreground">
                            <EmojiText text={highlight.name.slice(0, 2)} size={22} />
                          </span>
                        )}
                      </span>
                    </span>

                    {itemCount > 0 && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {itemCount}
                      </span>
                    )}
                  </button>

                  <span className="flex max-w-[72px] items-center gap-0.5 overflow-hidden whitespace-nowrap text-xs font-medium text-foreground">
                    <EmojiText text={highlight.name} size={13} className="truncate" />
                  </span>

                  {isOwnProfile && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="absolute -top-1 right-0 rounded-full bg-background/95 p-1 opacity-0 shadow-md backdrop-blur transition-opacity focus:opacity-100 group-hover:opacity-100"
                          aria-label={t('common.more', { defaultValue: "Ko'proq" })}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(highlight)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('common.edit', { defaultValue: 'Tahrirlash' })}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeletingHighlight(highlight)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('common.delete', { defaultValue: "O'chirish" })}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Highlight Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('profile.highlights.createTitle', { defaultValue: 'Tanlangan yarating' })}
            </DialogTitle>
            <DialogDescription>
              {t('profile.highlights.createDescription', {
                defaultValue:
                  "Tanlanganga nom bering. Story'larni keyinroq arxivdan qo\u2018shishingiz mumkin.",
              })}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newHighlightName}
            onChange={(e) => setNewHighlightName(e.target.value)}
            placeholder={t('profile.highlights.namePlaceholder', { defaultValue: 'Nomi...' })}
            maxLength={50}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
              {t('common.cancel', { defaultValue: 'Bekor qilish' })}
            </Button>
            <Button onClick={handleCreateHighlight} disabled={!newHighlightName.trim() || isSaving}>
              {isSaving
                ? t('common.loading', { defaultValue: 'Yuklanmoqda...' })
                : t('common.create', { defaultValue: 'Yaratish' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Highlight Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('profile.highlights.editTitle', { defaultValue: 'Tanlanganni tahrirlash' })}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={newHighlightName}
            onChange={(e) => setNewHighlightName(e.target.value)}
            placeholder={t('profile.highlights.namePlaceholder', { defaultValue: 'Nomi...' })}
            maxLength={50}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel', { defaultValue: 'Bekor qilish' })}
            </Button>
            <Button onClick={handleEditHighlight} disabled={!newHighlightName.trim() || isSaving}>
              {isSaving
                ? t('common.loading', { defaultValue: 'Yuklanmoqda...' })
                : t('common.save', { defaultValue: 'Saqlash' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletingHighlight}
        onOpenChange={(open) => !open && setDeletingHighlight(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('profile.highlights.deleteTitle', { defaultValue: "Tanlanganni o'chirasizmi?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('profile.highlights.deleteDescription', {
                defaultValue:
                  '\u201c' + NAME_TOKEN + "\u201d butunlay o'chiriladi. Story'lar arxivda qoladi.",
                name: deletingHighlight?.name || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('common.cancel', { defaultValue: 'Bekor qilish' })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteHighlight}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', { defaultValue: "O'chirish" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Highlight Viewer */}
      {selectedHighlight && selectedHighlight.items && selectedHighlight.items.length > 0 && (
        <StoryViewer
          storyGroup={{
            user_id: userId,
            username: null,
            display_name: selectedHighlight.name,
            avatar_url: selectedHighlight.cover_url || selectedHighlight.items[0]?.media_url || null,
            is_verified: false,
            stories: selectedHighlight.items.map(item => ({
              id: item.story_id,
              user_id: userId,
              media_url: item.media_url,
              media_type: item.media_type,
              caption: item.caption,
              views_count: 0,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              created_at: item.created_at,
            })),
            all_story_ids: selectedHighlight.items.map(item => item.story_id),
          }}
          allGroups={[]}
          onClose={() => setSelectedHighlight(null)}
        />
      )}
    </>
  );
}
