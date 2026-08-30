import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Phone, Video, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CallPreflightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerName: string;
  peerAvatar?: string;
  initialType: 'audio' | 'video';
  onStart: (type: 'audio' | 'video') => Promise<void> | void;
}

export function CallPreflightDialog({
  open,
  onOpenChange,
  peerName,
  peerAvatar,
  initialType,
  onStart,
}: CallPreflightDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [starting, setStarting] = useState<'audio' | 'video' | null>(null);

  const stopPreview = useCallback(() => {
    previewStreamRef.current?.getTracks().forEach((track) => track.stop());
    previewStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewing(false);
  }, []);

  const startPreview = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPreviewError('Kamera bu qurilmada qo‘llanmaydi');
      return;
    }

    setPreviewError(null);
    try {
      stopPreview();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user',
        },
        audio: false,
      });
      previewStreamRef.current = stream;
      setPreviewing(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (error) {
      const name = (error as DOMException | null)?.name;
      setPreviewError(
        name === 'NotAllowedError'
          ? 'Kameraga ruxsat berilmadi'
          : name === 'NotFoundError'
            ? 'Kamera topilmadi'
            : 'Kamerani ishga tushirib bo‘lmadi'
      );
    }
  }, [stopPreview]);

  useEffect(() => {
    if (!open) {
      stopPreview();
      setPreviewError(null);
      setStarting(null);
      return;
    }

    if (initialType === 'video') void startPreview();
    return stopPreview;
  }, [initialType, open, startPreview, stopPreview]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = previewStreamRef.current;
    if (video && stream && video.srcObject !== stream) video.srcObject = stream;
  }, [previewing]);

  const begin = async (type: 'audio' | 'video') => {
    if (starting) return;
    setStarting(type);

    // Release the preview before WebRTC acquires the production stream. This
    // avoids NotReadableError on cameras that allow only one active capture.
    stopPreview();
    try {
      await onStart(type);
      onOpenChange(false);
    } finally {
      setStarting(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopPreview();
        onOpenChange(next);
      }}
    >
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden rounded-[30px] border-white/10 bg-[#11161d]/98 p-0 text-white shadow-2xl backdrop-blur-2xl">
        <div className="sr-only">
          <DialogTitle>Qo‘ng‘iroqni boshlash</DialogTitle>
          <DialogDescription>Kamera va qo‘ng‘iroq turini tanlang.</DialogDescription>
        </div>

        <div className="relative aspect-[16/10] min-h-[320px] overflow-hidden bg-[#0a0d11] sm:min-h-[430px]">
          {previewing ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full scale-x-[-1] object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(74,144,226,0.18),transparent_42%),linear-gradient(180deg,#171d24,#0a0d11)] px-6 text-center">
              <Avatar className="h-28 w-28 border-2 border-white/10 shadow-2xl sm:h-32 sm:w-32">
                <AvatarImage src={peerAvatar} />
                <AvatarFallback className="bg-white/10 text-3xl font-semibold text-white">
                  {peerName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h2 className="mt-5 max-w-[90%] truncate text-2xl font-semibold">{peerName}</h2>
              <p className="mt-1 text-sm text-white/45">Qo‘ng‘iroqqa tayyor</p>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent p-4 pb-10">
            <div>
              <p className="text-sm font-semibold">{peerName}</p>
              <p className="text-xs text-white/50">
                {previewing ? 'Kamera ko‘rinishi' : 'Kamera o‘chiq'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white/80 backdrop-blur transition hover:bg-white/15 hover:text-white"
              aria-label="Bekor qilish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {previewError && (
            <div className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-red-500/15 px-4 py-2 text-xs text-red-100 backdrop-blur">
              {previewError}
            </div>
          )}

          <button
            type="button"
            onClick={() => (previewing ? stopPreview() : void startPreview())}
            className={cn(
              'absolute bottom-4 left-4 flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium backdrop-blur-xl transition',
              previewing
                ? 'border-white/20 bg-white text-neutral-950'
                : 'border-white/10 bg-black/35 text-white hover:bg-white/15'
            )}
          >
            <Camera className="h-4 w-4" />
            {previewing ? 'Kamerani o‘chirish' : 'Kamerani tekshirish'}
          </button>
        </div>

        <div className="flex items-center justify-center gap-5 border-t border-white/10 px-4 py-5">
          <button
            type="button"
            disabled={Boolean(starting)}
            onClick={() => void begin('video')}
            className="group flex w-24 flex-col items-center gap-2 disabled:opacity-50"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition group-hover:bg-emerald-400 group-active:scale-95">
              <Video className="h-6 w-6" />
            </span>
            <span className="text-xs text-white/65">
              {starting === 'video' ? 'Boshlanmoqda...' : 'Video'}
            </span>
          </button>

          <button
            type="button"
            disabled={Boolean(starting)}
            onClick={() => onOpenChange(false)}
            className="group flex w-24 flex-col items-center gap-2 disabled:opacity-50"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-neutral-950 shadow-lg transition group-hover:bg-white/90 group-active:scale-95">
              <X className="h-6 w-6" />
            </span>
            <span className="text-xs text-white/65">Bekor qilish</span>
          </button>

          <button
            type="button"
            disabled={Boolean(starting)}
            onClick={() => void begin('audio')}
            className="group flex w-24 flex-col items-center gap-2 disabled:opacity-50"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition group-hover:bg-emerald-400 group-active:scale-95">
              <Phone className="h-6 w-6" />
            </span>
            <span className="text-xs text-white/65">
              {starting === 'audio' ? 'Boshlanmoqda...' : 'Audio'}
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
