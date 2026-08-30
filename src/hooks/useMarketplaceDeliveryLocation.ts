import { useCallback, useEffect, useState } from 'react';
import { resolveMapClickPlace } from '@/lib/mapPlaces';

export interface MarketplaceDeliveryLocation {
  latitude: number;
  longitude: number;
  label: string;
  accuracy?: number | null;
}

const STORAGE_KEY = 'alsamos:marketplace:delivery-location';

function fallbackLabel(latitude: number, longitude: number) {
  return latitude.toFixed(4) + ', ' + longitude.toFixed(4);
}

export function useMarketplaceDeliveryLocation() {
  const [location, setLocation] = useState<MarketplaceDeliveryLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        Number.isFinite(Number(parsed?.latitude)) &&
        Number.isFinite(Number(parsed?.longitude)) &&
        typeof parsed?.label === 'string'
      ) {
        setLocation({
          latitude: Number(parsed.latitude),
          longitude: Number(parsed.longitude),
          label: parsed.label,
          accuracy: Number.isFinite(Number(parsed.accuracy)) ? Number(parsed.accuracy) : null,
        });
      }
    } catch {
      // Optional preference only.
    }
  }, []);

  const locate = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setError('Qurilma joylashuvni aniqlashni qo‘llab-quvvatlamaydi');
      return null;
    }

    setIsLocating(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 60000,
        });
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      let label = fallbackLabel(latitude, longitude);

      try {
        const place = await resolveMapClickPlace({ latitude, longitude }, 16);
        if (place) {
          label =
            [place.name, place.address]
              .filter(Boolean)
              .filter((value, index, all) => all.indexOf(value) === index)
              .join(', ') || label;
        }
      } catch {
        // Coordinates are still a valid real location if reverse lookup fails.
      }

      const next: MarketplaceDeliveryLocation = {
        latitude,
        longitude,
        label,
        accuracy: position.coords.accuracy ?? null,
      };

      setLocation(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Optional preference only.
      }
      return next;
    } catch (reason: any) {
      setError(
        reason?.code === 1
          ? 'Joylashuvga ruxsat berilmadi'
          : 'Joylashuvni aniqlab bo‘lmadi',
      );
      return null;
    } finally {
      setIsLocating(false);
    }
  }, []);

  return { location, isLocating, error, locate };
}
