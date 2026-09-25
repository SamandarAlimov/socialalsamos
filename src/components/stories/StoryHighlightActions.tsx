import { useRef, useState } from 'react';
import {
  Copy,
  Pencil,
  QrCode,
  Send,
  Trash2,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import type { StoryHighlight } from '@/hooks/useStoryHighlights';

interface StoryHighlightActionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlight: StoryHighlight | null;
  username: string | null;
  onEdit: (highlight: StoryHighlight) => void;
  onDelete: (highlight: StoryHighlight) => void;
}

export function StoryHighlightActions({
  open,
  onOpenChange,
  highlight,
  username,
  onEdit,
  onDelete,
}: StoryHighlightActionsProps) {
  const [qrOpen, setQrOpen] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  if (!highlight) return null;

  const publicPath = username ? `/user/${encodeURIComponent(username)}` : '/profile';
  const shareUrl = `${window.location.origin}${publicPath}?highlight=${encodeURIComponent(highlight.id)}`;

  const shareHighlight = async () => {
    onOpenChange(false);
    try {
      if (navigator.share) {
        await navigator.share({ title: highlight.name, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Tanlangan havolasi nusxalandi');
      }
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        console.error('Highlight share error:', error);
        toast.error('Ulashib bo‘lmadi');
      }
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Tanlangan havolasi nusxalandi');
      onOpenChange(false);
    } catch (error) {
      console.error('Highlight link copy error:', error);
      toast.error('Havolani nusxalab bo‘lmadi');
    }
  };

  const saveQr = async () => {
    const canvas = qrWrapRef.current?.querySelector('canvas');
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    try {
      const file = new File([blob], `${highlight.name || 'tanlangan'}-qr.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${highlight.name} QR` });
        return;
      }
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${highlight.name || 'tanlangan'}-qr.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success('QR kod saqlandi');
  };

  const actionClass =
    'flex min-h-14 w-full items-center gap-3 border-b border-border/60 px-5 text-left text-[15px] font-medium transition last:border-b-0 hover:bg-muted/50';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          hideDefaultClose
          className="left-1/2 right-auto w-[calc(100%-20px)] max-w-lg -translate-x-1/2 rounded-t-[28px] border-x border-t border-border/70 p-0 pb-[max(10px,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">Tanlangan amallari</SheetTitle>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
          <div className="mt-2 overflow-hidden rounded-[22px] bg-background">
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                onOpenChange(false);
                onEdit(highlight);
              }}
            >
              <Pencil className="h-5 w-5" />
              Tanlanganni tahrirlash
            </button>
            <button type="button" className={actionClass} onClick={() => void shareHighlight()}>
              <Send className="h-5 w-5" />
              Jo‘natish
            </button>
            <button type="button" className={actionClass} onClick={() => void copyLink()}>
              <Copy className="h-5 w-5" />
              Tanlangan havolasini nusxalash
            </button>
            <button
              type="button"
              className={actionClass}
              onClick={() => setQrOpen(true)}
            >
              <QrCode className="h-5 w-5" />
              QR kod
            </button>
            <button
              type="button"
              className={`${actionClass} text-destructive`}
              onClick={() => {
                onOpenChange(false);
                onDelete(highlight);
              }}
            >
              <Trash2 className="h-5 w-5" />
              Tanlanganni o‘chirish
            </button>
          </div>
          <SheetClose asChild>
            <button
              type="button"
              className="mx-3 mt-3 h-12 w-[calc(100%-24px)] rounded-2xl bg-muted text-sm font-semibold"
            >
              Bekor qilish
            </button>
          </SheetClose>
        </SheetContent>
      </Sheet>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="w-[calc(100vw-28px)] max-w-sm rounded-[30px] p-0" hideDefaultClose>
          <DialogHeader className="px-5 pb-0 pt-5 text-center">
            <DialogTitle className="text-lg font-semibold">Tanlangan QR kodi</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-5 pt-4 text-center">
            <div
              ref={qrWrapRef}
              className="mx-auto flex w-fit items-center justify-center rounded-[28px] bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-600 p-[4px] shadow-lg"
            >
              <div className="rounded-[24px] bg-white p-5">
                <QRCodeCanvas
                  value={shareUrl}
                  size={220}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#111111"
                  marginSize={1}
                />
              </div>
            </div>
            <p className="mt-4 text-base font-semibold">{highlight.name}</p>
            {username ? <p className="mt-1 text-xs text-muted-foreground">@{username}</p> : null}
            <p className="mx-auto mt-3 max-w-[280px] text-sm leading-relaxed text-muted-foreground">
              QR kodni skaner qilib ushbu Tanlanganni to‘g‘ridan-to‘g‘ri ochish mumkin.
            </p>
          </div>
          <div className="border-t border-border/70 p-3">
            <button
              type="button"
              onClick={() => void saveQr()}
              className="h-12 w-full rounded-2xl bg-foreground text-sm font-semibold text-background"
            >
              Qurilmaga saqlash
            </button>
            <button
              type="button"
              onClick={() => setQrOpen(false)}
              className="mt-2 h-11 w-full rounded-2xl text-sm font-semibold"
            >
              Tayyor
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
