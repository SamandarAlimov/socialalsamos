import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useProfilePhotos } from '@/hooks/useProfilePhotos';

interface ProfilePhotosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string | null;
  isOwnProfile?: boolean;
  /** profiles.avatar_url - galereya bo'sh bo'lsa ishlatiladi */
  fallbackUrl?: string | null;
  name?: string | null;
  username?: string | null;
  onChanged?: () => void;
}

type GalleryItem = { id: string; image_url: string; synthetic?: boolean };

const viewerActionClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 text-sm font-medium text-white backdrop-blur-xl transition hover:bg-white/15 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 sm:px-4';

const SWIPE_NAV_THRESHOLD_PX = 48;
const SWIPE_DISMISS_THRESHOLD_PX = 72;
const SWIPE_AXIS_DOMINANCE = 1.1;

export function ProfilePhotosDialog({
  open,
  onOpenChange,
  userId,
  isOwnProfile = false,
  fallbackUrl,
  name,
  username,
  onChanged,
}: ProfilePhotosDialogProps) {
  const { t } = useTranslation();
  const { photos, isLoading, uploading, addPhoto, setMainPhoto, deletePhoto } =
    useProfilePhotos(open ? userId : null);

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const items: GalleryItem[] = useMemo(() => {
    if (photos.length > 0) {
      return photos.map((p) => ({ id: p.id, image_url: p.image_url }));
    }
    if (fallbackUrl) {
      return [{ id: 'fallback', image_url: fallbackUrl, synthetic: true }];
    }
    return [];
  }, [photos, fallbackUrl]);

  const total = items.length;
  const current = items[Math.min(index, Math.max(total - 1, 0))];
  const isCurrentMain = Boolean(current && index === 0 && !current.synthetic);
  const isWorking = busy || uploading;

  useEffect(() => {
    if (open) {
      setIndex(0);
      setConfirmingDelete(false);
    }
  }, [open]);

  useEffect(() => {
    setConfirmingDelete(false);
    thumbnailRefs.current[index]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [index]);

  const goPrev = useCallback(() => {
    setIndex((i) => (total === 0 ? 0 : (i - 1 + total) % total));
  }, [total]);

  const goNext = useCallback(() => {
    setIndex((i) => (total === 0 ? 0 : (i + 1) % total));
  }, [total]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goPrev, goNext]);

  const handleDownload = async () => {
    if (!current) return;
    try {
      const response = await fetch(current.image_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${username || 'profile'}-${index + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(current.image_url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      await addPhoto(file);
      setIndex(0);
      onChanged?.();
      toast.success(
        t('profile.photos.added', { defaultValue: "Yangi profil rasmi qo'shildi" }),
      );
    } catch (error: any) {
      toast.error(
        error?.message ||
          t('profile.photos.addFailed', { defaultValue: "Rasmni yuklab bo'lmadi" }),
      );
    }
  };

  const handleSetMain = async () => {
    if (!current || current.synthetic) return;
    setBusy(true);
    try {
      await setMainPhoto(current.id);
      setIndex(0);
      onChanged?.();
      toast.success(t('profile.photos.mainSet', { defaultValue: 'Asosiy rasm yangilandi' }));
    } catch (error: any) {
      toast.error(
        error?.message ||
          t('profile.photos.mainFailed', { defaultValue: "Asosiy rasmni o'zgartirib bo'lmadi" }),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!current || current.synthetic) return;

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setBusy(true);
    try {
      await deletePhoto(current.id);
      setIndex(0);
      setConfirmingDelete(false);
      onChanged?.();
      toast.success(t('profile.photos.deleted', { defaultValue: "Rasm o'chirildi" }));
    } catch (error: any) {
      toast.error(
        error?.message ||
          t('profile.photos.deleteFailed', { defaultValue: "Rasmni o'chirib bo'lmadi" }),
      );
    } finally {
      setBusy(false);
    }
  };

  const resetTouchGesture = () => {
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    const endX = event.changedTouches[0]?.clientX ?? null;
    const endY = event.changedTouches[0]?.clientY ?? null;
    resetTouchGesture();

    if (startX == null || startY == null || endX == null || endY == null) return;

    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Up yoki down swipe: profil photo viewer'ni yopadi. Bu bir dona rasmda ham ishlaydi.
    if (
      absY >= SWIPE_DISMISS_THRESHOLD_PX &&
      absY > absX * SWIPE_AXIS_DOMINANCE
    ) {
      onOpenChange(false);
      return;
    }

    // Left/right swipe faqat bir nechta profil rasmi mavjud bo'lsa navigation qiladi.
    if (
      total < 2 ||
      absX < SWIPE_NAV_THRESHOLD_PX ||
      absX <= absY * SWIPE_AXIS_DOMINANCE
    ) {
      return;
    }

    if (deltaX > 0) goPrev();
    else goNext();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDefaultClose
        className="!fixed !inset-0 !left-0 !top-0 !h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden border-0 bg-black p-0 text-white shadow-none sm:rounded-none"
      >
        <DialogTitle className="sr-only">
          {t('profile.photos.title', { defaultValue: 'Profil rasmlari' })}
        </DialogTitle>

        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-32 bg-gradient-to-b from-black/85 via-black/45 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-48 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

          <header className="absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] sm:px-6">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold tracking-[-0.01em] text-white sm:text-base">
                  {name || username || t('profile.user')}
                </p>
                {isCurrentMain ? (
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/75 backdrop-blur">
                    {t('profile.photos.main', { defaultValue: 'Asosiy' })}
                  </span>
                ) : null}
              </div>
              {total > 0 ? (
                <p className="mt-0.5 text-xs tabular-nums text-white/55">
                  {index + 1} / {total}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('common.close', { defaultValue: 'Yopish' })}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20 active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <main
            className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-0 pb-[calc(env(safe-area-inset-bottom)+104px)] pt-[calc(env(safe-area-inset-top)+72px)] sm:px-16 sm:pb-28 sm:pt-20"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={resetTouchGesture}
          >
            {isLoading && total === 0 ? (
              <Loader2 className="h-8 w-8 animate-spin text-white/65" />
            ) : current ? (
              <img
                key={current.id}
                src={current.image_url}
                alt={name || username || 'profile'}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 text-center text-white/60">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <ImagePlus className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-white/80">
                  {t('profile.photos.empty', { defaultValue: 'Profil rasmi yo‘q' })}
                </p>
              </div>
            )}

            {total > 1 ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label={t('common.previous', { defaultValue: 'Oldingi' })}
                  className="absolute left-5 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur-xl transition hover:bg-black/60 sm:flex"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label={t('common.next', { defaultValue: 'Keyingi' })}
                  className="absolute right-5 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur-xl transition hover:bg-black/60 sm:flex"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            ) : null}
          </main>

          <footer className="absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)] sm:px-6 sm:pb-6">
            {total > 1 ? (
              <div className="no-scrollbar flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-black/30 p-1.5 backdrop-blur-xl">
                {items.map((item, itemIndex) => (
                  <button
                    key={item.id}
                    ref={(element) => {
                      thumbnailRefs.current[itemIndex] = element;
                    }}
                    type="button"
                    onClick={() => setIndex(itemIndex)}
                    aria-label={`${itemIndex + 1}`}
                    aria-current={itemIndex === index ? 'true' : undefined}
                    className={cn(
                      'h-9 w-9 shrink-0 overflow-hidden rounded-full border transition sm:h-10 sm:w-10',
                      itemIndex === index
                        ? 'border-white opacity-100'
                        : 'border-transparent opacity-55 hover:opacity-85',
                    )}
                  >
                    <img
                      src={item.image_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}

            {confirmingDelete ? (
              <div className="flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-full border border-white/10 bg-black/70 p-1.5 pl-4 text-sm shadow-2xl backdrop-blur-xl">
                <span className="truncate text-white/80">
                  {t('profile.photos.deleteConfirm', { defaultValue: 'Rasm o‘chirilsinmi?' })}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="h-9 rounded-full px-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  {t('common.cancel', { defaultValue: 'Bekor qilish' })}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-red-500/90 px-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {t('common.delete', { defaultValue: "O'chirish" })}
                </button>
              </div>
            ) : null}

            <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-black/45 p-1.5 shadow-2xl backdrop-blur-2xl">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!current || isWorking}
                aria-label={t('common.download', { defaultValue: 'Yuklab olish' })}
                className={viewerActionClass}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t('common.download', { defaultValue: 'Yuklab olish' })}
                </span>
              </button>

              {isOwnProfile ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isWorking}
                    aria-label={t('profile.photos.add', { defaultValue: "Rasm qo'shish" })}
                    className={viewerActionClass}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">
                      {t('profile.photos.add', { defaultValue: "Rasm qo'shish" })}
                    </span>
                  </button>

                  {current && !current.synthetic && !isCurrentMain ? (
                    <button
                      type="button"
                      onClick={handleSetMain}
                      disabled={isWorking}
                      aria-label={t('profile.photos.setMain', { defaultValue: 'Asosiy qilish' })}
                      className={viewerActionClass}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Star className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">
                        {t('profile.photos.setMain', { defaultValue: 'Asosiy qilish' })}
                      </span>
                    </button>
                  ) : null}

                  {current && !current.synthetic ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isWorking}
                      aria-label={t('common.delete', { defaultValue: "O'chirish" })}
                      className={cn(viewerActionClass, 'text-red-300 hover:bg-red-500/15 hover:text-red-200')}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">
                        {t('common.delete', { defaultValue: "O'chirish" })}
                      </span>
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
