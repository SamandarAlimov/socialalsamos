/**
 * Chat foni (wallpaper) — Telegramdagidek.
 *
 * Foydalanuvchi tanlovi `localStorage`da saqlanadi (darhol ishlaydi, migratsiya
 * talab qilmaydi) va o'zgarganda barcha komponentlarga custom event orqali
 * xabar beriladi. Kelajakda `user_settings.chat_wallpaper` ustuni qo'shilsa,
 * `syncChatWallpaperToServer` orqali qurilmalar o'rtasida sinxronlash mumkin.
 */

export type ChatWallpaperKind = 'none' | 'solid' | 'gradient' | 'image';

export interface ChatWallpaper {
  /** Preset id yoki 'custom' */
  id: string;
  kind: ChatWallpaperKind;
  /** Asosiy fon rangi (CSS color) */
  color: string;
  /** CSS background-image qiymati ('none' bo'lishi mumkin) */
  image: string;
  /** Pattern (takrorlanuvchi) fonmi */
  repeat: boolean;
  /** Qoraytirish darajasi 0..0.8 */
  dim: number;
  /** Blur (px) 0..24 */
  blur: number;
}

export interface ChatWallpaperPreset {
  id: string;
  /** Ro'yxatda ko'rsatiladigan nom (o'zbekcha) */
  name: string;
  kind: ChatWallpaperKind;
  color: string;
  image: string;
  repeat: boolean;
  /** Preset uchun tavsiya etilgan boshlang'ich qiymatlar */
  dim?: number;
  blur?: number;
}

const STORAGE_KEY = 'chat.wallpaper.v1';
export const CHAT_WALLPAPER_EVENT = 'chat-wallpaper-change';

/** Kichik SVG patternlarni data-URI sifatida yasash */
function svgPattern(size: number, body: string): string {
  const svg =
    "%3Csvg xmlns='http://www.w3.org/2000/svg' width='" +
    size +
    "' height='" +
    size +
    "'%3E" +
    body +
    '%3C/svg%3E';
  return 'url("data:image/svg+xml,' + svg + '")';
}

const DOT_PATTERN = svgPattern(
  36,
  "%3Ccircle cx='6' cy='6' r='2.2' fill='%23ffffff' fill-opacity='0.22'/%3E%3Ccircle cx='24' cy='20' r='1.6' fill='%23ffffff' fill-opacity='0.16'/%3E"
);

const HEART_PATTERN = svgPattern(
  48,
  "%3Cpath d='M12 20c-4-3-7-5.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 3.6-3 6-7 9z' fill='%23ffffff' fill-opacity='0.18'/%3E%3Cpath d='M34 40c-3-2.2-5.2-4-5.2-6.7a3 3 0 015.2-2 3 3 0 015.2 2c0 2.7-2.2 4.5-5.2 6.7z' fill='%23ffffff' fill-opacity='0.13'/%3E"
);

const PLANE_PATTERN = svgPattern(
  56,
  "%3Cpath d='M4 16l22-8-8 22-3-8-11-6z' fill='%23ffffff' fill-opacity='0.14'/%3E%3Cpath d='M30 44l18-7-6 18-2.5-6.5L30 44z' fill='%23ffffff' fill-opacity='0.1'/%3E"
);

function gradient(from: string, via: string, to: string): string {
  return 'linear-gradient(160deg, ' + from + ' 0%, ' + via + ' 50%, ' + to + ' 100%)';
}

/** Telegramga yaqin tayyor fonlar */
export const CHAT_WALLPAPER_PRESETS: ChatWallpaperPreset[] = [
  {
    id: 'default',
    name: 'Standart',
    kind: 'none',
    color: '',
    image: 'none',
    repeat: false,
  },
  {
    id: 'alsamos',
    name: 'Alsamos',
    kind: 'gradient',
    color: '#f8b878',
    image: gradient('#ffd9b3', '#f7a65a', '#e97b23'),
    repeat: false,
    dim: 0.05,
  },
  {
    id: 'sunset',
    name: 'Shafaq',
    kind: 'gradient',
    color: '#f3a683',
    image: gradient('#fdd9a0', '#f3927a', '#c86b8d'),
    repeat: false,
  },
  {
    id: 'ocean',
    name: 'Dengiz',
    kind: 'gradient',
    color: '#7fb3d5',
    image: gradient('#cfe9f7', '#7fb3d5', '#3f6f9f'),
    repeat: false,
  },
  {
    id: 'mint',
    name: 'Yalpiz',
    kind: 'gradient',
    color: '#a8d5ba',
    image: gradient('#dff5e6', '#a8d5ba', '#5f9e7d'),
    repeat: false,
  },
  {
    id: 'lavender',
    name: 'Lavanda',
    kind: 'gradient',
    color: '#b9a7db',
    image: gradient('#e8ddf7', '#b9a7db', '#7d68ab'),
    repeat: false,
  },
  {
    id: 'graphite',
    name: 'Grafit',
    kind: 'gradient',
    color: '#2f3640',
    image: gradient('#4a5462', '#2f3640', '#191d24'),
    repeat: false,
  },
  {
    id: 'night',
    name: 'Tun',
    kind: 'gradient',
    color: '#101a2b',
    image: gradient('#26364f', '#152238', '#0a1120'),
    repeat: false,
  },
  {
    id: 'dots',
    name: 'Nuqtalar',
    kind: 'image',
    color: '#5a7fa8',
    image: DOT_PATTERN,
    repeat: true,
  },
  {
    id: 'hearts',
    name: 'Yuraklar',
    kind: 'image',
    color: '#c96b7a',
    image: HEART_PATTERN,
    repeat: true,
  },
  {
    id: 'planes',
    name: 'Samolyotlar',
    kind: 'image',
    color: '#4f8ab0',
    image: PLANE_PATTERN,
    repeat: true,
  },
  {
    id: 'solid-cream',
    name: 'Krem',
    kind: 'solid',
    color: '#f3ead9',
    image: 'none',
    repeat: false,
  },
  {
    id: 'solid-sage',
    name: 'Zaytun',
    kind: 'solid',
    color: '#dfe7dc',
    image: 'none',
    repeat: false,
  },
  {
    id: 'solid-slate',
    name: 'Ko\u2018k-kul',
    kind: 'solid',
    color: '#2b333d',
    image: 'none',
    repeat: false,
  },
];

export const DEFAULT_CHAT_WALLPAPER: ChatWallpaper = {
  id: 'default',
  kind: 'none',
  color: '',
  image: 'none',
  repeat: false,
  dim: 0,
  blur: 0,
};

export function wallpaperFromPreset(preset: ChatWallpaperPreset): ChatWallpaper {
  return {
    id: preset.id,
    kind: preset.kind,
    color: preset.color,
    image: preset.image,
    repeat: preset.repeat,
    dim: preset.dim ?? 0,
    blur: preset.blur ?? 0,
  };
}

/** Foydalanuvchi yuklagan rasmdan fon yasash */
export function wallpaperFromImageUrl(url: string): ChatWallpaper {
  return {
    id: 'custom',
    kind: 'image',
    color: '#1c1c1c',
    image: 'url("' + url + '")',
    repeat: false,
    dim: 0.12,
    blur: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalize(input: unknown): ChatWallpaper {
  const raw = (input || {}) as Partial<ChatWallpaper>;
  const kind: ChatWallpaperKind =
    raw.kind === 'solid' || raw.kind === 'gradient' || raw.kind === 'image'
      ? raw.kind
      : 'none';

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : 'default',
    kind,
    color: typeof raw.color === 'string' ? raw.color : '',
    image: typeof raw.image === 'string' && raw.image ? raw.image : 'none',
    repeat: Boolean(raw.repeat),
    dim: clamp(Number(raw.dim ?? 0), 0, 0.8),
    blur: clamp(Number(raw.blur ?? 0), 0, 24),
  };
}

export function readChatWallpaper(): ChatWallpaper {
  if (typeof window === 'undefined') return DEFAULT_CHAT_WALLPAPER;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CHAT_WALLPAPER;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_CHAT_WALLPAPER;
  }
}

export function writeChatWallpaper(wallpaper: ChatWallpaper): ChatWallpaper {
  const next = normalize(wallpaper);

  if (typeof window !== 'undefined') {
    try {
      if (next.id === 'default' && next.kind === 'none') {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // xotira to'lgan bo'lsa ham UI ishlashda davom etadi
    }

    window.dispatchEvent(new CustomEvent(CHAT_WALLPAPER_EVENT, { detail: next }));
  }

  return next;
}

export function isWallpaperActive(wallpaper: ChatWallpaper): boolean {
  return wallpaper.kind !== 'none' && (wallpaper.image !== 'none' || Boolean(wallpaper.color));
}

/** CSS o'zgaruvchilari: `.chat-wallpaper-surface` shu qiymatlardan foydalanadi */
export function wallpaperCssVars(wallpaper: ChatWallpaper): Record<string, string> {
  return {
    '--cw-color': wallpaper.color || 'transparent',
    '--cw-image': wallpaper.image || 'none',
    '--cw-size': wallpaper.repeat ? 'auto' : 'cover',
    '--cw-repeat': wallpaper.repeat ? 'repeat' : 'no-repeat',
    '--cw-dim': String(wallpaper.dim),
    '--cw-blur': wallpaper.blur + 'px',
  };
}

/** Preview (kichik kvadrat) uchun inline style */
export function wallpaperPreviewStyle(
  wallpaper: Pick<ChatWallpaper, 'color' | 'image' | 'repeat'>
): Record<string, string> {
  return {
    backgroundColor: wallpaper.color || 'transparent',
    backgroundImage: wallpaper.image || 'none',
    backgroundSize: wallpaper.repeat ? 'auto' : 'cover',
    backgroundRepeat: wallpaper.repeat ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
  };
}
