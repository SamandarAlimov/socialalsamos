import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  BedDouble,
  Bus,
  Car,
  Coffee,
  Croissant,
  Droplets,
  Dumbbell,
  Fuel,
  GraduationCap,
  Landmark,
  MapPin,
  MoonStar,
  Pill,
  Sandwich,
  ShoppingCart,
  Stethoscope,
  Store,
  Utensils,
} from 'lucide-react';

/**
 * Professional ikonkalar (emoji/stiker emas). Har kategoriya uchun lucide
 * ikonka + brend rangi. Xarita nishonlari ham shu ranglardan foydalanadi.
 */
export interface CategoryUi {
  label: string;
  Icon: LucideIcon;
  color: string;
}

export const CATEGORY_UI: Record<string, CategoryUi> = {
  restaurant: { label: 'Restoranlar', Icon: Utensils, color: '#E8663D' },
  cafe: { label: 'Kafelar', Icon: Coffee, color: '#B4703A' },
  fast_food: { label: 'Fast food', Icon: Sandwich, color: '#E9A13B' },
  bakery: { label: 'Nonvoyxona', Icon: Croissant, color: '#C98A46' },
  fuel: { label: 'Zaprovka', Icon: Fuel, color: '#2E7D5B' },
  parking: { label: 'Parkovka', Icon: Car, color: '#2F6FED' },
  pharmacy: { label: 'Dorixona', Icon: Pill, color: '#2FA37A' },
  hospital: { label: 'Shifoxona', Icon: Stethoscope, color: '#D7443E' },
  atm: { label: 'Bankomat', Icon: Banknote, color: '#3B7A57' },
  bank: { label: 'Banklar', Icon: Landmark, color: '#37568F' },
  market: { label: 'Do\u2018konlar', Icon: Store, color: '#8A5CD1' },
  supermarket: { label: 'Supermarket', Icon: ShoppingCart, color: '#7A4FC0' },
  mosque: { label: 'Masjidlar', Icon: MoonStar, color: '#2C8C7A' },
  hotel: { label: 'Mehmonxona', Icon: BedDouble, color: '#4A6FA5' },
  school: { label: 'Ta\u2018lim', Icon: GraduationCap, color: '#4260B8' },
  gym: { label: 'Sport zal', Icon: Dumbbell, color: '#C4453F' },
  car_wash: { label: 'Moyka', Icon: Droplets, color: '#2E9BC7' },
  bus_stop: { label: 'Bekatlar', Icon: Bus, color: '#1E7BC4' },
};

/** Filtr qatorida ko\u2018rinadigan tartib. */
export const CATEGORY_BAR_ORDER: string[] = [
  'restaurant',
  'cafe',
  'fast_food',
  'fuel',
  'parking',
  'pharmacy',
  'supermarket',
  'market',
  'atm',
  'bank',
  'mosque',
  'hospital',
  'hotel',
  'bus_stop',
  'gym',
  'car_wash',
  'school',
  'bakery',
];

export const DEFAULT_CATEGORY_UI: CategoryUi = {
  label: 'Joy',
  Icon: MapPin,
  color: '#2F6FED',
};

export function categoryUi(id?: string | null): CategoryUi {
  if (!id) return DEFAULT_CATEGORY_UI;
  return CATEGORY_UI[id] ?? DEFAULT_CATEGORY_UI;
}

/** Leaflet divIcon uchun tomchi shaklidagi professional nishon. */
export function pinSvg(color: string, options?: { size?: number; active?: boolean }): string {
  const size = options?.size ?? 34;
  const height = Math.round(size * 1.4);
  const ring = options?.active ? '#ffffff' : 'rgba(255,255,255,0.9)';
  return [
    '<svg width="' + size + '" height="' + height + '" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">',
    '<path d="M12 0C5.373 0 0 5.373 0 12c0 7.732 9.75 20.25 11.1 21.93a1.2 1.2 0 0 0 1.8 0C14.25 32.25 24 19.732 24 12 24 5.373 18.627 0 12 0z" fill="' +
      color +
      '" stroke="' +
      ring +
      '" stroke-width="1.5"/>',
    '<circle cx="12" cy="12" r="4.4" fill="#ffffff"/>',
    '</svg>',
  ].join('');
}

/** Foydalanuvchi joylashuvi uchun "tirik" nuqta. */
export function meDotSvg(): string {
  return [
    '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">',
    '<circle cx="13" cy="13" r="11" fill="rgba(47,111,237,0.22)"/>',
    '<circle cx="13" cy="13" r="6" fill="#2F6FED" stroke="#ffffff" stroke-width="2.5"/>',
    '</svg>',
  ].join('');
}

/** Bekat nishoni (kichik, kvadrat - POI dan farq qilib turadi). */
export function stopSvg(): string {
  return [
    '<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">',
    '<rect x="1" y="1" width="20" height="20" rx="6" fill="#1E7BC4" stroke="#ffffff" stroke-width="2"/>',
    '<path d="M7 6h8v7H7z" fill="#ffffff"/>',
    '<circle cx="8.5" cy="15" r="1.4" fill="#ffffff"/>',
    '<circle cx="13.5" cy="15" r="1.4" fill="#ffffff"/>',
    '</svg>',
  ].join('');
}


/** POI markerlar ko'payganda xaritani toza saqlaydigan cluster badge. */
export function clusterSvg(count: number): string {
  const text = count > 99 ? '99+' : String(count);
  const size = count > 20 ? 42 : count > 8 ? 38 : 34;
  return [
    '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:999px;',
    'display:flex;align-items:center;justify-content:center;',
    'background:rgba(25,30,40,.88);color:white;font:700 12px/1 system-ui;',
    'border:2px solid rgba(255,255,255,.95);box-shadow:0 6px 20px rgba(0,0,0,.22);',
    'backdrop-filter:blur(8px)">',
    text,
    '</div>',
  ].join('');
}

/** GTFS-RT live vehicle markeri: marshrut raqami bilan. */
export function vehicleSvg(ref: string, color?: string | null, bearing?: number | null): string {
  const safeRef = String(ref || 'BUS').slice(0, 5).replace(/[<>&"']/g, '');
  const bg = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#1677D2';
  const rotate = Number.isFinite(Number(bearing)) ? Number(bearing) : 0;
  return [
    '<div style="position:relative;display:flex;align-items:center;justify-content:center;">',
    '<div style="min-width:34px;height:28px;padding:0 7px;border-radius:10px;',
    'display:flex;align-items:center;justify-content:center;background:' + bg + ';',
    'color:#fff;font:800 11px/1 system-ui;border:2px solid #fff;',
    'box-shadow:0 5px 16px rgba(0,0,0,.24)">',
    safeRef,
    '</div>',
    '<div style="position:absolute;bottom:-5px;width:8px;height:8px;background:' + bg + ';',
    'transform:rotate(45deg);border-right:2px solid #fff;border-bottom:2px solid #fff"></div>',
    Number.isFinite(Number(bearing))
      ? '<div style="position:absolute;top:-9px;font-size:9px;color:' + bg + ';transform:rotate(' + rotate + 'deg)">▲</div>'
      : '',
    '</div>',
  ].join('');
}


/** Active navigation uchun yo'nalishga qarab buriladigan marker. */
export function navigationArrowSvg(heading?: number | null): string {
  const rotate = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  return [
    '<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;',
    'filter:drop-shadow(0 5px 12px rgba(0,0,0,.28));transform:rotate(' + rotate + 'deg)">',
    '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">',
    '<circle cx="20" cy="20" r="17" fill="rgba(47,111,237,.18)"/>',
    '<path d="M20 5.5 30 29l-10-4.8L10 29 20 5.5z" fill="#2F6FED" stroke="#fff" stroke-width="2.8" stroke-linejoin="round"/>',
    '</svg>',
    '</div>',
  ].join('');
}
