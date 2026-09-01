import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
/** Toshkent — standart markaz */
const DEFAULT_CENTER: [number, number] = [41.311081, 69.240562];

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

export interface LocationCoords {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  /** Joriy manzil matni */
  value: string;
  /** Ma'lum bo'lsa, xaritada ko'rsatiladigan koordinata */
  coords?: LocationCoords | null;
  /** Foydalanuvchi manzilni o'zgartirganda chaqiriladi */
  onChange: (label: string, coords: LocationCoords) => void;
  /** Manzilni tozalash */
  onClear?: () => void;
}

const pinIcon = L.divIcon({
  className: '',
  html:
    '<div style="width:18px;height:18px;border-radius:9999px;background:hsl(var(--primary));' +
    'box-shadow:0 0 0 5px hsl(var(--primary) / 0.22), 0 2px 6px rgba(0,0,0,0.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function formatAddress(data: Record<string, any>, lat: number, lng: number): string {
  const a = (data?.address ?? {}) as Record<string, string>;
  const city = a.city || a.town || a.village || a.municipality || a.county;
  const parts = [city, a.state, a.country].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (typeof data?.display_name === 'string') return data.display_name;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function LocationPicker({ value, coords, onChange, onClear }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setResolving(true);
    setError(null);
    try {
      const res = await fetch(
        `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=uz`,
      );
      const data = await res.json();
      onChangeRef.current(formatAddress(data, lat, lng), { lat, lng });
    } catch {
      onChangeRef.current(`${lat.toFixed(5)}, ${lng.toFixed(5)}`, { lat, lng });
    } finally {
      setResolving(false);
    }
  }, []);

  const moveMarker = useCallback((lat: number, lng: number, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const point = marker.getLatLng();
        void reverseGeocode(point.lat, point.lng);
      });
      markerRef.current = marker;
    }

    map.setView([lat, lng], zoom ?? Math.max(map.getZoom(), 12));
  }, [reverseGeocode]);

  // Xaritani bir marta ishga tushirish
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const start: [number, number] = coords ? [coords.lat, coords.lng] : DEFAULT_CENTER;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(start, coords ? 13 : 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      moveMarker(event.latlng.lat, event.latlng.lng);
      void reverseGeocode(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    if (coords) moveMarker(coords.lat, coords.lng, 13);

    const timer = window.setTimeout(() => map.invalidateSize(), 150);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tashqaridan kelgan koordinatani sinxronlash
  useEffect(() => {
    if (coords && mapRef.current) moveMarker(coords.lat, coords.lng);
  }, [coords, moveMarker]);

  const handleSearch = async () => {
    const term = query.trim();
    if (!term) return;

    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `${NOMINATIM_BASE}/search?format=jsonv2&limit=5&accept-language=uz&q=${encodeURIComponent(term)}`,
      );
      const data: GeoResult[] = await res.json();
      setResults(Array.isArray(data) ? data : []);
      if (!data?.length) setError('Hech narsa topilmadi. Boshqacha yozib ko\u2019ring.');
    } catch {
      setError('Qidiruvda xatolik. Keyinroq urinib ko\u2019ring.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectResult = (result: GeoResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    moveMarker(lat, lng, 14);
    onChangeRef.current(result.display_name.split(',').slice(0, 3).join(',').trim(), { lat, lng });
    setResults([]);
    setQuery('');
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Brauzeringiz joylashuvni aniqlashni qo\u2019llab-quvvatlamaydi.');
      return;
    }
    setResolving(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        moveMarker(latitude, longitude, 14);
        void reverseGeocode(latitude, longitude);
      },
      () => {
        setResolving(false);
        setError('Joylashuvga ruxsat berilmadi.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSearch();
              }
            }}
            placeholder="Shahar yoki manzilni qidiring"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={handleSearch} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Qidirish'}
          </Button>
          <Button type="button" variant="outline" onClick={handleUseMyLocation} disabled={resolving}>
            <LocateFixed className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Mening joylashuvim</span>
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {results.map((result) => (
            <button
              key={`${result.lat}-${result.lon}`}
              type="button"
              onClick={() => handleSelectResult(result)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent/60 border-b border-border/60 last:border-0"
            >
              {result.display_name}
            </button>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="h-64 w-full rounded-xl border border-border overflow-hidden z-0"
        aria-label="Manzil xaritasi"
      />

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm truncate">
            {resolving ? 'Manzil aniqlanmoqda\u2026' : value || 'Manzil tanlanmagan'}
          </p>
        </div>
        {value && onClear && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4 mr-1" />
            Tozalash
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Xaritani bosing yoki belgini surib manzilingizni aniq belgilang.
      </p>
    </div>
  );
}
