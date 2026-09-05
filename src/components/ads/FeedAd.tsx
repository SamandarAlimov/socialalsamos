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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Ad } from '@/hooks/useAds';
import { recordAdFeedbackLocal, type AdFeedbackType } from '@/lib/adDeliveryClient';
import {
  recordDiscoverAdImpression,
  recordFeedAdImpression,
  registerDiscoverAdOpportunity,
  registerFeedAdOpportunity,
  snoozeDiscoverAds,
  snoozeFeedAds,
} from '@/lib/adFrequencyPolicy';

interface FeedAdProps {
  ad: Ad;
  onImpression: (adId: string) => void;
  onClick: (adId: string) => void;
  onFeedback?: (adId: string, feedback: AdFeedbackType) => void;
  variant?: 'feed' | 'discover';
  className?: string;
}

export function FeedAd({
  ad,
  onImpression,
  onClick,
  onFeedback,
  variant = 'feed',
  className,
}: FeedAdProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [frequencySuppressed, setFrequencySuppressed] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const impressionTimerRef = useRef<number | null>(null);
  const hasTrackedImpression = useRef(false);
  const hasCheckedOpportunity = useRef(false);

  useEffect(() => {
    hasTrackedImpression.current = false;
    hasCheckedOpportunity.current = false;
    setDismissed(false);
    setFrequencySuppressed(false);
    setShowWhy(false);
  }, [ad.id]);

  useEffect(() => {
    if (!frequencySuppressed || variant !== 'discover' || dismissed) return;
    const timer = window.setTimeout(() => {
      hasCheckedOpportunity.current = false;
      setFrequencySuppressed(false);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [dismissed, frequencySuppressed, variant]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || dismissed || frequencySuppressed) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!hasCheckedOpportunity.current) {
            hasCheckedOpportunity.current = true;
            const allowed = variant === 'discover'
              ? registerDiscoverAdOpportunity(ad.id)
              : registerFeedAdOpportunity(ad.id);

            if (!allowed) {
              setFrequencySuppressed(true);
              videoRef.current?.pause();
              return;
            }
          }

          if (!hasTrackedImpression.current && impressionTimerRef.current === null) {
            impressionTimerRef.current = window.setTimeout(() => {
              hasTrackedImpression.current = true;
              impressionTimerRef.current = null;
              if (variant === 'discover') recordDiscoverAdImpression(ad.id);
              else recordFeedAdImpression(ad.id);
              onImpression(ad.id);
            }, variant === 'discover' ? 1000 : 800);
          }

          if (videoRef.current) videoRef.current.play().catch(() => undefined);
        } else {
          if (impressionTimerRef.current !== null) {
            window.clearTimeout(impressionTimerRef.current);
            impressionTimerRef.current = null;
          }
          videoRef.current?.pause();
        }
      },
      { threshold: [0, 0.5, 0.75] },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (impressionTimerRef.current !== null) {
        window.clearTimeout(impressionTimerRef.current);
        impressionTimerRef.current = null;
      }
    };
  }, [ad.id, dismissed, frequencySuppressed, onImpression, variant]);

  const openAd = () => {
    onClick(ad.id);
    if (ad.destination_url) window.open(ad.destination_url, '_blank', 'noopener,noreferrer');
  };

  const applyFeedback = (feedback: AdFeedbackType) => {
    recordAdFeedbackLocal(ad.id, feedback);
    setDismissed(true);
    if (variant === 'discover') snoozeDiscoverAds();
    else snoozeFeedAds();
    onFeedback?.(ad.id, feedback);
  };

  const hideAd = () => applyFeedback('hide');

  if (dismissed || frequencySuppressed) return null;

  const advertiser = ad.profile?.display_name || ad.profile?.username || ad.title;
  const handle = ad.profile?.username ? `@${ad.profile.username}` : 'Alsamos Ads';
  const initial = advertiser.trim().charAt(0).toUpperCase() || 'A';
  const isDiscover = variant === 'discover';

  const feedbackMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Reklama menyusi">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuItem onClick={() => setShowWhy((value) => !value)} className="gap-2">
          <Info className="h-4 w-4" />
          Nega bu reklama?
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => applyFeedback('not_relevant')} className="gap-2">
          <EyeOff className="h-4 w-4" />
          Menga mos emas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => applyFeedback('seen_too_often')} className="gap-2">
          <Repeat2 className="h-4 w-4" />
          Juda ko‘p ko‘ryapman
        </DropdownMenuItem>
        <DropdownMenuItem onClick={hideAd} className="gap-2">
          <X className="h-4 w-4" />
          Reklamani yashirish
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => applyFeedback('report')} className="gap-2 text-destructive focus:text-destructive">
          <Flag className="h-4 w-4" />
          Reklamani shikoyat qilish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const whyPanel = showWhy ? (
    <div className="border-t border-border/60 bg-muted/25 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
      <span className="font-semibold text-foreground">Nega ko‘ryapsiz?</span>{' '}
      Alsamos reklama yetkazib berish tizimi kampaniya mosligi, kontent sifati va reklama charchog‘ini birga hisoblaydi. Menyu orqali bergan fikringiz keyingi reklamalarni kamaytirish yoki yaxshilashga ishlatiladi.
    </div>
  ) : null;

  if (isDiscover) {
    return (
      <article ref={containerRef} className={cn('overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm', className)}>
        <div className="flex gap-4 p-4 sm:p-5">
          <button type="button" onClick={openAd} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-28 sm:w-28" aria-label={`${ad.title} reklamasini ochish`}>
            {ad.media_type === 'video' ? (
              <video ref={videoRef} src={ad.media_url} className="h-full w-full object-cover" muted loop playsInline preload="metadata" />
            ) : (
              <img src={ad.media_url} alt={ad.title} className="h-full w-full object-cover" loading="lazy" />
            )}
            <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white backdrop-blur">Reklama</span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{advertiser}</p>
                <p className="truncate text-xs text-muted-foreground">{handle} · Homiylik kontenti</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {feedbackMenu}
                <button type="button" onClick={hideAd} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Reklamani yashirish">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug">{ad.title}</h3>
            {ad.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{ad.description}</p>}
            <button type="button" onClick={openAd} className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-foreground px-4 text-xs font-semibold text-background transition hover:opacity-90 active:scale-[0.98]">
              {ad.call_to_action || 'Batafsil'}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {whyPanel}
      </article>
    );
  }

  return (
    <article ref={containerRef} className={cn('overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm', className)}>
      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
        <Avatar className="h-10 w-10 border border-border bg-muted">
          <AvatarImage src={ad.profile?.avatar_url || ''} />
          <AvatarFallback className="text-sm font-semibold">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{advertiser}</p>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Reklama</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{handle}</p>
        </div>
        {feedbackMenu}
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground" onClick={hideAd} aria-label="Reklamani yashirish">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {whyPanel}

      <button type="button" onClick={openAd} className="relative block aspect-[4/3] w-full overflow-hidden bg-neutral-950 text-left sm:aspect-video" aria-label={`${ad.title} reklamasini ochish`}>
        {ad.media_type === 'video' ? (
          <video ref={videoRef} src={ad.media_url} className="h-full w-full object-cover" loop muted={isMuted} playsInline preload="metadata" />
        ) : (
          <img src={ad.media_url} alt={ad.title} className="h-full w-full object-cover" loading="lazy" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
        {ad.media_type === 'video' && (
          <button type="button" className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-black/80" onClick={(event) => { event.stopPropagation(); setIsMuted((value) => !value); }} aria-label={isMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}>
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </button>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <div>
          <h3 className="text-base font-semibold leading-snug sm:text-lg">{ad.title}</h3>
          {ad.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{ad.description}</p>}
        </div>
        <button type="button" onClick={openAd} className="flex h-11 w-full items-center justify-between rounded-xl border border-border bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90 active:scale-[0.995]">
          <span>{ad.call_to_action || 'Batafsil'}</span>
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
