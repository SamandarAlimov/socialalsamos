/**
 * Post yaratish oqimi uchun umumiy qoidalar: fayl turlari, limitlar, validatsiya.
 * Create sahifasi endi faqat rasm/videoni emas, HAR QANDAY faylni qabul qiladi.
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export const MAX_FILES_PER_POST = 10;
export const MAX_COLLABORATORS = 10;

/** Har bir tur uchun maksimal hajm (bayt). */
export const MAX_FILE_SIZE: Record<MediaKind, number> = {
  image: 25 * 1024 * 1024, // 25 MB
  video: 512 * 1024 * 1024, // 512 MB
  audio: 100 * 1024 * 1024, // 100 MB
  document: 100 * 1024 * 1024, // 100 MB
  archive: 200 * 1024 * 1024, // 200 MB
  other: 100 * 1024 * 1024, // 100 MB
};

/** Fayl tanlash dialogida hech narsa cheklanmaydi. */
export const ACCEPT_ANY_FILE = '*/*';

const DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'rtf', 'odt', 'txt', 'md', 'csv',
  'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'epub', 'json', 'xml',
]);

const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'heic', 'heif', 'tif', 'tiff',
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp', 'hevc']);

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'amr']);

export function getFileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

/**
 * Fayl turini aniqlash. MIME turi ishonchsiz bo'lganda (iOS HEIC, ba'zi
 * Android brauzerlari bo'sh `type` qaytaradi) kengaytmaga tayanadi.
 */
export function detectMediaKind(file: Pick<File, 'name' | 'type'>): MediaKind {
  const mime = (file.type || '').toLowerCase();
  const ext = getFileExtension(file.name || '');

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';

  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'document';
  if (mime.includes('zip') || mime.includes('compressed')) return 'archive';

  return 'other';
}

/** Create composer inline preview'i (documentlar feed'da PostDocumentViewer orqali preview qilinadi). */
export function isPreviewable(kind: MediaKind): boolean {
  return kind === 'image' || kind === 'video' || kind === 'audio';
}

/** Brauzerda tahrirlash (crop/filter/trim) mumkinmi. */
export function isEditable(kind: MediaKind): boolean {
  return kind === 'image' || kind === 'video';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

const KIND_LABELS_UZ: Record<MediaKind, string> = {
  image: 'Rasm',
  video: 'Video',
  audio: 'Audio',
  document: 'Hujjat',
  archive: 'Arxiv',
  other: 'Fayl',
};

export function mediaKindLabel(kind: MediaKind): string {
  return KIND_LABELS_UZ[kind];
}

export type FileValidationResult =
  | { ok: true; kind: MediaKind }
  | { ok: false; kind: MediaKind; error: string };

export function validateFile(file: File): FileValidationResult {
  const kind = detectMediaKind(file);

  if (file.size === 0) {
    return { ok: false, kind, error: `"${file.name}" bo'sh fayl` };
  }

  const limit = MAX_FILE_SIZE[kind];
  if (file.size > limit) {
    return {
      ok: false,
      kind,
      error: `"${file.name}" juda katta (${formatBytes(file.size)}). ${mediaKindLabel(kind)} uchun chegara ${formatBytes(limit)}`,
    };
  }

  return { ok: true, kind };
}

/**
 * Tanlangan fayllarni limitga moslab ajratadi.
 * Eski kodda `slice(0, maxFiles - current)` manfiy bo'lib qolishi mumkin edi.
 */
export function partitionSelectedFiles(
  files: File[],
  currentCount: number,
  maxFiles: number = MAX_FILES_PER_POST,
): { accepted: Array<{ file: File; kind: MediaKind }>; errors: string[] } {
  const remaining = Math.max(0, maxFiles - currentCount);
  const accepted: Array<{ file: File; kind: MediaKind }> = [];
  const errors: string[] = [];

  if (remaining === 0 && files.length > 0) {
    errors.push(`Eng ko'pi bilan ${maxFiles} ta fayl qo'shish mumkin`);
    return { accepted, errors };
  }

  for (const file of files) {
    if (accepted.length >= remaining) {
      errors.push(`Eng ko'pi bilan ${maxFiles} ta fayl qo'shish mumkin`);
      break;
    }

    const result = validateFile(file);
    if ('error' in result) {
      errors.push(result.error);
    } else {
      accepted.push({ file, kind: result.kind });
    }
  }

  return { accepted, errors: Array.from(new Set(errors)) };
}

/** Preview URL larni xotiradan bo'shatish (memory leak oldini olish). */
export function revokePreviewUrls(urls: Array<string | undefined | null>): void {
  for (const url of urls) {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  }
}
