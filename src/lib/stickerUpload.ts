/**
 * Foydalanuvchi stikerlarini tayyorlash quvuri (Bosqich C).
 *
 * Bosqichlar: rasm o‘qish → (ixtiyoriy) fon o‘chirish → shaffof chekkalarni
 * kesish → 512x512 WebP + 128px preview.
 *
 * Nima uchun 512x512: Telegram/WhatsApp bilan bir xil standart, retina
 * ekranda ham aniq ko‘rinadi, lekin fayl kichik qoladi (odatda 40–120 KB).
 */

export const STICKER_SIZE = 512;
export const STICKER_PREVIEW_SIZE = 128;
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024; // 12 MB
export const DAILY_UPLOAD_LIMIT = 30;

export const ACCEPTED_STICKER_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
];

export interface PreparedSticker {
  /** 512x512 asosiy fayl. */
  full: Blob;
  /** 128x128 ro‘yxat uchun yengil nusxa. */
  preview: Blob;
  /** 'image/webp' yoki qurilma qo‘llamasa 'image/png'. */
  mimeType: string;
  extension: 'webp' | 'png';
  width: number;
  height: number;
  /** Fon haqiqatan o‘chirildimi (paket mavjud bo‘lmasa — false). */
  backgroundRemoved: boolean;
}

export class StickerUploadError extends Error {}

/** Fayl turi va o‘lchamini tekshiradi — xato xabari foydalanuvchi tilida. */
export function validateStickerFile(file: File): void {
  if (!ACCEPTED_STICKER_TYPES.includes(file.type)) {
    throw new StickerUploadError(
      'Faqat PNG, JPEG, WebP, GIF yoki AVIF rasm yuklash mumkin',
    );
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new StickerUploadError('Rasm hajmi 12 MB dan oshmasligi kerak');
  }
}

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new StickerUploadError('Rasmni o\u2018qib bo\u2018lmadi'));
    };
    image.src = url;
  });
}

/**
 * Fonni avtomatik o‘chirish.
 *
 * `@imgly/background-removal` (brauzerda ishlaydigan segmentatsiya modeli)
 * o‘rnatilgan bo‘lsa ishlatiladi. Paket hali `package.json` da bo‘lmasligi
 * mumkin, shuning uchun spetsifikator o‘zgaruvchida saqlanadi va Vite uni
 * build vaqtida majburiy hal qilmaydi — paket yo‘q bo‘lsa quvur oddiy
 * kesish rejimida davom etadi.
 */
async function tryRemoveBackground(file: File): Promise<{ blob: Blob; removed: boolean }> {
  const moduleName = '@imgly/background-removal';

  try {
    const mod = (await import(/* @vite-ignore */ moduleName)) as {
      removeBackground?: (input: Blob) => Promise<Blob>;
    };

    if (typeof mod.removeBackground === 'function') {
      const blob = await mod.removeBackground(file);
      return { blob, removed: true };
    }
  } catch {
    // Paket o‘rnatilmagan yoki model yuklanmadi — bu kutilgan holat.
  }

  return { blob: file, removed: false };
}

/**
 * Shaffof chekkalarni kesadi.
 *
 * Fon o‘chirilgandan keyin rasm atrofida katta bo‘sh joy qoladi; uni
 * kesmasak, stiker kichkina ko‘rinadi va foydalanuvchi uni kattalashtirishga
 * majbur bo‘ladi.
 */
function trimTransparent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = canvas.getContext('2d');
  if (!context) return canvas;

  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);

  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  // Butunlay shaffof yoki chekkasi yo‘q — o‘zgartirmaymiz.
  if (right < 0 || bottom < 0) return canvas;

  const padding = Math.round(Math.max(right - left, bottom - top) * 0.04);
  const cropX = Math.max(0, left - padding);
  const cropY = Math.max(0, top - padding);
  const cropWidth = Math.min(width - cropX, right - left + 1 + padding * 2);
  const cropHeight = Math.min(height - cropY, bottom - top + 1 + padding * 2);

  if (cropWidth <= 0 || cropHeight <= 0) return canvas;

  const cropped = document.createElement('canvas');
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  cropped
    .getContext('2d')
    ?.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  return cropped;
}

function squareCanvas(source: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const target = document.createElement('canvas');
  target.width = size;
  target.height = size;

  const context = target.getContext('2d');
  if (!context) return target;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  // Nisbatni saqlab, kvadrat ichiga to‘liq joylashtiramiz (kesmaymiz).
  const ratio = Math.min(size / source.width, size / source.height);
  const drawWidth = Math.round(source.width * ratio);
  const drawHeight = Math.round(source.height * ratio);

  context.drawImage(
    source,
    Math.round((size - drawWidth) / 2),
    Math.round((size - drawHeight) / 2),
    drawWidth,
    drawHeight,
  );

  return target;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new StickerUploadError('Faylni tayyorlab bo\u2018lmadi'));
      },
      mimeType,
      quality,
    );
  });
}

/** Qurilma WebP eksportini qo‘llaydimi. */
function supportsWebp(): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

/**
 * Yuklangan rasmni stikerga aylantiradi.
 *
 * @param file Foydalanuvchi tanlagan rasm
 * @param options.removeBackground Fonni o‘chirishga harakat qilish
 * @param options.onStage Bosqich haqida xabar (UI da progress ko‘rsatish uchun)
 */
export async function prepareSticker(
  file: File,
  options: {
    removeBackground?: boolean;
    onStage?: (stage: 'reading' | 'segmenting' | 'trimming' | 'encoding') => void;
  } = {},
): Promise<PreparedSticker> {
  validateStickerFile(file);

  options.onStage?.('reading');

  let working: Blob = file;
  let backgroundRemoved = false;

  if (options.removeBackground !== false) {
    options.onStage?.('segmenting');
    const result = await tryRemoveBackground(file);
    working = result.blob;
    backgroundRemoved = result.removed;
  }

  const image = await loadImage(working);

  const base = document.createElement('canvas');
  base.width = image.naturalWidth || image.width;
  base.height = image.naturalHeight || image.height;
  base.getContext('2d')?.drawImage(image, 0, 0);

  options.onStage?.('trimming');
  const trimmed = backgroundRemoved ? trimTransparent(base) : base;

  options.onStage?.('encoding');
  const useWebp = supportsWebp();
  const mimeType = useWebp ? 'image/webp' : 'image/png';
  const extension: 'webp' | 'png' = useWebp ? 'webp' : 'png';

  const full = await canvasToBlob(squareCanvas(trimmed, STICKER_SIZE), mimeType, 0.92);
  const preview = await canvasToBlob(
    squareCanvas(trimmed, STICKER_PREVIEW_SIZE),
    mimeType,
    0.85,
  );

  return {
    full,
    preview,
    mimeType,
    extension,
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    backgroundRemoved,
  };
}
