import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

// Fix default marker icon
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
}

export function LocationMessage({
  latitude,
  longitude,
  address,
  isMine,
  senderName,
}: LocationMessageProps) {
  const navigate = useNavigate();

  const title = address || senderName || 'Joylashuv';

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
    <div className="w-[260px] max-w-full overflow-hidden rounded-2xl border border-border/60 bg-card">
      {/* Xarita preview - bosilsa ilova ichidagi xaritaga o'tadi */}
      <button
        type="button"
        onClick={handleOpenInApp}
        className="relative block h-[150px] w-full cursor-pointer"
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
          attributionControl={false}
        >
          <TileLayer url={OSM_TILE_URL} />
          <Marker position={[latitude, longitude]} />
        </MapContainer>

        {/* Klik xaritaga tushmasligi uchun qatlam */}
        <div className="absolute inset-0 z-[400] bg-gradient-to-t from-black/25 via-transparent to-transparent" />

        <span className="absolute bottom-2 left-2 z-[401] rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </span>
      </button>

      {/* Ma'lumot va amallar */}
      <div className="space-y-2 p-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <MapPin className="h-3.5 w-3.5 text-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[13px] font-medium text-foreground"
              style={{ overflowWrap: 'anywhere' }}
            >
              {title}
            </p>
            <p className="text-[11px] text-muted-foreground">Joylashuv</p>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleOpenInApp}
            className={cn(
              'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors',
              'bg-muted text-foreground hover:bg-muted/70 active:bg-muted'
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
            className="flex h-8 w-9 items-center justify-center rounded-xl bg-muted text-foreground transition-colors hover:bg-muted/70"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
