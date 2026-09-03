import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FlipHorizontal2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { UI_LAYER } from '@/lib/uiLayers';
import { useIsMobile } from '@/hooks/use-mobile';
import { FILTERS } from './filters/FilterData';

interface CameraVideoRecorderProps {
  onCapture: (file: File, type: 'image' | 'video', url: string) => void;
  onClose: () => void;
  mode?: 'photo' | 'video' | 'both';
  aspectRatio?: '1:1' | '9:16' | '16:9' | 'auto';
}

interface CaptureSize {
  width: number;
  height: number;
}

function supportedRecorderMime(): string | null {
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

function captureSize(
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

function drawCameraFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  mirror: boolean,
  filter: string,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.max(
    canvas.width / sourceWidth,
    canvas.height / sourceHeight,
  );
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = (canvas.width - drawWidth) / 2;
  const y = (canvas.height - drawHeight) / 2;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.filter = 'none';
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.filter = filter || 'none';

  if (mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(
      video,
      canvas.width - x - drawWidth,
      y,
      drawWidth,
      drawHeight,
    );
  } else {
    context.drawImage(video, x, y, drawWidth, drawHeight);
  }

  context.restore();
}

function extensionForMime(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

export function CameraVideoRecorder({
  onCapture,
  onClose,
  mode = 'both',
  aspectRatio = 'auto',
}: CameraVideoRecorderProps) {
  const isMobile = useIsMobile();

  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>(
    mode === 'video' ? 'video' : 'photo',
  );
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('none');
  const [showFilters, setShowFilters] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renderFrameRef = useRef<number | null>(null);

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

  const filterStyle = useMemo(
    () =>
      currentFilter === 'none'
        ? ''
        : FILTERS.find((filter) => filter.id === currentFilter)?.style ?? '',
    [currentFilter],
  );

  const stopRenderLoop = useCallback(() => {
    if (renderFrameRef.current !== null) {
      cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
    }
  }, []);

  const stopProcessedStream = useCallback(() => {
    processedStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
    processedStreamRef.current = null;
  }, []);

  const stopCameraStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraReady(false);
    stopCameraStream();

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1280, max: 1920, min: 320 },
          height: { ideal: 1280, max: 1920, min: 240 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: captureMode === 'video',
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: captureMode === 'video',
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraReady(true);
    } catch (error) {
      console.error('Camera access error:', error);
      setCameraReady(false);
    }
  }, [captureMode, facingMode, stopCameraStream]);

  useEffect(() => {
    void startCamera();

    return () => {
      stopRenderLoop();
      stopProcessedStream();
      stopCameraStream();

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [
    startCamera,
    stopCameraStream,
    stopProcessedStream,
    stopRenderLoop,
  ]);

  const switchCamera = useCallback(() => {
    if (isRecording) return;
    setFacingMode((current) =>
      current === 'user' ? 'environment' : 'user',
    );
  }, [isRecording]);

  const prepareCanvas = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return null;

    const size = captureSize(
      computedAspectRatio,
      video.videoWidth,
      video.videoHeight,
    );
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;

    return { video, canvas, context };
  }, [computedAspectRatio]);

  const takePhoto = useCallback(() => {
    const prepared = prepareCanvas();
    if (!prepared) return;

    drawCameraFrame(
      prepared.context,
      prepared.canvas,
      prepared.video,
      facingMode === 'user',
      filterStyle,
    );

    setCapturedPhoto(prepared.canvas.toDataURL('image/jpeg', 0.92));
  }, [facingMode, filterStyle, prepareCanvas]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;

    const prepared = prepareCanvas();
    const mimeType = supportedRecorderMime();
    const canCaptureCanvas =
      prepared &&
      typeof prepared.canvas.captureStream === 'function';

    if (!mimeType || !canCaptureCanvas || !prepared) {
      console.error('Processed camera recording is not supported');
      return;
    }

    chunksRef.current = [];
    stopRenderLoop();
    stopProcessedStream();

    const draw = () => {
      drawCameraFrame(
        prepared.context,
        prepared.canvas,
        prepared.video,
        facingMode === 'user',
        filterStyle,
      );
      renderFrameRef.current = requestAnimationFrame(draw);
    };
    draw();

    const processed = prepared.canvas.captureStream(30);

    streamRef.current.getAudioTracks().forEach((track) => {
      processed.addTrack(track);
    });

    processedStreamRef.current = processed;

    const recorder = new MediaRecorder(processed, {
      mimeType,
      videoBitsPerSecond:
        Math.max(prepared.canvas.width, prepared.canvas.height) >= 1080
          ? 8_000_000
          : 5_000_000,
      audioBitsPerSecond: 128_000,
    });
    mediaRecorderRef.current = recorder;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });

    recorder.addEventListener(
      'stop',
      () => {
        stopRenderLoop();
        stopProcessedStream();

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) return;

        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setRecordedBlob(blob);
      },
      { once: true },
    );

    recorder.start(500);
    setIsRecording(true);
    setRecordingDuration(0);

    timerRef.current = setInterval(() => {
      setRecordingDuration((current) => current + 1);
    }, 1000);
  }, [
    facingMode,
    filterStyle,
    isRecording,
    prepareCanvas,
    recordedUrl,
    stopProcessedStream,
    stopRenderLoop,
  ]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !isRecording) return;

    if (recorder.state !== 'inactive') recorder.stop();

    setIsRecording(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    stopCameraStream();
  }, [isRecording, stopCameraStream]);

  const retake = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);

    setRecordedUrl(null);
    setRecordedBlob(null);
    setCapturedPhoto(null);
    setRecordingDuration(0);
    setIsPlaying(false);
    void startCamera();
  }, [recordedUrl, startCamera]);

  const confirmCapture = useCallback(() => {
    if (capturedPhoto) {
      void fetch(capturedPhoto)
        .then((response) => response.blob())
        .then((blob) => {
          const file = new File([blob], `photo_${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          onCapture(file, 'image', capturedPhoto);
        });
      return;
    }

    if (recordedBlob && recordedUrl) {
      const mimeType = recordedBlob.type || 'video/webm';
      const file = new File(
        [recordedBlob],
        `video_${Date.now()}.${extensionForMime(mimeType)}`,
        { type: mimeType },
      );
      onCapture(file, 'video', recordedUrl);
    }
  }, [capturedPhoto, onCapture, recordedBlob, recordedUrl]);

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
    const rest = seconds % 60;
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
  };

  const quickFilters = useMemo(
    () => FILTERS.slice(0, 9).filter((filter) => filter.id !== 'none'),
    [],
  );

  if (capturedPhoto || recordedUrl) {
    return (
      <div className={cn('fixed inset-0 flex flex-col bg-background safe-area-inset', UI_LAYER.immersive)}>
        <canvas ref={canvasRef} className="hidden" />

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
          {capturedPhoto ? (
            <img
              src={capturedPhoto}
              alt=""
              className={cn(
                'max-h-full max-w-full rounded-2xl object-contain',
                isMobile ? 'w-full' : 'max-h-[75vh]',
              )}
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center">
              <video
                ref={previewVideoRef}
                src={recordedUrl ?? undefined}
                className={cn(
                  'max-h-full max-w-full rounded-2xl object-contain',
                  isMobile ? 'w-full' : 'max-h-[75vh]',
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

        <div
          className={cn(
            'flex items-center justify-center gap-3 border-t border-border/60 bg-background p-4',
            isMobile && 'pb-safe',
          )}
        >
          <Button
            variant="outline"
            size="lg"
            onClick={retake}
            className="rounded-xl"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Qayta
          </Button>
          <Button
            size="lg"
            onClick={confirmCapture}
            className="rounded-xl"
          >
            <Check className="mr-2 h-5 w-5" />
            Tanlash
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('fixed inset-0 flex flex-col overflow-hidden bg-black safe-area-inset', UI_LAYER.immersive)}>
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 pt-safe">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          disabled={isRecording}
          className="rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 hover:text-white"
        >
          <X className="h-6 w-6" />
        </Button>

        {isRecording && (
          <div className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
            {formatDuration(recordingDuration)}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={switchCamera}
          disabled={isRecording}
          className="rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 hover:text-white"
        >
          <FlipHorizontal2 className="h-6 w-6" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'max-h-full max-w-full object-cover',
            isMobile ? 'h-full w-full' : aspectRatioClass,
            facingMode === 'user' && 'scale-x-[-1]',
          )}
          style={{ filter: filterStyle || undefined }}
        />

        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white" />
          </div>
        )}
      </div>

      {showFilters && !isRecording && (
        <div className="absolute inset-x-0 bottom-32 z-20 px-4">
          <ScrollArea className="w-full">
            <div className="flex justify-center gap-2 pb-2">
              <button
                type="button"
                onClick={() => setCurrentFilter('none')}
                className={cn(
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 bg-black/45 text-white backdrop-blur',
                  currentFilter === 'none'
                    ? 'border-white'
                    : 'border-transparent',
                )}
                aria-label="Filtrsiz"
              >
                <X className="h-5 w-5" />
              </button>

              {quickFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setCurrentFilter(filter.id)}
                  title={filter.name}
                  className={cn(
                    'h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 bg-muted',
                    currentFilter === filter.id
                      ? 'border-white'
                      : 'border-transparent',
                  )}
                >
                  <div
                    className="h-full w-full bg-gradient-to-br from-primary/70 via-accent/60 to-secondary"
                    style={{ filter: filter.style }}
                  />
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <div
        className={cn(
          'shrink-0 border-t border-white/10 bg-black/75 p-4 text-white backdrop-blur-xl',
          isMobile && 'pb-safe',
        )}
      >
        {!isRecording && (
          <div className="mb-4 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters((current) => !current)}
              className={cn(
                'rounded-full text-white hover:bg-white/10 hover:text-white',
                showFilters && 'bg-white/10',
              )}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Filtr
            </Button>
          </div>
        )}

        {mode === 'both' && !isRecording && (
          <div className="mb-4 flex justify-center gap-8">
            <button
              type="button"
              onClick={() => setCaptureMode('photo')}
              className={cn(
                'text-xs font-semibold uppercase tracking-wider transition',
                captureMode === 'photo' ? 'text-white' : 'text-white/45',
              )}
            >
              Foto
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('video')}
              className={cn(
                'text-xs font-semibold uppercase tracking-wider transition',
                captureMode === 'video' ? 'text-white' : 'text-white/45',
              )}
            >
              Video
            </button>
          </div>
        )}

        <div className="flex justify-center">
          {captureMode === 'photo' ? (
            <button
              type="button"
              onClick={takePhoto}
              disabled={!cameraReady}
              aria-label="Rasmga olish"
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/15 transition active:scale-95 disabled:opacity-40"
            >
              <span className="h-14 w-14 rounded-full bg-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!cameraReady}
              aria-label={isRecording ? 'To‘xtatish' : 'Yozishni boshlash'}
              className={cn(
                'flex h-20 w-20 items-center justify-center rounded-full border-4 border-white transition active:scale-95 disabled:opacity-40',
                isRecording ? 'bg-white/10' : 'bg-red-500/15',
              )}
            >
              {isRecording ? (
                <Square className="h-8 w-8 fill-red-500 text-red-500" />
              ) : (
                <span className="h-14 w-14 rounded-full bg-red-500" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
