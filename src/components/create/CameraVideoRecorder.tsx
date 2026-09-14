import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Check,
  FlipHorizontal2,
  Images,
  Play,
  RotateCcw,
  Square,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { CAMERA_LENSES, cameraOverlayCss } from './filters/CameraLensData';
import { extensionForMime } from './cameraCaptureUtils';
import { useCameraCapture } from './useCameraCapture';

interface CameraVideoRecorderProps {
  onCapture: (file: File, type: 'image' | 'video', url: string) => void;
  onClose: () => void;
  mode?: 'photo' | 'video' | 'both';
  aspectRatio?: '1:1' | '9:16' | '16:9' | 'auto';
}

type CameraLens = (typeof CAMERA_LENSES)[number];

export function CameraVideoRecorder({
  onCapture,
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

  const lensIndex = Math.max(
    0,
    CAMERA_LENSES.findIndex((item) => item.id === lensId),
  );
  const lens = CAMERA_LENSES[lensIndex] ?? CAMERA_LENSES[0];

  const camera = useCameraCapture({
    captureMode,
    facingMode,
    aspectRatio: computedAspectRatio,
    lens,
  });

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
    if (!camera.isRecording) deviceInputRef.current?.click();
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

      onCapture(file, type, URL.createObjectURL(file));
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

  const relativeLens = useCallback(
    (offset: number): CameraLens => {
      const length = CAMERA_LENSES.length;
      const index = (lensIndex + offset + length) % length;
      return CAMERA_LENSES[index] ?? CAMERA_LENSES[0];
    },
    [lensIndex],
  );

  const lensBubble = (item: CameraLens, dimmed = false) => {
    const overlay = item.overlays?.[0];
    return (
      <button
        key={`${item.id}-${dimmed ? 'far' : 'near'}`}
        type="button"
        disabled={camera.isRecording}
        onClick={() => setLensId(item.id)}
        aria-label={`${item.name} filtri`}
        aria-pressed={item.id === lensId}
        className={cn(
          'group shrink-0 transition active:scale-95 disabled:opacity-30',
          dimmed && 'opacity-55',
        )}
      >
        <span
          className={cn(
            'relative block h-11 w-11 overflow-hidden rounded-full border-2 border-white/45 bg-zinc-700 shadow-lg transition sm:h-12 sm:w-12',
            item.id === lensId &&
              'scale-110 border-white shadow-[0_0_0_3px_rgba(255,255,255,.2)]',
          )}
        >
          <span
            className="absolute inset-0 bg-gradient-to-br from-orange-300 via-rose-500 to-indigo-700"
            style={{ filter: item.style || undefined }}
          />
          {overlay && (
            <span
              className="absolute inset-0"
              style={{
                background: cameraOverlayCss(overlay),
                mixBlendMode: overlay.blendMode,
                opacity: overlay.opacity ?? 1,
              }}
            />
          )}
          {item.id === 'none' && (
            <span className="absolute inset-0 m-auto h-7 w-px rotate-45 bg-white/90" />
          )}
        </span>
      </button>
    );
  };

  const shutter =
    captureMode === 'photo' ? (
      <button
        type="button"
        onClick={camera.takePhoto}
        disabled={!camera.cameraReady || Boolean(camera.cameraError)}
        aria-label="Rasmga olish"
        className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-[5px] border-white bg-white/15 shadow-[0_12px_36px_rgba(0,0,0,.42)] transition active:scale-95 disabled:opacity-40"
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
          'flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-[5px] border-white shadow-[0_12px_36px_rgba(0,0,0,.42)] transition active:scale-95 disabled:opacity-40',
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

  const captureRail = (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      {lensBubble(relativeLens(-2), true)}
      {lensBubble(relativeLens(-1))}
      {shutter}
      {lensBubble(relativeLens(1))}
      {lensBubble(relativeLens(2), true)}
    </div>
  );

  const modeSwitcher = mode === 'both' && !camera.isRecording && (
    <div className="flex items-center justify-center gap-7 text-white">
      <button
        type="button"
        onClick={() => setCaptureMode('photo')}
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.18em]',
          captureMode === 'photo' ? 'text-white' : 'text-white/45',
        )}
      >
        Foto
      </button>
      <button
        type="button"
        onClick={() => setCaptureMode('video')}
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.18em]',
          captureMode === 'video' ? 'text-white' : 'text-white/45',
        )}
      >
        Video
      </button>
    </div>
  );

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

  const hasPreview = Boolean(camera.capturedPhoto || camera.recordedUrl);

  return (
    <div
      data-camera-recorder-root="true"
      data-camera-state={hasPreview ? 'preview' : 'live'}
      className="absolute inset-0 z-30 min-h-0 overflow-hidden bg-[#080b10] text-white md:bg-background md:text-foreground"
    >
      <canvas ref={camera.canvasRef} className="hidden" />
      {mediaPicker}

      <div className="mx-auto flex h-full w-full max-w-[1080px] flex-col items-center justify-center gap-3 px-0 py-0 md:px-6 md:py-4">
        <div className="flex min-h-0 flex-1 items-center justify-center gap-4 md:w-full">
          <div
            className={cn(
              'relative h-full w-full overflow-hidden bg-black md:h-[min(66dvh,650px)] md:w-auto md:max-w-[70vw] md:rounded-[30px] md:shadow-[0_24px_70px_-32px_rgba(0,0,0,.6)]',
              aspectRatioClass,
            )}
          >
            {hasPreview ? (
              camera.capturedPhoto ? (
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
              )
            ) : (
              <>
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
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white" />
                  </div>
                )}

                {camera.cameraError && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 px-6 text-center text-white">
                    <div className="max-w-xs space-y-4">
                      <p className="text-sm leading-relaxed text-white/75">
                        {camera.cameraError}
                      </p>
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => void camera.startCamera()}
                          className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black"
                        >
                          Qayta urinish
                        </button>
                        <button
                          type="button"
                          onClick={chooseFromDevice}
                          className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white"
                        >
                          Qurilmadan
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {camera.isRecording && (
                  <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                    {formatDuration(camera.recordingDuration)}
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/45 to-transparent px-2 pb-4 pt-20 md:hidden">
                  <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
                    {lens?.name ?? 'Normal'}
                  </div>
                  {modeSwitcher}
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={chooseFromDevice}
                      disabled={camera.isRecording}
                      aria-label="Qurilmadan tanlash"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-md disabled:opacity-30"
                    >
                      <Images className="h-6 w-6" />
                    </button>
                    {captureRail}
                    <button
                      type="button"
                      onClick={switchCamera}
                      disabled={camera.isRecording}
                      aria-label="Kamerani aylantirish"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md disabled:opacity-30"
                    >
                      <FlipHorizontal2 className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {hasPreview && (
              <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-5 pb-5 pt-24 md:hidden">
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      camera.retake();
                    }}
                    className="flex h-11 items-center gap-2 rounded-full bg-black/45 px-5 text-sm font-semibold text-white backdrop-blur-md"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Qayta
                  </button>
                  <button
                    type="button"
                    onClick={confirmCapture}
                    className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black"
                  >
                    <Check className="h-5 w-5" />
                    Davom etish
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="hidden w-14 shrink-0 flex-col gap-3 md:flex">
            <button
              type="button"
              onClick={chooseFromDevice}
              disabled={camera.isRecording}
              aria-label="Qurilmadan tanlash"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted disabled:opacity-30"
            >
              <Images className="h-5 w-5" />
            </button>
            {!hasPreview && (
              <button
                type="button"
                onClick={switchCamera}
                disabled={camera.isRecording}
                aria-label="Kamerani aylantirish"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted disabled:opacity-30"
              >
                <FlipHorizontal2 className="h-5 w-5" />
              </button>
            )}
            {hasPreview && (
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  camera.retake();
                }}
                aria-label="Qayta olish"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
            )}
          </aside>
        </div>

        <div className="hidden min-h-[92px] shrink-0 items-center justify-center gap-4 md:flex">
          {hasPreview ? (
            <button
              type="button"
              onClick={confirmCapture}
              className="flex h-12 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background shadow-lg"
            >
              <Check className="h-5 w-5" />
              Davom etish
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {lens?.name ?? 'Normal'}
              </span>
              <div className="rounded-[28px] bg-[#080b10] px-5 py-2 text-white shadow-lg">
                {captureRail}
              </div>
              {modeSwitcher}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
