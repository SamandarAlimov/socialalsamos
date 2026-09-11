import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/supabaseAny';
import { uploadMedia } from '@/lib/mediaUpload';

export type ProductMediaType = 'image' | 'video';

export interface ProductMediaDraft {
  url: string;
  mediaType: ProductMediaType;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

export interface ProductMedia extends ProductMediaDraft {
  id: string;
  position: number;
}

// Limitlar bazadagi marketplace_check_product_media() triggeri bilan bir xil.
export const MAX_PRODUCT_MEDIA = 10;
export const MAX_PRODUCT_VIDEOS = 2;
export const MAX_VIDEO_DURATION_SECONDS = 60;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

// Marketplace kartalari va detail sahifasi original 8-12 MB kamera rasmini
// yuklab yurmasligi kerak. 1920 px katta ekran/retina uchun yetarli, WebP esa
// odatda kamera JPEG/PNG faylidan bir necha baravar kichik chiqadi.
const PRODUCT_IMAGE_MAX_EDGE = 1920;
const PRODUCT_IMAGE_WEBP_QUALITY = 0.82;
const PRODUCT_IMAGE_OPTIMIZE_FROM_BYTES = 320 * 1024;
const NEW_PRODUCT_MEDIA_GUARD_MS = 10 * 60 * 1000;
const HEIC_IMAGE_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);
const PASS_THROUGH_IMAGE_TYPES = new Set(['image/gif', 'image/svg+xml']);

export const ACCEPTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export const PRODUCT_MEDIA_ACCEPT =
  'image/*,video/mp4,video/webm,video/quicktime';

export type ProductMediaErrorCode =
  | 'unsupported_type'
  | 'too_many_media'
  | 'too_many_videos'
  | 'video_too_long'
  | 'video_too_large'
  | 'image_too_large'
  | 'image_unreadable'
  | 'video_unreadable'
  | 'poster_failed'
  | 'upload_failed';

const MESSAGES: Record<ProductMediaErrorCode, string> = {
  unsupported_type:
    "Bu fayl turi qo'llab-quvvatlanmaydi. Rasm yoki MP4 / WebM / MOV video yuklang.",
  too_many_media: `Ko'pi bilan ${MAX_PRODUCT_MEDIA} ta media qo'shish mumkin.`,
  too_many_videos: `Ko'pi bilan ${MAX_PRODUCT_VIDEOS} ta video qo'shish mumkin.`,
  video_too_long: `Video ${MAX_VIDEO_DURATION_SECONDS} soniyadan uzun bo'lmasligi kerak.`,
  video_too_large: 'Video hajmi 50 MB dan oshmasligi kerak.',
  image_too_large: 'Rasm hajmi 12 MB dan oshmasligi kerak.',
  image_unreadable:
    "Rasmni brauzer o'qiy olmadi. JPG, PNG yoki WebP formatida qayta tanlang.",
  video_unreadable:
    "Videoni o'qib bo'lmadi. Boshqa formatda (MP4) qayta urinib ko'ring.",
  poster_failed:
    "Video uchun muqova kadrini olishning iloji bo'lmadi. Boshqa video tanlang.",
  upload_failed: "Fayl yuklanmadi. Aloqani tekshirib, qayta urinib ko'ring.",
};

export function productMediaErrorMessage(code: ProductMediaErrorCode) {
  return MESSAGES[code] ?? MESSAGES.upload_failed;
}

export class ProductMediaError extends Error {
  code: ProductMediaErrorCode;

  constructor(code: ProductMediaErrorCode) {
    super(productMediaErrorMessage(code));
    this.code = code;
    this.name = 'ProductMediaError';
  }
}

export function isVideoFile(file: File) {
  return file.type.startsWith('video/');
}

export function formatMediaDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(seconds ?? 0)));
  if (total <= 0) return '';
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

// —— Rasm optimizatsiyasi ————————————————————————————————————————

function loadBrowserImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };

    image.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ProductMediaError('image_unreadable'));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
}

/**
 * Kamera/iPhone rasmlarini upload oldidan brauzerning o'zida yengillashtiradi.
 * Muhim jihat: HEIC/HEIF aynan shu yerda web-safe formatga o'tkaziladi. Aks
 * holda Safari yuklagan fayl Chrome/Windows'da umuman ko'rinmasligi mumkin.
 */
async function optimizeProductImage(file: File): Promise<File> {
  const normalizedType = file.type.toLowerCase();
  if (PASS_THROUGH_IMAGE_TYPES.has(normalizedType)) return file;

  const mustTranscode = HEIC_IMAGE_TYPES.has(normalizedType);
  const image = await loadBrowserImage(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new ProductMediaError('image_unreadable');

  const scale = Math.min(1, PRODUCT_IMAGE_MAX_EDGE / Math.max(width, height));
  const needsResize = scale < 0.999;
  const shouldOptimize =
    mustTranscode || needsResize || file.size >= PRODUCT_IMAGE_OPTIMIZE_FROM_BYTES;
  if (!shouldOptimize) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new ProductMediaError('image_unreadable');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  // WebP ishlamaydigan juda eski browser uchun JPEG fallback bor.
  let blob = await canvasBlob(canvas, 'image/webp', PRODUCT_IMAGE_WEBP_QUALITY);
  let extension = 'webp';
  let outputType = 'image/webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasBlob(canvas, 'image/jpeg', 0.84);
    extension = 'jpg';
    outputType = 'image/jpeg';
  }
  if (!blob) throw new ProductMediaError('image_unreadable');

  // Kichik JPEG/PNG'ni qayta kodlash uni kattalashtirib yuborsa originalni
  // saqlaymiz. HEIC va resize holatida esa browser-safe natija ustun turadi.
  if (!mustTranscode && !needsResize && blob.size >= file.size * 0.94) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'product-image';
  return new File([blob], `${baseName}.${extension}`, {
    type: outputType,
    lastModified: file.lastModified,
  });
}

// —— Video o'qish yordamchilari ————————————————————————————————————

function waitForEvent(
  target: HTMLVideoElement,
  event: string,
  timeoutMs: number,
) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new ProductMediaError('video_unreadable'));
    }, timeoutMs);

    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new ProductMediaError('video_unreadable'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, onDone);
      target.removeEventListener('error', onError);
    };

    target.addEventListener(event, onDone, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

function createDetachedVideo(objectUrl: string) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;
  return video;
}

/**
 * Videoni yuklamasdan turib, brauzerning o'zida davomiyligini o'lchaydi va
 * birinchi yaroqli kadridan muqova rasmi tayyorlaydi.
 */
async function inspectVideo(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const video = createDetachedVideo(objectUrl);

  try {
    await waitForEvent(video, 'loadedmetadata', 15000);

    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new ProductMediaError('video_unreadable');
    }
    if (duration > MAX_VIDEO_DURATION_SECONDS + 0.5) {
      throw new ProductMediaError('video_too_long');
    }

    // Birinchi kadr ko'pincha qora bo'ladi, shuning uchun bir oz oldinga
    // suriladi — lekin klipning oxiridan oshib ketmasligi kerak.
    const posterTime = Math.min(Math.max(duration * 0.1, 0.15), duration - 0.05);
    video.currentTime = Math.max(0, posterTime);
    await waitForEvent(video, 'seeked', 15000);

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      throw new ProductMediaError('poster_failed');
    }

    // Muqova hech qachon 1280 px dan katta bo'lmasin.
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext('2d');
    if (!context) throw new ProductMediaError('poster_failed');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', 0.82);
    });
    if (!blob) throw new ProductMediaError('poster_failed');

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    const poster = new File([blob], `${baseName}-poster.jpg`, {
      type: 'image/jpeg',
    });

    return {
      durationSeconds: Math.max(1, Math.round(duration)),
      poster,
      ratio: width / height,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

// —— Yuklash ——————————————————————————————————————————————

async function upload(file: File) {
  try {
    const uploaded = await uploadMedia(file, {
      type: 'product',
      visibility: 'public',
    });
    if (!uploaded?.url) throw new ProductMediaError('upload_failed');
    // DB uchun preview/signed URL emas, imkon qadar barqaror reference yoziladi.
    return (uploaded.storageUrl || uploaded.url) as string;
  } catch (error) {
    if (error instanceof ProductMediaError) throw error;
    console.error('Product media upload failed:', error);
    throw new ProductMediaError('upload_failed');
  }
}

/**
 * Bitta faylni tekshiradi, kerak bo'lsa optimallashtiradi/muqova tayyorlaydi va
 * yuklaydi. Xatolar har doim ProductMediaError bo'ladi.
 */
export async function prepareProductMedia(
  file: File,
  existing: ProductMediaDraft[],
): Promise<ProductMediaDraft> {
  if (existing.length >= MAX_PRODUCT_MEDIA) {
    throw new ProductMediaError('too_many_media');
  }

  if (isVideoFile(file)) {
    if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
      throw new ProductMediaError('unsupported_type');
    }
    const videoCount = existing.filter(item => item.mediaType === 'video').length;
    if (videoCount >= MAX_PRODUCT_VIDEOS) {
      throw new ProductMediaError('too_many_videos');
    }
    if (file.size > MAX_VIDEO_BYTES) {
      throw new ProductMediaError('video_too_large');
    }

    const { durationSeconds, poster } = await inspectVideo(file);
    // Muqova avval yuklanadi: video yuklanib, poster yiqilsa, baza
    // cheklovi satrni baribir rad etardi.
    const thumbnailUrl = await upload(poster);
    const url = await upload(file);

    return { url, mediaType: 'video', thumbnailUrl, durationSeconds };
  }

  if (!file.type.startsWith('image/')) {
    throw new ProductMediaError('unsupported_type');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ProductMediaError('image_too_large');
  }

  const optimized = await optimizeProductImage(file);
  const url = await upload(optimized);
  return { url, mediaType: 'image', thumbnailUrl: null, durationSeconds: null };
}

/**
 * Muqova doim rasm bo'lishi kerak (baza ham shuni talab qiladi), shuning
 * uchun ro'yxat yozilishdan oldin birinchi rasm boshiga suriladi.
 */
export function orderProductMedia(media: ProductMediaDraft[]) {
  const firstImage = media.findIndex(item => item.mediaType === 'image');
  if (firstImage <= 0) return [...media];
  const ordered = [...media];
  const [cover] = ordered.splice(firstImage, 1);
  return [cover, ...ordered];
}

type ProductMediaWriteError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type FreshProductGuard = {
  canRollback: boolean;
};

async function readFreshProductGuard(productId: string): Promise<FreshProductGuard> {
  const [productResult, mediaResult] = await Promise.all([
    db
      .from('products')
      .select('created_at, status')
      .eq('id', productId)
      .maybeSingle(),
    db
      .from('product_images')
      .select('id')
      .eq('product_id', productId)
      .limit(1),
  ]);

  if (productResult.error || mediaResult.error || !productResult.data) {
    return { canRollback: false };
  }

  const createdAt = Date.parse(String(productResult.data.created_at || ''));
  const age = Number.isFinite(createdAt) ? Date.now() - createdAt : Number.POSITIVE_INFINITY;
  const isFresh = age >= 0 && age <= NEW_PRODUCT_MEDIA_GUARD_MS;
  const hasExistingMedia = Boolean(mediaResult.data?.length);

  return {
    canRollback:
      isFresh &&
      !hasExistingMedia &&
      productResult.data.status !== 'deleted',
  };
}

/**
 * CreateProductDialog avval products satrini yaratadi, keyin media yozadi.
 * Media yiqilsa oldingi kod aktiv, ammo rasmsiz e'lon qoldirib ketardi.
 * Faqat ayni create-flow'dagi yangi va hali mediasiz productni soft-delete
 * qilamiz; eski product tahririga tegmaymiz. Throw callerning success/reset/
 * close oqimini to'xtatadi, media draft esa formda qoladi va user qayta urina oladi.
 */
async function abortFreshProductAfterMediaFailure(
  productId: string,
  guard: FreshProductGuard,
) {
  if (!guard.canRollback) return false;

  const { error } = await db
    .from('products')
    .update({ status: 'deleted' })
    .eq('id', productId);

  if (error) {
    console.error('Failed to rollback product after media persistence error:', error);
    return false;
  }

  toast({
    title: "Mahsulot e'lon qilinmadi",
    description:
      "Rasm bazaga to'liq saqlanmadi. Media formda qoldi — qayta E'lon qilishni bosing.",
    variant: 'destructive',
  });

  throw new Error('MARKETPLACE_PRODUCT_MEDIA_PERSISTENCE_FAILED');
}

/**
 * Production DB migratsiyasi frontenddan ortda qolsa PostgREST yangi media
 * ustunlarini schema cache'da topolmaydi. Oddiy rasmlar eski product_images
 * sxemasida ham to'liq ishlaydi, shuning uchun shu holatni aniq ajratib olamiz.
 */
function isLegacyProductImagesSchema(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as ProductMediaWriteError;
  const text = [value.message, value.details, value.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const mentionsNewColumn =
    text.includes('media_type') ||
    text.includes('thumbnail_url') ||
    text.includes('duration_seconds');

  return (
    value.code === 'PGRST204' ||
    (mentionsNewColumn && (text.includes('column') || text.includes('schema cache')))
  );
}

async function insertLegacyImageRows(productId: string, media: ProductMediaDraft[]) {
  const legacyRows = media.map((item, index) => ({
    product_id: productId,
    url: item.url,
    position: index,
  }));
  return db.from('product_images').insert(legacyRows);
}

/**
 * product_images ni berilgan ro'yxatga tenglashtiradi. Idempotent: eski
 * satrlar o'chiriladi va yangi tartib to'liq qayta yoziladi.
 *
 * Rasmlar uchun schema-cache driftga qo'shimcha himoya bor: production yangi
 * ustunlarni tanimasa legacy uchta ustun bilan qayta yoziladi. Image-only
 * productda ayrim PostgREST/trigger xatolari noto'g'ri klassifikatsiya qilinsa
 * ham legacy retry bajariladi — yangi product rasm-siz qolib ketmasin.
 */
export async function syncProductMedia(
  productId: string,
  media: ProductMediaDraft[],
) {
  const ordered = orderProductMedia(media).slice(0, MAX_PRODUCT_MEDIA);
  const guard = ordered.length > 0
    ? await readFreshProductGuard(productId)
    : { canRollback: false };

  const { error: deleteError } = await db
    .from('product_images')
    .delete()
    .eq('product_id', productId);

  if (deleteError) {
    console.error('Product media cleanup failed:', deleteError);
    return abortFreshProductAfterMediaFailure(productId, guard);
  }

  if (ordered.length === 0) return true;

  const rows = ordered.map((item, index) => ({
    product_id: productId,
    url: item.url,
    position: index,
    media_type: item.mediaType,
    thumbnail_url: item.thumbnailUrl,
    duration_seconds: item.durationSeconds,
  }));

  const { error: insertError } = await db.from('product_images').insert(rows);
  if (!insertError) return true;

  const imageOnly = ordered.every(item => item.mediaType === 'image');
  if (imageOnly) {
    if (isLegacyProductImagesSchema(insertError)) {
      console.warn(
        'Marketplace product media schema is behind frontend; retrying image persistence with legacy columns.',
        insertError,
      );
    } else {
      console.warn(
        'Marketplace product image write failed; retrying the compatibility write before giving up.',
        insertError,
      );
    }

    // Birinchi urinish transaction emas. Retrydan oldin ehtimoliy qisman
    // yozuvlarni tozalash kerak, aks holda unique position/id constraint uradi.
    const { error: retryCleanupError } = await db
      .from('product_images')
      .delete()
      .eq('product_id', productId);
    if (!retryCleanupError) {
      const { error: legacyInsertError } = await insertLegacyImageRows(productId, ordered);
      if (!legacyInsertError) return true;
      console.error('Product media compatibility write failed:', legacyInsertError);
    } else {
      console.error('Product media retry cleanup failed:', retryCleanupError);
    }

    return abortFreshProductAfterMediaFailure(productId, guard);
  }

  console.error('Product media write failed:', insertError);
  return abortFreshProductAfterMediaFailure(productId, guard);
}
