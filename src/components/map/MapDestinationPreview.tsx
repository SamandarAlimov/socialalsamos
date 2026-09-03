import { MapPinned, Navigation, Radio } from 'lucide-react';

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
 * Lightweight preview for posts/messages.
 * Bu joyda alohida Leaflet/iframe xarita ochilmaydi: preview faqat destination
 * kartasi, real interaction esa yagona /map tizimiga o'tadi.
 */
export function MapDestinationPreview({
  latitude,
  longitude,
  title,
  live = false,
  className,
}: MapDestinationPreviewProps) {
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_25%_25%,hsl(var(--muted))_0,transparent_34%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)))]',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="relative z-[1] flex max-w-[85%] flex-col items-center gap-2 text-center">
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm backdrop-blur-sm',
            live
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
          )}
        >
          {live ? <Radio className="h-5 w-5" /> : <MapPinned className="h-5 w-5" />}
        </span>

        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">
            {title || 'Alsamos Xarita'}
          </p>
          <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </p>
        </div>

        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur">
          <Navigation className="h-3 w-3" />
          Alsamos Xarita
        </span>
      </div>
    </div>
  );
}

export default MapDestinationPreview;
