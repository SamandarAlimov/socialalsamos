import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import type {
  StoryHighlight,
  StoryHighlightDraftItem,
} from '@/hooks/useStoryHighlights';
import { uploadMedia } from '@/lib/mediaUpload';
import { cn } from '@/lib/utils';

type StoryRow = StoryHighlightDraftItem & {
  id: string;
  created_at: string;
  expires_at: string;
};

interface StoryHighlightEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  highlight: StoryHighlight | null;
  updateHighlight: (
    highlightId: string,
    updates: { name?: string; cover_url?: string | null },
  ) => Promise<boolean>;
  syncHighlightItems: (
    highlightId: string,
    items: StoryHighlightDraftItem[],
  ) => Promise<boolean>;
}

function CoverMedia({ url, mediaType, name }: { url: string | null; mediaType: string | null; name: string }) {
  if (url && mediaType === 'video') {
    return <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  }
  if (url) return <img src={url} alt="" className="h-full w-full object-cover" />;
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background:
          'radial-gradient(circle at 24% 20%, rgba(255,255,255,.78), transparent 28%), radial-gradient(circle at 82% 74%, rgba(217,70,239,.38), transparent 35%), linear-gradient(135deg, #f7c8dd 0%, #c4b5fd 52%, #8b5cf6 100%)',
      }}
    >
      <span className="text-2xl font-semibold text-white drop-shadow-sm">
        {name.trim().slice(0, 2).toUpperCase() || '✦'}
      </span>
    </div>
  );
}

export function StoryHighlightEditDialog({
  open,
  onOpenChange,
  userId,
  highlight,
  updateHighlight,
  syncHighlightItems,
}: StoryHighlightEditDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tab, setTab] = useState<'selected' | 'stories'>('selected');
  const [coverStoryId, setCoverStoryId] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null);
  const [loadingStories, setLoadingStories] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!coverFile) {
      setCoverObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  useEffect(() => {
    if (!open || !highlight) return;

    setName(highlight.name);
    setSelectedIds((highlight.items || []).map((item) => item.story_id));
    setCoverStoryId(
      highlight.cover_url
        ? highlight.items?.find((item) => item.media_url === highlight.cover_url)?.story_id || null
        : null,
    );
    setCoverFile(null);
    setTab('selected');

    let cancelled = false;
    const loadStories = async () => {
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
        console.error('Error loading stories for highlight edit:', error);
        if (!cancelled) setStories([]);
      } finally {
        if (!cancelled) setLoadingStories(false);
      }
    };

    void loadStories();
    return () => {
      cancelled = true;
    };
  }, [highlight, open, userId]);

  const selectedStories = useMemo(
    () =>
      selectedIds
        .map((id) => stories.find((story) => story.id === id))
        .filter((story): story is StoryRow => Boolean(story)),
    [selectedIds, stories],
  );

  const selectedCoverStory = useMemo(
    () => selectedStories.find((story) => story.id === coverStoryId) || null,
    [coverStoryId, selectedStories],
  );

  const existingCoverItem = highlight?.cover_url
    ? highlight.items?.find((item) => item.media_url === highlight.cover_url) || null
    : null;
  const existingCoverStillSelected = existingCoverItem
    ? selectedIds.includes(existingCoverItem.story_id)
    : true;
  const previewUrl =
    coverObjectUrl ||
    selectedCoverStory?.media_url ||
    (existingCoverStillSelected ? highlight?.cover_url || null : null) ||
    selectedStories[0]?.media_url ||
    null;
  const previewMediaType = coverObjectUrl
    ? 'image'
    : selectedCoverStory?.media_type ||
      (highlight?.cover_url && existingCoverStillSelected
        ? existingCoverItem?.media_type || 'image'
        : selectedStories[0]?.media_type || null);

  const visibleStories = tab === 'selected' ? selectedStories : stories;

  const toggleStory = (storyId: string) => {
    setSelectedIds((current) => {
      if (current.includes(storyId)) {
        if (coverStoryId === storyId) setCoverStoryId(null);
        return current.filter((id) => id !== storyId);
      }
      return [...current, storyId];
    });
  };

  const chooseCoverStory = (storyId: string) => {
    if (!selectedIds.includes(storyId)) {
      setSelectedIds((current) => [...current, storyId]);
    }
    setCoverStoryId(storyId);
    setCoverFile(null);
  };

  const handleCoverFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Muqova uchun rasm faylini tanlang');
      return;
    }
    setCoverFile(file);
    setCoverStoryId(null);
  };

  const handleSave = async () => {
    if (!highlight || !name.trim() || saving) return;
    setSaving(true);
    try {
      let coverUrl: string | null | undefined;
      if (coverFile) {
        const uploaded = await uploadMedia(coverFile, { type: 'avatar', visibility: 'public' });
        coverUrl = uploaded.url;
      } else if (selectedCoverStory) {
        coverUrl = selectedCoverStory.media_url;
      } else if (existingCoverItem && !existingCoverStillSelected) {
        coverUrl = selectedStories.find((story) => story.media_type !== 'video')?.media_url || null;
      }

      const metadataUpdated = await updateHighlight(highlight.id, {
        name: name.trim(),
        ...(coverUrl !== undefined ? { cover_url: coverUrl } : {}),
      });
      if (!metadataUpdated) return;

      const storiesUpdated = await syncHighlightItems(
        highlight.id,
        selectedStories.map((story) => ({
          story_id: story.id,
          media_url: story.media_url,
          media_type: story.media_type,
          caption: story.caption,
        })),
      );
      if (!storiesUpdated) return;

      toast.success('Tanlangan yangilandi');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving highlight edit:', error);
      toast.error('Tanlanganni saqlab bo‘lmadi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent
        hideDefaultClose
        className="h-[100dvh] max-h-[100dvh] w-full max-w-none translate-y-[-50%] gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none sm:h-[min(88dvh,820px)] sm:max-h-[820px] sm:max-w-xl sm:rounded-[30px] sm:border sm:shadow-2xl"
      >
        <DialogHeader className="border-b border-border/70 px-4 py-4 sm:px-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="justify-self-start text-sm font-medium text-primary disabled:opacity-50"
            >
              Bekor qilish
            </button>
            <DialogTitle className="text-base font-semibold sm:text-lg">Tanlanganni tahrirlash</DialogTitle>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim()}
              className="justify-self-end text-sm font-semibold text-primary disabled:opacity-50"
            >
              {saving ? 'Saqlanmoqda…' : 'Tayyor'}
            </button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-background">
          <section className="flex flex-col items-center px-5 pb-5 pt-6">
            <div className="rounded-full bg-muted p-[4px]">
              <div className="h-24 w-24 overflow-hidden rounded-full border-[3px] border-background bg-black sm:h-28 sm:w-28">
                <CoverMedia url={previewUrl} mediaType={previewMediaType} name={name} />
              </div>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />
            <Button
              type="button"
              variant="ghost"
              className="mt-2 h-9 rounded-full px-4 text-sm font-semibold text-primary hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Qurilmadan muqova
            </Button>

            {selectedStories.length > 0 ? (
              <div className="mt-2 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {selectedStories.map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => chooseCoverStory(story.id)}
                    className={cn(
                      'relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 bg-muted',
                      coverStoryId === story.id ? 'border-primary ring-2 ring-primary/20' : 'border-background',
                    )}
                    aria-label="Storyni muqova qilish"
                  >
                    {story.media_type === 'video' ? (
                      <video src={story.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      <img src={story.media_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="border-y border-border/70 px-5 py-4">
            <div className="flex items-center gap-4">
              <label htmlFor="edit-highlight-name" className="w-16 shrink-0 text-sm font-medium">
                Nomi
              </label>
              <Input
                id="edit-highlight-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={50}
                className="h-10 flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
              />
            </div>
          </section>

          <div className="grid grid-cols-2 border-b border-border/70">
            <button
              type="button"
              onClick={() => setTab('selected')}
              className={cn(
                'relative h-12 text-sm font-semibold text-muted-foreground',
                tab === 'selected' && 'text-foreground',
              )}
            >
              Tanlangan
              {tab === 'selected' ? <span className="absolute inset-x-5 bottom-0 h-0.5 bg-foreground" /> : null}
            </button>
            <button
              type="button"
              onClick={() => setTab('stories')}
              className={cn(
                'relative h-12 text-sm font-semibold text-muted-foreground',
                tab === 'stories' && 'text-foreground',
              )}
            >
              Storylar
              {tab === 'stories' ? <span className="absolute inset-x-5 bottom-0 h-0.5 bg-foreground" /> : null}
            </button>
          </div>

          <section className="p-2.5 sm:p-4">
            {loadingStories ? (
              <div className="flex min-h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : visibleStories.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center px-8 text-center text-sm text-muted-foreground">
                {tab === 'selected' ? 'Bu Tanlanganda story yo‘q.' : 'Hozircha story yo‘q.'}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2">
                {visibleStories.map((story) => {
                  const selected = selectedIds.includes(story.id);
                  const selectedIndex = selectedIds.indexOf(story.id);
                  return (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() => toggleStory(story.id)}
                      className="relative aspect-[3/4] overflow-hidden bg-muted"
                      aria-pressed={selected}
                    >
                      {story.media_type === 'video' ? (
                        <video src={story.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        <img src={story.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      {story.media_type === 'video' ? (
                        <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white">
                          <Play className="h-3 w-3 fill-current" />
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow-md',
                          selected ? 'bg-primary text-primary-foreground' : 'bg-black/25 text-transparent',
                        )}
                      >
                        {selected ? selectedIndex + 1 : <Check className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
