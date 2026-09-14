import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FlipHorizontal2,
  Gauge,
  Images,
  LayoutGrid,
  Music2,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  Timer,
  Type,
  Wand2,
  Zap,
  ZapOff,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { CAMERA_LENSES, cameraOverlayCss } from './filters/CameraLensData';
import { extensionForMime } from './cameraCaptureUtils';
import { useCameraCapture } from './useCameraCapture';

export interface CameraCaptureMeta {
  speed: number;
  durationLimit: number;
  boomerang: boolean;
  textOverlay?: string;
}

interface CameraVideoRecorderProps {
  onCapture: (
    file: File,
    type: 'image' | 'video',
    url: string,
    meta?: CameraCaptureMeta,
  ) => void;
  onClose: () => void;
  mode?: 'photo' | 'video' | 'both';
  aspectRatio?: '1:1' | '9:16' | '16:9' | 'auto';
}

type CameraLens = (typeof CAMERA_LENSES)[number];

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const DURATIONS = [15, 30, 60, 90] as const;
const COUNTDOWNS = [0, 3, 10] as const;

function nextValue<T>(values: readonly T[], current: T): T {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length] ?? values[0];
}

function drawCenteredText(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
) {
  const clean = text.trim();
  if (!clean) return;

  const maxWidth = canvas.width * 0.82;
  const fontSize = Math.max(30, Math.round(canvas.width * 0.065));
  const lineHeight = fontSize * 1.18;
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  context.save();
  context.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  const firstY = canvas.height * 0.42 - ((lines.length - 1) * lineHeight) / 2;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(4, Math.round(fontSize * 0.12));
  context.strokeStyle = 'rgba(0,0,0,.58)';
  context.fillStyle = '#fff';

  lines.slice(0, 5).forEach((value, index) => {
    const y = firstY + index * lineHeight;
    context.strokeText(value, canvas.width / 2, y, maxWidth);
    context.fillText(value, canvas.width / 2, y, maxWidth);
  });
  context.restore();
}

export function CameraVideoRecorder({
  onCapture,
  mode = 'both',
  aspectRatio = 'auto',
}: CameraVideoRecorderProps) {
  const isMobile = useIsMobile();
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const deviceInputRef = useRef<HTMLInputElement>(null);
  const filterRailRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>(
    mode === 'video' ? 'video' : 'photo',
  );
  const [lensId, setLensId] = useState('none');
  const [showSettings, setShowSettings] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [showAudioHint, setShowAudioHint] = useState(false);
  const [textOverlay, setTextOverlay] = useState('');
  const [gridEnabled, setGridEnabled] = useState(false);
  const [boomerang, setBoomerang] = useState(false);
  const [softwareFlash, setSoftwareFlash] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [durationLimit, setDurationLimit] = useState<(typeof DURATIONS)[number]>(60);
  const [countdownDelay, setCountdownDelay] = useState<(typeof COUNTDOWNS)[number]>(0);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);

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
  const isReelCamera = mode === 'video';

  const drawCaptureOverlay = useCallback(
    (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      if (softwareFlash) {
        context.save();
        context.fillStyle = 'rgba(255,255,255,.13)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
      }
      drawCenteredText(context, canvas, textOverlay);
    },
    [softwareFlash, textOverlay],
  );

  const camera = useCameraCapture({
    captureMode,
    facingMode,
    aspectRatio: computedAspectRatio,
    lens,
    drawOverlay: drawCaptureOverlay,
  });

  const captureMeta = useMemo<CameraCaptureMeta>(
    () => ({
      speed,
      durationLimit,
      boomerang,
      ...(textOverlay.trim() ? { textOverlay: textOverlay.trim() } : {}),
    }),
    [boomerang, durationLimit, speed, textOverlay],
  );

  const switchCamera = useCallback(() => {
    if (camera.isRecording) return;
    setSoftwareFlash(false);
    setFacingMode((current) =>
      current === 'user' ? 'environment' : 'user',
    );
  }, [camera.isRecording]);

  const toggleFlash = useCallback(() => {
    if (camera.isRecording) return;
    if (camera.torchSupported) {
      void camera.toggleTorch().then((changed) => {
        if (changed) setSoftwareFlash(false);
      });
      return;
    }
    setSoftwareFlash((current) => !current);
  }, [camera]);

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
            captureMeta,
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
        captureMeta,
      );
    }
  }, [camera.capturedPhoto, camera.recordedBlob, camera.recordedUrl, captureMeta, onCapture]);

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

      onCapture(file, type, URL.createObjectURL(file), captureMeta);
    },
    [captureMeta, mode, onCapture],
  );

  const togglePlayback = useCallback(() => {
    const preview = previewVideoRef.current;
    if (!preview) return;
    if (preview.paused) {
      preview.playbackRate = speed;
      void preview.play();
      setIsPlaying(true);
    } else {
      preview.pause();
      setIsPlaying(false);
    }
  }, [speed]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const executeCapture = useCallback(() => {
    if (captureMode === 'photo') camera.takePhoto();
    else camera.startRecording();
  }, [camera.startRecording, camera.takePhoto, captureMode]);

  const requestCapture = useCallback(() => {
    if (camera.isRecording) {
      camera.stopRecording();
      return;
    }
    if (countdownDelay > 0) {
      setCountdownRemaining(countdownDelay);
      return;
    }
    executeCapture();
  }, [camera.isRecording, camera.stopRecording, countdownDelay, executeCapture]);

  useEffect(() => {
    if (countdownRemaining === null) return;
    if (countdownRemaining <= 0) {
      setCountdownRemaining(null);
      executeCapture();
      return;
    }
    const timerId = window.setTimeout(
      () => setCountdownRemaining((current) => (current === null ? null : current - 1)),
      1000,
    );
    return () => window.clearTimeout(timerId);
  }, [countdownRemaining, executeCapture]);

  useEffect(() => {
    if (
      camera.isRecording &&
      durationLimit > 0 &&
      camera.recordingDuration >= durationLimit
    ) {
      camera.stopRecording();
    }
  }, [camera.isRecording, camera.recordingDuration, camera.stopRecording, durationLimit]);

  const scrollFiltersIntoView = useCallback(() => {
    filterRailRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, []);

  const randomLens = useCallback(() => {
    if (CAMERA_LENSES.length <= 1) return;
    let next = CAMERA_LENSES[Math.floor(Math.random() * CAMERA_LENSES.length)];
    if (next?.id === lensId) {
      next = CAMERA_LENSES[(lensIndex + 1) % CAMERA_LENSES.length];
    }
    if (next) setLensId(next.id);
  }, [lensId, lensIndex]);

  const lensBubble = (item: CameraLens) => {
    const overlay = item.overlays?.[0];
    return (
      <button
        key={item.id}
        type="button"
        disabled={camera.isRecording}
        onClick={(event) => {
          setLensId(item.id);
          event.currentTarget.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          });
        }}
        aria-label={`${item.name} filtri`}
        aria-pressed={item.id === lensId}
        className="group shrink-0 snap-center transition active:scale-95 disabled:opacity-30"
      >
        <span
          className={cn(
            'relative block h-11 w-11 overflow-hidden rounded-full border-2 border-white/45 bg-zinc-700 shadow-lg transition sm:h-12 sm:w-12',
            item.id === lensId &&
              'scale-110 border-white shadow-[0_0_0_3px_rgba(255,255,255,.22)]',
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

  const shutter = (
    <button
      type="button"
      onClick={requestCapture}
      disabled={
        !camera.cameraReady ||
        Boolean(camera.cameraError) ||
        countdownRemaining !== null
      }
      aria-label={
        camera.isRecording
          ? 'To‘xtatish'
          : captureMode === 'photo'
            ? 'Rasmga olish'
            : 'Yozishni boshlash'
      }
      className={cn(
        'flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-[5px] border-white shadow-[0_12px_36px_rgba(0,0,0,.42)] transition active:scale-95 disabled:opacity-40',
        captureMode === 'photo'
          ? 'bg-white/15'
          : camera.isRecording
            ? 'bg-white/10'
            : 'bg-red-500/15',
      )}
    >
      {captureMode === 'photo' ? (
        <span className="h-[54px] w-[54px] rounded-full bg-white" />
      ) : camera.isRecording ? (
        <Square className="h-8 w-8 fill-red-500 text-red-500" />
      ) : (
        <span className="h-[54px] w-[54px] rounded-full bg-red-500" />
      )}
    </button>
  );

  const filterCaptureRail = (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/75 md:text-muted-foreground">
        {lens?.name ?? 'Normal'}
      </span>
      <div className="relative h-[88px] w-[min(72vw,430px)] max-w-full overflow-hidden rounded-[30px] bg-[#080b10] shadow-lg">
        <div
          ref={filterRailRef}
          className="alsamos-camera-filter-scroll absolute inset-0 z-10 flex snap-x snap-mandatory items-center gap-3 overflow-x-auto px-[94px] py-2 scroll-smooth"
          onWheel={(event) => {
            const rail = event.currentTarget;
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
              event.preventDefault();
              rail.scrollLeft += event.deltaY;
            }
          }}
        >
          {CAMERA_LENSES.map(lensBubble)}
        </div>
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="pointer-events-auto">{shutter}</div>
        </div>
      </div>
    </div>
  );

  const modeSwitcher = mode === 'both' && !camera.isRecording && (
    <div className="flex items-center justify-center gap-7 text-white md:text-foreground">
      <button
        type="button"
        onClick={() => setCaptureMode('photo')}
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.18em]',
          captureMode === 'photo'
            ? 'text-white md:text-foreground'
            : 'text-white/45 md:text-muted-foreground/55',
        )}
      >
        Foto
      </button>
      <button
        type="button"
        onClick={() => setCaptureMode('video')}
        className={cn(
          'text-[11px] font-semibold uppercase tracking-[0.18em]',
          captureMode === 'video'
            ? 'text-white md:text-foreground'
            : 'text-white/45 md:text-muted-foreground/55',
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
  const flashOn = camera.torchEnabled || softwareFlash;

  const storyTools = (
    <>
      <button
        type="button"
        onClick={() => setShowTextInput((current) => !current)}
        aria-label="Matn"
        title="Matn"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted',
          'bg-black/30 text-white backdrop-blur-md',
          showTextInput && 'ring-2 ring-white/70 md:ring-primary/50',
        )}
      >
        <Type className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => setBoomerang((current) => !current)}
        aria-label="Boomerang"
        title="Boomerang"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted',
          boomerang && 'ring-2 ring-white/70 md:ring-primary/50',
        )}
      >
        <RefreshCw className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => setGridEnabled((current) => !current)}
        aria-label="Layout"
        title="Layout"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted',
          gridEnabled && 'ring-2 ring-white/70 md:ring-primary/50',
        )}
      >
        <LayoutGrid className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => {
          setCaptureMode('video');
          setCountdownDelay(3);
        }}
        aria-label="Hands-free"
        title="Hands-free"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted"
      >
        <Square className="h-5 w-5" />
      </button>
    </>
  );

  const reelTools = (
    <>
      <button
        type="button"
        onClick={() => setShowAudioHint((current) => !current)}
        aria-label="Audio"
        title="Audio"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted"
      >
        <Music2 className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={scrollFiltersIntoView}
        aria-label="Effektlar"
        title="Effektlar"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted"
      >
        <Sparkles className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => setDurationLimit((current) => nextValue(DURATIONS, current))}
        aria-label={`Davomiylik ${durationLimit} soniya`}
        title="Davomiylik"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-[13px] font-bold text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted"
      >
        {durationLimit}
      </button>
      <button
        type="button"
        onClick={() => setGridEnabled((current) => !current)}
        aria-label="Video layout"
        title="Video layout"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted',
          gridEnabled && 'ring-2 ring-white/70 md:ring-primary/50',
        )}
      >
        <LayoutGrid className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => setCountdownDelay((current) => nextValue(COUNTDOWNS, current))}
        aria-label={`Timer ${countdownDelay} soniya`}
        title="Timer"
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted"
      >
        <Timer className="h-6 w-6" />
        {countdownDelay > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold text-black md:bg-foreground md:text-background">
            {countdownDelay}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={randomLens}
        aria-label="Tasodifiy effekt"
        title="Tasodifiy effekt"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition md:border md:border-border/70 md:bg-background md:text-foreground md:shadow-sm md:hover:bg-muted"
      >
        <Wand2 className="h-6 w-6" />
      </button>
    </>
  );

  return (
    <div
      data-camera-recorder-root="true"
      data-camera-state={hasPreview ? 'preview' : 'live'}
      className="absolute inset-0 z-30 min-h-0 overflow-hidden bg-[#080b10] text-white md:bg-background md:text-foreground"
    >
      <canvas ref={camera.canvasRef} className="hidden" />
      {mediaPicker}

      <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col items-center justify-center gap-3 px-0 py-0 md:px-6 md:py-4">
        <div className="flex min-h-0 flex-1 items-center justify-center gap-3 md:w-full md:gap-4">
          {!hasPreview && (
            <aside className="hidden w-14 shrink-0 flex-col items-center gap-3 md:flex">
              {isReelCamera ? reelTools : storyTools}
            </aside>
          )}

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center md:flex-none">
            {isReelCamera && !hasPreview && (
              <button
                type="button"
                onClick={() => setShowAudioHint((current) => !current)}
                className="mb-2 hidden h-10 items-center gap-2 rounded-full border border-border/70 bg-background px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted md:flex"
              >
                <Music2 className="h-4 w-4" />
                Add audio
              </button>
            )}

            <div
              className={cn(
                'relative h-full w-full overflow-hidden bg-black md:h-[min(62dvh,620px)] md:w-auto md:max-w-[68vw] md:rounded-[30px] md:shadow-[0_24px_70px_-32px_rgba(0,0,0,.6)]',
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

                  {gridEnabled && (
                    <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-3 grid-rows-3">
                      {Array.from({ length: 9 }).map((_, index) => (
                        <span
                          key={index}
                          className="border-[0.5px] border-white/28"
                        />
                      ))}
                    </div>
                  )}

                  {textOverlay.trim() && (
                    <div className="pointer-events-none absolute inset-x-[8%] top-[42%] z-20 -translate-y-1/2 text-center text-2xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,.9)] sm:text-3xl">
                      {textOverlay}
                    </div>
                  )}

                  {!camera.cameraReady && !camera.cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white" />
                    </div>
                  )}

                  {camera.cameraError && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 px-6 text-center text-white">
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

                  {countdownRemaining !== null && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 text-[84px] font-bold text-white drop-shadow-lg">
                      {countdownRemaining}
                    </div>
                  )}

                  {camera.isRecording && (
                    <span className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                      {formatDuration(camera.recordingDuration)} / {durationLimit}s
                    </span>
                  )}

                  <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:hidden">
                    <span className="h-11 w-11" />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleFlash}
                        disabled={camera.isRecording}
                        aria-label={flashOn ? 'Flashni o‘chirish' : 'Flashni yoqish'}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md disabled:opacity-35"
                      >
                        {flashOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                      </button>
                      {isReelCamera && (
                        <>
                          <button
                            type="button"
                            onClick={() => setSpeed((current) => nextValue(SPEEDS, current))}
                            aria-label={`Tezlik ${speed}x`}
                            className="flex h-10 min-w-10 items-center justify-center rounded-full bg-black/30 px-2 text-xs font-bold text-white backdrop-blur-md"
                          >
                            {speed}×
                          </button>
                          <button
                            type="button"
                            onClick={() => setCountdownDelay((current) => nextValue(COUNTDOWNS, current))}
                            aria-label="Timer"
                            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md"
                          >
                            <Timer className="h-5 w-5" />
                            {countdownDelay > 0 && (
                              <span className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold text-black">
                                {countdownDelay}
                              </span>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSettings((current) => !current)}
                      aria-label="Sozlamalar"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md"
                    >
                      <Settings className="h-6 w-6" />
                    </button>
                  </div>

                  {isReelCamera && (
                    <button
                      type="button"
                      onClick={() => setShowAudioHint((current) => !current)}
                      className="absolute left-1/2 top-[72px] z-30 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-black/45 px-5 text-sm font-semibold text-white backdrop-blur-md md:hidden"
                    >
                      <Music2 className="h-4 w-4" />
                      Add audio
                    </button>
                  )}

                  <div className="absolute left-3 top-[28%] z-30 flex -translate-y-1/2 flex-col gap-3 md:hidden">
                    {isReelCamera ? reelTools : storyTools}
                  </div>

                  {showTextInput && !isReelCamera && (
                    <div className="absolute inset-x-5 top-[33%] z-40">
                      <input
                        autoFocus
                        value={textOverlay}
                        maxLength={140}
                        onChange={(event) => setTextOverlay(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') setShowTextInput(false);
                        }}
                        placeholder="Matn yozing..."
                        className="h-12 w-full rounded-2xl border border-white/15 bg-black/45 px-4 text-center text-base font-semibold text-white outline-none backdrop-blur-xl placeholder:text-white/45"
                      />
                    </div>
                  )}

                  {showAudioHint && isReelCamera && (
                    <div className="absolute left-1/2 top-[126px] z-40 w-[min(84%,310px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/72 p-4 text-center text-white shadow-2xl backdrop-blur-xl md:top-4">
                      <Music2 className="mx-auto mb-2 h-5 w-5" />
                      <p className="text-xs font-semibold">Audio</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/65">
                        Asl audio yozuvga olinadi. Musiqani klip olingandan keyin Reel tahririda tanlash mumkin.
                      </p>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/55 to-transparent px-2 pb-3 pt-20 md:hidden">
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
                      <div className="min-w-0 flex-1">{filterCaptureRail}</div>
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
                <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-5 pb-5 pt-24 md:hidden">
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
          </div>

          <aside className="hidden w-14 shrink-0 flex-col items-center gap-3 md:flex">
            {!hasPreview && (
              <>
                <button
                  type="button"
                  onClick={toggleFlash}
                  disabled={camera.isRecording}
                  aria-label={flashOn ? 'Flashni o‘chirish' : 'Flashni yoqish'}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted disabled:opacity-30"
                >
                  {flashOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                </button>
                {isReelCamera && (
                  <button
                    type="button"
                    onClick={() => setSpeed((current) => nextValue(SPEEDS, current))}
                    aria-label={`Tezlik ${speed}x`}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background text-xs font-bold text-foreground shadow-sm transition hover:bg-muted"
                  >
                    {speed}×
                  </button>
                )}
                <button
                  type="button"
                  onClick={chooseFromDevice}
                  disabled={camera.isRecording}
                  aria-label="Qurilmadan tanlash"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted disabled:opacity-30"
                >
                  <Images className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={switchCamera}
                  disabled={camera.isRecording}
                  aria-label="Kamerani aylantirish"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted disabled:opacity-30"
                >
                  <FlipHorizontal2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings((current) => !current)}
                  aria-label="Sozlamalar"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted"
                >
                  <Settings className="h-5 w-5" />
                </button>
              </>
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

        <div className="hidden min-h-[112px] shrink-0 items-center justify-center gap-4 md:flex">
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
              {filterCaptureRail}
              {modeSwitcher}
            </div>
          )}
        </div>
      </div>

      {showSettings && !hasPreview && (
        <div className="absolute right-4 top-16 z-50 w-64 rounded-2xl border border-white/10 bg-black/85 p-3 text-white shadow-2xl backdrop-blur-xl md:right-6 md:top-6 md:border-border md:bg-background/95 md:text-foreground">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Settings className="h-4 w-4" />
            Kamera sozlamalari
          </div>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setGridEnabled((current) => !current)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-white/10 md:hover:bg-muted"
            >
              <span className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Grid</span>
              <span>{gridEnabled ? 'Yoniq' : 'O‘chiq'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCountdownDelay((current) => nextValue(COUNTDOWNS, current))}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-white/10 md:hover:bg-muted"
            >
              <span className="flex items-center gap-2"><Timer className="h-4 w-4" /> Timer</span>
              <span>{countdownDelay === 0 ? 'O‘chiq' : `${countdownDelay}s`}</span>
            </button>
            {isReelCamera && (
              <button
                type="button"
                onClick={() => setSpeed((current) => nextValue(SPEEDS, current))}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-white/10 md:hover:bg-muted"
              >
                <span className="flex items-center gap-2"><Gauge className="h-4 w-4" /> Tezlik</span>
                <span>{speed}×</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLensId('none');
                setGridEnabled(false);
                setSoftwareFlash(false);
                setCountdownDelay(0);
                setSpeed(1);
                setDurationLimit(60);
                setBoomerang(false);
                setTextOverlay('');
              }}
              className="mt-1 flex w-full items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/10 md:border-border md:hover:bg-muted"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
