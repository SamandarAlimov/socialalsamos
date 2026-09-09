import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronUp,
  Lock,
  Mic,
  Pause,
  Play,
  Send,
  Square,
  SwitchCamera,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { uploadMedia } from '@/lib/mediaUpload';
import { useToast } from '@/hooks/use-toast';
import {
  getVideoNoteProgress,
  VIDEO_NOTE_CIRCLE_CLASS,
  VIDEO_NOTE_CIRCLE_STYLE,
  VIDEO_NOTE_MAX_SECONDS,
  VIDEO_NOTE_PANEL_CLASS,
  VIDEO_NOTE_PANEL_STYLE,
} from '@/lib/videoNoteLayout';

interface TelegramMediaRecorderProps {
  onSend: (
    url: string,
    duration: number,
    type: 'audio' | 'video' | 'video_note'
  ) => void | Promise<unknown>;
  onCancel?: () => void;
}

type RecordingState = 'idle' | 'recording' | 'preview' | 'sending';
type RecordingMode = 'voice' | 'video';

const HOLD_TO_RECORD_MS = 220;
const MIN_DURATION_MS = 650;
const CANCEL_DISTANCE = 92;
const LOCK_DISTANCE = 72;
const LIVE_BARS = 28;
const PREVIEW_BARS = 42;
const VIDEO_RING_RADIUS = 47;
const VIDEO_RING_CIRCUMFERENCE = 2 * Math.PI * VIDEO_RING_RADIUS;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatLiveDuration(milliseconds: number) {
  const safeMs = Math.max(0, milliseconds);
  const mins = Math.floor(safeMs / 60000);
  const secs = Math.floor((safeMs % 60000) / 1000);
  const centiseconds = Math.floor((safeMs % 1000) / 10);
  return `${mins}:${secs.toString().padStart(2, '0')},${centiseconds
    .toString()
    .padStart(2, '0')}`;
}

export function TelegramMediaRecorder({ onSend, onCancel }: TelegramMediaRecorderProps) {
  const { toast } = useToast();

  const [state, setState] = useState<RecordingState>('idle');
  const [mode, setMode] = useState<RecordingMode>('voice');
  const [duration, setDuration] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(LIVE_BARS).fill(8));
  const [recordedLevels, setRecordedLevels] = useState<number[]>(
    Array(PREVIEW_BARS).fill(0.22)
  );
  const [isHolding, setIsHolding] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gestureDx, setGestureDx] = useState(0);
  const [gestureDy, setGestureDy] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoPlaybackRef = useRef<HTMLVideoElement>(null);
  const audioPlaybackRef = useRef<HTMLAudioElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const mimeTypeRef = useRef('audio/webm');
  const modeRef = useRef<RecordingMode>('voice');
  const startedAtRef = useRef(0);
  const pausedStartedAtRef = useRef(0);
  const pausedTotalMsRef = useRef(0);
  const isPausedRef = useRef(false);
  const autoSendRef = useRef(false);
  const lockedRef = useRef(false);
  const cancelledRef = useRef(false);
  const holdActiveRef = useRef(false);
  const holdTriggeredRef = useRef(false);
  const releaseBeforeRecorderRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const waveformHistoryRef = useRef<number[]>([]);
  const lastVisualizerCommitRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
  }, []);

  const revokeUrl = useCallback(() => {
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current = null;
    }
  }, []);

  const cleanupResources = useCallback(() => {
    clearTimer();
    stopTracks();
    stopVisualization();
    revokeUrl();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, [clearTimer, revokeUrl, stopTracks, stopVisualization]);

  const resetGesture = useCallback(() => {
    holdActiveRef.current = false;
    holdTriggeredRef.current = false;
    setIsHolding(false);
    setGestureDx(0);
    setGestureDy(0);
  }, []);

  const resetAll = useCallback(() => {
    cleanupResources();
    clearHoldTimer();
    setState('idle');
    setMediaUrl(null);
    setMediaBlob(null);
    setDuration(0);
    setElapsedMs(0);
    setIsPlaying(false);
    setPlaybackProgress(0);
    setIsLocked(false);
    setIsPaused(false);
    setAudioLevels(Array(LIVE_BARS).fill(8));
    setRecordedLevels(Array(PREVIEW_BARS).fill(0.22));
    waveformHistoryRef.current = [];
    startedAtRef.current = 0;
    pausedStartedAtRef.current = 0;
    pausedTotalMsRef.current = 0;
    isPausedRef.current = false;
    autoSendRef.current = false;
    lockedRef.current = false;
    cancelledRef.current = false;
    releaseBeforeRecorderRef.current = false;
    resetGesture();
  }, [cleanupResources, clearHoldTimer, resetGesture]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          // Component is already leaving; resource cleanup below is enough.
        }
      }
      cleanupResources();
      clearHoldTimer();
    };
  }, [cleanupResources, clearHoldTimer]);

  const getRecordedElapsedMs = useCallback(() => {
    if (!startedAtRef.current) return 0;
    const now = Date.now();
    const activePause =
      isPausedRef.current && pausedStartedAtRef.current
        ? now - pausedStartedAtRef.current
        : 0;
    return Math.max(0, now - startedAtRef.current - pausedTotalMsRef.current - activePause);
  }, []);

  const getSupportedMimeType = (isVideo: boolean) => {
    const candidates = isVideo
      ? [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4',
        ]
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  };

  const extensionFor = (mimeType: string) => {
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
  };

  const uploadAndSend = useCallback(
    async (blob: Blob, seconds: number, recordMode: RecordingMode) => {
      if (!blob.size) {
        toast({
          variant: 'destructive',
          title: 'Yozuv bo‘sh',
          description: 'Mikrofon ovoz yozib olmadi. Qayta urinib ko‘ring.',
        });
        resetAll();
        return;
      }

      setState('sending');
      try {
        const ext = extensionFor(mimeTypeRef.current);
        const uploaded = await uploadMedia(blob, {
          filename: `${recordMode}_${Date.now()}.${ext}`,
          type: 'chat',
          visibility: 'public',
        });
        const sent = await onSend(
          uploaded.storageUrl || uploaded.url,
          Math.max(1, seconds),
          recordMode === 'video' ? 'video_note' : 'audio'
        );
        if (sent === null) throw new Error('Xabar serverga yozilmadi');
        resetAll();
      } catch (error) {
        console.error('Media message upload failed:', error);
        toast({
          variant: 'destructive',
          title: 'Jo‘natilmadi',
          description: 'Internetni tekshirib, yozuvni qayta jo‘natishga urinib ko‘ring.',
        });
        setState('preview');
      }
    },
    [onSend, resetAll, toast]
  );

  const startAudioVisualization = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined);

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const update = (timestamp: number) => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);

        if (timestamp - lastVisualizerCommitRef.current >= 55) {
          lastVisualizerCommitRef.current = timestamp;
          const bars = Array.from({ length: LIVE_BARS }, (_, index) => {
            const dataIndex = Math.min(
              data.length - 1,
              Math.floor((index / Math.max(1, LIVE_BARS - 1)) * (data.length - 1))
            );
            return clamp(10 + ((data[dataIndex] || 0) / 255) * 90, 10, 100);
          });
          setAudioLevels(bars);

          const average =
            bars.reduce((sum, value) => sum + value, 0) / Math.max(1, bars.length) / 100;
          waveformHistoryRef.current.push(clamp(average, 0.18, 1));
          if (waveformHistoryRef.current.length > PREVIEW_BARS) {
            waveformHistoryRef.current.shift();
          }
        }

        animationFrameRef.current = requestAnimationFrame(update);
      };

      animationFrameRef.current = requestAnimationFrame(update);
    } catch (error) {
      console.error('Failed to start audio visualization:', error);
    }
  }, []);

  const stopRecorder = useCallback(() => {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, [clearTimer]);

  const startRecording = useCallback(
    async (recordMode: RecordingMode) => {
      try {
        cleanupResources();
        cancelledRef.current = false;
        autoSendRef.current = false;
        modeRef.current = recordMode;
        setMode(recordMode);
        setDuration(0);
        setElapsedMs(0);
        setMediaBlob(null);
        setMediaUrl(null);
        setPlaybackProgress(0);
        setIsPaused(false);
        isPausedRef.current = false;
        pausedStartedAtRef.current = 0;
        pausedTotalMsRef.current = 0;
        waveformHistoryRef.current = [];
        chunksRef.current = [];

        const isVideo = recordMode === 'video';
        const constraints: MediaStreamConstraints = isVideo
          ? {
              video: {
                facingMode,
                width: { ideal: 720 },
                height: { ideal: 720 },
              },
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            }
          : {
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (!isVideo) startAudioVisualization(stream);

        if (isVideo) {
          lockedRef.current = true;
          setIsLocked(true);
          setState('recording');
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
            videoPreviewRef.current.muted = true;
            try {
              await videoPreviewRef.current.play();
            } catch (error) {
              console.warn('Video preview autoplay failed:', error);
            }
          }
        }

        const preferredMimeType = getSupportedMimeType(isVideo);
        const recorder = preferredMimeType
          ? new MediaRecorder(stream, { mimeType: preferredMimeType })
          : new MediaRecorder(stream);
        mimeTypeRef.current =
          recorder.mimeType || preferredMimeType || (isVideo ? 'video/webm' : 'audio/webm');
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          stopTracks();
          stopVisualization();

          if (cancelledRef.current) {
            resetAll();
            return;
          }

          const elapsedAtStop = Math.max(1, getRecordedElapsedMs());
          setElapsedMs(elapsedAtStop);
          const history = waveformHistoryRef.current;
          setRecordedLevels(
            history.length >= PREVIEW_BARS
              ? history.slice(-PREVIEW_BARS)
              : [...Array(PREVIEW_BARS - history.length).fill(0.18), ...history]
          );

          const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
          chunksRef.current = [];
          const seconds = Math.max(1, Math.round(elapsedAtStop / 1000));

          if (autoSendRef.current) {
            autoSendRef.current = false;
            setDuration(seconds);
            void uploadAndSend(blob, seconds, modeRef.current);
            return;
          }

          const url = URL.createObjectURL(blob);
          revokeUrl();
          mediaUrlRef.current = url;
          setMediaBlob(blob);
          setMediaUrl(url);
          setDuration(seconds);
          setState('preview');
          setIsPaused(false);
          isPausedRef.current = false;
        };

        recorder.start(100);
        startedAtRef.current = Date.now();
        if (!isVideo) setState('recording');

        if (!isVideo && releaseBeforeRecorderRef.current) {
          releaseBeforeRecorderRef.current = false;
          cancelledRef.current = true;
          setState('idle');
          recorder.stop();
          toast({
            title: 'Juda qisqa',
            description: 'Mikrofonga ruxsat berilgach, yozish uchun qayta bosib turing.',
          });
          return;
        }

        clearTimer();
        timerRef.current = setInterval(() => {
          const nextElapsed = getRecordedElapsedMs();
          setElapsedMs(nextElapsed);
          setDuration(Math.floor(nextElapsed / 1000));

          if (
            isVideo &&
            nextElapsed >= VIDEO_NOTE_MAX_SECONDS * 1000 &&
            mediaRecorderRef.current?.state !== 'inactive'
          ) {
            autoSendRef.current = false;
            stopRecorder();
          }
        }, 50);
      } catch (error) {
        console.error('Failed to start recording:', error);
        cleanupResources();
        setState('idle');
        setIsLocked(false);
        setIsPaused(false);
        lockedRef.current = false;
        isPausedRef.current = false;
        resetGesture();

        const name = (error as { name?: string } | null)?.name;
        toast({
          variant: 'destructive',
          title: recordMode === 'video' ? 'Kameraga ruxsat yo‘q' : 'Mikrofonga ruxsat yo‘q',
          description:
            name === 'NotAllowedError'
              ? 'Brauzer sozlamalarida ruxsat bering va qayta urinib ko‘ring.'
              : 'Qurilma topilmadi yoki boshqa ilova tomonidan band.',
        });
      }
    },
    [
      cleanupResources,
      clearTimer,
      facingMode,
      getRecordedElapsedMs,
      resetAll,
      resetGesture,
      revokeUrl,
      startAudioVisualization,
      stopRecorder,
      stopTracks,
      stopVisualization,
      toast,
      uploadAndSend,
    ]
  );

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    autoSendRef.current = false;
    clearTimer();
    stopVisualization();
    resetGesture();
    setState('idle');
    setIsLocked(false);
    setIsPaused(false);
    lockedRef.current = false;
    isPausedRef.current = false;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      resetAll();
    }
    onCancel?.();
  }, [clearTimer, onCancel, resetAll, resetGesture, stopVisualization]);

  const finishAndSend = useCallback(() => {
    const elapsed = getRecordedElapsedMs();
    if (elapsed < MIN_DURATION_MS) {
      cancelledRef.current = true;
      autoSendRef.current = false;
      setState('idle');
      resetGesture();
      stopRecorder();
      toast({
        title: 'Juda qisqa',
        description: 'Yozish uchun mikrofonni biroz uzoqroq bosib turing.',
      });
      return;
    }
    autoSendRef.current = true;
    stopRecorder();
  }, [getRecordedElapsedMs, resetGesture, stopRecorder, toast]);

  const stopToPreview = useCallback(() => {
    autoSendRef.current = false;
    stopRecorder();
  }, [stopRecorder]);

  const togglePause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || modeRef.current !== 'voice') return;

    try {
      if (recorder.state === 'recording') {
        recorder.pause();
        pausedStartedAtRef.current = Date.now();
        isPausedRef.current = true;
        setIsPaused(true);
        setElapsedMs(getRecordedElapsedMs());
      } else if (recorder.state === 'paused') {
        pausedTotalMsRef.current += Math.max(0, Date.now() - pausedStartedAtRef.current);
        pausedStartedAtRef.current = 0;
        isPausedRef.current = false;
        recorder.resume();
        setIsPaused(false);
      }
    } catch (error) {
      console.warn('MediaRecorder pause/resume failed:', error);
    }
  }, [getRecordedElapsedMs]);

  const handleSendFromPreview = useCallback(() => {
    if (!mediaBlob) return;
    void uploadAndSend(mediaBlob, duration, mode);
  }, [duration, mediaBlob, mode, uploadAndSend]);

  const togglePlayback = useCallback(() => {
    const element = mode === 'video' ? videoPlaybackRef.current : audioPlaybackRef.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  }, [mode]);

  const switchCamera = useCallback(async () => {
    if (state !== 'recording' || mode !== 'video') return;
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      try {
        await videoTrack.applyConstraints({ facingMode: { exact: nextFacingMode } });
      } catch {
        await videoTrack.applyConstraints({ facingMode: nextFacingMode });
      }
      setFacingMode(nextFacingMode);
    } catch (error) {
      console.error('Failed to switch camera:', error);
      toast({ variant: 'destructive', title: 'Kamera almashtirilmadi' });
    }
  }, [facingMode, mode, state, toast]);

  const lockRecording = useCallback(() => {
    if (modeRef.current !== 'voice' || state !== 'recording') return;
    lockedRef.current = true;
    setIsLocked(true);
    holdActiveRef.current = false;
    setIsHolding(false);
    clearHoldTimer();
    setGestureDx(0);
    setGestureDy(0);
  }, [clearHoldTimer, state]);

  const handleHoldStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (state !== 'idle') return;
      event.preventDefault();
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
      holdActiveRef.current = true;
      holdTriggeredRef.current = false;
      releaseBeforeRecorderRef.current = false;
      setIsHolding(true);
      setGestureDx(0);
      setGestureDy(0);
      clearHoldTimer();
      holdTimerRef.current = setTimeout(() => {
        holdTriggeredRef.current = true;
        void startRecording(mode);
      }, HOLD_TO_RECORD_MS);
    },
    [clearHoldTimer, mode, startRecording, state]
  );

  const handleHoldMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!holdActiveRef.current || !holdTriggeredRef.current || modeRef.current !== 'voice') {
        return;
      }
      if (lockedRef.current) return;

      const dx = clientX - pointerStartRef.current.x;
      const dy = clientY - pointerStartRef.current.y;
      setGestureDx(Math.min(0, dx));
      setGestureDy(Math.min(0, dy));

      if (dx <= -CANCEL_DISTANCE) {
        holdActiveRef.current = false;
        setIsHolding(false);
        cancelRecording();
        return;
      }
      if (dy <= -LOCK_DISTANCE) lockRecording();
    },
    [cancelRecording, lockRecording]
  );

  const handleHoldEnd = useCallback(() => {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    setIsHolding(false);
    clearHoldTimer();

    if (!holdTriggeredRef.current) {
      setMode((previous) => (previous === 'voice' ? 'video' : 'voice'));
      resetGesture();
      return;
    }

    if (modeRef.current === 'voice' && !lockedRef.current) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') finishAndSend();
      else releaseBeforeRecorderRef.current = true;
    }

    holdTriggeredRef.current = false;
    setGestureDx(0);
    setGestureDy(0);
  }, [clearHoldTimer, finishAndSend, resetGesture]);

  const handleHoldCancel = useCallback(() => {
    if (!holdActiveRef.current) return;
    const shouldDiscard =
      holdTriggeredRef.current && modeRef.current === 'voice' && !lockedRef.current;
    holdActiveRef.current = false;
    setIsHolding(false);
    clearHoldTimer();
    holdTriggeredRef.current = false;
    setGestureDx(0);
    setGestureDy(0);
    if (shouldDiscard) cancelRecording();
  }, [cancelRecording, clearHoldTimer]);

  useEffect(() => {
    if (!isHolding) return;

    const onMove = (event: PointerEvent) => handleHoldMove(event.clientX, event.clientY);
    const onUp = () => handleHoldEnd();
    const onCancel = () => handleHoldCancel();

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [handleHoldCancel, handleHoldEnd, handleHoldMove, isHolding]);

  const videoProgress = getVideoNoteProgress(
    state === 'recording' ? elapsedMs : duration * 1000
  );
  const videoRingOffset = VIDEO_RING_CIRCUMFERENCE * (1 - videoProgress);

  if (state === 'sending') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex h-14 items-center justify-center gap-2 bg-card px-3"
      >
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <span className="text-sm text-muted-foreground">
          {mode === 'video' ? 'Video xabar' : 'Ovozli xabar'} jo‘natilmoqda...
        </span>
      </motion.div>
    );
  }

  if (state === 'preview' && mode === 'video' && mediaUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={VIDEO_NOTE_PANEL_CLASS}
        style={VIDEO_NOTE_PANEL_STYLE}
        data-video-note-surface
      >
        <div className={VIDEO_NOTE_CIRCLE_CLASS} style={VIDEO_NOTE_CIRCLE_STYLE}>
          <div className="absolute inset-[5px] overflow-hidden rounded-full bg-black shadow-inner">
            <video
              ref={videoPlaybackRef}
              src={mediaUrl}
              className="h-full w-full object-cover"
              playsInline
              controls={false}
              disablePictureInPicture
              loop
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          </div>
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full -rotate-90 text-foreground"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle cx="50" cy="50" r={VIDEO_RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
            <circle cx="50" cy="50" r={VIDEO_RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={VIDEO_RING_CIRCUMFERENCE} strokeDashoffset={videoRingOffset} />
          </svg>
          <button
            type="button"
            onClick={togglePlayback}
            className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
            aria-label={isPlaying ? 'Pauza' : 'Ko‘rish'}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 rounded-full border border-border/70 bg-background/90 p-1.5 shadow-lg backdrop-blur">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive" onClick={cancelRecording} aria-label="O‘chirish">
            <Trash2 className="h-4 w-4" />
          </Button>
          <span className="min-w-[54px] text-center text-[11px] tabular-nums text-muted-foreground">{formatDuration(duration)}</span>
          <Button variant="default" size="icon" className="h-9 w-9 rounded-full" onClick={handleSendFromPreview} aria-label="Jo‘natish">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  if (state === 'recording' && mode === 'video') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={VIDEO_NOTE_PANEL_CLASS}
        style={VIDEO_NOTE_PANEL_STYLE}
        data-video-note-surface
      >
        <div className={VIDEO_NOTE_CIRCLE_CLASS} style={VIDEO_NOTE_CIRCLE_STYLE}>
          <div className="absolute inset-[5px] overflow-hidden rounded-full bg-black shadow-inner">
            <video
              ref={videoPreviewRef}
              className="h-full w-full object-cover"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
              playsInline
              controls={false}
              disablePictureInPicture
              muted
              autoPlay
            />
          </div>
          <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90 text-foreground" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={VIDEO_RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
            <motion.circle cx="50" cy="50" r={VIDEO_RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={VIDEO_RING_CIRCUMFERENCE} animate={{ strokeDashoffset: videoRingOffset }} transition={{ duration: 0.2, ease: 'linear' }} />
          </svg>
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
            {formatDuration(duration)}
          </div>
          <Button variant="ghost" size="icon" className="absolute right-3 top-3 h-9 w-9 rounded-full bg-black/55 text-white hover:bg-black/70 hover:text-white" onClick={switchCamera} aria-label="Kamerani almashtirish">
            <SwitchCamera className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2 rounded-full border border-border/70 bg-background/90 p-1.5 shadow-lg backdrop-blur">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive" onClick={cancelRecording} aria-label="Bekor qilish">
            <X className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={stopToPreview} aria-label="To‘xtatib ko‘rish">
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
          <Button variant="default" size="icon" className="h-9 w-9 rounded-full" onClick={finishAndSend} aria-label="Jo‘natish">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  if (state === 'preview' && mode === 'voice' && mediaUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex h-14 items-center gap-2 bg-card px-2"
        data-voice-recorder="preview"
      >
        <audio
          ref={audioPlaybackRef}
          src={mediaUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            setPlaybackProgress(
              element.duration ? clamp(element.currentTime / element.duration, 0, 1) : 0
            );
          }}
          onEnded={(event) => {
            event.currentTarget.currentTime = 0;
            setIsPlaying(false);
            setPlaybackProgress(0);
          }}
        />

        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full border border-border bg-background text-destructive shadow-sm hover:bg-destructive/10" onClick={cancelRecording} aria-label="O‘chirish">
          <Trash2 className="h-5 w-5" />
        </Button>

        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-primary px-2.5 text-primary-foreground shadow-sm">
          <button type="button" onClick={togglePlayback} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20 transition-transform active:scale-95" aria-label={isPlaying ? 'Pauza' : 'Eshitish'}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
          </button>
          <div className="flex h-7 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
            {recordedLevels.map((level, index) => (
              <span
                key={index}
                className={cn(
                  'w-[2px] shrink-0 rounded-full bg-current transition-opacity',
                  (index + 1) / recordedLevels.length <= playbackProgress
                    ? 'opacity-100'
                    : 'opacity-55'
                )}
                style={{ height: `${clamp(5 + level * 20, 5, 25)}px` }}
              />
            ))}
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums">{formatDuration(duration)}</span>
        </div>

        <Button variant="default" size="icon" className="h-11 w-11 shrink-0 rounded-full shadow-md" onClick={handleSendFromPreview} aria-label="Jo‘natish">
          <Send className="h-5 w-5" />
        </Button>
      </motion.div>
    );
  }

  if (state === 'recording' && mode === 'voice' && isLocked) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex h-14 items-center gap-2 bg-card px-2"
        data-voice-recorder="locked"
      >
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full border border-border bg-background text-destructive shadow-sm hover:bg-destructive/10" onClick={cancelRecording} aria-label="Bekor qilish">
          <Trash2 className="h-5 w-5" />
        </Button>

        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-2.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive" />
          <span className="w-[62px] shrink-0 text-xs font-medium tabular-nums text-foreground">{formatLiveDuration(elapsedMs)}</span>
          <div className="flex h-7 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
            {audioLevels.map((level, index) => (
              <motion.span
                key={index}
                className="w-[2px] shrink-0 rounded-full bg-foreground/75"
                animate={{ height: isPaused ? 5 : clamp((level / 100) * 24, 5, 24) }}
                transition={{ duration: 0.08, ease: 'linear' }}
              />
            ))}
          </div>
          <button type="button" onClick={togglePause} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-foreground shadow-sm transition-transform active:scale-95" aria-label={isPaused ? 'Davom ettirish' : 'Pauza'}>
            {isPaused ? <Play className="ml-0.5 h-4 w-4" fill="currentColor" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>

        <Button variant="default" size="icon" className="h-11 w-11 shrink-0 rounded-full shadow-md" onClick={finishAndSend} aria-label="Jo‘natish">
          <Send className="h-5 w-5" />
        </Button>
      </motion.div>
    );
  }

  if (state === 'recording' && mode === 'voice') {
    const cancelProgress = clamp(Math.abs(gestureDx) / CANCEL_DISTANCE, 0, 1);
    const lockProgress = clamp(Math.abs(gestureDy) / LOCK_DISTANCE, 0, 1);

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex h-14 items-center bg-card px-3"
        data-voice-recorder="holding"
      >
        <div className="flex shrink-0 items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
          <span className="w-[68px] text-xs font-medium tabular-nums text-foreground">{formatLiveDuration(elapsedMs)}</span>
        </div>

        <motion.div
          className="flex min-w-0 flex-1 items-center justify-center gap-1 text-sm text-muted-foreground"
          animate={{ x: Math.max(-34, gestureDx * 0.32), opacity: 1 - cancelProgress * 0.35 }}
          transition={{ duration: 0.06 }}
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">Bekor qilish uchun suring</span>
        </motion.div>

        <div className="relative ml-2 flex h-11 w-11 shrink-0 items-center justify-center">
          <motion.div className="absolute inset-0 rounded-full bg-primary/18" animate={{ scale: [1, 1.28, 1], opacity: [0.7, 0.18, 0.7] }} transition={{ duration: 1.15, repeat: Infinity }} />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Mic className="h-5 w-5" />
          </div>
          <motion.div
            className="absolute bottom-[52px] right-0 flex w-11 flex-col items-center gap-0.5 rounded-full border border-border bg-background/95 py-2 text-muted-foreground shadow-lg backdrop-blur"
            animate={{ y: Math.max(-8, gestureDy * 0.18), scale: 1 + lockProgress * 0.08 }}
          >
            <Lock className={cn('h-4 w-4', lockProgress > 0.65 && 'text-foreground')} />
            <ChevronUp className="h-3.5 w-3.5" />
          </motion.div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-label={mode === 'voice' ? 'Ovozli xabar (bosib turing)' : 'Video xabar (bosib turing)'}
        title={
          mode === 'voice'
            ? 'Yozish uchun bosib turing · video xabarga o‘tish uchun bir marta bosing'
            : 'Yozish uchun bosib turing · ovozli xabarga o‘tish uchun bir marta bosing'
        }
        onPointerDown={handleHoldStart}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          'relative flex h-10 w-10 touch-none select-none items-center justify-center overflow-hidden rounded-full text-muted-foreground transition-all',
          'hover:bg-muted hover:text-foreground active:scale-95',
          isHolding && 'bg-muted text-foreground'
        )}
      >
        <motion.span key={mode} initial={{ y: 8, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} className="absolute inset-0 flex items-center justify-center">
          {mode === 'voice' ? <Mic className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </motion.span>
        {isHolding && (
          <motion.span initial={{ scale: 0.7, opacity: 0.5 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.7, repeat: Infinity }} className="pointer-events-none absolute inset-0 rounded-full bg-foreground/10" />
        )}
      </button>
    </div>
  );
}
