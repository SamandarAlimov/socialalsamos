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
  const previewRef = useRef<HTMLVideoElement>(null);

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
    const video = previewRef.current;
    if (!video) return;
    video.muted = muted;
    if (active && !dismissed) video.play().catch(() => undefined);
    else video.pause();
  }, [active, dismissed, muted]);

  if (dismissed) return null;

  const advertiser = ad.profile?.display_name || ad.profile?.username || ad.title;
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
    <div
      className={cn(
        'absolute left-3 right-3 z-[46] mx-auto max-w-[460px] overflow-hidden rounded-2xl border border-white/15 bg-black/78 text-white shadow-2xl backdrop-blur-2xl',
        'top-[calc(env(safe-area-inset-top,0px)+58px)] md:top-16',
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openAd}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10"
            aria-label={`${ad.title} reklamasini ochish`}
          >
            {ad.media_type === 'video' ? (
              <video
                ref={previewRef}
                src={ad.media_url}
                muted={muted}
                loop
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <img src={ad.media_url} alt="" className="h-full w-full object-cover" />
            )}
          </button>

          <Avatar className="hidden h-9 w-9 border border-white/15 bg-white/10 sm:flex">
            <AvatarImage src={ad.profile?.avatar_url || ''} />
            <AvatarFallback className="bg-white/10 text-xs font-semibold text-white">{initial}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">{advertiser}</p>
              <span className="rounded-full border border-white/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/70">
                Reklama
              </span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-white/65">{ad.description || ad.title}</p>
          </div>

          {ad.media_type === 'video' && (
            <button
              type="button"
              onClick={onMuteToggle}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/15 active:scale-95"
              aria-label={muted ? 'Reklama ovozini yoqish' : 'Reklama ovozini o‘chirish'}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/15 active:scale-95"
                aria-label="Reklama menyusi"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
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
              <DropdownMenuItem onClick={() => sendFeedback('report')} className="gap-2 text-destructive focus:text-destructive">
                <Flag className="h-4 w-4" />
                Shikoyat qilish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={dismissAd}
            className="h-9 rounded-xl px-3 text-xs font-medium text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            Yopish
          </button>
          <button
            type="button"
            onClick={openAd}
            className="ml-auto inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-black transition hover:bg-white/90 active:scale-[0.98]"
          >
            {ad.call_to_action || 'Batafsil'}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showWhy && (
        <div className="border-t border-white/10 bg-white/[0.04] px-3 py-3 text-[11px] leading-relaxed text-white/65">
          <span className="font-semibold text-white">Nega ko‘ryapsiz?</span>{' '}
          Kampaniya mosligi, sifat signallari va reklama charchog‘i birga hisoblanadi. Siz bergan feedback shu reklamani va o‘xshash takrorlarni kamaytiradi.
        </div>
      )}
    </div>
  );
}
