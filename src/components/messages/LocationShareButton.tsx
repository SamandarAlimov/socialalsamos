import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, Navigation, Radio } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LIVE_LOCATION_DURATIONS } from '@/hooks/useLiveLocation';
import { cn } from '@/lib/utils';

const LEAFLET_IMG = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images';
const OSM_TILE_URL = 'https://' + '{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// Standart marker ikonkalarini to'g'rilash
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: LEAFLET_IMG + '/marker-icon-2x.png',
  iconUrl: LEAFLET_IMG + '/marker-icon.png',
  shadowUrl: LEAFLET_IMG + '/marker-shadow.png',
});

export interface SharedLocationPayload {
  latitude: number;
  longitude: number;
  address?: string;
  /** Jonli joylashuv bo'lsa, necha sekund davom etadi */
  liveDurationSeconds?: number;
}

interface LocationShareButtonProps {
  onShareLocation: (location: SharedLocationPayload) => void;
}

function MapClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onSelect(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

export function LocationShareButton({ onShareLocation }: LocationShareButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [liveDuration, setLiveDuration] = useState<number | null>(null);

  const getCurrentLocation = async () => {
    setIsLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const loc = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setCurrentLocation(loc);
      setSelectedLocation(loc);
      setLiveDuration(null);
      setShowPicker(true);
    } catch (error) {
      toast.error("Joylashuvni aniqlab bo'lmadi. Brauzerda joylashuvga ruxsat bering.");
    } finally {
      setIsLoading(false);
    }
  };

  const share = (loc: { lat: number; lng: number }, live?: number | null) => {
    onShareLocation({
      latitude: loc.lat,
      longitude: loc.lng,
      liveDurationSeconds: live ?? undefined,
    });
    setShowPicker(false);
    toast.success(live ? 'Jonli joylashuv ulashildi' : 'Joylashuv yuborildi');
  };

  const isMoved =
    !!selectedLocation &&
    !!currentLocation &&
    (selectedLocation.lat !== currentLocation.lat || selectedLocation.lng !== currentLocation.lng);

  return (
    <>
      <button
        className="tg-transition flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent"
        onClick={getCurrentLocation}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <MapPin className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm">Joylashuv</span>
      </button>

      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg overflow-hidden rounded-2xl p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-base">Joylashuvni ulashish</DialogTitle>
            <DialogDescription className="text-xs">
              Boshqa joyni tanlash uchun xaritani bosing.
            </DialogDescription>
          </DialogHeader>

          <div className="relative h-[45vh] max-h-[400px] min-h-[220px]">
            {currentLocation && (
              <MapContainer
                center={[currentLocation.lat, currentLocation.lng]}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url={OSM_TILE_URL}
                />
                <MapClickHandler onSelect={(lat, lng) => setSelectedLocation({ lat, lng })} />
                {selectedLocation && (
                  <Marker position={[selectedLocation.lat, selectedLocation.lng]} />
                )}
              </MapContainer>
            )}
          </div>

          <div className="space-y-3 p-4">
            {/* Jonli joylashuv muddatlari */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Radio className="h-3.5 w-3.5" />
                Jonli joylashuv (harakatingiz kuzatiladi)
              </p>
              <div className="flex flex-wrap gap-2">
                {LIVE_LOCATION_DURATIONS.map((d) => (
                  <Button
                    key={d.seconds}
                    size="sm"
                    variant={liveDuration === d.seconds ? 'default' : 'outline'}
                    className="rounded-xl"
                    onClick={() =>
                      setLiveDuration((prev) => (prev === d.seconds ? null : d.seconds))
                    }
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              className={cn('w-full rounded-xl')}
              onClick={() => currentLocation && share(currentLocation, liveDuration)}
              variant={liveDuration ? 'default' : 'outline'}
            >
              {liveDuration ? (
                <>
                  <Radio className="mr-2 h-4 w-4" />
                  Jonli joylashuvni ulashish
                </>
              ) : (
                <>
                  <Navigation className="mr-2 h-4 w-4" />
                  Hozirgi joylashuvni yuborish
                </>
              )}
            </Button>

            {isMoved && !liveDuration && (
              <Button
                className="w-full rounded-xl"
                onClick={() => selectedLocation && share(selectedLocation)}
              >
                <MapPin className="mr-2 h-4 w-4" />
                Tanlangan joyni yuborish
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
