/**
 * Xarita qatlamlari (Yandexdagi "Xarita / Sputnik / Gibrid" almashtirgichi).
 * Diqqat: URL manzillar bo'laklardan yig'iladi - platsholderlar ({s}, {z})
 * bilan aralashib ketmasligi uchun.
 */

const H = 'https://';

const OSM_URL = H + '{s}' + '.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI_URL =
  H + 'server.arcgisonline.com' + '/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const CARTO_LABELS_URL = H + '{s}' + '.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
const CARTO_DARK_URL = H + '{s}' + '.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TRANSIT_URL = H + 'tileserver.memomaps.de' + '/tilegen/{z}/{x}/{y}.png';
const CYCLE_URL = H + '{s}' + '.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png';
const TRAFFIC_URL = String(import.meta.env.VITE_TRAFFIC_TILE_URL ?? '').trim();

const OSM_ATTR = 'OpenStreetMap';
const ESRI_ATTR = 'Esri, Maxar, Earthstar Geographics';
const CARTO_ATTR = 'OpenStreetMap, CARTO';

export type MapLayerId = 'map' | 'satellite' | 'hybrid' | 'night';

export interface MapLayerDef {
  id: MapLayerId;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /**
   * Providerda real raster mavjud bo'lgan eng yuqori zoom.
   * Leaflet undan yuqorida shu tile'ni scale qiladi; aks holda Esri ayrim
   * hududlarda "Map data not yet available" placeholder qaytaradi.
   */
  maxNativeZoom?: number;
  /** Sputnik ustiga yozuvlar qatlami (gibrid rejim uchun). */
  labelsUrl?: string;
  /** Tungi rejim - UI ni qorayadi. */
  dark?: boolean;
}

export const MAP_LAYERS: MapLayerDef[] = [
  { id: 'map', label: 'Xarita', url: OSM_URL, attribution: OSM_ATTR, maxZoom: 19 },
  {
    id: 'satellite',
    label: 'Sputnik',
    url: ESRI_URL,
    attribution: ESRI_ATTR,
    maxZoom: 19,
    maxNativeZoom: 15,
  },
  {
    id: 'hybrid',
    label: 'Gibrid',
    url: ESRI_URL,
    attribution: ESRI_ATTR,
    maxZoom: 19,
    maxNativeZoom: 15,
    labelsUrl: CARTO_LABELS_URL,
  },
  { id: 'night', label: 'Tungi', url: CARTO_DARK_URL, attribution: CARTO_ATTR, maxZoom: 19, dark: true },
];

export type MapOverlayId = 'transit' | 'cycle' | 'stops' | 'traffic';

export interface MapOverlayDef {
  id: MapOverlayId;
  label: string;
  /** Tile qatlami bo'lmagan ustamalar (masalan bekatlar) uchun bo'sh. */
  url?: string;
  attribution?: string;
  opacity?: number;
}

export const MAP_OVERLAYS: MapOverlayDef[] = [
  ...(TRAFFIC_URL
    ? [
        {
          id: 'traffic' as const,
          label: 'Tirbandlik',
          url: TRAFFIC_URL,
          attribution: 'Traffic data provider',
          opacity: 0.82,
        },
      ]
    : []),
  { id: 'transit', label: 'Jamoat transporti', url: TRANSIT_URL, attribution: OSM_ATTR, opacity: 0.9 },
  { id: 'cycle', label: 'Velosiped yo\u2018llari', url: CYCLE_URL, attribution: OSM_ATTR, opacity: 0.8 },
  { id: 'stops', label: 'Bekatlar' },
];

export function getLayer(id: MapLayerId | string | null | undefined): MapLayerDef {
  return MAP_LAYERS.find((layer) => layer.id === id) ?? MAP_LAYERS[0];
}

export function getOverlay(id: string): MapOverlayDef | undefined {
  return MAP_OVERLAYS.find((overlay) => overlay.id === id);
}
