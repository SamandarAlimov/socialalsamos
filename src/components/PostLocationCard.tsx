import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Navigation, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isLiveActive, type PostLocation } from '@/hooks/usePostLocation';

interface PostLocationCardProps {
  location: PostLocation;
  className?: string;
  /** Kompakt ko'rinish — faqat chip. */
  compact?: boolean;
}

function remainingLabel(liveUntil: string): string {
  const diff = new Date(liveUntil).getTime() - Date.now();
  if (diff <= 0) return 'Tugadi';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} daq qoldi`;
  const hours = Math.floor(minutes / 60);
  return `${hours} soat ${minutes % 60} daq qoldi`;
}

/** Statik xarita rasmi kalitsiz — OSM staticmap xizmati. */
function staticMapUrl(latitude: number, longitude: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=15&size=600x220&markers=${latitude},${longitude},red-pushpin`;
}

/** Lentada post joylashuvini ko'rsatish. */
export function PostLocationCard({ location, className, compact }: PostLocationCardProps) {
  const [live, setLive] = useState(() => isLiveActive(location));
  const [remaining, setRemaining] = useState(() =>
    location.live_until ? remainingLabel(location.live_until) : '',
  );

  // Qolgan vaqt sanog'i
  useEffect(() => {
    if (!location.live_until || location.mode !== 'live') return;

    const tick = () => {
      setLive(isLiveActive(location));
      setRemaining(remainingLabel(location.live_until as string));
    };

    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [location.live_until, location.mode, location.latitude, location.longitude]);

  const title = location.place?.name ?? location.label ?? 'Joylashuv';
  const subtitle = location.place?.address ?? null;
  const mapHref = `/map?lat=${location.latitude}&lng=${location.longitude}&label=${encodeURIComponent(title)}`;

  if (compact) {
    return (
      <Link
        to={mapHref}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted',
          className,
        )}
      >
        {live ? (
          <Radio className="h-3.5 w-3.5 shrink-0 animate-pulse text-red-500" />
        ) : (
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
        )}
        <span className="truncate">{title}</span>
      </Link>
    );
  }

  return (
    <Link
      to={mapHref}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'block overflow-hidden rounded-2xl border border-border/60 bg-muted/30 transition hover:border-border',
        className,
      )}
    >
      <div className="relative h-32 w-full bg-muted">
        <img
          src={staticMapUrl(location.latitude, location.longitude)}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        {live && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            <Radio className="h-3 w-3 animate-pulse" /> Live
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {live ? <Navigation className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {live
              ? remaining
              : (subtitle ??
                `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`)}
          </p>
        </div>
      </div>
    </Link>
  );
}
