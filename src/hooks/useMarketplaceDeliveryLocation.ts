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

function validLocation(value: MarketplaceDeliveryLocation | null | undefined) {
  return Boolean(
    value &&
    Number.isFinite(Number(value.latitude)) &&
    Number.isFinite(Number(value.longitude)) &&
    Math.abs(Number(value.latitude)) <= 90 &&
    Math.abs(Number(value.longitude)) <= 180 &&
    typeof value.label === 'string' &&
    value.label.trim(),
  );
}

export function useMarketplaceDeliveryLocation() {
  const [location, setLocationState] = useState<MarketplaceDeliveryLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as MarketplaceDeliveryLocation;
      if (validLocation(parsed)) {
        setLocationState({
          latitude: Number(parsed.latitude),
          longitude: Number(parsed.longitude),
          label: parsed.label.trim(),
          accuracy: Number.isFinite(Number(parsed.accuracy)) ? Number(parsed.accuracy) : null,
        });
      }
    } catch {
      // Optional preference only.
    }
  }, []);

  const setLocation = useCallback((next: MarketplaceDeliveryLocation | null) => {
    setError(null);
    if (!next) {
      setLocationState(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Optional preference only.
      }
      return;
    }

    if (!validLocation(next)) {
      setError('Tanlangan joylashuv ma’lumoti noto‘g‘ri.');
      return;
    }

    const normalized: MarketplaceDeliveryLocation = {
      latitude: Number(next.latitude),
      longitude: Number(next.longitude),
      label: next.label.trim(),
      accuracy: Number.isFinite(Number(next.accuracy)) ? Number(next.accuracy) : null,
    };

    setLocationState(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
  }, [setLocation]);

  return { location, isLocating, error, locate, setLocation };
}
