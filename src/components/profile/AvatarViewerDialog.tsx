import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AvatarViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src?: string | null;
  name?: string | null;
  /** Optional file name used when downloading the picture. */
  downloadName?: string;
}

/** Full screen viewer for profile pictures (tap avatar -> see full photo). */
export function AvatarViewerDialog({
  open,
  onOpenChange,
  src,
  name,
  downloadName,
}: AvatarViewerDialogProps) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!open) setZoomed(false);
  }, [open]);

  const handleDownload = async () => {
    if (!src) return;
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${downloadName || name || 'profile'}.jpg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  if (!src) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-0 bg-black/95 p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">
          {t('profile.avatarViewer.title', {
            defaultValue: 'Profil rasmi',
          })}
        </DialogTitle>

        <div className="relative flex min-h-[60vh] items-center justify-center overflow-auto p-4">
          <img
            src={src}
            alt={name || t('profile.avatarViewer.title', { defaultValue: 'Profil rasmi' })}
            onClick={() => setZoomed((prev) => !prev)}
            className={cn(
              'max-h-[75vh] w-auto max-w-full cursor-zoom-in rounded-xl object-contain transition-transform duration-300',
              zoomed && 'scale-150 cursor-zoom-out',
            )}
          />

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-2 py-1 backdrop-blur">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-white hover:bg-white/15"
              aria-label={t('common.zoom', { defaultValue: 'Kattalashtirish' })}
              onClick={() => setZoomed((prev) => !prev)}
            >
              {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-white hover:bg-white/15"
              aria-label={t('common.download', { defaultValue: 'Yuklab olish' })}
              onClick={handleDownload}
            >
              <Download className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
