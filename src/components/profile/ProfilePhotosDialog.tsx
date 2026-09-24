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
type GestureAxis = 'pending' | 'vertical' | 'horizontal';

type PointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  axis: GestureAxis;
};

const viewerActionClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 text-sm font-medium text-white backdrop-blur-xl transition hover:bg-white/15 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 sm:px-4';

const GESTURE_START_THRESHOLD_PX = 8;
const GESTURE_AXIS_DOMINANCE = 1.08;
const SWIPE_NAV_THRESHOLD_PX = 48;
const DRAG_DISMISS_DISTANCE_PX = 120;
const DRAG_DISMISS_MIN_DISTANCE_PX = 44;
const DRAG_DISMISS_VELOCITY_PX_MS = 0.65;
const DRAG_PROGRESS_DISTANCE_PX = 320;
const DRAG_MAX_SCALE_REDUCTION = 0.14;
const DISMISS_ANIMATION_MS = 240;

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
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const gestureRef = useRef<PointerGesture | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
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
  const dragProgress = Math.min(Math.abs(dragY) / DRAG_PROGRESS_DISTANCE_PX, 1);
  const dragScale = 1 - dragProgress * DRAG_MAX_SCALE_REDUCTION;
  const chromeOpacity = Math.max(0.12, 1 - dragProgress * 1.15);
  const overlayOpacity = Math.max(0.2, 0.88 - dragProgress * 0.62);
  const surfaceOpacity = Math.max(0.08, 1 - dragProgress * 0.86);

  useEffect(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    gestureRef.current = null;
    setDragY(0);
    setIsDragging(false);
    setIsDismissing(false);

    if (open) {
      setIndex(0);
      setConfirmingDelete(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

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

  const springBack = () => {
    gestureRef.current = null;
    setIsDragging(false);
    setIsDismissing(false);
    setDragY(0);
  };

  const animateDismiss = (direction: number) => {
    const viewportHeight = Math.max(window.innerHeight || 0, 720);
    gestureRef.current = null;
    setIsDragging(false);
    setIsDismissing(true);
    setDragY(direction * viewportHeight * 1.08);

    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      onOpenChange(false);
    }, DISMISS_ANIMATION_MS);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (isDismissing || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if ((event.target as Element | null)?.closest('[data-photo-viewer-control]')) return;

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      axis: 'pending',
    };
    setIsDragging(false);
    setDragY(0);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; the gesture still works without it.
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || isDismissing) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (gesture.axis === 'pending') {
      if (Math.max(absX, absY) < GESTURE_START_THRESHOLD_PX) return;

      if (absY > absX * GESTURE_AXIS_DOMINANCE) {
        gesture.axis = 'vertical';
        setIsDragging(true);
      } else if (absX > absY * GESTURE_AXIS_DOMINANCE) {
        gesture.axis = 'horizontal';
      } else {
        return;
      }
    }

    if (gesture.axis === 'vertical') {
      event.preventDefault();
      setDragY(deltaY);
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const elapsedMs = Math.max(performance.now() - gesture.startedAt, 1);
    const verticalVelocity = Math.abs(deltaY) / elapsedMs;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore browsers that do not expose pointer capture consistently.
    }

    if (
      gesture.axis === 'vertical' ||
      (gesture.axis === 'pending' && absY > absX * GESTURE_AXIS_DOMINANCE)
    ) {
      const shouldDismiss =
        absY >= DRAG_DISMISS_DISTANCE_PX ||
        (absY >= DRAG_DISMISS_MIN_DISTANCE_PX &&
          verticalVelocity >= DRAG_DISMISS_VELOCITY_PX_MS);

      if (shouldDismiss) {
        animateDismiss(deltaY < 0 ? -1 : 1);
      } else {
        springBack();
      }
      return;
    }

    gestureRef.current = null;
    setIsDragging(false);

    if (
      gesture.axis === 'horizontal' &&
      total > 1 &&
      absX >= SWIPE_NAV_THRESHOLD_PX &&
      absX > absY * GESTURE_AXIS_DOMINANCE
    ) {
      if (deltaX > 0) goPrev();
      else goNext();
    }
  };

  const handlePointerCancel = () => {
    if (!gestureRef.current) return;
    springBack();
  };

  const mediaTransition = isDragging
    ? 'none'
    : isDismissing
      ? `transform ${DISMISS_ANIMATION_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${DISMISS_ANIMATION_MS}ms ease`
      : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease';
  const chromeTransition = isDragging
    ? 'none'
    : isDismissing
      ? `opacity ${DISMISS_ANIMATION_MS}ms ease`
      : 'opacity 220ms ease';
  const backdropTransition = isDragging
    ? 'none'
    : isDismissing
      ? `background-color ${DISMISS_ANIMATION_MS}ms ease`
      : 'background-color 260ms ease';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDefaultClose
        overlayClassName="!bg-transparent"
        overlayStyle={{
          backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
          transition: backdropTransition,
        }}
        style={{
          backgroundColor: `rgba(0, 0, 0, ${surfaceOpacity})`,
          transition: backdropTransition,
        }}
        className="!fixed !inset-0 !left-0 !top-0 !h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden border-0 bg-transparent p-0 text-white shadow-none sm:rounded-none"
      >
        <DialogTitle className="sr-only">
          {t('profile.photos.title', { defaultValue: 'Profil rasmlari' })}
        </DialogTitle>

        <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-32 bg-gradient-to-b from-black/85 via-black/45 to-transparent"
            style={{ opacity: chromeOpacity, transition: chromeTransition }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-48 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
            style={{ opacity: chromeOpacity, transition: chromeTransition }}
          />

          <header
            className="absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] sm:px-6"
            style={{ opacity: chromeOpacity, transition: chromeTransition }}
          >
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
              data-photo-viewer-control
              onClick={() => onOpenChange(false)}
              aria-label={t('common.close', { defaultValue: 'Yopish' })}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/20 active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <main
            className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-0 pb-[calc(env(safe-area-inset-bottom)+104px)] pt-[calc(env(safe-area-inset-top)+72px)] sm:px-16 sm:pb-28 sm:pt-20"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerCancel}
          >
            <div
              className="relative flex h-full w-full items-center justify-center will-change-transform"
              style={{
                transform: `translate3d(0, ${dragY}px, 0) scale(${dragScale})`,
                opacity: 1 - dragProgress * 0.08,
                transition: mediaTransition,
              }}
            >
              {isLoading && total === 0 ? (
                <Loader2 className="h-8 w-8 animate-spin text-white/65" />
              ) : current ? (
                <img
                  key={current.id}
                  src={current.image_url}
                  alt={name || username || 'profile'}
                  draggable={false}
                  className="pointer-events-none max-h-full max-w-full select-none object-contain"
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
            </div>

            {total > 1 ? (
              <>
                <button
                  type="button"
                  data-photo-viewer-control
                  onClick={goPrev}
                  aria-label={t('common.previous', { defaultValue: 'Oldingi' })}
                  className="absolute left-5 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur-xl transition hover:bg-black/60 sm:flex"
                  style={{ opacity: chromeOpacity, transition: chromeTransition }}
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  data-photo-viewer-control
                  onClick={goNext}
                  aria-label={t('common.next', { defaultValue: 'Keyingi' })}
                  className="absolute right-5 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur-xl transition hover:bg-black/60 sm:flex"
                  style={{ opacity: chromeOpacity, transition: chromeTransition }}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            ) : null}
          </main>

          <footer
            className="absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)] sm:px-6 sm:pb-6"
            style={{ opacity: chromeOpacity, transition: chromeTransition }}
          >
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
