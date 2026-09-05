import { useEffect, useMemo, useState } from 'react';
import { useActiveAds } from '@/hooks/useAds';
import { VideoSponsoredOverlay } from './VideoSponsoredOverlay';

const VIDEO_AD_INTERVAL = 7;

export function VideoAdsSurface() {
  const { ads, trackImpression, trackClick } = useActiveAds('feed', 3);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);

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

  const ad = useMemo(() => {
    if (!ads.length || activeIndex < VIDEO_AD_INTERVAL - 1) return null;
    if ((activeIndex + 1) % VIDEO_AD_INTERVAL !== 0) return null;
    const slot = Math.floor(activeIndex / VIDEO_AD_INTERVAL);
    return ads[slot % ads.length] || null;
  }, [activeIndex, ads]);

  if (!ad) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[46] md:left-[72px]">
      <VideoSponsoredOverlay
        key={`${ad.id}-${activeIndex}`}
        ad={ad}
        active
        muted={muted}
        onMuteToggle={() => setMuted((value) => !value)}
        onImpression={(id) => trackImpression(id, 'video')}
        onClick={(id) => trackClick(id, 'video')}
        className="pointer-events-auto"
      />
    </div>
  );
}
