/**
 * Albom (media group) — Telegramdagidek bir nechta rasm/video bitta xabar
 * ichida to'r (grid) bo'lib ko'rinadi.
 *
 * Xabar matni formati:
 *   [ALBUM]{"items":[{"url":"...","type":"image"}],"caption":"..."}[/ALBUM]
 */

export type AlbumItemType = 'image' | 'video';

export interface AlbumItem {
  url: string;
  type: AlbumItemType;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  thumb?: string;
}

export interface AlbumData {
  items: AlbumItem[];
  caption?: string;
}

export const ALBUM_PREFIX = '[ALBUM]';
export const ALBUM_SUFFIX = '[/ALBUM]';
export const ALBUM_REGEX = /\[ALBUM\]([\s\S]*?)\[\/ALBUM\]/;

/** Albomda ko'rsatiladigan maksimal element (qolganlari "+N" bo'ladi). */
export const ALBUM_MAX_VISIBLE = 10;

/** Bitta xabarga sig'adigan maksimal media soni (Telegramda 10). */
export const ALBUM_MAX_ITEMS = 10;

export function buildAlbumPayload(data: AlbumData): string {
  const items = data.items.map((item) => ({
    url: item.url,
    type: item.type,
    name: item.name,
    size: item.size,
    width: item.width,
    height: item.height,
    duration: item.duration,
    thumb: item.thumb,
  }));
  const payload = { items, caption: data.caption || undefined };
  return `${ALBUM_PREFIX}${JSON.stringify(payload)}${ALBUM_SUFFIX}`;
}

export function isAlbumMessage(content: string | null | undefined): boolean {
  if (!content) return false;
  return ALBUM_REGEX.test(content);
}

export function parseAlbumPayload(content: string | null | undefined): AlbumData | null {
  if (!content) return null;
  const match = content.match(ALBUM_REGEX);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as Partial<AlbumData>;
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;

    const items: AlbumItem[] = parsed.items
      .filter((item): item is AlbumItem => Boolean(item && typeof item.url === 'string'))
      .slice(0, ALBUM_MAX_ITEMS)
      .map((item) => ({
        url: item.url,
        type: item.type === 'video' ? 'video' : 'image',
        name: typeof item.name === 'string' ? item.name : undefined,
        size: typeof item.size === 'number' ? item.size : undefined,
        width: typeof item.width === 'number' ? item.width : undefined,
        height: typeof item.height === 'number' ? item.height : undefined,
        duration: typeof item.duration === 'number' ? item.duration : undefined,
        thumb: typeof item.thumb === 'string' ? item.thumb : undefined,
      }));

    if (items.length === 0) return null;

    const caption =
      typeof parsed.caption === 'string' && parsed.caption.trim().length > 0
        ? parsed.caption
        : undefined;

    return { items, caption };
  } catch {
    return null;
  }
}

/** Chat ro'yxatidagi qisqa ko'rinish uchun matn. */
export function albumPreviewText(data: AlbumData): string {
  if (data.caption) return data.caption;
  const photos = data.items.filter((i) => i.type === 'image').length;
  const videos = data.items.filter((i) => i.type === 'video').length;

  if (photos && videos) return `${data.items.length} ta media`;
  if (videos) return `${videos} ta video`;
  return `${photos} ta rasm`;
}

export interface AlbumCellLayout {
  colSpan: number;
  rowSpan: number;
}

export interface AlbumLayout {
  columns: number;
  rows: number;
  cells: AlbumCellLayout[];
  /** Ko'rsatilmagan elementlar soni ("+N") */
  hiddenCount: number;
}

const ONE: AlbumCellLayout = { colSpan: 1, rowSpan: 1 };

/**
 * Telegramdagi albom mozaikasiga yaqin joylashuv.
 * Grid `columns` x `rows` bo'lib, har bir element o'z span'iga ega.
 */
export function albumLayout(count: number): AlbumLayout {
  const visible = Math.min(count, ALBUM_MAX_VISIBLE);
  const hiddenCount = Math.max(0, count - visible);

  if (visible <= 1) {
    return { columns: 1, rows: 1, cells: [ONE], hiddenCount };
  }

  if (visible === 2) {
    return { columns: 2, rows: 1, cells: [ONE, ONE], hiddenCount };
  }

  if (visible === 3) {
    // Chapda baland element, o'ngda ikkita kichik
    return {
      columns: 2,
      rows: 2,
      cells: [{ colSpan: 1, rowSpan: 2 }, ONE, ONE],
      hiddenCount,
    };
  }

  if (visible === 4) {
    return { columns: 2, rows: 2, cells: [ONE, ONE, ONE, ONE], hiddenCount };
  }

  if (visible === 5) {
    // Yuqorida ikkita katta, pastda uchta kichik
    return {
      columns: 6,
      rows: 2,
      cells: [
        { colSpan: 3, rowSpan: 1 },
        { colSpan: 3, rowSpan: 1 },
        { colSpan: 2, rowSpan: 1 },
        { colSpan: 2, rowSpan: 1 },
        { colSpan: 2, rowSpan: 1 },
      ],
      hiddenCount,
    };
  }

  // 6 va undan ko'p: uch ustunli to'r
  const columns = 3;
  const rows = Math.ceil(visible / columns);
  return {
    columns,
    rows,
    cells: Array.from({ length: visible }, () => ONE),
    hiddenCount,
  };
}

/** Fayl hajmini o'qishga qulay ko'rinishga aylantiradi. */
export function formatAlbumSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Video davomiyligini mm:ss ko'rinishida qaytaradi. */
export function formatAlbumDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
