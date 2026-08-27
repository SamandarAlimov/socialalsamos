import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (open) {
      setIndex(0);
      setConfirmingDelete(false);
    }
  }, [open]);

  useEffect(() => {
    setConfirmingDelete(false);
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
        t('profile.photos.added', { defaultValue: "Yangi profil rasmi qo'shildi" })
      );
    } catch (error: any) {
      toast.error(
        error?.message || t('profile.photos.addFailed', { defaultValue: "Rasmni yuklab bo'lmadi" })
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
          t('profile.photos.mainFailed', { defaultValue: "Asosiy rasmni o'zgartirib bo'lmadi" })
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
          t('profile.photos.deleteFailed', { defaultValue: "Rasmni o'chirib bo'lmadi" })
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-none bg-black/95 p-0 text-white sm:rounded-2xl">
        <DialogTitle className="sr-only">
          {t('profile.photos.title', { defaultValue: 'Profil rasmlari' })}
        </DialogTitle>

        {/* Telegram uslubidagi segmentli indikator */}
        {total > 1 && (
          <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-3">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i === index ? 'bg-white' : 'bg-white/30 hover:bg-white/50'
                )}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col">
          {/* Sarlavha */}
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {name || username || t('profile.user')}
              </p>
              {total > 0 && (
                <p className="text-xs text-white/60">
                  {index + 1} / {total}
                  {index === 0 && total > 1 && (
                    <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      {t('profile.photos.main', { defaultValue: 'Asosiy' })}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Rasm */}
          <div
            className="relative flex min-h-[50vh] items-center justify-center overflow-hidden bg-black"
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              const startX = touchStartX.current;
              const endX = e.changedTouches[0]?.clientX ?? null;
              touchStartX.current = null;
              if (startX == null || endX == null) return;
              const delta = endX - startX;
              if (Math.abs(delta) < 48) return;
              if (delta > 0) goPrev();
              else goNext();
            }}
          >
            {isLoading && total === 0 ? (
              <Loader2 className="h-8 w-8 animate-spin text-white/70" />
            ) : current ? (
              <img
                key={current.id}
                src={current.image_url}
                alt={name || username || 'profile'}
                className="max-h-[70vh] w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-white/70">
                <ImagePlus className="h-10 w-10" />
                <p className="text-sm">
                  {t('profile.photos.empty', { defaultValue: 'Profil rasmi yo\u2018q' })}
                </p>
              </div>
            )}

            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label={t('common.previous', { defaultValue: 'Oldingi' })}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label={t('common.next', { defaultValue: 'Keyingi' })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Kichik rasmlar */}
          {total > 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 py-3">
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    'h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border-2 transition',
                    i === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                  )}
                >
                  <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Amallar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={!current}
              className="bg-white/10 text-white hover:bg-white/20"
            >
              <Download className="mr-2 h-4 w-4" />
              {t('common.download', { defaultValue: 'Yuklab olish' })}
            </Button>

            {isOwnProfile && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUpload}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="bg-white/10 text-white hover:bg-white/20"
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 h-4 w-4" />
                  )}
                  {t('profile.photos.add', { defaultValue: "Rasm qo'shish" })}
                </Button>

                {current && !current.synthetic && index !== 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSetMain}
                    disabled={busy}
                    className="bg-white/10 text-white hover:bg-white/20"
                  >
                    <Star className="mr-2 h-4 w-4" />
                    {t('profile.photos.setMain', { defaultValue: 'Asosiy qilish' })}
                  </Button>
                )}

                {current && !current.synthetic && (
                  <Button
                    variant={confirmingDelete ? 'destructive' : 'secondary'}
                    size="sm"
                    onClick={handleDelete}
                    disabled={busy}
                    className={cn(
                      'ml-auto',
                      !confirmingDelete && 'bg-white/10 text-white hover:bg-white/20'
                    )}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {confirmingDelete
                      ? t('common.confirm', { defaultValue: 'Tasdiqlash' })
                      : t('common.delete', { defaultValue: "O'chirish" })}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
