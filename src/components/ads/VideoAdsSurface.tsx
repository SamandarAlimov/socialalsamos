import { useEffect, useRef, useState } from 'react';
import { useActiveAds, type Ad } from '@/hooks/useAds';
import { VideoSponsoredOverlay } from './VideoSponsoredOverlay';
import {
  canShowVideoAd,
  recordVideoAdImpression,
  snoozeVideoAds,
} from '@/lib/adFrequencyPolicy';
import type { AdFeedbackType } from '@/lib/adDeliveryClient';

type ActiveSlot = {
  ad: Ad;
  index: number;
};

const VIDEO_RETRY_ORGANIC_GAP = 6;

export function VideoAdsSurface() {
  const {
    ads,
    trackImpression,
    trackClick,
    submitFeedback,
  } = useActiveAds('video', 6);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [slot, setSlot] = useState<ActiveSlot | null>(null);
  const lastEvaluatedIndexRef = useRef(-1);
  const lastAttemptedIndexRef = useRef(-100);

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

    // If somebody swipes past an ad before its impression threshold, do not
    // chase them with another ad on every following reel.
    if (activeIndex - lastAttemptedIndexRef.current < VIDEO_RETRY_ORGANIC_GAP) return;

    // Candidate pool is already ranked by the delivery layer. Pick the first
    // candidate that also passes local real-time pacing/fatigue rules.
    const candidate = ads.find((item) => canShowVideoAd(activeIndex, item.id));
    if (!candidate) return;

    lastAttemptedIndexRef.current = activeIndex;
    setSlot({ ad: candidate, index: activeIndex });
  }, [activeIndex, ads, slot]);

  if (!slot || slot.index !== activeIndex) return null;

  const handleImpression = (adId: string) => {
    recordVideoAdImpression(adId, slot.index);
    void trackImpression(adId, 'video');
  };

  const handleDismiss = () => {
    snoozeVideoAds();
    setSlot(null);
  };

  const handleFeedback = (adId: string, feedback: AdFeedbackType) => {
    snoozeVideoAds();
    setSlot(null);
    void submitFeedback(adId, feedback, 'video', { organic_index: activeIndex });
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
        onClick={(id) => void trackClick(id, 'video')}
        onDismiss={handleDismiss}
        onFeedback={handleFeedback}
        className="pointer-events-auto"
      />
    </div>
  );
}
