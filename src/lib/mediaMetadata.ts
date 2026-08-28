import type { MediaKind } from '@/lib/postComposer';

/**
 * Fayl metama'lumotlarini o'qish: rasm o'lchami, video/audio davomiyligi,
 * video uchun poster (thumbnail) kadri.
 *
 * Bu ma'lumotlar post_media jadvaliga yoziladi — shu sababli lentada
 * rasm joyi oldindan bron qilinadi (layout shift bo'lmaydi) va video
 * yuklanmasidan oldin ham poster ko'rinadi.
 */

export interface MediaMetadata {
  width?: number;
  height?: number;
  durationSeconds?: number;
  aspectRatio?: string;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function toAspectRatio(width: number, height: number): string | undefined {
  if (!width || !height) return undefined;
  const divisor = gcd(width, height) || 1;
  const w = Math.round(width / divisor);
  const h = Math.round(height / divisor);
  // Juda g'alati nisbatlarni o'nlik ko'rinishda beramiz
  if (w > 50 || h > 50) return (width / height).toFixed(4);
  return `${w}:${h}`;
}

function readImageMetadata(objectUrl: string): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve({}), 8000);

    image.onload = () => {
      clearTimeout(timer);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        aspectRatio: toAspectRatio(image.naturalWidth, image.naturalHeight),
      });
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve({});
    };

    image.src = objectUrl;
  });
}

function readMediaElementMetadata(objectUrl: string, isVideo: boolean): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const element = document.createElement(isVideo ? 'video' : 'audio') as
      | HTMLVideoElement
      | HTMLAudioElement;
    element.preload = 'metadata';
    element.muted = true;

    const timer = setTimeout(() => resolve({}), 12000);

    element.onloadedmetadata = () => {
      clearTimeout(timer);
      const duration = Number.isFinite(element.duration) ? element.duration : undefined;

      if (isVideo) {
        const video = element as HTMLVideoElement;
        resolve({
          durationSeconds: duration,
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
          aspectRatio: toAspectRatio(video.videoWidth, video.videoHeight),
        });
      } else {
        resolve({ durationSeconds: duration });
      }
    };

    element.onerror = () => {
      clearTimeout(timer);
      resolve({});
    };

    element.src = objectUrl;
  });
}

export async function readMediaMetadata(
  kind: MediaKind,
  objectUrl: string,
): Promise<MediaMetadata> {
  try {
    if (kind === 'image') return await readImageMetadata(objectUrl);
    if (kind === 'video') return await readMediaElementMetadata(objectUrl, true);
    if (kind === 'audio') return await readMediaElementMetadata(objectUrl, false);
  } catch (error) {
    console.warn('Metama\u2018lumot o\u2018qilmadi:', error);
  }
  return {};
}

/** Videodan poster kadr olish (thumbnail sifatida yuklanadi). */
export function captureVideoPoster(
  objectUrl: string,
  atSecond = 0.1,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const finish = (blob: Blob | null) => {
      video.src = '';
      resolve(blob);
    };

    const timer = setTimeout(() => finish(null), 12000);

    video.onloadeddata = () => {
      video.currentTime = Math.min(atSecond, Math.max(0, (video.duration || 1) - 0.1));
    };

    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context || !canvas.width || !canvas.height) return finish(null);

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.82);
      } catch {
        finish(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };

    video.src = objectUrl;
  });
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
