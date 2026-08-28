/**
 * Bosqich E — klient tomonidagi stiker kompozitori.
 *
 * Ish printsipi: videoni `<video>` da o‘ynatib, har kadrni offscreen canvas’ga
 * chizamiz, ustiga stiker rasmlarini qo‘yamiz va natijani `MediaRecorder`
 * bilan yozib olamiz. Bu yo‘l ffmpeg.wasm dan ancha tez, chunki dekodlash
 * brauzerning nativ dekoderida bajariladi.
 *
 * Cheklov: `MediaRecorder` audio yo‘lini `captureStream` orqali oladi, ba’zi
 * brauzerlarda esa bu ishlamaydi. Shu sababli audio ffmpeg.wasm bilan
 * qayta biriktiriladi (`ffmpegClient.muxAudioFrom`).
 */

import { isVisibleAt, type StorySticker } from '@/lib/storyStickers';

/** Bezak stikerlari uchun minimal ma’lumot (edit_state ichidagi model). */
export interface BurnPlacement {
  imageUrl: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity?: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
}

export interface BurnOptions {
  /** Chiqish kengligi; balandlik nisbatdan hisoblanadi. */
  maxWidth?: number;
  /** Sekundiga kadr. 30 — ijtimoiy tarmoq uchun yetarli muvozanat. */
  fps?: number;
  /** Bitrate (bit/s). */
  videoBitsPerSecond?: number;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

export class BurnError extends Error {}

/** Brauzer qo‘llab-quvvatlaydigan eng yaxshi konteyner/kodekni tanlaydi. */
export function pickRecorderMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  if (typeof MediaRecorder === 'undefined') return '';

  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // e’tiborsiz — keyingisini sinaymiz
    }
  }
  return '';
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new BurnError('Stiker rasmini yuklab bo\u2018lmadi'));
    image.src = url;
  });
}

/** Interaktiv stikerni kuydirish uchun bezak modeliga keltiradi. */
export function placementFromStorySticker(
  sticker: StorySticker,
  imageUrl: string,
): BurnPlacement {
  return {
    imageUrl,
    x: sticker.x,
    y: sticker.y,
    scale: sticker.scale,
    rotation: sticker.rotation,
    startSeconds: sticker.startSeconds,
    endSeconds: sticker.endSeconds,
  };
}

function isPlacementVisible(placement: BurnPlacement, seconds: number): boolean {
  return isVisibleAt(
    {
      startSeconds: placement.startSeconds ?? null,
      endSeconds: placement.endSeconds ?? null,
    } as StorySticker,
    seconds,
  );
}

/**
 * Stikerlarni videoga kuydiradi va yangi video `Blob` qaytaradi.
 *
 * Diqqat: bu funksiya asosiy ipda ishlaydi, chunki `MediaRecorder` va
 * `<video>` Web Worker’da mavjud emas. Foydalanuvchi interfeysi qotmasligi
 * uchun `onProgress` orqali holat ko‘rsatiladi va `signal` bilan bekor
 * qilinadi.
 */
export async function burnStickersIntoVideo(
  file: File | Blob,
  placements: BurnPlacement[],
  options: BurnOptions = {},
): Promise<Blob> {
  const { maxWidth = 1080, fps = 30, videoBitsPerSecond = 6_000_000, onProgress, signal } = options;

  if (typeof MediaRecorder === 'undefined') {
    throw new BurnError('Brauzer video yozishni qo\u2018llab-quvvatlamaydi');
  }

  const mimeType = pickRecorderMimeType();
  if (!mimeType) {
    throw new BurnError('Mos video kodek topilmadi');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const video = document.createElement('video');
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new BurnError('Videoni o\u2018qib bo\u2018lmadi'));
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new BurnError('Video davomiyligi aniqlanmadi');
    }

    // O‘lchamni chegaralaymiz: 4K videoni to‘liq qayta kodlash telefonni
    // qizdiradi va xotirani tugatadi.
    const ratio = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
    const width = Math.round((video.videoWidth || maxWidth) * ratio);
    const height = Math.round((video.videoHeight || maxWidth) * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new BurnError('Canvas konteksti ochilmadi');

    const images = await Promise.all(
      placements.map(async (placement) => ({
        placement,
        image: await loadImage(placement.imageUrl),
      })),
    );

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const finished = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () => reject(new BurnError('Yozib olishda xatolik'));
    });

    recorder.start();
    await video.play();

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      video.pause();
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
    };

    signal?.addEventListener('abort', stop, { once: true });

    const drawFrame = () => {
      if (stopped) return;

      const time = video.currentTime;
      context.drawImage(video, 0, 0, width, height);

      images.forEach(({ placement, image }) => {
        if (!isPlacementVisible(placement, time)) return;

        const targetWidth = width * placement.scale;
        const targetHeight = (image.height / image.width) * targetWidth;

        context.save();
        context.globalAlpha = placement.opacity ?? 1;
        context.translate(placement.x * width, placement.y * height);
        context.rotate((placement.rotation * Math.PI) / 180);
        context.drawImage(
          image,
          -targetWidth / 2,
          -targetHeight / 2,
          targetWidth,
          targetHeight,
        );
        context.restore();
      });

      onProgress?.(Math.min(1, time / duration));

      if (video.ended || video.currentTime >= duration - 0.02) {
        stop();
        return;
      }

      requestAnimationFrame(drawFrame);
    };

    requestAnimationFrame(drawFrame);
    video.onended = stop;

    const result = await finished;
    onProgress?.(1);
    return result;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
