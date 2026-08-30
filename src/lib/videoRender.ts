export interface VideoRenderEdit {
  trimStart: number;
  trimEnd: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export interface VideoRenderOptions {
  frameRate?: number;
  maxDimension?: number;
  onProgress?: (progress: number) => void;
}

interface RecorderFormat {
  mimeType: string;
  extension: string;
}

const FORMAT_CANDIDATES: RecorderFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

function recorderFormat(): RecorderFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;

  return (
    FORMAT_CANDIDATES.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate.mimeType),
    ) ?? null
  );
}

export function canRenderEditedVideo(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');

  return Boolean(
    recorderFormat() &&
      typeof canvas.captureStream === 'function' &&
      (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext),
  );
}

function waitForEvent(
  target: HTMLMediaElement | MediaRecorder,
  eventName: string,
  errorTarget?: HTMLMediaElement,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const success = () => {
      cleanup();
      resolve();
    };
    const failure = () => {
      cleanup();
      reject(new Error('Video media hodisasi bajarilmadi'));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, success as EventListener);
      errorTarget?.removeEventListener('error', failure);
    };

    target.addEventListener(eventName, success as EventListener, { once: true });
    errorTarget?.addEventListener('error', failure, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const safe = Math.max(0, Math.min(video.duration || 0, time));
  if (Math.abs(video.currentTime - safe) < 0.01) return;

  const done = waitForEvent(video, 'seeked', video);
  video.currentTime = safe;
  await done;
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

function outputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  rotation: number,
  maxDimension: number,
): { width: number; height: number; scale: number } {
  const rotated = Math.abs(rotation % 180) === 90;
  const rawWidth = rotated ? sourceHeight : sourceWidth;
  const rawHeight = rotated ? sourceWidth : sourceHeight;
  const scale = Math.min(1, maxDimension / Math.max(rawWidth, rawHeight));

  const even = (value: number) => {
    const rounded = Math.max(2, Math.round(value * scale));
    return rounded % 2 === 0 ? rounded : rounded - 1;
  };

  return {
    width: even(rawWidth),
    height: even(rawHeight),
    scale,
  };
}

export async function renderEditedVideo(
  file: File,
  edit: VideoRenderEdit,
  options: VideoRenderOptions = {},
): Promise<File> {
  const format = recorderFormat();
  if (!format) {
    throw new Error('Bu brauzer video render formatini qo‘llab-quvvatlamaydi');
  }

  const frameRate = Math.max(15, Math.min(60, options.frameRate ?? 30));
  const maxDimension = Math.max(480, Math.min(1920, options.maxDimension ?? 1080));

  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = sourceUrl;
  video.preload = 'auto';
  video.playsInline = true;
  video.controls = false;
  video.style.position = 'fixed';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  video.style.left = '-9999px';
  document.body.appendChild(video);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    video.remove();
    URL.revokeObjectURL(sourceUrl);
    throw new Error('Video render Canvas ishga tushmadi');
  }

  let audioContext: AudioContext | null = null;
  let audioSource: MediaElementAudioSourceNode | null = null;
  let recorder: MediaRecorder | null = null;
  let renderStream: MediaStream | null = null;
  let animationFrame = 0;

  try {
    if (video.readyState < 1) {
      await waitForEvent(video, 'loadedmetadata', video);
    }

    const sourceVideoWidth = video.videoWidth;
    const sourceVideoHeight = video.videoHeight;
    const sourceDuration = video.duration;

    if (
      !Number.isFinite(sourceDuration) ||
      sourceDuration <= 0 ||
      !sourceVideoWidth ||
      !sourceVideoHeight
    ) {
      throw new Error('Video metama’lumoti noto‘g‘ri');
    }

    const trimStart = Math.max(0, Math.min(sourceDuration, edit.trimStart || 0));
    const requestedEnd = Number.isFinite(edit.trimEnd) ? edit.trimEnd : sourceDuration;
    const trimEnd = Math.max(trimStart + 0.05, Math.min(sourceDuration, requestedEnd));
    const clipDuration = trimEnd - trimStart;

    const cropX = clampPercent(edit.cropX, 0);
    const cropY = clampPercent(edit.cropY, 0);
    const cropWidth = Math.max(1, clampPercent(edit.cropWidth, 100));
    const cropHeight = Math.max(1, clampPercent(edit.cropHeight, 100));

    const sx = (sourceVideoWidth * cropX) / 100;
    const sy = (sourceVideoHeight * cropY) / 100;
    const sw = Math.min(
      sourceVideoWidth - sx,
      Math.max(1, (sourceVideoWidth * cropWidth) / 100),
    );
    const sh = Math.min(
      sourceVideoHeight - sy,
      Math.max(1, (sourceVideoHeight * cropHeight) / 100),
    );

    const rotation = ((Math.round(edit.rotation / 90) * 90) % 360 + 360) % 360;
    const dimensions = outputDimensions(sw, sh, rotation, maxDimension);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    renderStream = canvas.captureStream(frameRate);

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (AudioContextConstructor) {
      audioContext = new AudioContextConstructor();
      const destination = audioContext.createMediaStreamDestination();
      audioSource = audioContext.createMediaElementSource(video);
      audioSource.connect(destination);
      destination.stream.getAudioTracks().forEach((track) => {
        renderStream?.addTrack(track);
      });
      await audioContext.resume();
    }

    const videoBitsPerSecond =
      Math.max(canvas.width, canvas.height) >= 1080 ? 8_000_000 : 4_500_000;

    recorder = new MediaRecorder(renderStream, {
      mimeType: format.mimeType,
      videoBitsPerSecond,
      audioBitsPerSecond: 128_000,
    });

    const chunks: BlobPart[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    const stopped = waitForEvent(recorder, 'stop');

    const drawFrame = () => {
      context.save();
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((rotation * Math.PI) / 180);
      context.scale(edit.flipHorizontal ? -1 : 1, edit.flipVertical ? -1 : 1);

      const drawWidth = sw * dimensions.scale;
      const drawHeight = sh * dimensions.scale;

      context.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight,
      );
      context.restore();

      const progress = Math.max(
        0,
        Math.min(1, (video.currentTime - trimStart) / clipDuration),
      );
      options.onProgress?.(progress);

      if (
        video.currentTime >= trimEnd - 0.015 ||
        video.ended ||
        recorder?.state === 'inactive'
      ) {
        video.pause();
        if (recorder?.state !== 'inactive') recorder?.stop();
        return;
      }

      animationFrame = requestAnimationFrame(drawFrame);
    };

    await seekVideo(video, trimStart);
    recorder.start(500);
    drawFrame();

    try {
      await video.play();
    } catch {
      if (recorder.state !== 'inactive') recorder.stop();
      throw new Error('Brauzer videoni render uchun ijro eta olmadi');
    }

    await stopped;
    options.onProgress?.(1);

    if (chunks.length === 0) {
      throw new Error('Render natijasi bo‘sh qaytdi');
    }

    const blob = new Blob(chunks, { type: format.mimeType });
    const base = file.name.replace(/\.[^/.]+$/, '') || 'video';

    return new File([blob], `${base}-edited.${format.extension}`, {
      type: format.mimeType,
      lastModified: Date.now(),
    });
  } finally {
    cancelAnimationFrame(animationFrame);
    video.pause();
    audioSource?.disconnect();
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close();
    }
    renderStream?.getTracks().forEach((track) => track.stop());
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(sourceUrl);
  }
}
