import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, EyeOff, Flag, MoreHorizontal, Repeat2, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Ad } from '@/hooks/useAds';
import type { AdFeedbackType } from '@/lib/adDeliveryClient';
import {
  canShowChannelAd,
  recordChannelAdImpression,
  snoozeChannelAds,
} from '@/lib/channelAdFrequencyPolicy';

interface Props {
  ad: Ad;
  onImpression: (adId: string) => void;
  onClick: (adId: string) => void;
  onFeedback: (adId: string, feedback: AdFeedbackType) => void;
}

export function ChannelSponsoredCard({ ad, onImpression, onClick, onFeedback }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackedRef = useRef(false);
  const [hidden, setHidden] = useState(false);
  const [eligible, setEligible] = useState(() => canShowChannelAd(ad.id));

  useEffect(() => {
    setHidden(false);
    trackedRef.current = false;
    setEligible(canShowChannelAd(ad.id));
  }, [ad.id]);

  useEffect(() => {
    if (eligible || hidden) return;
    const timer = window.setInterval(() => {
      if (canShowChannelAd(ad.id)) setEligible(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [ad.id, eligible, hidden]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !eligible || hidden) return;

    let timer: number | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6 && !trackedRef.current) {
          timer = window.setTimeout(() => {
            trackedRef.current = true;
            recordChannelAdImpression(ad.id);
            onImpression(ad.id);
          }, 1000);
        } else if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.6, 0.85] },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [ad.id, eligible, hidden, onImpression]);

  if (!eligible || hidden) return null;

  const advertiser = ad.profile?.display_name || ad.profile?.username || ad.title;
  const initial = advertiser.trim().slice(0, 1).toUpperCase() || 'A';

  const openAd = () => {
    onClick(ad.id);
    if (ad.destination_url) window.open(ad.destination_url, '_blank', 'noopener,noreferrer');
  };

  const feedback = (type: AdFeedbackType) => {
    setHidden(true);
    snoozeChannelAds();
    onFeedback(ad.id, type);
  };

  return (
    <article
      ref={rootRef}
      className="my-3 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
      aria-label="Homiylik kontenti"
    >
      <div className="flex items-start gap-3 p-4">
        <Avatar className="h-11 w-11 border border-border bg-muted">
          <AvatarImage src={ad.profile?.avatar_url || ''} />
          <AvatarFallback className="text-sm font-semibold">{initial}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{advertiser}</p>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Reklama
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {ad.description || ad.title}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Reklama menyusi"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuItem onClick={() => feedback('not_relevant')} className="gap-2">
              <EyeOff className="h-4 w-4" />
              Menga mos emas
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => feedback('seen_too_often')} className="gap-2">
              <Repeat2 className="h-4 w-4" />
              Juda ko‘p ko‘ryapman
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => feedback('hide')} className="gap-2">
              <X className="h-4 w-4" />
              Yashirish
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => feedback('report')} className="gap-2 text-destructive focus:text-destructive">
              <Flag className="h-4 w-4" />
              Shikoyat qilish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        onClick={openAd}
        className="flex w-full items-center justify-between border-t border-border/60 px-4 py-3 text-left transition hover:bg-muted/35"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{ad.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Public kanal joylashuvi</span>
        </span>
        <span className="ml-3 inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold">
          {ad.call_to_action || 'Batafsil'}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </button>
    </article>
  );
}
