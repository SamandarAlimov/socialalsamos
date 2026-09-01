import type { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * Brauzerdagi haqiqiy video quvuri (ffmpeg.wasm).
 *
 * Nega klientda:
 *  - hech qanday tashqi API kaliti va o'z serverimiz kerak emas;
 *  - foydalanuvchi fayli qurilmadan chiqmasdan qirqiladi va siqiladi,
 *    ya'ni private/friends postlarda ham maxfiylik saqlanadi.
 *
 * Nega single-thread core:
 *  - multi-thread (`core-mt`) SharedArrayBuffer talab qiladi, u esa
 *    COOP/COEP javob header'larini majbur qiladi. Bu header'lar Leaflet
 *    tayllari va Supabase so'rovlariga ta'sir qiladi, shuning uchun ataylab
 *    sekinroq, lekin hech narsani buzmaydigan variant tanlangan.
 *
 * Cheklov: wasm kodlash sekin. Uzun yoki og'ir fayllar uchun
 * `assessClientRender` ogohlantiradi — keyinchalik server worker'i
 * (`video_jobs`) shu joydan ulanadi.
 */

/** Core fayllari CDN'dan olinadi; self-hosting uchun env bilan almashtiriladi. */
const DEFAULT_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

const CORE_BASE = String(
  import.meta.env.VITE_FFMPEG_CORE_URL ?? DEFAULT_CORE_BASE,
).replace(/\/+$/, '');

/** Klientda kodlashga ruxsat berilgan yuqori chegaralar. */
export const CLIENT_RENDER_MAX_BYTES = 250 * 1024 * 1024;
export const CLIENT_RENDER_MAX_SECONDS = 300;
/** Shu chegaradan uzun bo'lsa foydalanuvchini ogohlantiramiz. */
export const CLIENT_RENDER_SLOW_SECONDS = 60;

const INPUT_NAME = 'input.bin';
const AUDIO_NAME = 'audio.bin';
const OUTPUT_NAME = 'output.mp4';

export interface VideoTrim {
  startSeconds: number;
  endSeconds: number;
}

/**
 * Kesish to'rtburchagi — manba o'lchamining foizida (0..100).
 *
 * Foiz ataylab tanlangan: tahrirlagich video piksel o'lchamini bilmasdan
 * ham crop maydonini ko'rsatadi, ffmpeg esa iw/ih ifodalari bilan o'zi
 * hisoblaydi.
 */
export interface VideoCropPercent {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoAudioTrack {
  data: File | Blob;
  /** Musiqaning qaysi sekundidan boshlansin. */
  startSeconds?: number;
  /** 0..2 oralig'ida. */
  volume?: number;
  /** true bo'lsa original ovoz butunlay almashtiriladi. */
  replaceOriginal?: boolean;
}

export interface VideoRenderRequest {
  file: File;
  trim?: VideoTrim | null;
  crop?: VideoCropPercent | null;
  /** 0, 90, 180 yoki 270 daraja (soat yo'nalishi bo'yicha). */
  rotation?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  /** Chiqish o'lchovi shu ramkaga sig'diriladi (nisbat saqlanadi). */
  maxWidth?: number;
  maxHeight?: number;
  fps?: number | null;
  /** x264 sifat darajasi: kichik son = yaxshi sifat, katta fayl. */
  crf?: number;
  preset?: string;
  /** Original ovozni o'chirish. */
  mute?: boolean;
  /** Original ovoz balandligi (0..2). */
  volume?: number;
  audio?: VideoAudioTrack | null;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

export interface VideoRenderResult {
  file: File;
  /** Bajarilgan ffmpeg argumentlari — debug va log uchun. */
  args: string[];
  durationSeconds: number | null;
}

export interface FfmpegArgsInput {
  inputName: string;
  outputName: string;
  audioName?: string | null;
  trim?: VideoTrim | null;
  crop?: VideoCropPercent | null;
  rotation?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  scale?: { maxWidth: number; maxHeight: number } | null;
  fps?: number | null;
  crf: number;
  preset: string;
  mute: boolean;
  volume: number;
  audioStartSeconds: number;
  audioVolume: number;
  replaceOriginalAudio: boolean;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Foizni ffmpeg ifodasidagi ko'paytmaga aylantiradi. */
function factor(percent: number, fallback: number): string {
  const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : fallback;
  return String(Math.round((safe / 100) * 100000) / 100000);
}

/** Burilishni 0/90/180/270 ga keltiradi. */
export function normalizeRotation(rotation?: number): number {
  if (!rotation || !Number.isFinite(rotation)) return 0;
  return (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
}

/**
 * Filtr zanjiri: crop → oyna → burilish → o'lcham → kadr tezligi.
 *
 * Tartib eski canvas render bilan bir xil, shuning uchun ikki yo'l bir xil
 * natija beradi.
 */
function videoFilterChain(input: FfmpegArgsInput): string[] {
  const chain: string[] = [];
  const crop = input.crop;

  const cropsSomething =
    crop &&
    (crop.x > 0 || crop.y > 0 || crop.width < 100 || crop.height < 100);

  if (crop && cropsSomething) {
    chain.push(
      'crop=iw*' +
        factor(crop.width, 100) +
        ':ih*' +
        factor(crop.height, 100) +
        ':iw*' +
        factor(crop.x, 0) +
        ':ih*' +
        factor(crop.y, 0),
    );
  }

  if (input.flipHorizontal) chain.push('hflip');
  if (input.flipVertical) chain.push('vflip');

  // transpose=1 — 90° soat yo'nalishi bo'yicha, transpose=2 — teskari.
  const rotation = normalizeRotation(input.rotation);
  if (rotation === 90) chain.push('transpose=1');
  else if (rotation === 180) chain.push('transpose=1', 'transpose=1');
  else if (rotation === 270) chain.push('transpose=2');

  if (input.scale) {
    // force_divisible_by=2 — x264 juft o'lcham talab qiladi.
    chain.push(
      'scale=' +
        Math.round(input.scale.maxWidth) +
        ':' +
        Math.round(input.scale.maxHeight) +
        ':force_original_aspect_ratio=decrease:force_divisible_by=2',
    );
  }

  if (input.fps && input.fps > 0) {
    chain.push('fps=' + Math.round(input.fps));
  }

  return chain;
}

/**
 * ffmpeg argumentlarini yasaydi. Toza funksiya, shuning uchun wasm'siz
 * test qilinadi.
 */
export function buildFfmpegArgs(input: FfmpegArgsInput): string[] {
  const args: string[] = [];
  const chain = videoFilterChain(input);

  // Trim: -ss inputdan oldin turgani uchun tez izlash (fast seek) ishlaydi.
  if (input.trim && input.trim.startSeconds > 0) {
    args.push('-ss', String(round3(input.trim.startSeconds)));
  }

  args.push('-i', input.inputName);

  const hasExtraAudio = Boolean(input.audioName);

  if (hasExtraAudio) {
    if (input.audioStartSeconds > 0) {
      args.push('-ss', String(round3(input.audioStartSeconds)));
    }
    args.push('-i', String(input.audioName));
  }

  if (input.trim) {
    const duration = input.trim.endSeconds - Math.max(0, input.trim.startSeconds);
    if (duration > 0) args.push('-t', String(round3(duration)));
  }

  // Original ovoz o'chirilgan yoki almashtirilgan bo'lsa aralashtirish shart emas.
  const mixOriginalAudio = hasExtraAudio && !input.mute && !input.replaceOriginalAudio;

  if (mixOriginalAudio) {
    const videoPart = '[0:v]' + (chain.length > 0 ? chain.join(',') : 'null') + '[vout]';
    const audioPart =
      '[0:a]volume=' +
      input.volume +
      '[a0];[1:a]volume=' +
      input.audioVolume +
      '[a1];[a0][a1]amix=inputs=2:duration=first:normalize=0[aout]';

    args.push('-filter_complex', videoPart + ';' + audioPart);
    args.push('-map', '[vout]', '-map', '[aout]');
  } else {
    if (chain.length > 0) args.push('-vf', chain.join(','));

    if (hasExtraAudio) {
      // Video birinchi manbadan, ovoz ikkinchisidan; qisqasi bo'yicha tugaydi.
      args.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
      if (input.audioVolume !== 1) {
        args.push('-af', 'volume=' + input.audioVolume);
      }
    } else if (input.mute) {
      args.push('-an');
    } else if (input.volume !== 1) {
      args.push('-af', 'volume=' + input.volume);
    }
  }

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    input.preset,
    '-crf',
    String(input.crf),
    '-pix_fmt',
    'yuv420p',
    // faststart — lentada video birinchi kadrdan darhol ochilishi uchun.
    '-movflags',
    '+faststart',
  );

  const silent = !hasExtraAudio && input.mute;
  if (!silent) {
    args.push('-c:a', 'aac', '-b:a', '128k');
  }

  args.push('-y', input.outputName);

  return args;
}

export interface ClientRenderAssessment {
  ok: boolean;
  slow: boolean;
  reason?: string;
}

/**
 * Klientda kodlash maqsadga muvofiqmi. Katta fayllarni brauzerda kodlash
 * qurilmani muzlatib qo'yishi mumkin, shuning uchun oldindan tekshiramiz.
 */
export function assessClientRender(args: {
  sizeBytes: number;
  durationSeconds?: number | null;
}): ClientRenderAssessment {
  if (args.sizeBytes > CLIENT_RENDER_MAX_BYTES) {
    return {
      ok: false,
      slow: false,
      reason:
        'Fayl juda katta (' +
        Math.round(args.sizeBytes / (1024 * 1024)) +
        ' MB). Brauzerda qayta ishlash chegarasi ' +
        Math.round(CLIENT_RENDER_MAX_BYTES / (1024 * 1024)) +
        ' MB.',
    };
  }

  const duration = args.durationSeconds ?? null;

  if (duration !== null && duration > CLIENT_RENDER_MAX_SECONDS) {
    return {
      ok: false,
      slow: false,
      reason:
        'Video juda uzun. Brauzerda qayta ishlash chegarasi ' +
        Math.round(CLIENT_RENDER_MAX_SECONDS / 60) +
        ' daqiqa.',
    };
  }

  if (duration !== null && duration > CLIENT_RENDER_SLOW_SECONDS) {
    return {
      ok: true,
      slow: true,
      reason: 'Uzun video: qayta ishlash bir necha daqiqa olishi mumkin.',
    };
  }

  return { ok: true, slow: false };
}

/** Brauzer wasm'ni qo'llab-quvvatlaydimi. */
export function isVideoPipelineSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof Worker === 'function';
}

let ffmpegPromise: Promise<FFmpeg> | null = null;

/**
 * ffmpeg.wasm ni faqat kerak bo'lganda yuklaydi.
 *
 * Dinamik import ataylab: statik import bo'lsa wasm glue kodi bosh sahifa
 * bundle'iga tushib, birinchi ochilish vaqtini sekinlashtiradi.
 */
async function loadFfmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg: FFmpegClass }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);

      const instance = new FFmpegClass();

      // Core va wasm blob URL sifatida beriladi — aks holda cross-origin
      // worker yaratish bloklanadi.
      await instance.load({
        coreURL: await toBlobURL(CORE_BASE + '/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(CORE_BASE + '/ffmpeg-core.wasm', 'application/wasm'),
      });

      return instance;
    })().catch((error) => {
      // Muvaffaqiyatsiz yuklash keshda qolmasligi kerak.
      ffmpegPromise = null;
      throw error;
    });
  }

  return ffmpegPromise;
}

/** Xatolikdan keyin instansiyani tashlab yuborish. */
function resetFfmpeg(instance: FFmpeg | null) {
  ffmpegPromise = null;
  try {
    instance?.terminate();
  } catch {
    // terminate xatosi muhim emas.
  }
}

async function toUint8Array(data: File | Blob): Promise<Uint8Array> {
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Videoni qirqadi, kesadi, buradi, siqadi va kerak bo'lsa musiqa qo'shadi.
 *
 * Natija — haqiqiy mp4 fayl, ya'ni tahrir faqat metadata sifatida qolib
 * ketmaydi.
 */
export async function renderVideo(
  request: VideoRenderRequest,
): Promise<VideoRenderResult> {
  if (!isVideoPipelineSupported()) {
    throw new Error('Bu brauzerda video qayta ishlash qo‘llab-quvvatlanmaydi.');
  }

  const trim =
    request.trim && request.trim.endSeconds > Math.max(0, request.trim.startSeconds)
      ? request.trim
      : null;

  const args = buildFfmpegArgs({
    inputName: INPUT_NAME,
    outputName: OUTPUT_NAME,
    audioName: request.audio ? AUDIO_NAME : null,
    trim,
    crop: request.crop ?? null,
    rotation: request.rotation ?? 0,
    flipHorizontal: request.flipHorizontal ?? false,
    flipVertical: request.flipVertical ?? false,
    scale: {
      maxWidth: request.maxWidth ?? 1080,
      maxHeight: request.maxHeight ?? 1920,
    },
    fps: request.fps ?? null,
    crf: request.crf ?? 26,
    preset: request.preset ?? 'veryfast',
    mute: request.mute ?? false,
    volume: request.volume ?? 1,
    audioStartSeconds: request.audio?.startSeconds ?? 0,
    audioVolume: request.audio?.volume ?? 1,
    replaceOriginalAudio: request.audio?.replaceOriginal ?? false,
  });

  const ffmpeg = await loadFfmpeg();

  const handleProgress = ({ progress }: { progress: number }) => {
    if (!request.onProgress) return;
    const ratio = Number.isFinite(progress) ? progress : 0;
    request.onProgress(Math.min(1, Math.max(0, ratio)));
  };

  let aborted = false;
  const handleAbort = () => {
    aborted = true;
    resetFfmpeg(ffmpeg);
  };

  ffmpeg.on('progress', handleProgress);
  request.signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    await ffmpeg.writeFile(INPUT_NAME, await toUint8Array(request.file));

    if (request.audio) {
      await ffmpeg.writeFile(AUDIO_NAME, await toUint8Array(request.audio.data));
    }

    await ffmpeg.exec(args);

    const output = await ffmpeg.readFile(OUTPUT_NAME);
    const bytes =
      typeof output === 'string' ? new TextEncoder().encode(output) : output;

    if (bytes.length === 0) {
      throw new Error('Video qayta ishlandi, lekin natija bo‘sh chiqdi.');
    }

    const baseName = request.file.name.replace(/\.[^.]+$/, '') || 'video';

    return {
      file: new File([bytes as BlobPart], baseName + '-edited.mp4', { type: 'video/mp4' }),
      args,
      durationSeconds: trim ? trim.endSeconds - Math.max(0, trim.startSeconds) : null,
    };
  } catch (error) {
    if (aborted) {
      throw new Error('Video qayta ishlash bekor qilindi.');
    }
    resetFfmpeg(ffmpeg);
    throw error;
  } finally {
    request.signal?.removeEventListener('abort', handleAbort);

    if (!aborted) {
      ffmpeg.off('progress', handleProgress);
      // Vaqtinchalik fayllar wasm FS'da qolib xotirani egallamasligi kerak.
      await ffmpeg.deleteFile(INPUT_NAME).catch(() => undefined);
      if (request.audio) {
        await ffmpeg.deleteFile(AUDIO_NAME).catch(() => undefined);
      }
      await ffmpeg.deleteFile(OUTPUT_NAME).catch(() => undefined);
    }
  }
}
