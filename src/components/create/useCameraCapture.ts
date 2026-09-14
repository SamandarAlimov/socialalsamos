import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraLens } from './filters/CameraLensData';
import {
  captureSize,
  clampCameraZoom,
  drawCameraFrame,
  supportedRecorderMime,
} from './cameraCaptureUtils';

interface UseCameraCaptureOptions {
  captureMode: 'photo' | 'video';
  facingMode: 'user' | 'environment';
  aspectRatio: '1:1' | '9:16' | '16:9';
  lens: CameraLens;
  drawOverlay?: (
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
  ) => void;
}

export function useCameraCapture(options: UseCameraCaptureOptions) {
  const { captureMode, facingMode, aspectRatio, lens, drawOverlay } = options;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renderFrameRef = useRef<number | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Zoom is controlled at the Create-page level so the same pinch / wheel
  // gesture can drive Story and Reel without coupling layout code to this hook.
  // The value is also used by the canvas renderer, therefore saved photos and
  // recorded videos match the live preview instead of zooming only with CSS.
  useEffect(() => {
    const handleZoom = (event: Event) => {
      const detail = (event as CustomEvent<number | { zoom?: number }>).detail;
      const nextZoom = typeof detail === 'number' ? detail : detail?.zoom;
      if (typeof nextZoom !== 'number') return;
      setZoom(clampCameraZoom(nextZoom));
    };

    window.addEventListener('alsamos-camera-zoom', handleZoom);
    return () => window.removeEventListener('alsamos-camera-zoom', handleZoom);
  }, []);

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
    setTorchEnabled(false);
    setTorchSupported(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraReady(false);
    setCameraError(null);
    stopCameraStream();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Bu brauzer kamera ochishni qo‘llab-quvvatlamaydi.');
      return;
    }

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
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack?.getCapabilities) {
        const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        setTorchSupported(Boolean(capabilities.torch));
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      console.error('Camera access error:', error);
      setCameraError('Kameraga ruxsat berilmadi yoki kamera band.');
    }
  }, [captureMode, facingMode, stopCameraStream]);

  useEffect(() => {
    void startCamera();
    return () => {
      stopRenderLoop();
      stopProcessedStream();
      stopCameraStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera, stopCameraStream, stopProcessedStream, stopRenderLoop]);

  useEffect(() => () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  // Use the individual CSS `scale` transform so the existing front-camera
  // mirror transform keeps working. This makes pinch zoom visible immediately
  // while the canvas path below applies the exact same crop to saved media.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.style.setProperty('scale', String(zoom));
    video.style.setProperty('transform-origin', 'center center');
    video.style.setProperty('will-change', 'scale');
  }, [cameraReady, zoom]);

  const prepareCanvas = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return null;
    const size = captureSize(aspectRatio, video.videoWidth, video.videoHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { alpha: false });
    return context ? { video, canvas, context } : null;
  }, [aspectRatio]);

  const drawPreparedFrame = useCallback(
    (prepared: {
      video: HTMLVideoElement;
      canvas: HTMLCanvasElement;
      context: CanvasRenderingContext2D;
    }) => {
      drawCameraFrame(
        prepared.context,
        prepared.canvas,
        prepared.video,
        facingMode === 'user',
        lens,
        zoom,
      );
      drawOverlay?.(prepared.context, prepared.canvas);
    },
    [drawOverlay, facingMode, lens, zoom],
  );

  const takePhoto = useCallback(() => {
    const prepared = prepareCanvas();
    if (!prepared) return;
    drawPreparedFrame(prepared);
    setCapturedPhoto(prepared.canvas.toDataURL('image/jpeg', 0.92));
    stopCameraStream();
  }, [drawPreparedFrame, prepareCanvas, stopCameraStream]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;
    const prepared = prepareCanvas();
    const mimeType = supportedRecorderMime();
    if (!prepared || !mimeType || typeof prepared.canvas.captureStream !== 'function') {
      setCameraError('Bu brauzer filtrlangan video yozishni qo‘llab-quvvatlamaydi.');
      return;
    }

    chunksRef.current = [];
    stopRenderLoop();
    stopProcessedStream();
    const draw = () => {
      drawPreparedFrame(prepared);
      renderFrameRef.current = requestAnimationFrame(draw);
    };
    draw();

    const processed = prepared.canvas.captureStream(30);
    streamRef.current.getAudioTracks().forEach((track) => processed.addTrack(track));
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
        const url = URL.createObjectURL(blob);
        setRecordedUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
        setRecordedBlob(blob);
      },
      { once: true },
    );

    recorder.start(500);
    setIsRecording(true);
    setRecordingDuration(0);
    timerRef.current = setInterval(
      () => setRecordingDuration((value) => value + 1),
      1000,
    );
  }, [
    drawPreparedFrame,
    isRecording,
    prepareCanvas,
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

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return false;
    const next = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchEnabled(next);
      return true;
    } catch (error) {
      console.warn('Camera torch toggle failed:', error);
      setTorchSupported(false);
      setTorchEnabled(false);
      return false;
    }
  }, [torchEnabled, torchSupported]);

  const retake = useCallback(() => {
    setRecordedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setRecordedBlob(null);
    setCapturedPhoto(null);
    setRecordingDuration(0);
    void startCamera();
  }, [startCamera]);

  return {
    videoRef,
    canvasRef,
    cameraReady,
    cameraError,
    isRecording,
    recordingDuration,
    capturedPhoto,
    recordedUrl,
    recordedBlob,
    torchSupported,
    torchEnabled,
    zoom,
    startCamera,
    takePhoto,
    startRecording,
    stopRecording,
    toggleTorch,
    retake,
  };
}
