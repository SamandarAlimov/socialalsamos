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

// Marketplace listing/detail uchun 4K telefon rasmini original 8-12 MB holida
// saqlash foyda bermaydi. Yuklashdan oldin browserning o'zida oqilona o'lchamga
// tushiramiz; bu storage bandwidth, LCP va mobil internetdagi kutishni keskin kamaytiradi.
const PRODUCT_IMAGE_MAX_SIDE = 1920;
const PRODUCT_IMAGE_OPTIMIZE_FROM_BYTES = 1.5 * 1024 * 1024;
const PRODUCT_IMAGE_WEBP_QUALITY = 0.84;
const OPTIMIZABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

function loadImage(file: File) {
  return new Promise<{ image: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('image_decode_failed'));
    };
    image.src = objectUrl;
  });
}

/**
 * Katta JPEG/PNG/WebP rasmlarni clientda WebP ga siqadi. Optimallashtirish
 * muvaffaqiyatsiz bo'lsa uploadni bloklamaymiz — original fayl ishlatiladi.
 * GIF/HEIC singari formatlarni canvas orqali buzib yubormaslik uchun tegmaymiz.
 */
export async function optimizeProductImage(file: File): Promise<File> {
  if (!OPTIMIZABLE_IMAGE_TYPES.has(file.type)) return file;

  let loaded: { image: HTMLImageElement; objectUrl: string } | null = null;
  try {
    loaded = await loadImage(file);
    const width = loaded.image.naturalWidth;
    const height = loaded.image.naturalHeight;
    if (!width || !height) return file;

    const longestSide = Math.max(width, height);
    const scale = Math.min(1, PRODUCT_IMAGE_MAX_SIDE / longestSide);
    const shouldResize = scale < 0.999;
    const shouldCompress = file.size > PRODUCT_IMAGE_OPTIMIZE_FROM_BYTES;
    if (!shouldResize && !shouldCompress) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(loaded.image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/webp', PRODUCT_IMAGE_WEBP_QUALITY);
    });

    if (!blob) return file;
    // Faqat siqish kerak bo'lgan kichik o'lchamli rasmda WebP kattaroq chiqsa,
    // originalni saqlash yaxshiroq. Resize qilingan 4K rasm esa o'lcham sabab baribir foydali.
    if (!shouldResize && blob.size >= file.size * 0.95) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'product-image';
    return new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch (error) {
    console.warn('Product image optimization skipped:', error);
    return file;
  } finally {
    if (loaded?.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
  }
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
    return uploaded.url as string;
  } catch (error) {
    if (error instanceof ProductMediaError) throw error;
    console.error('Product media upload failed:', error);
    throw new ProductMediaError('upload_failed');
  }
}

/**
 * Bitta faylni tekshiradi, kerak bo'lsa muqova tayyorlaydi va yuklaydi.
 * Xatolar har doim ProductMediaError bo'ladi, ya'ni chaqiruvchi tomon
 * foydalanuvchiga to'g'ridan-to'g'ri o'zbekcha matn ko'rsata oladi.
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

function wait(milliseconds: number) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function productMediaWasPersisted(productId: string, ordered: ProductMediaDraft[]) {
  try {
    const { data, error } = await db
      .from('product_images')
      .select('url,position')
      .eq('product_id', productId)
      .order('position', { ascending: true });
    if (error || !Array.isArray(data) || data.length !== ordered.length) return false;
    return ordered.every((item, index) => {
      const row = data[index] as { url?: string; position?: number };
      return row?.url === item.url && Number(row?.position) === index;
    });
  } catch {
    return false;
  }
}

/**
 * product_images ni berilgan ro'yxatga tenglashtiradi. Idempotent: eski
 * satrlar o'chiriladi va yangi tartib to'liq qayta yoziladi.
 *
 * Muhim compatibility: Supabase migration deploy hali productionga yetib
 * bormagan bo'lsa, faqat rasmlardan iborat product uchun legacy uchta ustun
 * (product_id/url/position) bilan qayta uriniladi. Video esa yangi sxemani
 * talab qiladi va jimgina rasm sifatida yozilmaydi.
 */
export async function syncProductMedia(
  productId: string,
  media: ProductMediaDraft[],
) {
  const ordered = orderProductMedia(media).slice(0, MAX_PRODUCT_MEDIA);

  const { error: deleteError } = await db
    .from('product_images')
    .delete()
    .eq('product_id', productId);

  if (deleteError) {
    console.error('Product media cleanup failed:', deleteError);
    return false;
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

  const insertModernRows = () => db.from('product_images').insert(rows);
  let { error: insertError } = await insertModernRows();

  if (!insertError || await productMediaWasPersisted(productId, ordered)) return true;

  const canUseLegacySchema =
    ordered.every(item => item.mediaType === 'image') &&
    isLegacyProductImagesSchema(insertError);

  if (canUseLegacySchema) {
    console.warn(
      'Marketplace product media schema is behind frontend; retrying image persistence with legacy columns.',
      insertError,
    );

    const legacyRows = ordered.map((item, index) => ({
      product_id: productId,
      url: item.url,
      position: index,
    }));
    const insertLegacyRows = () => db.from('product_images').insert(legacyRows);
    let { error: legacyInsertError } = await insertLegacyRows();

    if (!legacyInsertError || await productMediaWasPersisted(productId, ordered)) return true;

    // Mobil tarmoqda request serverda bajarilib, clientga javob kelmay qolishi
    // mumkin. Bir marta qisqa retry qilamiz va undan keyin DB holatini tekshiramiz.
    await wait(250);
    ({ error: legacyInsertError } = await insertLegacyRows());
    if (!legacyInsertError || await productMediaWasPersisted(productId, ordered)) return true;

    console.error('Product media legacy write failed:', legacyInsertError);
    return false;
  }

  // Schema mos bo'lsa ham vaqtinchalik network/PostgREST xatosi tufayli rasm
  // satrini yo'qotib qo'ymaslik uchun bitta idempotent-ish retry. Birinchi request
  // aslida yozilgan bo'lsa verification yuqorida true qaytaradi va bu yerga kelmaydi.
  await wait(250);
  ({ error: insertError } = await insertModernRows());
  if (!insertError || await productMediaWasPersisted(productId, ordered)) return true;

  console.error('Product media write failed:', insertError);
  return false;
}
