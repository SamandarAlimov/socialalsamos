import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ProfileQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export function ProfileQrDialog({
  open,
  onOpenChange,
  username,
  displayName,
  avatarUrl,
}: ProfileQrDialogProps) {
  const { t } = useTranslation();
  const qrWrapperRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handle = username || 'user';
  const profileUrl = useMemo(() => {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://social.alsamos.com';
    return `${origin}/user/${handle}`;
  }, [handle]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      toast.success(t('profile.qr.copied', { defaultValue: 'Havola nusxalandi' }));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('common.error', { defaultValue: 'Xatolik yuz berdi' }));
    }
  };

  const handleDownload = () => {
    const canvas = qrWrapperRef.current?.querySelector('canvas');
    if (!canvas) return;

    try {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `alsamos-${handle}-qr.png`;
      link.click();
      toast.success(t('profile.qr.downloaded', { defaultValue: 'QR kod yuklab olindi' }));
    } catch {
      toast.error(t('common.error', { defaultValue: 'Xatolik yuz berdi' }));
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: displayName || `@${handle}`,
      text: t('profile.qr.shareText', {
        defaultValue: 'Alsamos profilim: @{{handle}}',
        handle,
      }),
      url: profileUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or share unavailable, fall back to copy
      }
    }

    handleCopy();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('profile.qr.title', { defaultValue: 'QR kod' })}</DialogTitle>
          <DialogDescription>
            {t('profile.qr.description', {
              defaultValue: 'Bu QR kodni skanerlab profilingizga kirishadi.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            ref={qrWrapperRef}
            className="rounded-3xl bg-gradient-to-br from-primary/15 via-background to-primary/10 p-5 shadow-sm"
          >
            <div className="rounded-2xl bg-white p-4">
              <QRCodeCanvas
                value={profileUrl}
                size={208}
                level="H"
                marginSize={2}
                bgColor="#ffffff"
                fgColor="#111111"
                imageSettings={
                  avatarUrl
                    ? {
                        src: avatarUrl,
                        height: 44,
                        width: 44,
                        excavate: true,
                      }
                    : undefined
                }
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 text-center">
            <Avatar className="h-12 w-12">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback>
                {(displayName || username || 'U')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="font-semibold">{displayName || `@${handle}`}</p>
            <p className="text-xs text-muted-foreground break-all">{profileUrl}</p>
          </div>

          <div className="grid w-full grid-cols-3 gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="truncate">{t('common.copy', { defaultValue: 'Nusxalash' })}</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              <span className="truncate">{t('common.download', { defaultValue: 'Yuklab olish' })}</span>
            </Button>
            <Button size="sm" className="gap-1" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
              <span className="truncate">{t('common.share', { defaultValue: 'Ulashish' })}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
