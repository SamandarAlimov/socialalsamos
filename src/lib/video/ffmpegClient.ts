/**
 * ffmpeg.wasm bilan ishlash qatlami (Bosqich E).
 *
 * Nima uchun dinamik yuklash?
 * `@ffmpeg/ffmpeg` hali `package.json` da yo‘q va u ~30 MB WASM tortadi. Agar
 * statik `import` yozilsa, paket o‘rnatilmagan holatda butun build sinadi.
 * Shuning uchun spetsifikator o‘zgaruvchida saqlanadi va `@vite-ignore`
 * qo‘yiladi — paket yo‘q bo‘lsa quvur o‘zini o‘chiradi, ilova ishlashda
 * davom etadi.
 */

let ffmpegInstance: unknown = null;
let loadPromise: Promise<unknown> | null = null;

export class FfmpegUnavailableError extends Error {
  constructor() {
    super('Video qayta ishlash moduli mavjud emas');
  }
}

interface MinimalFfmpeg {
  load: (config?: Record<string, unknown>) => Promise<void>;
  writeFile: (name: string, data: Uint8Array) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array | string>;
  deleteFile?: (name: string) => Promise<void>;
  exec: (args: string[]) => Promise<number>;
  on?: (event: string, handler: (payload: { progress?: number }) => void) => void;
}

/** ffmpeg.wasm mavjudligini tekshiradi (UI shunga qarab yo‘l tanlaydi). */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await getFfmpeg();
    return true;
  } catch {
    return false;
  }
}

async function getFfmpeg(): Promise<MinimalFfmpeg> {
  if (ffmpegInstance) return ffmpegInstance as MinimalFfmpeg;

  if (!loadPromise) {
    loadPromise = (async () => {
      // Spetsifikator o‘zgaruvchida — Vite build vaqtida tekshirmaydi.
      const moduleName = '@ffmpeg/ffmpeg';

      let mod: Record<string, unknown>;
      try {
        mod = (await import(/* @vite-ignore */ moduleName)) as Record<string, unknown>;
      } catch {
        throw new FfmpegUnavailableError();
      }

      const FFmpegCtor = mod.FFmpeg as (new () => MinimalFfmpeg) | undefined;
      if (!FFmpegCtor) throw new FfmpegUnavailableError();

      const instance = new FFmpegCtor();
      await instance.load();
      return instance;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }

  ffmpegInstance = await loadPromise;
  return ffmpegInstance as MinimalFfmpeg;
}

async function toUint8(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Kuydirilgan videoga asl fayldan audio yo‘lini biriktiradi.
 *
 * `MediaRecorder` canvas oqimini yozganda audio yo‘qoladi — bu quvurdagi
 * ma’lum cheklov. Shu funksiya uni tuzatadi: video yo‘l ko‘chiriladi
 * (`-c:v copy`), audio esa AAC ga kodlanadi.
 */
export async function muxAudioFrom(
  videoWithoutAudio: Blob,
  originalWithAudio: Blob,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const ffmpeg = await getFfmpeg();

  ffmpeg.on?.('progress', ({ progress }) => {
    if (typeof progress === 'number') onProgress?.(Math.min(1, Math.max(0, progress)));
  });

  const videoName = 'burned.webm';
  const audioName = 'source.mp4';
  const outputName = 'output.mp4';

  await ffmpeg.writeFile(videoName, await toUint8(videoWithoutAudio));
  await ffmpeg.writeFile(audioName, await toUint8(originalWithAudio));

  await ffmpeg.exec([
    '-i',
    videoName,
    '-i',
    audioName,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0?',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  await ffmpeg.deleteFile?.(videoName);
  await ffmpeg.deleteFile?.(audioName);
  await ffmpeg.deleteFile?.(outputName);

  return new Blob([bytes as BlobPart], { type: 'video/mp4' });
}

/** Videodan qopqoq kadr oladi (thumbnail). */
export async function extractPoster(video: Blob, atSeconds = 0.1): Promise<Blob> {
  const ffmpeg = await getFfmpeg();

  const inputName = 'poster-input';
  const outputName = 'poster.jpg';

  await ffmpeg.writeFile(inputName, await toUint8(video));
  await ffmpeg.exec(['-ss', String(atSeconds), '-i', inputName, '-frames:v', '1', outputName]);

  const data = await ffmpeg.readFile(outputName);
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  await ffmpeg.deleteFile?.(inputName);
  await ffmpeg.deleteFile?.(outputName);

  return new Blob([bytes as BlobPart], { type: 'image/jpeg' });
}
