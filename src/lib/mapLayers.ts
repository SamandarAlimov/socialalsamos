/** Xarita qatlamlari va ustama qatlamlar (Yandex/Google uslubidagi almashtirgich uchun). */

// Diqqat: tile manzillari `{z}/{x}/{y}` shablonlarini o'z ichiga oladi, shu
// sababli ular bo'laklardan yig'iladi - hech qanday shablon almashtirilmasin.
const HTTPS = 'https' + '://';

export interface MapLayerDef {
  id: 'map' | 'satellite' | 'hybrid' | 'night';
  label: string;
  emoji: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** Gibrid rejim uchun yozuvlar (label) qatlami. */
  labelsUrl?: string;
  dark?: boolean;
}

const OSM_URL = HTTPS + '{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI_URL =
  HTTPS + 'server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const CARTO_LABELS = HTTPS + '{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
const CARTO_DARK = HTTPS + '{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TRANSIT_URL = HTTPS + 'tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png';
const CYCLE_URL = HTTPS + '{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png';

export const MAP_LAYERS: MapLayerDef[] = [
  {
    id: 'map',
    label: 'Xarita',
    emoji: '\ud83d\uddfa\ufe0f',
    url: OSM_URL,
    attribution: '\u00a9 OpenStreetMap',
    maxZoom: 19,
  },
  {
    id: 'satellite',
    label: 'Sputnik',
    emoji: '\ud83d\udef0\ufe0f',
    url: ESRI_URL,
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  {
    id: 'hybrid',
    label: 'Gibrid',
    emoji: '\ud83c\udf10',
    url: ESRI_URL,
    attribution: 'Esri, \u00a9 OpenStreetMap',
    maxZoom: 19,
    labelsUrl: CARTO_LABELS,
  },
  {
    id: 'night',
    label: 'Tungi',
    emoji: '\ud83c\udf19',
    url: CARTO_DARK,
    attribution: '\u00a9 OpenStreetMap, \u00a9 CARTO',
    maxZoom: 20,
    dark: true,
  },
];

export interface MapOverlayDef {
  id: 'transit' | 'cycle' | 'stops';
  label: string;
  hint?: string;
  url?: string;
  attribution?: string;
}

export const MAP_OVERLAYS: MapOverlayDef[] = [
  {
    id: 'transit',
    label: 'Jamoat transporti',
    hint: 'Avtobus, trolleybus va metro liniyalari',
    url: TRANSIT_URL,
    attribution: '\u00a9 memomaps.de, OpenStreetMap',
  },
  {
    id: 'cycle',
    label: 'Velosiped yo\u2018llari',
    hint: 'Velosiped infratuzilmasi',
    url: CYCLE_URL,
    attribution: 'CyclOSM, OpenStreetMap',
  },
  {
    id: 'stops',
    label: 'Bekatlar',
    hint: 'Atrofdagi bekatlarni xaritada ko\u2018rsatish',
  },
];

export function getLayer(id: string): MapLayerDef {
  return MAP_LAYERS.find((layer) => layer.id === id) ?? MAP_LAYERS[0];
}
