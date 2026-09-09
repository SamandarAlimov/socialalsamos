import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FlipHorizontal2, Play, RotateCcw, Square, X } from 'lucide-react';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>(mode === 'video' ? 'video' : 'photo');
  const [lensId, setLensId] = useState('none');

  const computedAspectRatio = useMemo<'1:1' | '9:16' | '16:9'>(() => {
    if (aspectRatio === 'auto') return isMobile ? '9:16' : '16:9';
    return aspectRatio;
  }, [aspectRatio, isMobile]);

  const aspectRatioClass = useMemo(() => ({
    '1:1': 'aspect-square',
    '9:16': 'aspect-[9/16]',
    '16:9': 'aspect-video',
  })[computedAspectRatio], [computedAspectRatio]);

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

  // The recorder must live at the real viewport level, not inside Create's
  // scrolling/swipe container. Mobile Safari treats fixed descendants of some
  // scrolling/transformed ancestors as locally fixed, which let the Create
  // mode navbar cover capture controls. The portal below removes that ancestor
  // relationship; this lock also prevents the page behind the camera bouncing.
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
    setFacingMode((current) => current === 'user' ? 'environment' : 'user');
  }, [camera.isRecording]);

  const confirmCapture = useCallback(() => {
    if (camera.capturedPhoto) {
      void fetch(camera.capturedPhoto)
        .then((response) => response.blob())
        .then((blob) => {
          onCapture(new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }), 'image', camera.capturedPhoto as string);
        });
      return;
    }
    if (camera.recordedBlob && camera.recordedUrl) {
      const mimeType = camera.recordedBlob.type || 'video/webm';
      onCapture(
        new File([camera.recordedBlob], `video_${Date.now()}.${extensionForMime(mimeType)}`, { type: mimeType }),
        'video',
        camera.recordedUrl,
      );
    }
  }, [camera.capturedPhoto, camera.recordedBlob, camera.recordedUrl, onCapture]);

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

  if (camera.capturedPhoto || camera.recordedUrl) {
    const previewLayer = (
      <div
        data-camera-recorder-root="true"
        className={cn(
          'fixed inset-0 isolate flex h-[100dvh] w-screen flex-col overflow-hidden overscroll-none bg-background',
          UI_LAYER.immersive,
        )}
      >
        <canvas ref={camera.canvasRef} className="hidden" />
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          {camera.capturedPhoto ? (
            <img
              src={camera.capturedPhoto}
              alt=""
              className={cn(
                'max-h-full max-w-full rounded-2xl object-contain',
                isMobile ? 'h-full w-full' : 'max-h-[75vh]',
              )}
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
              <video
                ref={previewVideoRef}
                src={camera.recordedUrl ?? undefined}
                className={cn(
                  'max-h-full max-w-full rounded-2xl object-contain',
                  isMobile ? 'h-full w-full' : 'max-h-[75vh]',
                )}
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
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-background/80 backdrop-blur">
                    <Play className="ml-1 h-7 w-7" />
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border/60 bg-background px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              setIsPlaying(false);
              camera.retake();
            }}
            className="rounded-xl"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Qayta
          </Button>
          <Button size="lg" onClick={confirmCapture} className="rounded-xl">
            <Check className="mr-2 h-5 w-5" />
            Tanlash
          </Button>
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
      className={cn(
        'fixed inset-0 isolate flex h-[100dvh] w-screen touch-manipulation flex-col overflow-hidden overscroll-none bg-black',
        UI_LAYER.immersive,
      )}
    >
      <canvas ref={camera.canvasRef} className="hidden" />

      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top),1rem)]">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          disabled={camera.isRecording}
          aria-label="Yopish"
          className="rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 hover:text-white"
        >
          <X className="h-6 w-6" />
        </Button>
        {camera.isRecording && (
          <div className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
            {formatDuration(camera.recordingDuration)}
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={switchCamera}
          disabled={camera.isRecording}
          aria-label="Kamerani aylantirish"
          className="rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 hover:text-white"
        >
          <FlipHorizontal2 className="h-6 w-6" />
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        <video
          ref={camera.videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'max-h-full max-w-full object-cover',
            isMobile ? 'h-full w-full' : aspectRatioClass,
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
            <div className="max-w-sm space-y-4">
              <p className="text-sm leading-relaxed text-white/80">
                {camera.cameraError}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void camera.startCamera()}
                className="rounded-full"
              >
                Qayta urinish
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="relative shrink-0 border-t border-white/10 bg-black/[0.88] px-0 pt-2 text-white backdrop-blur-xl pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {mode === 'both' && !camera.isRecording && (
          <div className="mb-1 flex justify-center gap-8 px-4 pt-1">
            <button
              type="button"
              onClick={() => setCaptureMode('photo')}
              className={cn(
                'text-[11px] font-semibold uppercase tracking-[0.16em] transition',
                captureMode === 'photo' ? 'text-white' : 'text-white/45',
              )}
            >
              Foto
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('video')}
              className={cn(
                'text-[11px] font-semibold uppercase tracking-[0.16em] transition',
                captureMode === 'video' ? 'text-white' : 'text-white/45',
              )}
            >
              Video
            </button>
          </div>
        )}

        {!camera.isRecording && <CameraLensRail value={lensId} onChange={setLensId} />}

        <div className="relative flex min-h-[86px] items-center justify-center px-4 pb-1 pt-1 sm:min-h-[92px] sm:pb-2">
          {captureMode === 'photo' ? (
            <button
              type="button"
              onClick={camera.takePhoto}
              disabled={!camera.cameraReady || Boolean(camera.cameraError)}
              aria-label="Rasmga olish"
              className="flex h-[74px] w-[74px] items-center justify-center rounded-full border-[5px] border-white bg-white/15 shadow-[0_10px_32px_rgba(0,0,0,.3)] transition active:scale-95 disabled:opacity-40 sm:h-20 sm:w-20"
            >
              <span className="h-[50px] w-[50px] rounded-full bg-white sm:h-14 sm:w-14" />
            </button>
          ) : (
            <button
              type="button"
              onClick={camera.isRecording ? camera.stopRecording : camera.startRecording}
              disabled={!camera.cameraReady || Boolean(camera.cameraError)}
              aria-label={camera.isRecording ? 'To‘xtatish' : 'Yozishni boshlash'}
              className={cn(
                'flex h-[74px] w-[74px] items-center justify-center rounded-full border-[5px] border-white shadow-[0_10px_32px_rgba(0,0,0,.3)] transition active:scale-95 disabled:opacity-40 sm:h-20 sm:w-20',
                camera.isRecording ? 'bg-white/10' : 'bg-red-500/15',
              )}
            >
              {camera.isRecording ? (
                <Square className="h-8 w-8 fill-red-500 text-red-500" />
              ) : (
                <span className="h-[50px] w-[50px] rounded-full bg-red-500 sm:h-14 sm:w-14" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(liveLayer, document.body)
    : liveLayer;
}
