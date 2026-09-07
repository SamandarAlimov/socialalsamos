import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraLens } from './filters/CameraLensData';
import { captureSize, drawCameraFrame, supportedRecorderMime } from './cameraCaptureUtils';

interface UseCameraCaptureOptions {
  captureMode: 'photo' | 'video';
  facingMode: 'user' | 'environment';
  aspectRatio: '1:1' | '9:16' | '16:9';
  lens: CameraLens;
}

export function useCameraCapture(options: UseCameraCaptureOptions) {
  const { captureMode, facingMode, aspectRatio, lens } = options;
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

  const takePhoto = useCallback(() => {
    const prepared = prepareCanvas();
    if (!prepared) return;
    drawCameraFrame(prepared.context, prepared.canvas, prepared.video, facingMode === 'user', lens);
    setCapturedPhoto(prepared.canvas.toDataURL('image/jpeg', 0.92));
    stopCameraStream();
  }, [facingMode, lens, prepareCanvas, stopCameraStream]);

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
      drawCameraFrame(prepared.context, prepared.canvas, prepared.video, facingMode === 'user', lens);
      renderFrameRef.current = requestAnimationFrame(draw);
    };
    draw();

    const processed = prepared.canvas.captureStream(30);
    streamRef.current.getAudioTracks().forEach((track) => processed.addTrack(track));
    processedStreamRef.current = processed;
    const recorder = new MediaRecorder(processed, {
      mimeType,
      videoBitsPerSecond: Math.max(prepared.canvas.width, prepared.canvas.height) >= 1080 ? 8_000_000 : 5_000_000,
      audioBitsPerSecond: 128_000,
    });
    mediaRecorderRef.current = recorder;
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });
    recorder.addEventListener('stop', () => {
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
    }, { once: true });

    recorder.start(500);
    setIsRecording(true);
    setRecordingDuration(0);
    timerRef.current = setInterval(() => setRecordingDuration((value) => value + 1), 1000);
  }, [facingMode, isRecording, lens, prepareCanvas, stopProcessedStream, stopRenderLoop]);

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
    startCamera,
    takePhoto,
    startRecording,
    stopRecording,
    retake,
  };
}
