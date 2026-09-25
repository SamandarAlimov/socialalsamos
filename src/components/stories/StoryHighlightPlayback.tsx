import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Play, Trash2, X } from 'lucide-react';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import type { StoryHighlight, StoryHighlightItem } from '@/hooks/useStoryHighlights';
import { cn } from '@/lib/utils';
import { UI_LAYER } from '@/lib/uiLayers';

interface StoryHighlightPlaybackProps {
  highlight: StoryHighlight;
  isOwnProfile: boolean;
  onClose: () => void;
  onEdit: (highlight: StoryHighlight) => void;
  onRemoveStory: (highlightId: string, storyId: string) => Promise<boolean>;
}

const IMAGE_DURATION = 5000;

function resolveCoverItem(highlight: StoryHighlight): StoryHighlightItem | undefined {
  if (highlight.cover_url) {
    const matched = highlight.items?.find((item) => item.media_url === highlight.cover_url);
    if (matched) return matched;
  }
  return highlight.items?.[0];
}

export function StoryHighlightPlayback({
  highlight,
  isOwnProfile,
  onClose,
  onEdit,
  onRemoveStory,
}: StoryHighlightPlaybackProps) {
  const [items, setItems] = useState<StoryHighlightItem[]>(highlight.items || []);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setItems(highlight.items || []);
    setIndex(0);
    setProgress(0);
  }, [highlight.id]);

  const current = items[index];
  const isVideo = current?.media_type === 'video';
  const coverItem = resolveCoverItem(highlight);
  const coverUrl = highlight.cover_url || items.find((item) => item.media_type !== 'video')?.media_url || null;
  const avatarUrl = coverItem?.media_type === 'video' ? null : coverUrl;

  useEffect(() => {
    if (!current || isVideo || menuOpen) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - started;
      const next = Math.min(100, (elapsed / IMAGE_DURATION) * 100);
      setProgress(next);
      if (next >= 100) {
        window.clearInterval(timer);
        if (index < items.length - 1) setIndex((value) => value + 1);
        else onClose();
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, [current?.id, index, isVideo, items.length, menuOpen, onClose]);

  useEffect(() => {
    setProgress(0);
  }, [current?.id]);

  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    if (menuOpen) videoRef.current.pause();
    else void videoRef.current.play().catch(() => undefined);
  }, [isVideo, menuOpen, current?.id]);

  const initial = useMemo(() => highlight.name.trim().slice(0, 2).toUpperCase() || '✦', [highlight.name]);

  if (!current) return null;

  const goPrevious = () => {
    if (index > 0) setIndex((value) => value - 1);
  };

  const goNext = () => {
    if (index < items.length - 1) setIndex((value) => value + 1);
    else onClose();
  };

  const removeCurrent = async () => {
    if (!isOwnProfile || removing) return;
    setRemoving(true);
    try {
      const removed = await onRemoveStory(highlight.id, current.story_id);
      if (!removed) return;
      const nextItems = items.filter((item) => item.story_id !== current.story_id);
      if (nextItems.length === 0) {
        onClose();
        return;
      }
      setItems(nextItems);
      setIndex((value) => Math.min(value, nextItems.length - 1));
      setMenuOpen(false);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className={cn('fixed inset-0 flex items-center justify-center overflow-hidden bg-[#090a0d] text-white', UI_LAYER.immersive)}>
      <div className="relative h-[100dvh] w-full overflow-hidden bg-black sm:h-[min(94dvh,860px)] sm:w-auto sm:aspect-[9/16] sm:max-w-[calc(100vw-120px)] sm:rounded-[24px]">
        {!isVideo ? (
          <img src={current.media_url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-3xl" />
        ) : null}

        {isVideo ? (
          <video
            ref={videoRef}
            key={current.story_id}
            src={current.media_url}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full bg-black object-contain"
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (video.duration > 0) setProgress(Math.min(100, (video.currentTime / video.duration) * 100));
            }}
            onEnded={goNext}
          />
        ) : (
          <img src={current.media_url} alt="Tanlangan story" className="absolute inset-0 h-full w-full object-contain" />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/75 via-black/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/65 to-transparent" />

        <div className="absolute inset-x-0 top-0 z-30 px-2.5" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
          <div className="flex gap-1">
            {items.map((item, itemIndex) => (
              <div key={item.id} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: itemIndex < index ? '100%' : itemIndex === index ? `${progress}%` : '0%' }}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/40 bg-white/10">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-semibold">{initial}</span>}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{highlight.name}</span>
            {isOwnProfile ? (
              <button type="button" onClick={() => setMenuOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-full" aria-label="Tanlangan amallari">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full" aria-label="Yopish">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {current.caption ? (
          <div className="pointer-events-none absolute inset-x-5 bottom-16 z-20 flex justify-center">
            <div className="max-w-[92%] rounded-xl bg-black/45 px-3 py-2 text-center text-[15px] font-medium leading-snug backdrop-blur-md">
              {current.caption}
            </div>
          </div>
        ) : null}

        {isVideo ? <Play className="pointer-events-none absolute bottom-5 left-5 z-20 h-4 w-4 opacity-0" /> : null}

        <button type="button" onClick={goPrevious} className="absolute bottom-0 left-0 top-20 z-10 w-1/3" aria-label="Oldingi story" />
        <button type="button" onClick={goNext} className="absolute bottom-0 right-0 top-20 z-10 w-1/3" aria-label="Keyingi story" />
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          hideDefaultClose
          className="left-1/2 right-auto w-[calc(100%-20px)] max-w-lg -translate-x-1/2 rounded-t-[28px] border-x border-t border-border/70 bg-background p-0 pb-[max(10px,env(safe-area-inset-bottom))] text-foreground"
        >
          <SheetTitle className="sr-only">Tanlangan story amallari</SheetTitle>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
          <div className="mt-2 overflow-hidden rounded-[22px]">
            <button
              type="button"
              disabled={removing}
              onClick={() => void removeCurrent()}
              className="flex min-h-14 w-full items-center gap-3 border-b border-border/60 px-5 text-left text-[15px] font-medium text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-5 w-5" />
              Tanlangandan olib tashlash
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onClose();
                onEdit(highlight);
              }}
              className="flex min-h-14 w-full items-center gap-3 px-5 text-left text-[15px] font-medium"
            >
              <Pencil className="h-5 w-5" />
              Tanlanganni tahrirlash
            </button>
          </div>
          <SheetClose asChild>
            <button type="button" className="mx-3 mt-3 h-12 w-[calc(100%-24px)] rounded-2xl bg-muted text-sm font-semibold">
              Bekor qilish
            </button>
          </SheetClose>
        </SheetContent>
      </Sheet>
    </div>
  );
}
