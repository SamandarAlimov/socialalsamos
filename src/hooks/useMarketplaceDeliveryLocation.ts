import { useCallback, useEffect, useState } from 'react';

export interface MarketplaceDeliveryLocation {
  latitude: number;
  longitude: number;
  label: string;
  accuracy?: number | null;
}

const STORAGE_KEY = 'alsamos:marketplace:delivery-location';
const CHANGE_EVENT = 'alsamos:marketplace:delivery-location-change';
export const MARKETPLACE_LOCATION_PICKER_OPEN_EVENT = 'alsamos:marketplace:delivery-location-picker-open';

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

function normalizeLocation(value: MarketplaceDeliveryLocation): MarketplaceDeliveryLocation {
  return {
    latitude: Number(value.latitude),
    longitude: Number(value.longitude),
    label: value.label.trim(),
    accuracy: Number.isFinite(Number(value.accuracy)) ? Number(value.accuracy) : null,
  };
}

function readStoredLocation(): MarketplaceDeliveryLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketplaceDeliveryLocation;
    return validLocation(parsed) ? normalizeLocation(parsed) : null;
  } catch {
    return null;
  }
}

export function useMarketplaceDeliveryLocation() {
  const [location, setLocationState] = useState<MarketplaceDeliveryLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocationState(readStoredLocation());

    const handleCustomChange = (event: Event) => {
      const detail = (event as CustomEvent<MarketplaceDeliveryLocation | null>).detail;
      setLocationState(detail && validLocation(detail) ? normalizeLocation(detail) : null);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setLocationState(readStoredLocation());
    };

    window.addEventListener(CHANGE_EVENT, handleCustomChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleCustomChange);
      window.removeEventListener('storage', handleStorage);
    };
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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: null }));
      }
      return;
    }

    if (!validLocation(next)) {
      setError('Tanlangan joylashuv ma’lumoti noto‘g‘ri.');
      return;
    }

    const normalized = normalizeLocation(next);
    setLocationState(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Optional preference only.
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: normalized }));
    }
  }, []);

  /**
   * Marketplace'da "manzilni aniqlash" endi GPS'ga majburlamaydi.
   * Bir xil map-picker product detail, cart va checkoutdan ochiladi; pickerning
   * ichida foydalanuvchi joriy joyini ham, boshqa odam uchun istalgan manzilni
   * ham qidiruv/xarita orqali tanlay oladi.
   */
  const locate = useCallback(async () => {
    setError(null);
    if (typeof window === 'undefined') return null;

    setIsLocating(true);
    window.dispatchEvent(new CustomEvent(MARKETPLACE_LOCATION_PICKER_OPEN_EVENT));
    // Picker UI darhol ochiladi; real geolocation faqat foydalanuvchi uning
    // ichidagi "Joriy joylashuvim" tugmasini tanlaganda so'raladi.
    requestAnimationFrame(() => setIsLocating(false));
    return null;
  }, []);

  return { location, isLocating, error, locate, setLocation };
}
