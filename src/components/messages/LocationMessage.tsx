import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, ExternalLink, Radio } from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

// Standart marker ikonkasini tuzatish
delete (L.Icon.Default.prototype as any)._getIconUrl;
const LEAFLET_IMG = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images';
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${LEAFLET_IMG}/marker-icon-2x.png`,
  iconUrl: `${LEAFLET_IMG}/marker-icon.png`,
  shadowUrl: `${LEAFLET_IMG}/marker-shadow.png`,
});

// OpenStreetMap tile template ({s}/{z}/{x}/{y} Leaflet tomonidan almashtiriladi)
const OSM_TILE_URL = 'https://' + '{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const GMAPS_SEARCH = 'https://' + 'www.google.com/maps/search/?api=1&query=';

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
      `/map?destLat=${latitude}&destLng=${longitude}&destName=${encodeURIComponent(title)}`
    );
  };

  const handleOpenExternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`${GMAPS_SEARCH}${latitude},${longitude}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-[240px] max-w-full overflow-hidden rounded-2xl border border-border/60 bg-card sm:w-[260px]">
      {/* Xarita preview - bosilsa ilova ichidagi xaritaga o'tadi */}
      <button
        type="button"
        onClick={handleOpenInApp}
        className="relative block h-[140px] w-full cursor-pointer sm:h-[150px]"
        aria-label="Xaritada ko'rish"
      >
        <MapContainer
          center={[latitude, longitude]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
          attributionControl={true}
        >
          <TileLayer url={OSM_TILE_URL} attribution="OpenStreetMap" />
          <Marker position={[latitude, longitude]} />
        </MapContainer>

        {/* Klik xaritaga tushmasligi uchun qatlam */}
        <div className="absolute inset-0 z-[400] bg-gradient-to-t from-black/25 via-transparent to-transparent" />

        {isLive && (
          <span className="absolute left-2 top-2 z-[401] flex items-center gap-1 rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            JONLI
          </span>
        )}

        <span className="absolute bottom-2 left-2 z-[401] rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </span>
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

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleOpenInApp}
            className={cn(
              'tg-transition flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-medium',
              'bg-muted text-foreground hover:bg-muted/70 active:scale-95'
            )}
          >
            <Navigation className="h-3.5 w-3.5" />
            Yo'nalish
          </button>
          <button
            type="button"
            onClick={handleOpenExternal}
            aria-label="Tashqi xaritada ochish"
            title="Tashqi xaritada ochish"
            className="tg-transition flex h-8 w-9 items-center justify-center rounded-xl bg-muted text-foreground hover:bg-muted/70 active:scale-95"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
