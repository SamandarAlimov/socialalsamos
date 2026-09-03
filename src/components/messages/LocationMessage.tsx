import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MapDestinationPreview,
  mapDestinationHref,
} from '@/components/map/MapDestinationPreview';

interface LocationMessageProps {
  latitude: number;
  longitude: number;
  address?: string;
  isMine: boolean;
  senderName?: string;
  /** Jonli joylashuv tugash vaqti (ISO). Berilsa jonli ko'rinishda chiziladi. */
  liveUntil?: string;
}

/** Qolgan vaqtni Telegramdek qisqa ko'rsatish */
function formatRemaining(ms: number): string {
  if (ms <= 0) return 'tugadi';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} soat ${minutes} daqiqa qoldi`;
  if (totalMinutes > 0) return `${totalMinutes} daqiqa qoldi`;
  return `${Math.max(1, Math.floor(ms / 1000))} soniya qoldi`;
}

export function LocationMessage({
  latitude,
  longitude,
  address,
  isMine,
  senderName,
  liveUntil,
}: LocationMessageProps) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  const liveUntilMs = liveUntil ? new Date(liveUntil).getTime() : null;
  const isLive = !!liveUntilMs && liveUntilMs > now;

  useEffect(() => {
    if (!liveUntilMs) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [liveUntilMs]);

  const title = address || senderName || (liveUntilMs ? 'Jonli joylashuv' : 'Joylashuv');

  const handleOpenInApp = () => {
    navigate(
      mapDestinationHref({
        latitude,
        longitude,
        title,
        address,
      }),
    );
  };

  return (
    <div className="w-[240px] max-w-full overflow-hidden rounded-2xl border border-border/60 bg-card sm:w-[260px]">
      {/* Preview alohida xarita emas — real interaction yagona /map tizimiga o'tadi. */}
      <button
        type="button"
        onClick={handleOpenInApp}
        className="relative block h-[132px] w-full cursor-pointer overflow-hidden sm:h-[142px]"
        aria-label="Alsamos Xaritada ko'rish"
      >
        <MapDestinationPreview
          latitude={latitude}
          longitude={longitude}
          title={title}
          live={isLive}
        />
      </button>

      {/* Ma'lumot va amallar */}
      <div className="space-y-2 p-2.5">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
              isLive ? 'bg-green-500/15' : 'bg-muted'
            )}
          >
            {isLive ? (
              <Radio className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <MapPin className="h-3.5 w-3.5 text-foreground" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[13px] font-medium text-foreground"
              style={{ overflowWrap: 'anywhere' }}
            >
              {title}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {liveUntilMs
                ? isLive
                  ? `Jonli joylashuv \u00b7 ${formatRemaining(liveUntilMs - now)}`
                  : 'Jonli joylashuv tugadi'
                : 'Joylashuv'}
            </p>
          </div>
        </div>

        <div className="flex">
          <button
            type="button"
            onClick={handleOpenInApp}
            className={cn(
              'tg-transition flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-medium',
              'bg-muted text-foreground hover:bg-muted/70 active:scale-[0.99]'
            )}
          >
            <Navigation className="h-3.5 w-3.5" />
            Alsamos Xarita
          </button>
        </div>
      </div>
    </div>
  );
}
