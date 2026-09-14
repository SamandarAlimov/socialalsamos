import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  FlipHorizontal2,
  Images,
  Play,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UI_LAYER } from '@/lib/uiLayers';
import { useIsMobile } from '@/hooks/use-mobile';
import { CAMERA_LENSES, cameraOverlayCss } from './filters/CameraLensData';
import { CameraLensRail } from './CameraLensRail';
import { extensionForMime } from './cameraCaptureUtils';
import { useCameraCapture } from './useCameraCapture';

interface CameraVideoRecorderProps {
  onCapture: (file: File, type: 'image' | 'video', url: string) => void;
  onClose: () => void;
  mode?: 'photo' | 'video' | 'both';
  aspectRatio?: '1:1' | '9:16' | '16:9' | 'auto';
}

export function CameraVideoRecorder({
  onCapture,
  onClose,
  mode = 'both',
  aspectRatio = 'auto',
}: CameraVideoRecorderProps) {
  const isMobile = useIsMobile();
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const deviceInputRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>(
    mode === 'video' ? 'video' : 'photo',
  );
  const [lensId, setLensId] = useState('none');

  const computedAspectRatio = useMemo<'1:1' | '9:16' | '16:9'>(() => {
    if (aspectRatio === 'auto') return isMobile ? '9:16' : '16:9';
    return aspectRatio;
  }, [aspectRatio, isMobile]);

  const aspectRatioClass = useMemo(
    () =>
      ({
        '1:1': 'aspect-square',
        '9:16': 'aspect-[9/16]',
        '16:9': 'aspect-video',
      })[computedAspectRatio],
    [computedAspectRatio],
  );

  const lens = useMemo(
    () => CAMERA_LENSES.find((item) => item.id === lensId) ?? CAMERA_LENSES[0],
    [lensId],
  );

  const camera = useCameraCapture({
    captureMode,
    facingMode,
    aspectRatio: computedAspectRatio,
    lens,
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      html.style.overflow = previous.htmlOverflow;
      html.style.overscrollBehavior = previous.htmlOverscroll;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
    };
  }, []);

  const switchCamera = useCallback(() => {
    if (camera.isRecording) return;
    setFacingMode((current) =>
      current === 'user' ? 'environment' : 'user',
    );
  }, [camera.isRecording]);

  const confirmCapture = useCallback(() => {
    if (camera.capturedPhoto) {
      void fetch(camera.capturedPhoto)
        .then((response) => response.blob())
        .then((blob) => {
          onCapture(
            new File([blob], `photo_${Date.now()}.jpg`, {
              type: 'image/jpeg',
            }),
            'image',
            camera.capturedPhoto as string,
          );
        });
      return;
    }

    if (camera.recordedBlob && camera.recordedUrl) {
      const mimeType = camera.recordedBlob.type || 'video/webm';
      onCapture(
        new File(
          [camera.recordedBlob],
          `video_${Date.now()}.${extensionForMime(mimeType)}`,
          { type: mimeType },
        ),
        'video',
        camera.recordedUrl,
      );
    }
  }, [camera.capturedPhoto, camera.recordedBlob, camera.recordedUrl, onCapture]);

  const chooseFromDevice = useCallback(() => {
    if (camera.isRecording) return;
    deviceInputRef.current?.click();
  }, [camera.isRecording]);

  const handleDeviceFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      const type: 'image' | 'video' | null = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('image/')
          ? 'image'
          : null;

      if (!type) return;
      if (mode === 'video' && type !== 'video') return;
      if (mode === 'photo' && type !== 'image') return;

      const sourceUrl = URL.createObjectURL(file);
      onCapture(file, type, sourceUrl);
    },
    [mode, onCapture],
  );

  const togglePlayback = useCallback(() => {
    const preview = previewVideoRef.current;
    if (!preview) return;

    if (preview.paused) {
      void preview.play();
      setIsPlaying(true);
    } else {
      preview.pause();
      setIsPlaying(false);
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const mediaPicker = (
    <input
      ref={deviceInputRef}
      type="file"
      accept={
        mode === 'video'
          ? 'video/*'
          : mode === 'photo'
            ? 'image/*'
            : 'image/*,video/*'
      }
      className="hidden"
      onChange={handleDeviceFile}
    />
  );

  const shutter =
    captureMode === 'photo' ? (
      <button
        type="button"
        onClick={camera.takePhoto}
        disabled={!camera.cameraReady || Boolean(camera.cameraError)}
        aria-label="Rasmga olish"
        className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white bg-white/15 shadow-[0_12px_36px_rgba(0,0,0,.38)] transition active:scale-95 disabled:opacity-40"
      >
        <span className="h-[54px] w-[54px] rounded-full bg-white" />
      </button>
    ) : (
      <button
        type="button"
        onClick={camera.isRecording ? camera.stopRecording : camera.startRecording}
        disabled={!camera.cameraReady || Boolean(camera.cameraError)}
        aria-label={camera.isRecording ? 'To‘xtatish' : 'Yozishni boshlash'}
        className={cn(
          'flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white shadow-[0_12px_36px_rgba(0,0,0,.38)] transition active:scale-95 disabled:opacity-40',
          camera.isRecording ? 'bg-white/10' : 'bg-red-500/15',
        )}
      >
        {camera.isRecording ? (
          <Square className="h-8 w-8 fill-red-500 text-red-500" />
        ) : (
          <span className="h-[54px] w-[54px] rounded-full bg-red-500" />
        )}
      </button>
    );

  const captureModeSwitcher = mode === 'both' && !camera.isRecording && (
    <div className="flex items-center justify-center gap-7">
      <button
        type="button"
        onClick={() => setCaptureMode('photo')}
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.18em] transition',
          captureMode === 'photo' ? 'text-white' : 'text-white/45',
        )}
      >
        Foto
      </button>
      <button
        type="button"
        onClick={() => setCaptureMode('video')}
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.18em] transition',
          captureMode === 'video' ? 'text-white' : 'text-white/45',
        )}
      >
        Video
      </button>
    </div>
  );

  if (camera.capturedPhoto || camera.recordedUrl) {
    const previewLayer = (
      <div
        data-camera-recorder-root="true"
        data-camera-state="preview"
        className={cn(
          'fixed inset-0 isolate h-[100dvh] w-screen overflow-hidden overscroll-none bg-[#080b10] text-white',
          UI_LAYER.immersive,
        )}
      >
        <canvas ref={camera.canvasRef} className="hidden" />
        {mediaPicker}

        <div className="mx-auto flex h-full w-full max-w-[1240px] items-center justify-center md:gap-8 md:px-8 md:py-6">
          <div
            className={cn(
              'relative h-full w-full overflow-hidden bg-black md:h-[min(82dvh,780px)] md:w-auto md:max-w-[78vw] md:rounded-[30px] md:shadow-2xl',
              aspectRatioClass,
            )}
          >
            {camera.capturedPhoto ? (
              <img
                src={camera.capturedPhoto}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={previewVideoRef}
                  src={camera.recordedUrl ?? undefined}
                  className="h-full w-full object-cover"
                  loop
                  playsInline
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="absolute inset-0 flex items-center justify-center"
                  aria-label={isPlaying ? 'Pauza' : 'Ijro'}
                >
                  {!isPlaying && (
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
                      <Play className="ml-1 h-7 w-7" />
                    </span>
                  )}
                </button>
              </>
            )}

            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-5 pt-[max(env(safe-area-inset-top),1rem)] md:hidden">
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  camera.retake();
                }}
                aria-label="Qayta olish"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md"
              >
                <RotateCcw className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={confirmCapture}
                aria-label="Tanlash"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg"
              >
                <Check className="h-6 w-6" />
              </button>
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-24 md:hidden">
              <div className="flex items-center justify-center gap-5">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    camera.retake();
                  }}
                  className="rounded-full bg-black/45 px-5 py-3 text-sm font-semibold text-white backdrop-blur-md"
                >
                  Qayta
                </button>
                <button
                  type="button"
                  onClick={confirmCapture}
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg"
                >
                  Davom etish
                </button>
              </div>
            </div>
          </div>

          <aside className="hidden w-[220px] shrink-0 flex-col gap-3 md:flex">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                camera.retake();
              }}
              className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <RotateCcw className="h-5 w-5" />
              Qayta olish
            </button>
            <button
              type="button"
              onClick={confirmCapture}
              className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              <Check className="h-5 w-5" />
              Tanlash
            </button>
          </aside>
        </div>
      </div>
    );

    return typeof document !== 'undefined'
      ? createPortal(previewLayer, document.body)
      : previewLayer;
  }

  const liveLayer = (
    <div
      data-camera-recorder-root="true"
      data-camera-state="live"
      className={cn(
        'fixed inset-0 isolate h-[100dvh] w-screen touch-manipulation overflow-hidden overscroll-none bg-[#080b10] text-white',
        UI_LAYER.immersive,
      )}
    >
      <canvas ref={camera.canvasRef} className="hidden" />
      {mediaPicker}

      <div className="mx-auto flex h-full w-full max-w-[1240px] items-center justify-center md:gap-8 md:px-8 md:py-6">
        <div
          className={cn(
            'relative h-full w-full overflow-hidden bg-black md:h-[min(82dvh,780px)] md:w-auto md:max-w-[78vw] md:rounded-[30px] md:shadow-2xl',
            aspectRatioClass,
          )}
        >
          <video
            ref={camera.videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              'h-full w-full object-cover',
              facingMode === 'user' && 'scale-x-[-1]',
            )}
            style={{ filter: lens?.style || undefined }}
          />

          {lens?.overlays?.map((overlay, index) => (
            <div
              key={`${lens.id}-${index}`}
              className="pointer-events-none absolute inset-0"
              style={{
                background: cameraOverlayCss(overlay),
                mixBlendMode: overlay.blendMode,
                opacity: overlay.opacity ?? 1,
              }}
            />
          ))}

          {!camera.cameraReady && !camera.cameraError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white" />
            </div>
          )}

          {camera.cameraError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 px-6 text-center text-white">
              <div className="max-w-sm space-y-4">
                <p className="text-sm leading-relaxed text-white/80">
                  {camera.cameraError}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void camera.startCamera()}
                    className="rounded-full"
                  >
                    Qayta urinish
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={chooseFromDevice}
                    className="rounded-full border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                  >
                    Qurilmadan tanlash
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pb-5 pt-[max(env(safe-area-inset-top),1rem)] md:hidden">
            <button
              type="button"
              onClick={onClose}
              disabled={camera.isRecording}
              aria-label="Yopish"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md disabled:opacity-40"
            >
              <X className="h-7 w-7" />
            </button>

            {camera.isRecording ? (
              <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-md">
                {formatDuration(camera.recordingDuration)}
              </span>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={switchCamera}
              disabled={camera.isRecording}
              aria-label="Kamerani aylantirish"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md disabled:opacity-40"
            >
              <FlipHorizontal2 className="h-6 w-6" />
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/55 to-transparent px-3 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-24 md:hidden">
            {!camera.isRecording && (
              <div className="mb-1">
                <CameraLensRail value={lensId} onChange={setLensId} />
              </div>
            )}

            <div className="mb-2">{captureModeSwitcher}</div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center px-2">
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={chooseFromDevice}
                  disabled={camera.isRecording}
                  aria-label="Qurilmadan tanlash"
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.12] text-white backdrop-blur-md transition active:scale-95 disabled:opacity-35"
                >
                  <Images className="h-6 w-6" />
                </button>
              </div>

              {shutter}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={switchCamera}
                  disabled={camera.isRecording}
                  aria-label="Kamerani aylantirish"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.12] text-white backdrop-blur-md transition active:scale-95 disabled:opacity-35"
                >
                  <FlipHorizontal2 className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="hidden w-[230px] shrink-0 flex-col gap-3 md:flex">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-2 backdrop-blur-xl">
            <button
              type="button"
              onClick={onClose}
              disabled={camera.isRecording}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
            >
              <X className="h-5 w-5" />
              Yopish
            </button>
            <button
              type="button"
              onClick={chooseFromDevice}
              disabled={camera.isRecording}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
            >
              <Images className="h-5 w-5" />
              Qurilmadan
            </button>
            <button
              type="button"
              onClick={switchCamera}
              disabled={camera.isRecording}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
            >
              <FlipHorizontal2 className="h-5 w-5" />
              Kamerani aylantirish
            </button>
          </div>

          {mode === 'both' && !camera.isRecording && (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-3 backdrop-blur-xl">
              {captureModeSwitcher}
            </div>
          )}

          {!camera.isRecording && (
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.055] py-2 backdrop-blur-xl">
              <CameraLensRail value={lensId} onChange={setLensId} />
            </div>
          )}

          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.055] px-4 py-5 backdrop-blur-xl">
            {camera.isRecording && (
              <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300">
                {formatDuration(camera.recordingDuration)}
              </span>
            )}
            {shutter}
            <span className="text-center text-[11px] leading-4 text-white/55">
              {captureMode === 'photo'
                ? 'Rasmga olish uchun bosing'
                : camera.isRecording
                  ? 'Yozuvni tugatish uchun bosing'
                  : 'Video yozishni boshlash uchun bosing'}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(liveLayer, document.body)
    : liveLayer;
}
