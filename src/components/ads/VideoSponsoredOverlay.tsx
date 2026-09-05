import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  EyeOff,
  Flag,
  Info,
  MoreHorizontal,
  Repeat2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Ad } from '@/hooks/useAds';
import type { AdFeedbackType } from '@/lib/adDeliveryClient';

interface VideoSponsoredOverlayProps {
  ad: Ad;
  active: boolean;
  muted: boolean;
  onMuteToggle: () => void;
  onImpression: (adId: string) => void;
  onClick: (adId: string) => void;
  onDismiss?: () => void;
  onFeedback?: (adId: string, feedback: AdFeedbackType) => void;
  className?: string;
}

export function VideoSponsoredOverlay({
  ad,
  active,
  muted,
  onMuteToggle,
  onImpression,
  onClick,
  onDismiss,
  onFeedback,
  className,
}: VideoSponsoredOverlayProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const trackedRef = useRef(false);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || dismissed || trackedRef.current) return;
    const timer = window.setTimeout(() => {
      trackedRef.current = true;
      onImpression(ad.id);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [active, ad.id, dismissed, onImpression]);

  useEffect(() => {
    setDismissed(false);
    setShowWhy(false);
    trackedRef.current = false;
  }, [ad.id]);

  useEffect(() => {
    const video = mediaRef.current;
    if (!video) return;
    video.muted = muted;
    if (active && !dismissed) video.play().catch(() => undefined);
    else video.pause();
  }, [active, dismissed, muted]);

  if (dismissed) return null;

  const advertiser = ad.profile?.display_name || ad.profile?.username || ad.title;
  const username = ad.profile?.username ? `@${ad.profile.username}` : 'Alsamos Ads';
  const initial = advertiser.trim().charAt(0).toUpperCase() || 'A';

  const openAd = () => {
    onClick(ad.id);
    if (ad.destination_url) {
      window.open(ad.destination_url, '_blank', 'noopener,noreferrer');
    }
  };

  const dismissAd = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const sendFeedback = (feedback: AdFeedbackType) => {
    setDismissed(true);
    onFeedback?.(ad.id, feedback);
  };

  return (
    <section
      className={cn(
        'absolute inset-0 z-[46] overflow-hidden bg-black text-white',
        className,
      )}
      aria-label={`${advertiser} reklamasi`}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => {
        touchStartYRef.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartYRef.current;
        touchStartYRef.current = null;
        const end = event.changedTouches[0]?.clientY;
        if (start == null || end == null) return;
        // A decisive vertical swipe dismisses the sponsored reel instead of
        // trapping the user. The underlying native video feed keeps ownership
        // of ordinary scrolling after the ad leaves the viewport.
        if (Math.abs(end - start) >= 72) dismissAd();
      }}
    >
      <button
        type="button"
        onClick={openAd}
        className="absolute inset-0 block h-full w-full bg-black text-left"
        aria-label={`${ad.title} reklamasini ochish`}
      >
        {ad.media_type === 'video' ? (
          <video
            ref={mediaRef}
            src={ad.media_url}
            muted={muted}
            loop
            playsInline
            preload="auto"
            className="h-full w-full object-contain"
          />
        ) : (
          <img
            src={ad.media_url}
            alt={ad.title}
            className="h-full w-full object-contain"
            loading="eager"
          />
        )}
      </button>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/80" />

      <div className="absolute left-3 top-[max(12px,env(safe-area-inset-top))] z-20 flex items-center gap-2">
        <span className="rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md">
          Reklama
        </span>
        <span className="rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-medium text-white/70 backdrop-blur-md">
          Homiylik kontenti
        </span>
      </div>

      <div className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] z-30 flex flex-col gap-2">
        {ad.media_type === 'video' && (
          <button
            type="button"
            onClick={onMuteToggle}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/65 active:scale-90"
            aria-label={muted ? 'Reklama ovozini yoqish' : 'Reklama ovozini o‘chirish'}
          >
            {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/65 active:scale-90"
              aria-label="Reklama menyusi"
            >
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded-xl">
            <DropdownMenuItem onClick={() => setShowWhy((value) => !value)} className="gap-2">
              <Info className="h-4 w-4" />
              Nega bu reklama?
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => sendFeedback('not_relevant')} className="gap-2">
              <EyeOff className="h-4 w-4" />
              Menga mos emas
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => sendFeedback('seen_too_often')} className="gap-2">
              <Repeat2 className="h-4 w-4" />
              Juda ko‘p ko‘ryapman
            </DropdownMenuItem>
            <DropdownMenuItem onClick={dismissAd} className="gap-2">
              <X className="h-4 w-4" />
              O‘tkazib yuborish
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => sendFeedback('report')} className="gap-2 text-destructive focus:text-destructive">
              <Flag className="h-4 w-4" />
              Shikoyat qilish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-20 px-4 pb-3 sm:px-5">
        {showWhy && (
          <div className="mb-3 rounded-2xl border border-white/15 bg-black/55 p-3 text-[11px] leading-relaxed text-white/75 backdrop-blur-xl">
            <span className="font-semibold text-white">Nega bu reklama?</span>{' '}
            Alsamos kampaniya mosligi, foydalanuvchi qiziqishlari, sifat signallari va reklama charchog‘ini birga hisoblaydi. Siz bergan feedback keyingi reklamalarni kamaytirish yoki yaxshilash uchun ishlatiladi.
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-10 w-10 border border-white/20 bg-white/10">
                <AvatarImage src={ad.profile?.avatar_url || ''} />
                <AvatarFallback className="bg-white/10 text-sm font-semibold text-white">{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold drop-shadow">{advertiser}</p>
                <p className="truncate text-xs text-white/65">{username} · Reklama</p>
              </div>
            </div>

            <h2 className="mt-3 line-clamp-2 text-base font-semibold leading-snug drop-shadow sm:text-lg">
              {ad.title}
            </h2>
            {ad.description && (
              <p className="mt-1 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/75 drop-shadow">
                {ad.description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={dismissAd}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/65 active:scale-90"
            aria-label="Reklamani o‘tkazib yuborish"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <button
          type="button"
          onClick={openAd}
          className="mt-4 flex h-11 w-full items-center justify-between rounded-xl bg-white px-4 text-sm font-semibold text-black shadow-xl transition hover:bg-white/92 active:scale-[0.995]"
        >
          <span>{ad.call_to_action || 'Batafsil'}</span>
          <ArrowUpRight className="h-4 w-4" />
        </button>

        <p className="mt-2 text-center text-[10px] text-white/45">
          Yuqoriga surish yoki × bosish orqali darhol o‘tkazib yuborish mumkin
        </p>
      </div>
    </section>
  );
}
