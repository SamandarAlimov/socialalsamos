import { useEffect, useRef, useState } from 'react';
import { useActiveAds, type Ad } from '@/hooks/useAds';
import { VideoSponsoredOverlay } from './VideoSponsoredOverlay';
import {
  canShowVideoAd,
  recordVideoAdImpression,
  snoozeVideoAds,
} from '@/lib/adFrequencyPolicy';

type ActiveSlot = {
  ad: Ad;
  index: number;
};

export function VideoAdsSurface() {
  const { ads, trackImpression, trackClick } = useActiveAds('feed', 3);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [slot, setSlot] = useState<ActiveSlot | null>(null);
  const lastEvaluatedIndexRef = useRef(-1);

  useEffect(() => {
    let cleanupScroll: (() => void) | null = null;
    let currentNode: HTMLElement | null = null;

    const bind = () => {
      const node = document.querySelector<HTMLElement>('main .snap-y.snap-mandatory');
      if (!node || node === currentNode) return;

      cleanupScroll?.();
      currentNode = node;

      const sync = () => {
        const height = node.clientHeight || 1;
        setActiveIndex(Math.max(0, Math.round(node.scrollTop / height)));
      };

      sync();
      node.addEventListener('scroll', sync, { passive: true });
      cleanupScroll = () => node.removeEventListener('scroll', sync);
    };

    bind();
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cleanupScroll?.();
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (slot && slot.index !== activeIndex) {
      setSlot(null);
    }

    if (!ads.length || lastEvaluatedIndexRef.current === activeIndex) return;
    lastEvaluatedIndexRef.current = activeIndex;

    const candidate = ads[Math.abs(activeIndex) % ads.length];
    if (!candidate || !canShowVideoAd(activeIndex, candidate.id)) return;

    setSlot({ ad: candidate, index: activeIndex });
  }, [activeIndex, ads, slot]);

  if (!slot || slot.index !== activeIndex) return null;

  const handleImpression = (adId: string) => {
    recordVideoAdImpression(adId, slot.index);
    trackImpression(adId, 'video');
  };

  const handleDismiss = () => {
    snoozeVideoAds();
    setSlot(null);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[46] md:left-[72px]">
      <VideoSponsoredOverlay
        key={`${slot.ad.id}-${slot.index}`}
        ad={slot.ad}
        active
        muted={muted}
        onMuteToggle={() => setMuted((value) => !value)}
        onImpression={handleImpression}
        onClick={(id) => trackClick(id, 'video')}
        onDismiss={handleDismiss}
        className="pointer-events-auto"
      />
    </div>
  );
}
