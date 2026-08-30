export type ReelTransition = 'none' | 'fade';

export interface ReelSequenceClip {
  file: File;
  durationSeconds?: number | null;
  playbackRate?: number | null;
  transition?: ReelTransition | null;
}

export interface ReelSequenceRenderOptions {
  width?: number;
  height?: number;
  frameRate?: number;
  onProgress?: (progress: number) => void;
}

interface RecorderFormat {
  mimeType: string;
  extension: string;
}

const FORMATS: RecorderFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

function pickFormat(): RecorderFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return FORMATS.find((item) => MediaRecorder.isTypeSupported(item.mimeType)) ?? null;
}

export function canRenderReelSequence(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  return Boolean(
    pickFormat() &&
      typeof canvas.captureStream === 'function' &&
      AudioContextConstructor,
  );
}

function waitForMedia(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'ended',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Videoni o‘qib bo‘lmadi'));
    };
    const cleanup = () => {
      video.removeEventListener(eventName, onSuccess);
      video.removeEventListener('error', onError);
    };

    video.addEventListener(eventName, onSuccess, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function waitForRecorderStop(recorder: MediaRecorder): Promise<void> {
  return new Promise((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
  });
}

function drawCover(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.max(
    canvas.width / sourceWidth,
    canvas.height / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;

  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(video, x, y, width, height);
}

export async function renderReelSequence(
  clips: ReelSequenceClip[],
  options: ReelSequenceRenderOptions = {},
): Promise<File> {
  if (clips.length < 1) {
    throw new Error('Video topilmadi');
  }

  const format = pickFormat();
  if (!format) {
    throw new Error('Bu brauzer video birlashtirishni qo‘llab-quvvatlamaydi');
  }

  const width = Math.max(360, Math.min(1080, options.width ?? 720));
  const height = Math.max(640, Math.min(1920, options.height ?? 1280));
  const frameRate = Math.max(15, Math.min(60, options.frameRate ?? 30));

  const canvas = document.createElement('canvas');
  canvas.width = width % 2 === 0 ? width : width - 1;
  canvas.height = height % 2 === 0 ? height : height - 1;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Video canvas ishga tushmadi');

  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.controls = false;
  video.style.position = 'fixed';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.left = '-9999px';
  video.style.pointerEvents = 'none';
  document.body.appendChild(video);

  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextConstructor) {
    video.remove();
    throw new Error('Audio render mavjud emas');
  }

  const audioContext = new AudioContextConstructor();
  const destination = audioContext.createMediaStreamDestination();
  const audioSource = audioContext.createMediaElementSource(video);
  const audioGain = audioContext.createGain();
  audioSource.connect(audioGain);
  audioGain.connect(destination);

  const stream = canvas.captureStream(frameRate);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const recorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: width >= 1080 ? 8_000_000 : 5_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: BlobPart[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  const expectedDurations = clips.map((clip) => {
    const sourceDuration = Math.max(0.1, Number(clip.durationSeconds) || 1);
    const playbackRate = Math.max(
      0.25,
      Math.min(4, Number(clip.playbackRate) || 1),
    );
    return sourceDuration / playbackRate;
  });
  const expectedTotal = expectedDurations.reduce((sum, value) => sum + value, 0);
  let completedExpected = 0;
  let animationFrame = 0;

  try {
    await audioContext.resume();
    const stopped = waitForRecorderStop(recorder);
    recorder.start(500);

    for (let index = 0; index < clips.length; index += 1) {
      const clip = clips[index];
      const url = URL.createObjectURL(clip.file);

      try {
        video.pause();
        video.src = url;
        video.load();

        if (video.readyState < 1) {
          await waitForMedia(video, 'loadedmetadata');
        }

        const actualDuration =
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : Math.max(0.1, Number(clip.durationSeconds) || 1);
        const playbackRate = Math.max(
          0.25,
          Math.min(4, Number(clip.playbackRate) || 1),
        );
        video.playbackRate = playbackRate;
        video.defaultPlaybackRate = playbackRate;

        const ended = waitForMedia(video, 'ended');
        const transitionSeconds = Math.min(
          0.28,
          Math.max(0.12, expectedDurations[index] * 0.12),
        );
        const fadeIn = index > 0 && clips[index - 1]?.transition === 'fade';
        const fadeOut =
          index < clips.length - 1 && clip.transition === 'fade';

        const draw = () => {
          drawCover(context, canvas, video);

          const sourceTime = Math.max(0, video.currentTime);
          const outputTime = sourceTime / playbackRate;
          const outputRemaining =
            Math.max(0, actualDuration - sourceTime) / playbackRate;

          const inOpacity = fadeIn
            ? Math.max(0, 1 - outputTime / transitionSeconds)
            : 0;
          const outOpacity = fadeOut
            ? Math.max(0, 1 - outputRemaining / transitionSeconds)
            : 0;
          const transitionOpacity = Math.max(inOpacity, outOpacity);

          if (transitionOpacity > 0) {
            context.save();
            context.globalAlpha = Math.min(1, transitionOpacity);
            context.fillStyle = '#000';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.restore();
          }

          audioGain.gain.setValueAtTime(
            Math.max(0, 1 - transitionOpacity),
            audioContext.currentTime,
          );

          const clipProgress = Math.max(
            0,
            Math.min(1, video.currentTime / Math.max(0.1, actualDuration)),
          );
          options.onProgress?.(
            Math.max(
              0,
              Math.min(
                1,
                (completedExpected + clipProgress * expectedDurations[index]) /
                  expectedTotal,
              ),
            ),
          );

          if (!video.ended && recorder.state !== 'inactive') {
            animationFrame = requestAnimationFrame(draw);
          }
        };

        audioGain.gain.setValueAtTime(
          fadeIn ? 0 : 1,
          audioContext.currentTime,
        );
        draw();
        await video.play();
        await ended;
        cancelAnimationFrame(animationFrame);
        drawCover(context, canvas, video);
        completedExpected += expectedDurations[index];
        options.onProgress?.(
          Math.min(1, completedExpected / expectedTotal),
        );
      } finally {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }

    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;

    if (chunks.length === 0) {
      throw new Error('Birlashtirilgan video bo‘sh qaytdi');
    }

    options.onProgress?.(1);

    const blob = new Blob(chunks, { type: format.mimeType });
    return new File([blob], `reel-${Date.now()}.${format.extension}`, {
      type: format.mimeType,
      lastModified: Date.now(),
    });
  } finally {
    cancelAnimationFrame(animationFrame);
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    audioSource.disconnect();
    audioGain.disconnect();
    if (audioContext.state !== 'closed') {
      await audioContext.close().catch(() => undefined);
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}
