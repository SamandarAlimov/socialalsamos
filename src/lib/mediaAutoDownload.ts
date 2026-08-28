/**
 * Telegramdek "Media avtomatik yuklab olish" tizimi.
 *
 * Har bir media turi uchun uch rejim:
 *  - `always` : har doim avtomatik yuklanadi
 *  - `wifi`   : faqat cheklanmagan (Wi-Fi kabi) ulanishda
 *  - `never`  : faqat foydalanuvchi bosganda
 *
 * Bundan tashqari hajm chegaralari va "Ma'lumot tejash" rejimi bor.
 * Sozlamalar brauzerda saqlanadi va `MEDIA_AUTO_DOWNLOAD_EVENT` orqali
 * barcha komponentlarga darhol tarqaladi.
 */

export type AutoDownloadMode = 'always' | 'wifi' | 'never';

export type MediaCategory = 'photo' | 'video' | 'file' | 'voice' | 'gif';

export interface MediaAutoDownloadSettings {
  photo: AutoDownloadMode;
  video: AutoDownloadMode;
  file: AutoDownloadMode;
  voice: AutoDownloadMode;
  gif: AutoDownloadMode;
  /** Avtomatik yuklanadigan videoning maksimal hajmi (MB) */
  maxVideoMb: number;
  /** Avtomatik yuklanadigan faylning maksimal hajmi (MB) */
  maxFileMb: number;
  /** Ma'lumot tejash: barcha avtomatik yuklashni to'xtatadi */
  dataSaver: boolean;
  /** Videolarni avtomatik o'ynatish */
  autoplayVideo: boolean;
  /** GIF/animatsiyalarni avtomatik o'ynatish */
  autoplayGif: boolean;
}

export const STORAGE_KEY_AUTO_DOWNLOAD = 'chat.autoDownload.v1';
export const MEDIA_AUTO_DOWNLOAD_EVENT = 'chat-auto-download-change';

export const DEFAULT_AUTO_DOWNLOAD: MediaAutoDownloadSettings = {
  photo: 'always',
  video: 'wifi',
  file: 'wifi',
  voice: 'always',
  gif: 'wifi',
  maxVideoMb: 15,
  maxFileMb: 10,
  dataSaver: false,
  autoplayVideo: true,
  autoplayGif: true,
};

export const MAX_VIDEO_MB_MIN = 1;
export const MAX_VIDEO_MB_MAX = 100;
export const MAX_FILE_MB_MIN = 1;
export const MAX_FILE_MB_MAX = 100;

export const AUTO_DOWNLOAD_MODE_LABELS: Record<AutoDownloadMode, string> = {
  always: 'Har doim',
  wifi: 'Faqat Wi-Fi',
  never: 'Hech qachon',
};

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  photo: 'Rasmlar',
  video: 'Videolar',
  file: 'Fayllar',
  voice: 'Ovozli xabarlar',
  gif: 'GIF va animatsiyalar',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isMode(value: unknown): value is AutoDownloadMode {
  return value === 'always' || value === 'wifi' || value === 'never';
}

/** Sozlamalarni o'qish (buzuq qiymatlar standartga qaytariladi). */
export function loadAutoDownload(): MediaAutoDownloadSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_AUTO_DOWNLOAD };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_AUTO_DOWNLOAD);
    if (!raw) return { ...DEFAULT_AUTO_DOWNLOAD };

    const parsed = JSON.parse(raw) as Partial<MediaAutoDownloadSettings>;
    return {
      photo: isMode(parsed.photo) ? parsed.photo : DEFAULT_AUTO_DOWNLOAD.photo,
      video: isMode(parsed.video) ? parsed.video : DEFAULT_AUTO_DOWNLOAD.video,
      file: isMode(parsed.file) ? parsed.file : DEFAULT_AUTO_DOWNLOAD.file,
      voice: isMode(parsed.voice) ? parsed.voice : DEFAULT_AUTO_DOWNLOAD.voice,
      gif: isMode(parsed.gif) ? parsed.gif : DEFAULT_AUTO_DOWNLOAD.gif,
      maxVideoMb: clamp(
        Number(parsed.maxVideoMb) || DEFAULT_AUTO_DOWNLOAD.maxVideoMb,
        MAX_VIDEO_MB_MIN,
        MAX_VIDEO_MB_MAX
      ),
      maxFileMb: clamp(
        Number(parsed.maxFileMb) || DEFAULT_AUTO_DOWNLOAD.maxFileMb,
        MAX_FILE_MB_MIN,
        MAX_FILE_MB_MAX
      ),
      dataSaver: Boolean(parsed.dataSaver),
      autoplayVideo:
        parsed.autoplayVideo === undefined
          ? DEFAULT_AUTO_DOWNLOAD.autoplayVideo
          : Boolean(parsed.autoplayVideo),
      autoplayGif:
        parsed.autoplayGif === undefined
          ? DEFAULT_AUTO_DOWNLOAD.autoplayGif
          : Boolean(parsed.autoplayGif),
    };
  } catch {
    return { ...DEFAULT_AUTO_DOWNLOAD };
  }
}

/** Sozlamalarni saqlash va barcha oynalarga xabar berish. */
export function saveAutoDownload(settings: MediaAutoDownloadSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_AUTO_DOWNLOAD, JSON.stringify(settings));
  } catch {
    // xotira to'lgan bo'lsa e'tiborsiz qoldiramiz
  }
  window.dispatchEvent(new CustomEvent(MEDIA_AUTO_DOWNLOAD_EVENT, { detail: settings }));
}

export function isDefaultAutoDownload(settings: MediaAutoDownloadSettings): boolean {
  return (
    Object.keys(DEFAULT_AUTO_DOWNLOAD) as Array<keyof MediaAutoDownloadSettings>
  ).every((key) => settings[key] === DEFAULT_AUTO_DOWNLOAD[key]);
}

export type ConnectionKind = 'wifi' | 'cellular' | 'offline' | 'unknown';

interface NetworkInformationLike {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export function getNetworkInformation(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

/**
 * Ulanish turini aniqlaydi.
 *
 * Brauzerlar Wi-Fi/mobil ma'lumotni har doim ochib bermaydi, shuning uchun:
 *  - `saveData` yoqilgan bo'lsa -> `cellular` (tejash rejimi)
 *  - `type` mavjud bo'lsa -> to'g'ridan-to'g'ri ishlatiladi
 *  - `effectiveType` 2g/3g bo'lsa -> `cellular`
 *  - aks holda -> `unknown` (cheklanmagan deb hisoblanadi)
 */
export function getConnectionKind(): ConnectionKind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';

  const connection = getNetworkInformation();
  if (!connection) return 'unknown';

  if (connection.saveData) return 'cellular';

  const type = (connection.type || '').toLowerCase();
  if (type === 'wifi' || type === 'ethernet') return 'wifi';
  if (type === 'cellular') return 'cellular';

  const effective = (connection.effectiveType || '').toLowerCase();
  if (effective === 'slow-2g' || effective === '2g' || effective === '3g') return 'cellular';

  return 'unknown';
}

/** Ulanish cheklanmagan (Wi-Fi kabi) hisoblanadimi? */
export function isUnmeteredConnection(kind: ConnectionKind = getConnectionKind()): boolean {
  return kind === 'wifi' || kind === 'unknown';
}

export const CONNECTION_LABELS: Record<ConnectionKind, string> = {
  wifi: 'Wi-Fi',
  cellular: 'Mobil internet',
  offline: 'Ulanish yo\u2018q',
  unknown: 'Cheklanmagan ulanish',
};

function categoryLimitMb(
  category: MediaCategory,
  settings: MediaAutoDownloadSettings
): number | null {
  if (category === 'video' || category === 'gif') return settings.maxVideoMb;
  if (category === 'file') return settings.maxFileMb;
  return null;
}

/**
 * Shu mediani avtomatik yuklash kerakmi?
 *
 * @param sizeBytes fayl hajmi (bilinmasa `undefined`)
 */
export function shouldAutoDownload(
  category: MediaCategory,
  options: {
    settings?: MediaAutoDownloadSettings;
    sizeBytes?: number;
    connection?: ConnectionKind;
  } = {}
): boolean {
  const settings = options.settings || loadAutoDownload();
  const connection = options.connection || getConnectionKind();

  if (connection === 'offline') return false;
  if (settings.dataSaver) return false;

  const mode = settings[category];
  if (mode === 'never') return false;
  if (mode === 'wifi' && !isUnmeteredConnection(connection)) return false;

  const limitMb = categoryLimitMb(category, settings);
  if (limitMb !== null && options.sizeBytes && options.sizeBytes > limitMb * 1024 * 1024) {
    return false;
  }

  return true;
}

/** Media turini (mediaType/mime) kategoriya bilan moslash. */
export function categoryFromMediaType(
  mediaType: string | null | undefined,
  fileName?: string
): MediaCategory {
  const value = (mediaType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();

  if (value.includes('voice') || value.includes('audio')) return 'voice';
  if (value.includes('gif') || name.endsWith('.gif')) return 'gif';
  if (value.includes('image') || value === 'photo') return 'photo';
  if (value.includes('video')) return 'video';
  return 'file';
}
