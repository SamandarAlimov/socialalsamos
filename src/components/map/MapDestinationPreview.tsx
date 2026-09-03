import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigation, Radio } from 'lucide-react';

import { AlsamosMapSurface } from '@/components/map/AlsamosMapSurface';
import type { MapSceneMarker } from '@/lib/mapEngine';
import { cn } from '@/lib/utils';

export function mapDestinationHref({
  latitude,
  longitude,
  title,
  address,
}: {
  latitude: number;
  longitude: number;
  title?: string | null;
  address?: string | null;
}) {
  const params = new URLSearchParams({
    destLat: String(latitude),
    destLng: String(longitude),
  });
  if (title) params.set('destName', title);
  if (address) params.set('destAddress', address);
  return '/map?' + params.toString();
}

interface MapDestinationPreviewProps {
  latitude: number;
  longitude: number;
  title?: string | null;
  live?: boolean;
  className?: string;
}

/**
 * Home / Discover / Messages uchun real map preview.
 *
 * Bu alohida xarita emas — MapPage ishlatadigan AlsamosMapSurface'ning
 * read-only preview rejimi. Viewportga yaqinlashmaguncha mount bo'lmaydi.
 */
export function MapDestinationPreview({
  latitude,
  longitude,
  title,
  live = false,
  className,
}: MapDestinationPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldRenderMap, setShouldRenderMap] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (shouldRenderMap) return;
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldRenderMap(true);
        observer.disconnect();
      },
      {
        rootMargin: '320px 0px',
        threshold: 0.01,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldRenderMap]);

  const markers = useMemo<MapSceneMarker[]>(
    () => [
      {
        id: 'destination-preview',
        kind: 'selected',
        latitude,
        longitude,
        color: live ? '#10B981' : '#2F6FED',
        active: true,
      },
    ],
    [latitude, live, longitude],
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative isolate h-full w-full overflow-hidden bg-muted',
        className,
      )}
      aria-label={title ? `${title} xarita preview` : 'Joylashuv xarita preview'}
    >
      {shouldRenderMap ? (
        <div className="pointer-events-none absolute inset-0">
          <AlsamosMapSurface
            center={{ latitude, longitude }}
            referenceCenter={{ latitude, longitude }}
            zoom={15}
            markers={markers}
            renderMode="preview"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-background to-muted/70"
        />
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.10] via-transparent to-white/[0.05]"
      />

      {live && (
        <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-emerald-500/92 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur">
          <Radio className="h-3 w-3 animate-pulse" />
          Live
        </span>
      )}

      <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full border border-border/45 bg-background/88 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-md backdrop-blur-xl">
        <Navigation className="h-3 w-3" />
        Alsamos Xarita
      </span>
    </div>
  );
}

export default MapDestinationPreview;
