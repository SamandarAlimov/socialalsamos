import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Navigation, Radio, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isLiveActive, type PostLocation } from '@/hooks/usePostLocation';
import { useLiveLocationSharing } from '@/hooks/useLiveLocationSharing';
import {
  isGenericLocationLabel,
  reverseGeocode,
  type ResolvedAddress,
} from '@/lib/reverseGeocode';

interface PostLocationCardProps {
  location: PostLocation;
  className?: string;
  /** Kompakt ko\u2018rinish \u2014 faqat chip. */
  compact?: boolean;
  /** Post egasi bo\u2018lsa: live joylashuv avtomatik yangilanadi va to\u2018xtatish mumkin. */
  isOwner?: boolean;
  onStopped?: () => void;
}

const STATIC_MAP_BASE = 'https://staticmap.openstreetmap.de/staticmap.php';

function remainingLabel(liveUntil: string): string {
  const diff = new Date(liveUntil).getTime() - Date.now();
  if (diff <= 0) return 'Tugadi';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return minutes + ' daq qoldi';

  const hours = Math.floor(minutes / 60);
  return hours + ' soat ' + (minutes % 60) + ' daq qoldi';
}

/** Kalitsiz statik xarita rasmi (OSM). */
function staticMapUrl(latitude: number, longitude: number): string {
  const point = latitude + ',' + longitude;
  const params = new URLSearchParams({
    center: point,
    zoom: '15',
    size: '600x220',
    markers: point + ',red-pushpin',
  });
  return STATIC_MAP_BASE + '?' + params.toString();
}

/** Lentada post joylashuvini ko\u2018rsatish. */
export function PostLocationCard({
  location,
  className,
  compact,
  isOwner = false,
  onStopped,
}: PostLocationCardProps) {
  const [live, setLive] = useState(() => isLiveActive(location));
  const [remaining, setRemaining] = useState(() =>
    location.live_until ? remainingLabel(location.live_until) : '',
  );
  const [resolved, setResolved] = useState<ResolvedAddress | null>(null);

  const { endSharing } = useLiveLocationSharing({
    locationId: location.id,
    postId: location.post_id,
    liveUntil: location.live_until,
    enabled: isOwner && live,
  });

  // Qolgan vaqt sanog\u2018i
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

  /*
    Foydalanuvchi "joriy joylashuv" ni yuborganda bazada faqat koordinata
    bo'ladi. Umumiy "Joriy joylashuv" yozuvi o'rniga aynan qaysi manzil
    ekanini ko'rsatamiz — shuning uchun koordinatadan manzil tiklanadi.
  */
  const savedName = location.place?.name ?? location.label;
  const hasRealName = !isGenericLocationLabel(savedName);
  const savedAddress = location.place?.address ?? null;
  const needsLookup = !hasRealName || !savedAddress;

  useEffect(() => {
    if (!needsLookup) {
      setResolved(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    void reverseGeocode(location.latitude, location.longitude, controller.signal).then(
      (address) => {
        if (active) setResolved(address);
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [needsLookup, location.latitude, location.longitude]);

  const coordinateLabel =
    location.latitude.toFixed(4) + ', ' + location.longitude.toFixed(4);

  const title = hasRealName
    ? (savedName as string)
    : (resolved?.short ?? coordinateLabel);

  const detail = savedAddress ?? resolved?.full ?? coordinateLabel;
  const subtitle = detail === title ? coordinateLabel : detail;

  const mapHref =
    '/map?lat=' +
    location.latitude +
    '&lng=' +
    location.longitude +
    '&label=' +
    encodeURIComponent(title);

  const handleStop = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    await endSharing();
    setLive(false);
    onStopped?.();
  };

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
            {live ? remaining : subtitle}
          </p>
        </div>

        {live && isOwner && (
          <button
            type="button"
            onClick={handleStop}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-destructive/50 px-2.5 text-xs font-medium text-destructive transition hover:bg-destructive/10"
          >
            <Square className="h-3 w-3" /> To\u2018xtatish
          </button>
        )}
      </div>
    </Link>
  );
}
