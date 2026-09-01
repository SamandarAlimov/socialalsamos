import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Search, LocateFixed, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { reverseGeocode } from '@/lib/reverseGeocode';
import { cn } from '@/lib/utils';

/**
 * Profil joylashuvini haqiqiy xarita ma'lumotlari bilan bog'laydi.
 *
 * Ilgari bu maydon oddiy matn kiritish edi: foydalanuvchi xohlagan narsani
 * yozar, hech qanday tekshiruv yoki xarita bog'lanishi yo'q edi. Endi:
 *  - manzil OpenStreetMap (Nominatim) bo'yicha qidiriladi va tanlanadi;
 *  - "Joriy joylashuvim" tugmasi GPS koordinatasini haqiqiy manzilga aylantiradi;
 *  - tanlangan nuqta darhol xarita ko'rinishida ko'rsatiladi.
 *
 * Kalit talab qilinmaydi, shuning uchun qo'shimcha sozlama kerak emas.
 */

interface GeoSuggestion {
  id: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  /** Boshlang'ich koordinata bo'lsa xarita darhol ko'rsatiladi. */
  className?: string;
}

const SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function buildEmbedUrl(latitude: number, longitude: number): string {
  const delta = 0.01;
  const bbox = [
    (longitude - delta).toFixed(5),
    (latitude - delta).toFixed(5),
    (longitude + delta).toFixed(5),
    (latitude + delta).toFixed(5),
  ].join('%2C');
  return (
    'https://www.openstreetmap.org/export/embed.html?bbox=' +
    bbox +
    '&layer=mapnik&marker=' +
    latitude.toFixed(5) +
    '%2C' +
    longitude.toFixed(5)
  );
}

export function LocationPicker({ value, onChange, className }: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Qidiruvni sekinlashtiramiz: Nominatim so'rovlar chastotasini cheklaydi.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setError(null);

      const params = new URLSearchParams({
        format: 'jsonv2',
        q: trimmed,
        limit: '6',
        addressdetails: '1',
        'accept-language': 'uz,ru,en',
      });

      try {
        const response = await fetch(SEARCH_ENDPOINT + '?' + params.toString(), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Qidiruv xatosi');

        const payload = (await response.json()) as Array<Record<string, unknown>>;
        const mapped: GeoSuggestion[] = (payload || [])
          .map((item, index) => {
            const display = typeof item.display_name === 'string' ? item.display_name : '';
            const latitude = Number(item.lat);
            const longitude = Number(item.lon);
            if (!display || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              return null;
            }
            const parts = display.split(',').map((part) => part.trim());
            return {
              id: String(item.place_id ?? index),
              label: parts[0] || display,
              detail: parts.slice(1).join(', '),
              latitude,
              longitude,
            };
          })
          .filter((item): item is GeoSuggestion => item !== null);

        setSuggestions(mapped);
        if (mapped.length === 0) setError('Bunday manzil topilmadi');
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError('Manzil qidirib bo\u2018lmadi. Internetni tekshiring.');
      } finally {
        setSearching(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const applySuggestion = (suggestion: GeoSuggestion) => {
    const label = suggestion.detail
      ? suggestion.label + ', ' + suggestion.detail.split(',').slice(-2).join(',').trim()
      : suggestion.label;
    onChange(label);
    setCoords({ latitude: suggestion.latitude, longitude: suggestion.longitude });
    setSuggestions([]);
    setQuery('');
    setError(null);
  };

  const useCurrentLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Brauzer joylashuvni qo\u2018llab-quvvatlamaydi');
      return;
    }

    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ latitude, longitude });
        const resolved = await reverseGeocode(latitude, longitude);
        if (resolved) {
          onChange(resolved.full);
        } else {
          setError('Manzil aniqlanmadi, lekin nuqta xaritada ko\u2018rsatildi');
        }
        setLocating(false);
      },
      () => {
        setError('Joylashuvga ruxsat berilmadi');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, [onChange]);

  return (
    <div className={cn('space-y-2', className)}>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{value}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Joylashuvni tozalash"
            onClick={() => {
              onChange('');
              setCoords(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Shahar, tuman yoki manzilni yozing"
          className="pl-9"
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => applySuggestion(suggestion)}
              className={cn(
                'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60',
                index !== 0 && 'border-t border-border/60',
              )}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{suggestion.label}</span>
                {suggestion.detail && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {suggestion.detail}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={locating}
          onClick={useCurrentLocation}
        >
          {locating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <LocateFixed className="mr-1.5 h-3.5 w-3.5" />
          )}
          Joriy joylashuvim
        </Button>
        <span className="text-xs text-muted-foreground">Manzillar OpenStreetMap bazasidan olinadi</span>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {coords && (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            title="Tanlangan joylashuv xaritasi"
            src={buildEmbedUrl(coords.latitude, coords.longitude)}
            className="h-48 w-full border-0"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
