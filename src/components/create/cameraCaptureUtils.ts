import { drawCameraLensOverlays, type CameraLens } from './filters/CameraLensData';

export interface CaptureSize { width: number; height: number }

export function supportedRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function captureSize(
  aspectRatio: '1:1' | '9:16' | '16:9',
  sourceWidth: number,
  sourceHeight: number,
): CaptureSize {
  const maxLongEdge = 1280;
  if (aspectRatio === '1:1') {
    const side = Math.min(maxLongEdge, Math.max(720, Math.min(sourceWidth, sourceHeight)));
    const even = Math.max(2, Math.round(side / 2) * 2);
    return { width: even, height: even };
  }
  if (aspectRatio === '9:16') {
    const height = Math.min(maxLongEdge, Math.max(960, sourceHeight));
    const width = (height * 9) / 16;
    return {
      width: Math.max(2, Math.round(width / 2) * 2),
      height: Math.max(2, Math.round(height / 2) * 2),
    };
  }
  const width = Math.min(maxLongEdge, Math.max(960, sourceWidth));
  const height = (width * 9) / 16;
  return {
    width: Math.max(2, Math.round(width / 2) * 2),
    height: Math.max(2, Math.round(height / 2) * 2),
  };
}

export function drawCameraFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  mirror: boolean,
  lens: CameraLens,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = (canvas.width - drawWidth) / 2;
  const y = (canvas.height - drawHeight) / 2;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.filter = 'none';
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = lens.style || 'none';

  if (mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, canvas.width - x - drawWidth, y, drawWidth, drawHeight);
  } else {
    context.drawImage(video, x, y, drawWidth, drawHeight);
  }
  context.restore();
  drawCameraLensOverlays(context, canvas, lens);
}

export function extensionForMime(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm';
}
