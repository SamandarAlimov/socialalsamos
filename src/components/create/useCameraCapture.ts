import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraLens } from './filters/CameraLensData';
import {
  captureSize,
  clampCameraZoom,
  createCompatibleMediaRecorder,
  drawCameraFrame,
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

function mediaErrorName(error: unknown) {
  return error instanceof DOMException || error instanceof Error ? error.name : '';
}

function cameraErrorMessage(error: unknown) {
  const name = mediaErrorName(error);
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Kameraga ruxsat berilmadi. Brauzer sozlamalaridan kamera ruxsatini yoqing.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Kamera topilmadi. Boshqa kamera ulang yoki qurilmadan media tanlang.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Kamera boshqa ilova tomonidan band yoki hozir ishlamayapti.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'Bu kamera so‘ralgan sifatni qo‘llamaydi. Soddaroq rejimda qayta urinib ko‘ring.';
  }
  return 'Kamerani ochib bo‘lmadi. Qayta urinib ko‘ring yoki qurilmadan media tanlang.';
}

function shouldStopConstraintFallback(error: unknown) {
  const name = mediaErrorName(error);
  return name === 'NotAllowedError' || name === 'SecurityError';
}

async function waitForVideoDimensions(video: HTMLVideoElement, timeoutMs = 2500) {
  if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) return true;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', check);
      video.removeEventListener('loadeddata', check);
      video.removeEventListener('canplay', check);
      video.removeEventListener('resize', check);
      resolve(ready);
    };
    const check = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        finish(true);
      }
    };
    const timer = window.setTimeout(
      () => finish(video.videoWidth > 0 && video.videoHeight > 0),
      timeoutMs,
    );

    video.addEventListener('loadedmetadata', check);
    video.addEventListener('loadeddata', check);
    video.addEventListener('canplay', check);
    video.addEventListener('resize', check);
    check();
  });
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
  const zoomRef = useRef(1);
  const cameraSessionRef = useRef(0);

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
  // gesture can drive Post, Story and Reel without coupling layout code to this
  // hook. zoomRef lets an already-running recording read the latest value on
  // every canvas frame rather than freezing the zoom from recording start.
  useEffect(() => {
    const handleZoom = (event: Event) => {
      const detail = (event as CustomEvent<number | { zoom?: number }>).detail;
      const nextZoom = typeof detail === 'number' ? detail : detail?.zoom;
      if (typeof nextZoom !== 'number') return;
      const safeZoom = clampCameraZoom(nextZoom);
      zoomRef.current = safeZoom;
      setZoom(safeZoom);
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
    processedStreamRef.current?.getTracks().forEach((track) => track.stop());
    processedStreamRef.current = null;
  }, []);

  const stopCameraStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video && (!stream || video.srcObject === stream)) {
      video.pause();
      video.srcObject = null;
    }

    setCameraReady(false);
    setTorchEnabled(false);
    setTorchSupported(false);
  }, []);

  const startCamera = useCallback(async () => {
    const sessionId = cameraSessionRef.current + 1;
    cameraSessionRef.current = sessionId;
    setCameraReady(false);
    setCameraError(null);
    stopCameraStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        window.isSecureContext
          ? 'Bu brauzer kamera ochishni qo‘llab-quvvatlamaydi.'
          : 'Kamera faqat xavfsiz HTTPS ulanishida ishlaydi.',
      );
      return;
    }

    try {
      const videoCandidates: MediaTrackConstraints[] = [
        {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
          frameRate: { ideal: 30 },
        },
        { facingMode: { ideal: facingMode } },
        {},
      ];

      let stream: MediaStream | null = null;
      let lastError: unknown = null;
      for (const videoConstraints of videoCandidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
          break;
        } catch (error) {
          lastError = error;
          if (shouldStopConstraintFallback(error)) break;
        }
      }

      if (!stream) throw lastError ?? new Error('Camera unavailable');
      if (cameraSessionRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // Request microphone separately. A denied/broken microphone must not make
      // the camera unusable: video recording gracefully continues without audio.
      if (captureMode === 'video') {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          if (cameraSessionRef.current !== sessionId) {
            audioStream.getTracks().forEach((track) => track.stop());
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          audioStream.getAudioTracks().forEach((track) => stream?.addTrack(track));
        } catch (audioError) {
          console.warn('Microphone unavailable; recording video without audio.', audioError);
        }
      }

      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack?.getCapabilities) {
        const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        setTorchSupported(Boolean(capabilities.torch));
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        try {
          await video.play();
        } catch (playError) {
          // Some embedded browsers resolve getUserMedia before autoplay is
          // ready. loadeddata/canplay below can still recover the preview.
          console.warn('Camera autoplay was delayed.', playError);
        }
        const dimensionsReady = await waitForVideoDimensions(video);
        if (!dimensionsReady) throw new Error('Camera preview did not become ready');
      }

      if (cameraSessionRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setCameraReady(true);
    } catch (error) {
      if (cameraSessionRef.current !== sessionId) return;
      console.error('Camera access error:', error);
      stopCameraStream();
      setCameraError(cameraErrorMessage(error));
    }
  }, [captureMode, facingMode, stopCameraStream]);

  useEffect(() => {
    void startCamera();
    return () => {
      cameraSessionRef.current += 1;
      stopRenderLoop();
      stopProcessedStream();
      stopCameraStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera, stopCameraStream, stopProcessedStream, stopRenderLoop]);

  useEffect(() => () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  // Mobile browsers frequently suspend camera tracks when the tab/app goes to
  // the background. Resume the existing live track when possible and reopen it
  // only if it actually ended. Do not reprompt after a real camera error.
  useEffect(() => {
    const recoverCamera = () => {
      if (
        document.visibilityState !== 'visible' ||
        cameraError ||
        capturedPhoto ||
        recordedUrl ||
        isRecording
      ) {
        return;
      }

      const stream = streamRef.current;
      const track = stream?.getVideoTracks()[0];
      const video = videoRef.current;
      if (!stream || !track || track.readyState !== 'live') {
        void startCamera();
        return;
      }

      if (video?.paused) {
        void video.play().catch(() => {
          void startCamera();
        });
      }
    };

    document.addEventListener('visibilitychange', recoverCamera);
    window.addEventListener('pageshow', recoverCamera);
    window.addEventListener('focus', recoverCamera);
    return () => {
      document.removeEventListener('visibilitychange', recoverCamera);
      window.removeEventListener('pageshow', recoverCamera);
      window.removeEventListener('focus', recoverCamera);
    };
  }, [cameraError, capturedPhoto, isRecording, recordedUrl, startCamera]);

  // Keep zoom on the video itself using the long-supported transform property.
  // Combining mirror + zoom avoids conflicting transform implementations across
  // Safari, Chromium, Firefox and embedded WebViews.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const scaleX = facingMode === 'user' ? -zoom : zoom;
    video.style.setProperty('transform', `scale(${scaleX}, ${zoom})`);
    video.style.setProperty('transform-origin', '50% 50%');
    video.style.setProperty('will-change', zoom === 1 ? 'auto' : 'transform');
    video.style.setProperty('backface-visibility', 'hidden');
    video.style.setProperty('-webkit-backface-visibility', 'hidden');

    return () => {
      video.style.removeProperty('transform');
      video.style.removeProperty('transform-origin');
      video.style.removeProperty('will-change');
      video.style.removeProperty('backface-visibility');
      video.style.removeProperty('-webkit-backface-visibility');
    };
  }, [cameraReady, facingMode, zoom]);

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
        zoomRef.current,
      );
      drawOverlay?.(prepared.context, prepared.canvas);
    },
    [drawOverlay, facingMode, lens],
  );

  const takePhoto = useCallback(() => {
    const prepared = prepareCanvas();
    if (!prepared) {
      setCameraError('Kamera hali tayyor emas. Bir lahza kutib qayta urinib ko‘ring.');
      return;
    }
    drawPreparedFrame(prepared);
    setCapturedPhoto(prepared.canvas.toDataURL('image/jpeg', 0.92));
    stopCameraStream();
  }, [drawPreparedFrame, prepareCanvas, stopCameraStream]);

  const startRecording = useCallback(() => {
    const sourceStream = streamRef.current;
    if (!sourceStream || isRecording) return;
    if (typeof MediaRecorder === 'undefined') {
      setCameraError('Bu brauzer kamera videosini yozishni qo‘llab-quvvatlamaydi.');
      return;
    }

    chunksRef.current = [];
    stopRenderLoop();
    stopProcessedStream();

    const prepared = prepareCanvas();
    let recordingStream = sourceStream;
    let usingProcessedStream = false;

    // Prefer the canvas path so zoom, crop and effects are baked into the file.
    // If captureStream is missing/buggy (older Safari/WebView), record the raw
    // camera stream rather than failing the whole feature.
    if (prepared && typeof prepared.canvas.captureStream === 'function') {
      try {
        const draw = () => {
          drawPreparedFrame(prepared);
          renderFrameRef.current = requestAnimationFrame(draw);
        };
        draw();

        const processed = prepared.canvas.captureStream(30);
        sourceStream.getAudioTracks().forEach((track) => {
          try {
            processed.addTrack(track.clone());
          } catch {
            processed.addTrack(track);
          }
        });
        processedStreamRef.current = processed;
        recordingStream = processed;
        usingProcessedStream = true;
      } catch (captureStreamError) {
        console.warn('Canvas recording unavailable; using raw camera stream.', captureStreamError);
        stopRenderLoop();
        stopProcessedStream();
        recordingStream = sourceStream;
      }
    }

    const longEdge = prepared
      ? Math.max(prepared.canvas.width, prepared.canvas.height)
      : 720;
    const recorder = createCompatibleMediaRecorder(recordingStream, {
      videoBitsPerSecond: longEdge >= 1080 ? 8_000_000 : 5_000_000,
      audioBitsPerSecond: 128_000,
    });

    if (!recorder) {
      stopRenderLoop();
      stopProcessedStream();
      setCameraError('Bu brauzer video yozishni ishga tushira olmadi.');
      return;
    }

    mediaRecorderRef.current = recorder;
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });
    recorder.addEventListener(
      'error',
      () => {
        stopRenderLoop();
        stopProcessedStream();
        stopCameraStream();
        setIsRecording(false);
        setCameraError('Video yozishda xatolik yuz berdi. Qayta urinib ko‘ring.');
      },
      { once: true },
    );
    recorder.addEventListener(
      'stop',
      () => {
        stopRenderLoop();
        stopProcessedStream();
        mediaRecorderRef.current = null;

        const firstChunkType = chunksRef.current.find((chunk) => Boolean(chunk.type))?.type;
        const mimeType = recorder.mimeType || firstChunkType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stopCameraStream();

        if (blob.size === 0) {
          setCameraError('Video saqlanmadi. Qayta urinib ko‘ring.');
          return;
        }

        const url = URL.createObjectURL(blob);
        setRecordedUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
        setRecordedBlob(blob);
      },
      { once: true },
    );

    try {
      try {
        recorder.start(500);
      } catch {
        // Some Safari/WebView versions reject the timeslice argument but record
        // successfully with the default buffering strategy.
        recorder.start();
      }
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(
        () => setRecordingDuration((value) => value + 1),
        1000,
      );
    } catch (error) {
      console.error('MediaRecorder start failed:', error);
      mediaRecorderRef.current = null;
      if (usingProcessedStream) {
        stopRenderLoop();
        stopProcessedStream();
      }
      setCameraError('Video yozishni ishga tushirib bo‘lmadi.');
    }
  }, [
    drawPreparedFrame,
    isRecording,
    prepareCanvas,
    stopCameraStream,
    stopProcessedStream,
    stopRenderLoop,
  ]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !isRecording) return;

    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (recorder.state !== 'inactive') {
      try {
        recorder.requestData?.();
      } catch {
        // requestData is optional in some embedded implementations.
      }
      recorder.stop();
    } else {
      stopRenderLoop();
      stopProcessedStream();
      stopCameraStream();
    }
  }, [
    isRecording,
    stopCameraStream,
    stopProcessedStream,
    stopRenderLoop,
  ]);

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
    setCameraError(null);
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
