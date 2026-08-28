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
