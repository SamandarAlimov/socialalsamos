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

  const url = await upload(file);
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

/**
 * product_images ni berilgan ro'yxatga tenglashtiradi. Idempotent: eski
 * satrlar o'chiriladi va yangi tartib to'liq qayta yoziladi.
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

  const { error: insertError } = await db.from('product_images').insert(rows);

  if (insertError) {
    console.error('Product media write failed:', insertError);
    return false;
  }

  return true;
}
