import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Ad } from '@/hooks/useAds';

interface VideoSponsoredOverlayProps {
  ad: Ad;
  active: boolean;
  muted: boolean;
  onMuteToggle: () => void;
  onImpression: (adId: string) => void;
  onClick: (adId: string) => void;
  className?: string;
}

export function VideoSponsoredOverlay({
  ad,
  active,
  muted,
  onMuteToggle,
  onImpression,
  onClick,
  className,
}: VideoSponsoredOverlayProps) {
  const [dismissed, setDismissed] = useState(false);
  const trackedRef = useRef(false);
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!active || dismissed || trackedRef.current) return;
    const timer = window.setTimeout(() => {
      trackedRef.current = true;
      onImpression(ad.id);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [active, ad.id, dismissed, onImpression]);

  useEffect(() => {
    setDismissed(false);
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

  const openAd = () => {
    onClick(ad.id);
    if (ad.destination_url) {
      window.open(ad.destination_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className={cn(
        'absolute left-3 right-3 z-[46] mx-auto max-w-[440px] rounded-2xl border border-white/15 bg-black/72 p-3 text-white shadow-2xl backdrop-blur-xl',
        'top-[calc(env(safe-area-inset-top,0px)+58px)] md:top-16',
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
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
          <span className="absolute inset-x-1 bottom-1 rounded bg-black/65 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wide text-white">
            Reklama
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{advertiser}</p>
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
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => setDismissed(true)}
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
  );
}
