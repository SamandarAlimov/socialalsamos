const MAPLIBRE_VERSION = '6.6.0';
const SCRIPT_ID = 'alsamos-maplibre-runtime';
const STYLE_ID = 'alsamos-maplibre-style';

type MapLibreGlobal = {
  Map: new (options: Record<string, unknown>) => any;
  Marker: new (options?: Record<string, unknown>) => any;
  LngLatBounds: new () => any;
};

declare global {
  interface Window {
    maplibregl?: MapLibreGlobal;
  }
}

let runtimePromise: Promise<MapLibreGlobal> | null = null;

function ensureStylesheet(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href =
    'https://unpkg.com/maplibre-gl@' +
    MAPLIBRE_VERSION +
    '/dist/maplibre-gl.css';
  document.head.appendChild(link);
}

export function loadMapLibreRuntime(): Promise<MapLibreGlobal> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('MapLibre browser runtime unavailable'));
  }

  if (window.maplibregl?.Map) {
    ensureStylesheet();
    return Promise.resolve(window.maplibregl);
  }

  if (runtimePromise) return runtimePromise;

  ensureStylesheet();
  runtimePromise = new Promise<MapLibreGlobal>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const finish = () => {
      if (window.maplibregl?.Map) resolve(window.maplibregl);
      else reject(new Error('MapLibre runtime did not initialize'));
    };

    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('MapLibre runtime failed to load')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src =
      'https://unpkg.com/maplibre-gl@' +
      MAPLIBRE_VERSION +
      '/dist/maplibre-gl.js';
    script.onload = finish;
    script.onerror = () =>
      reject(new Error('MapLibre runtime failed to load'));
    document.head.appendChild(script);
  }).catch((error) => {
    runtimePromise = null;
    throw error;
  });

  return runtimePromise;
}
