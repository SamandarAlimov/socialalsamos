import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Check, ImagePlus, Images, Loader2, Play, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
import { supabase } from '@/integrations/supabase/client';
import type {
  StoryHighlight,
  StoryHighlightDraftItem,
  StoryHighlightItem,
} from '@/hooks/useStoryHighlights';
import { uploadMedia } from '@/lib/mediaUpload';
import { cn } from '@/lib/utils';

type ArchivedStory = StoryHighlightDraftItem & {
  id: string;
  created_at: string;
  expires_at: string;
};

type CoverStory = Pick<StoryHighlightDraftItem, 'story_id' | 'media_url' | 'media_type' | 'caption'>;

interface StoryHighlightComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  userId: string;
  highlight?: StoryHighlight | null;
  createHighlight: (
    name: string,
    coverUrl?: string,
    initialItems?: StoryHighlightDraftItem[],
  ) => Promise<unknown | null>;
  updateHighlight: (
    highlightId: string,
    updates: { name?: string; cover_url?: string | null },
  ) => Promise<boolean>;
}

function StoryCover({
  url,
  mediaType,
  name,
}: {
  url: string | null;
  mediaType: string | null;
  name: string;
}) {
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
    return <img src={url} alt="" className="h-full w-full object-cover" />;
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background:
          'radial-gradient(circle at 24% 20%, rgba(255,255,255,.78), transparent 28%), radial-gradient(circle at 82% 74%, rgba(217,70,239,.38), transparent 35%), linear-gradient(135deg, #f7c8dd 0%, #c4b5fd 52%, #8b5cf6 100%)',
      }}
    >
      <span className="text-2xl font-semibold tracking-[-0.04em] text-white drop-shadow-sm">
        {name.trim().slice(0, 2).toUpperCase() || '✦'}
      </span>
    </div>
  );
}

function CoverChoice({
  story,
  selected,
  onSelect,
}: {
  story: CoverStory;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span
        className={cn(
          'block h-14 w-14 overflow-hidden rounded-full border-2 bg-muted transition sm:h-16 sm:w-16',
          selected ? 'border-foreground ring-2 ring-foreground/15' : 'border-border/80',
        )}
      >
        {story.media_type === 'video' ? (
          <video
            src={story.media_url}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <img src={story.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </span>
      {story.media_type === 'video' ? (
        <span className="absolute bottom-0 left-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-black/65 text-white">
          <Play className="h-2.5 w-2.5 fill-current" />
        </span>
      ) : null}
      {selected ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-foreground text-background">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}

export function StoryHighlightComposerDialog({
  open,
  onOpenChange,
  mode,
  userId,
  highlight,
  createHighlight,
  updateHighlight,
}: StoryHighlightComposerDialogProps) {
  const { t } = useTranslation();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null);
  const [coverStoryId, setCoverStoryId] = useState<string | null>(null);
  const [removeExistingCover, setRemoveExistingCover] = useState(false);
  const [stories, setStories] = useState<ArchivedStory[]>([]);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!coverFile) {
      setCoverObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(coverFile);
    setCoverObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [coverFile]);

  useEffect(() => {
    if (!open) return;

    setName(mode === 'edit' ? highlight?.name ?? '' : '');
    setCoverFile(null);
    setCoverStoryId(null);
    setRemoveExistingCover(false);
    setSelectedStoryIds([]);

    if (mode !== 'create') return;

    let cancelled = false;
    const fetchStories = async () => {
      setLoadingStories(true);
      try {
        const { data, error } = await supabase
          .from('stories')
          .select('id, media_url, media_type, caption, created_at, expires_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        setStories(
          (data || []).map((story) => ({
            id: story.id,
            story_id: story.id,
            media_url: story.media_url,
            media_type: story.media_type,
            caption: story.caption,
            created_at: story.created_at,
            expires_at: story.expires_at,
          })),
        );
      } catch (error) {
        console.error('Error loading stories for highlight composer:', error);
        if (!cancelled) setStories([]);
      } finally {
        if (!cancelled) setLoadingStories(false);
      }
    };

    void fetchStories();
    return () => {
      cancelled = true;
    };
  }, [highlight?.name, mode, open, userId]);

  const selectedStories = useMemo(
    () =>
      selectedStoryIds
        .map((storyId) => stories.find((story) => story.id === storyId))
        .filter((story): story is ArchivedStory => Boolean(story)),
    [selectedStoryIds, stories],
  );

  const coverStoryCandidates = useMemo<CoverStory[]>(() => {
    if (mode === 'create') return selectedStories;
    return (highlight?.items || []).map((item: StoryHighlightItem) => ({
      story_id: item.story_id,
      media_url: item.media_url,
      media_type: item.media_type,
      caption: item.caption,
    }));
  }, [highlight?.items, mode, selectedStories]);

  const selectedCoverStory = useMemo(
    () => coverStoryCandidates.find((story) => story.story_id === coverStoryId) ?? null,
    [coverStoryCandidates, coverStoryId],
  );

  const firstSelectedStory = selectedStories[0] ?? null;
  const existingCover = mode === 'edit' && !removeExistingCover ? highlight?.cover_url ?? null : null;
  const previewUrl =
    coverObjectUrl || selectedCoverStory?.media_url || existingCover || firstSelectedStory?.media_url || null;
  const previewMediaType = coverObjectUrl
    ? 'image'
    : selectedCoverStory?.media_type || (existingCover ? 'image' : firstSelectedStory?.media_type ?? null);

  const resetAndClose = () => {
    if (saving) return;
    setCoverFile(null);
    setCoverStoryId(null);
    setSelectedStoryIds([]);
    setRemoveExistingCover(false);
    onOpenChange(false);
  };

  const handleCoverFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error(
        t('profile.highlights.coverImageOnly', {
          defaultValue: 'Muqova uchun rasm faylini tanlang',
        }),
      );
      return;
    }

    setCoverFile(file);
    setCoverStoryId(null);
    setRemoveExistingCover(false);
  };

  const chooseStoryCover = (storyId: string) => {
    setCoverStoryId(storyId);
    setCoverFile(null);
    setRemoveExistingCover(false);
  };

  const toggleStory = (storyId: string) => {
    setSelectedStoryIds((current) => {
      if (current.includes(storyId)) {
        if (coverStoryId === storyId) setCoverStoryId(null);
        return current.filter((id) => id !== storyId);
      }
      return [...current, storyId];
    });
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;

    setSaving(true);
    try {
      let uploadedCoverUrl: string | undefined;
      if (coverFile) {
        const uploaded = await uploadMedia(coverFile, { type: 'avatar', visibility: 'public' });
        uploadedCoverUrl = uploaded.url;
      }

      if (mode === 'create') {
        const automaticImageCover = selectedStories.find((story) => story.media_type !== 'video')?.media_url;
        const created = await createHighlight(
          trimmedName,
          uploadedCoverUrl || selectedCoverStory?.media_url || automaticImageCover,
          selectedStories.map((story) => ({
            story_id: story.story_id,
            media_url: story.media_url,
            media_type: story.media_type,
            caption: story.caption,
          })),
        );
        if (!created) return;
      } else if (highlight) {
        const updates: { name: string; cover_url?: string | null } = { name: trimmedName };
        if (uploadedCoverUrl) updates.cover_url = uploadedCoverUrl;
        else if (selectedCoverStory) updates.cover_url = selectedCoverStory.media_url;
        else if (removeExistingCover) updates.cover_url = null;

        const updated = await updateHighlight(highlight.id, updates);
        if (!updated) return;
      }

      setCoverFile(null);
      setCoverStoryId(null);
      setSelectedStoryIds([]);
      setRemoveExistingCover(false);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving premium highlight:', error);
      toast.error(
        error?.message ||
          t('profile.highlights.saveFailed', {
            defaultValue: 'Tanlanganni saqlab bo‘lmadi',
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === 'create'
      ? t('profile.highlights.createPremiumTitle', { defaultValue: 'Yangi tanlangan' })
      : t('profile.highlights.editTitle', { defaultValue: 'Tanlanganni tahrirlash' });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && resetAndClose()}>
      <DialogContent className="max-h-[min(88dvh,820px)] w-[calc(100vw-20px)] max-w-xl overflow-hidden rounded-[30px] border-border/70 bg-background p-0 shadow-2xl sm:w-full">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 text-left sm:px-6">
          <div className="flex items-center gap-2 pr-8">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold tracking-[-0.025em] sm:text-2xl">
                {title}
              </DialogTitle>
              {mode === 'create' ? (
                <DialogDescription className="mt-0.5 text-xs sm:text-sm">
                  {t('profile.highlights.createPremiumDescription', {
                    defaultValue: 'Storylarni tanlang, nom bering va muqovani storydan yoki qurilmadan qo‘ying.',
                  })}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          <section className="rounded-[26px] border border-border/70 bg-muted/25 p-4 sm:p-5">
            <div className="flex flex-col items-center text-center">
              <div className="relative rounded-full bg-gradient-to-tr from-amber-300 via-fuchsia-500 to-violet-600 p-[3px] shadow-lg shadow-fuchsia-500/10">
                <div className="h-24 w-24 overflow-hidden rounded-full border-[3px] border-background bg-muted sm:h-28 sm:w-28">
                  <StoryCover url={previewUrl} mediaType={previewMediaType} name={name} />
                </div>
              </div>

              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverFile}
              />

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full bg-background px-4 text-xs shadow-sm"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={saving}
                >
                  <ImagePlus className="mr-1.5 h-4 w-4" />
                  Qurilmadan
                </Button>

                {mode === 'edit' && highlight?.cover_url && !coverFile && !coverStoryId && !removeExistingCover ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 rounded-full px-3 text-xs text-muted-foreground"
                    onClick={() => {
                      setRemoveExistingCover(true);
                      setCoverStoryId(null);
                      setCoverFile(null);
                    }}
                    disabled={saving}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Muqovani olib tashlash
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 w-full border-t border-border/60 pt-4 text-left">
                <div className="mb-2 flex items-center gap-2">
                  <Images className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold text-foreground">Storydan muqova tanlash</p>
                </div>
                {coverStoryCandidates.length > 0 ? (
                  <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {coverStoryCandidates.map((story) => (
                      <CoverChoice
                        key={story.story_id}
                        story={story}
                        selected={coverStoryId === story.story_id}
                        onSelect={() => chooseStoryCover(story.story_id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {mode === 'create'
                      ? 'Avval pastdan story tanlang — tanlangan storylardan birini muqova qilishingiz mumkin.'
                      : 'Bu Tanlanganda hali story yo‘q. Story qo‘shilgach, shu yerdan muqova sifatida tanlash mumkin.'}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="highlight-name" className="text-sm font-semibold text-foreground">
                  {t('profile.highlights.nameLabel', { defaultValue: 'Nomi' })}
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">{name.length}/50</span>
              </div>
              <Input
                id="highlight-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('profile.highlights.namePlaceholderPremium', {
                  defaultValue: 'Masalan: Sayohat, Oila, Ish...',
                })}
                maxLength={50}
                className="h-12 rounded-2xl border-border/80 bg-background px-4 text-base shadow-sm"
                autoFocus={mode === 'edit'}
              />
            </div>
          </section>

          {mode === 'create' ? (
            <section className="mt-5">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t('profile.highlights.chooseStories', { defaultValue: 'Storylarni tanlang' })}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('profile.highlights.chooseStoriesHint', {
                      defaultValue: 'Faol va arxivdagi storylardan Tanlangan yarating.',
                    })}
                  </p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {selectedStoryIds.length} {t('profile.highlights.selected', { defaultValue: 'tanlandi' })}
                </span>
              </div>

              {loadingStories ? (
                <div className="flex min-h-36 items-center justify-center rounded-3xl border border-border/70 bg-muted/20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : stories.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 text-center">
                  <Archive className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Hozircha story yo‘q</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Story joylaganingizdan keyin shu yerda tanlash mumkin bo‘ladi.
                  </p>
                </div>
              ) : (
                <div className="grid max-h-[300px] grid-cols-4 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-5">
                  {stories.map((story) => {
                    const selectedIndex = selectedStoryIds.indexOf(story.id);
                    const selected = selectedIndex >= 0;
                    const isCover = coverStoryId === story.id;
                    return (
                      <button
                        key={story.id}
                        type="button"
                        onClick={() => toggleStory(story.id)}
                        aria-pressed={selected}
                        className={cn(
                          'group relative aspect-[3/4] overflow-hidden rounded-2xl border bg-muted text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          selected
                            ? 'border-foreground ring-2 ring-foreground/15'
                            : 'border-border/70 hover:border-foreground/30',
                        )}
                      >
                        {story.media_type === 'video' ? (
                          <video
                            src={story.media_url}
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={story.media_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                        <span className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
                        {story.media_type === 'video' ? (
                          <span className="absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                            <Play className="h-2.5 w-2.5 fill-current" />
                          </span>
                        ) : null}
                        {isCover ? (
                          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-bold text-black shadow-sm">
                            MUQOVA
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold shadow-sm transition',
                            selected
                              ? 'border-white bg-white text-black'
                              : 'border-white/80 bg-black/20 text-transparent backdrop-blur-sm',
                          )}
                        >
                          {selected ? selectedIndex + 1 : <Check className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/60 bg-background/95 px-5 py-4 backdrop-blur-xl sm:px-6">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!name.trim() || saving}
            className="h-12 w-full rounded-2xl bg-foreground text-base font-semibold text-background shadow-lg shadow-black/5 hover:bg-foreground/90"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === 'create'
              ? t('profile.highlights.createAction', { defaultValue: 'Tanlangan yaratish' })
              : t('common.save', { defaultValue: 'Saqlash' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
