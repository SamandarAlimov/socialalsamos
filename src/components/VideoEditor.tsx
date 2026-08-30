import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Crop,
  FlipHorizontal,
  FlipVertical,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  canRenderEditedVideo,
  renderEditedVideo,
  type VideoRenderEdit,
} from '@/lib/videoRender';

interface VideoEditorProps {
  videoUrl: string;
  onSave: (
    editedData: VideoEditData,
    renderedFile?: File | null,
  ) => void | Promise<void>;
  onCancel: () => void;
  open: boolean;
  initialEditData?: VideoEditData | null;
  sourceFile?: File | null;
  allowGraphOnly?: boolean;
}

export type VideoEditData = VideoRenderEdit;

type EditorMode = 'trim' | 'crop' | 'transform';
type AspectRatio = 'free' | '1:1' | '16:9' | '9:16' | '4:3';

const DEFAULT_CROP = { x: 0, y: 0, width: 100, height: 100 };

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function waitForMediaEvent(
  element: HTMLMediaElement,
  event: 'loadedmetadata' | 'seeked',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video kadrini o‘qib bo‘lmadi'));
    };
    const cleanup = () => {
      element.removeEventListener(event, onSuccess);
      element.removeEventListener('error', onError);
    };

    element.addEventListener(event, onSuccess, { once: true });
    element.addEventListener('error', onError, { once: true });
  });
}

async function generateThumbnails(videoUrl: string): Promise<string[]> {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  await waitForMediaEvent(video, 'loadedmetadata');

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0) return [];

  const count = Math.min(10, Math.max(4, Math.ceil(duration)));
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  if (!context) return [];

  const output: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const time = Math.min(
      Math.max(0, duration - 0.05),
      (duration / Math.max(1, count - 1)) * index,
    );

    if (Math.abs(video.currentTime - time) > 0.01) {
      video.currentTime = time;
      await waitForMediaEvent(video, 'seeked');
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    output.push(canvas.toDataURL('image/jpeg', 0.7));
  }

  video.removeAttribute('src');
  video.load();
  return output;
}

export function VideoEditor({
  videoUrl,
  onSave,
  onCancel,
  open,
  initialEditData,
  sourceFile,
  allowGraphOnly = true,
}: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cropSurfaceRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(
    null,
  );

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const [mode, setMode] = useState<EditorMode>('trim');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);

  const [cropArea, setCropArea] = useState(DEFAULT_CROP);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('free');
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  const renderSupported = useMemo(
    () => Boolean(sourceFile) && canRenderEditedVideo(),
    [sourceFile],
  );

  useEffect(() => {
    if (!open) return;

    const edit = initialEditData;
    setMode('trim');
    setRotation(edit?.rotation ?? 0);
    setFlipHorizontal(edit?.flipHorizontal ?? false);
    setFlipVertical(edit?.flipVertical ?? false);
    setCropArea(
      edit
        ? {
            x: edit.cropX,
            y: edit.cropY,
            width: edit.cropWidth,
            height: edit.cropHeight,
          }
        : DEFAULT_CROP,
    );
    setAspectRatio('free');

    if (!duration || !edit) {
      setTrimStart(0);
      setTrimEnd(100);
    } else {
      setTrimStart(Math.max(0, Math.min(100, (edit.trimStart / duration) * 100)));
      setTrimEnd(Math.max(0, Math.min(100, (edit.trimEnd / duration) * 100)));
    }
  }, [duration, initialEditData, open, videoUrl]);

  useEffect(() => {
    if (!open || !videoUrl) {
      setThumbnails([]);
      return;
    }

    let cancelled = false;
    setLoadingThumbnails(true);

    void generateThumbnails(videoUrl)
      .then((frames) => {
        if (!cancelled) setThumbnails(frames);
      })
      .catch((error) => {
        console.warn('Video timeline kadrlarini yaratib bo‘lmadi:', error);
        if (!cancelled) setThumbnails([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingThumbnails(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, videoUrl]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleLoadedMetadata = () => {
      const nextDuration = Number.isFinite(videoElement.duration) ? videoElement.duration : 0;
      setDuration(nextDuration);
      setCurrentTime(videoElement.currentTime || 0);
    };

    const handleTimeUpdate = () => {
      const nextTime = videoElement.currentTime;
      setCurrentTime(nextTime);

      if (duration <= 0) return;
      const endTime = (trimEnd / 100) * duration;
      if (nextTime >= endTime) {
        videoElement.currentTime = (trimStart / 100) * duration;
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);

    if (videoElement.readyState >= 1) handleLoadedMetadata();

    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
    };
  }, [duration, trimEnd, trimStart]);

  const togglePlay = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement || duration <= 0) return;

    if (!videoElement.paused) {
      videoElement.pause();
      return;
    }

    const startTime = (trimStart / 100) * duration;
    const endTime = (trimEnd / 100) * duration;
    if (videoElement.currentTime < startTime || videoElement.currentTime >= endTime) {
      videoElement.currentTime = startTime;
    }
    void videoElement.play();
  }, [duration, trimEnd, trimStart]);

  const toggleMute = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const next = !isMuted;
    videoElement.muted = next;
    setIsMuted(next);
  }, [isMuted]);

  const handleVolumeChange = useCallback(
    (value: number[]) => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const next = Math.max(0, Math.min(1, value[0] ?? 1));
      videoElement.volume = next;
      setVolume(next);

      const nextMuted = next === 0;
      videoElement.muted = nextMuted;
      setIsMuted(nextMuted);
    },
    [],
  );

  const seekTo = useCallback(
    (time: number) => {
      const videoElement = videoRef.current;
      if (!videoElement || duration <= 0) return;
      videoElement.currentTime = Math.max(0, Math.min(duration, time));
    },
    [duration],
  );

  const skipBackward = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement || duration <= 0) return;
    videoElement.currentTime = Math.max(
      (trimStart / 100) * duration,
      videoElement.currentTime - 5,
    );
  }, [duration, trimStart]);

  const skipForward = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement || duration <= 0) return;
    videoElement.currentTime = Math.min(
      (trimEnd / 100) * duration,
      videoElement.currentTime + 5,
    );
  }, [duration, trimEnd]);

  const setAspectRatioPreset = useCallback((ratio: AspectRatio) => {
    setAspectRatio(ratio);

    let width = 100;
    let height = 100;
    if (ratio === '1:1') {
      width = 82;
      height = 82;
    } else if (ratio === '16:9') {
      width = 100;
      height = 56.25;
    } else if (ratio === '9:16') {
      width = 56.25;
      height = 100;
    } else if (ratio === '4:3') {
      width = 100;
      height = 75;
    }

    setCropArea({
      x: (100 - width) / 2,
      y: (100 - height) / 2,
      width,
      height,
    });
  }, []);

  const handleCropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== 'crop') return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        cropX: cropArea.x,
        cropY: cropArea.y,
      };
    },
    [cropArea.x, cropArea.y, mode],
  );

  const handleCropPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      const surface = cropSurfaceRef.current;
      if (!start || !surface || mode !== 'crop') return;

      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const deltaX = ((event.clientX - start.x) / rect.width) * 100;
      const deltaY = ((event.clientY - start.y) / rect.height) * 100;

      setCropArea((current) => ({
        ...current,
        x: Math.max(0, Math.min(100 - current.width, start.cropX + deltaX)),
        y: Math.max(0, Math.min(100 - current.height, start.cropY + deltaY)),
      }));
    },
    [mode],
  );

  const handleCropPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const editData = useMemo<VideoEditData>(() => {
    const safeDuration = Math.max(0, duration);
    return {
      trimStart: (trimStart / 100) * safeDuration,
      trimEnd: (trimEnd / 100) * safeDuration,
      cropX: cropArea.x,
      cropY: cropArea.y,
      cropWidth: cropArea.width,
      cropHeight: cropArea.height,
      rotation,
      flipHorizontal,
      flipVertical,
    };
  }, [
    cropArea,
    duration,
    flipHorizontal,
    flipVertical,
    rotation,
    trimEnd,
    trimStart,
  ]);

  const saveEditGraph = useCallback(async () => {
    if (isRendering) return;
    await onSave(editData, null);
  }, [editData, isRendering, onSave]);

  const renderAndSave = useCallback(async () => {
    if (isRendering) return;

    if (!sourceFile || !renderSupported) {
      await saveEditGraph();
      return;
    }

    setIsRendering(true);
    setRenderProgress(0);

    try {
      videoRef.current?.pause();
      const renderedFile = await renderEditedVideo(sourceFile, editData, {
        frameRate: 30,
        maxDimension: 1080,
        onProgress: setRenderProgress,
      });

      await onSave(editData, renderedFile);
      toast.success('Video real faylga render qilindi');
    } catch (error) {
      console.error('Video render xatosi:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Videoni render qilib bo‘lmadi',
      );
    } finally {
      setIsRendering(false);
    }
  }, [
    editData,
    isRendering,
    onSave,
    renderSupported,
    saveEditGraph,
    sourceFile,
  ]);

  const progressPercent =
    duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="flex h-[92dvh] max-h-[920px] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 bg-background/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-base">Video tahrirlash</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {renderSupported
                  ? 'Trim, crop va transformni yangi video faylga real render qilish mumkin.'
                  : 'Bu brauzerda edit graph saqlanadi; real render mavjud emas.'}
              </p>
            </div>
            <span className="hidden rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[10px] font-medium text-muted-foreground sm:block">
              {renderSupported
                ? 'Real render mavjud'
                : allowGraphOnly
                  ? 'Edit graph'
                  : 'Render qo‘llanmaydi'}
            </span>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="relative min-h-[360px] overflow-hidden bg-black">
            <div
              ref={cropSurfaceRef}
              className="absolute inset-0 flex touch-none items-center justify-center p-4 sm:p-8"
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
            >
              <div
                className="relative max-h-full max-w-full"
                style={{
                  transform: `rotate(${rotation}deg) scaleX(${
                    flipHorizontal ? -1 : 1
                  }) scaleY(${flipVertical ? -1 : 1})`,
                  transition: 'transform 180ms ease',
                }}
              >
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="max-h-[64dvh] max-w-full object-contain"
                  playsInline
                />

                {mode === 'crop' && (
                  <>
                    <div className="pointer-events-none absolute inset-0 bg-black/20" />
                    <div
                      className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.58)]"
                      style={{
                        left: `${cropArea.x}%`,
                        top: `${cropArea.y}%`,
                        width: `${cropArea.width}%`,
                        height: `${cropArea.height}%`,
                      }}
                      onPointerDown={handleCropPointerDown}
                      onPointerMove={handleCropPointerMove}
                      onPointerUp={handleCropPointerUp}
                      onPointerCancel={handleCropPointerUp}
                    >
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                        {Array.from({ length: 9 }).map((_, index) => (
                          <div key={index} className="border border-white/20" />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/60 p-3 text-white shadow-xl backdrop-blur-xl sm:inset-x-5 sm:bottom-5">
              <div className="flex items-center gap-2 text-[11px] text-white/70">
                <span className="w-10 text-right">{formatTime(currentTime)}</span>
                <button
                  type="button"
                  aria-label="Videoda joyga o‘tish"
                  className="relative h-5 flex-1"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const percent = (event.clientX - rect.left) / rect.width;
                    seekTo(percent * duration);
                  }}
                >
                  <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20" />
                  <span
                    className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white"
                    style={{ width: `${progressPercent}%` }}
                  />
                </button>
                <span className="w-10">{formatTime(duration)}</span>
              </div>

              <div className="mt-2 flex items-center justify-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={skipBackward}
                  className="text-white hover:bg-white/10 hover:text-white"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  onClick={togglePlay}
                  className="rounded-full"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={skipForward}
                  className="text-white hover:bg-white/10 hover:text-white"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>

                <div className="ml-3 hidden items-center gap-2 sm:flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={toggleMute}
                    className="text-white hover:bg-white/10 hover:text-white"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    onValueChange={handleVolumeChange}
                    max={1}
                    step={0.05}
                    className="w-24"
                  />
                </div>
              </div>
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto border-t border-border/60 bg-card lg:border-l lg:border-t-0">
            <div className="sticky top-0 z-10 border-b border-border/60 bg-card/95 p-3 backdrop-blur">
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/60 p-1">
                {([
                  ['trim', Scissors, 'Kesish'],
                  ['crop', Crop, 'Kadr'],
                  ['transform', RotateCcw, 'Burish'],
                ] as const).map(([id, Icon, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={cn(
                      'flex h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-medium transition',
                      mode === id
                        ? 'bg-background text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-5 p-4">
              {mode === 'trim' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold">Video oralig‘i</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Boshlanish va tugash vaqtini belgilang.
                    </p>
                  </div>

                  <div className="relative h-20 overflow-hidden rounded-2xl bg-muted">
                    <div className="absolute inset-0 flex">
                      {loadingThumbnails && thumbnails.length === 0 ? (
                        <div className="flex w-full items-center justify-center text-xs text-muted-foreground">
                          Timeline tayyorlanmoqda...
                        </div>
                      ) : (
                        thumbnails.map((thumb, index) => (
                          <img
                            key={index}
                            src={thumb}
                            alt=""
                            className="h-full min-w-0 flex-1 object-cover"
                          />
                        ))
                      )}
                    </div>
                    <div
                      className="absolute inset-y-0 left-0 bg-black/60"
                      style={{ width: `${trimStart}%` }}
                    />
                    <div
                      className="absolute inset-y-0 right-0 bg-black/60"
                      style={{ width: `${100 - trimEnd}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-1 bg-primary shadow"
                      style={{ left: `calc(${trimStart}% - 2px)` }}
                    />
                    <div
                      className="absolute inset-y-0 w-1 bg-primary shadow"
                      style={{ left: `calc(${trimEnd}% - 2px)` }}
                    />
                  </div>

                  <Slider
                    value={[trimStart, trimEnd]}
                    onValueChange={(values) => {
                      const start = Math.min(values[0] ?? 0, (values[1] ?? 100) - 0.1);
                      const end = Math.max(values[1] ?? 100, start + 0.1);
                      setTrimStart(start);
                      setTrimEnd(end);
                    }}
                    min={0}
                    max={100}
                    step={0.1}
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-muted/45 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">Boshlanish</p>
                      <p className="mt-1 text-xs font-semibold">
                        {formatTime((trimStart / 100) * duration)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-muted/45 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">Tugash</p>
                      <p className="mt-1 text-xs font-semibold">
                        {formatTime((trimEnd / 100) * duration)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-primary/[0.07] p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">Davomiylik</p>
                      <p className="mt-1 text-xs font-semibold text-primary">
                        {formatTime(((trimEnd - trimStart) / 100) * duration)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {mode === 'crop' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold">Kadr formati</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Formatni tanlang, keyin crop maydonini videoda suring.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(['free', '1:1', '16:9', '9:16', '4:3'] as const).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setAspectRatioPreset(ratio)}
                        className={cn(
                          'h-10 rounded-xl border text-xs font-medium transition',
                          aspectRatio === ratio
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/60 bg-background text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {ratio === 'free' ? 'Erkin' : ratio}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-muted/45 p-3 text-xs leading-relaxed text-muted-foreground">
                    Crop o‘lchami format orqali belgilanadi. Maydonni sichqoncha yoki barmoq bilan surish mumkin.
                  </div>
                </div>
              )}

              {mode === 'transform' && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm font-semibold">Transform</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Videoni burish yoki akslantirish.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold">Burilish</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{rotation}°</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setRotation((value) => (value + 90) % 360)}>
                          <RotateCcw className="mr-1.5 h-4 w-4" />
                          90°
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setRotation(0)}>
                          Reset
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={flipHorizontal ? 'default' : 'outline'}
                      className="rounded-xl"
                      onClick={() => setFlipHorizontal((value) => !value)}
                    >
                      <FlipHorizontal className="mr-2 h-4 w-4" />
                      Gorizontal
                    </Button>
                    <Button
                      type="button"
                      variant={flipVertical ? 'default' : 'outline'}
                      className="rounded-xl"
                      onClick={() => setFlipVertical((value) => !value)}
                    >
                      <FlipVertical className="mr-2 h-4 w-4" />
                      Vertikal
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-border/60 bg-muted/25 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {renderSupported
                  ? allowGraphOnly
                    ? 'Render tugmasi yangi video fayl yaratadi. Xohlasangiz faqat edit holatini ham saqlashingiz mumkin.'
                    : 'Reel uchun o‘zgartirish faqat real render orqali qo‘llanadi.'
                  : allowGraphOnly
                    ? 'Bu qurilmada real browser render mavjud emas. Edit holati saqlanadi va keyingi render engine ishlatishi mumkin.'
                    : 'Bu qurilmada real video render mavjud emas. Original videoni o‘zgartirmasdan ishlatishingiz mumkin.'}
              </div>
            </div>
          </aside>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-5 py-4">
          {isRendering && (
            <div className="mr-auto min-w-32">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Render</span>
                <span>{Math.round(renderProgress * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(renderProgress * 100)}%` }}
                />
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={isRendering}
            onClick={onCancel}
            className="rounded-xl"
          >
            <X className="mr-2 h-4 w-4" />
            Bekor qilish
          </Button>

          {renderSupported && allowGraphOnly && (
            <Button
              type="button"
              variant="ghost"
              disabled={isRendering}
              onClick={() => void saveEditGraph()}
              className="rounded-xl"
            >
              Faqat editni saqlash
            </Button>
          )}

          <Button
            type="button"
            disabled={isRendering || (!renderSupported && !allowGraphOnly)}
            onClick={() => void renderAndSave()}
            className="rounded-xl"
          >
            {isRendering ? (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {renderSupported
              ? 'Render va saqlash'
              : allowGraphOnly
                ? 'Tahrirni saqlash'
                : 'Render mavjud emas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
