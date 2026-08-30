import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mic,
  Video,
  X,
  Send,
  Play,
  Pause,
  Square,
  Trash2,
  SwitchCamera,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadMedia } from '@/lib/mediaUpload';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getVideoNoteProgress,
  VIDEO_NOTE_CIRCLE_CLASS,
  VIDEO_NOTE_CIRCLE_STYLE,
  VIDEO_NOTE_MAX_SECONDS,
  VIDEO_NOTE_PANEL_CLASS,
  VIDEO_NOTE_PANEL_STYLE,
} from '@/lib/videoNoteLayout';

interface TelegramMediaRecorderProps {
  onSend: (url: string, duration: number, type: 'audio' | 'video') => void | Promise<unknown>;
  onCancel?: () => void;
}

type RecordingState = 'idle' | 'recording' | 'preview' | 'sending';
type RecordingMode = 'voice' | 'video';

/** Telegram: bir marta bosish mikrofon/video almashadi, bosib turish yozib oladi. */
const HOLD_TO_RECORD_MS = 260;
/** Shundan qisqa yozuvlar bekor qilinadi (Telegramdek). */
const MIN_DURATION_MS = 700;
const VIDEO_RING_RADIUS = 47;
const VIDEO_RING_CIRCUMFERENCE = 2 * Math.PI * VIDEO_RING_RADIUS;

export function TelegramMediaRecorder({ onSend, onCancel }: TelegramMediaRecorderProps) {
  const { toast } = useToast();

  const [state, setState] = useState<RecordingState>('idle');
  const [mode, setMode] = useState<RecordingMode>('voice');
  const [duration, setDuration] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(32).fill(4));
  const [isHolding, setIsHolding] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

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
  const holdTriggeredRef = useRef(false);
  const mediaUrlRef = useRef<string | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');
  const modeRef = useRef<RecordingMode>('voice');
  const startedAtRef = useRef<number>(0);
  const autoSendRef = useRef(false);
  const lockedRef = useRef(false);
  const cancelledRef = useRef(false);
  const holdActiveRef = useRef(false);
  const releaseBeforeRecorderRef = useRef(false);

  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
  }, []);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const revokeUrl = useCallback(() => {
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopTracks();
    clearTimer();
    stopVisualization();
    revokeUrl();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setAudioLevels(Array(32).fill(4));
  }, [stopTracks, clearTimer, stopVisualization, revokeUrl]);

  useEffect(() => {
    return () => {
      cleanup();
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAll = useCallback(() => {
    cleanup();
    setState('idle');
    setMediaUrl(null);
    setMediaBlob(null);
    setDuration(0);
    setElapsedMs(0);
    setIsPlaying(false);
    setIsLocked(false);
    lockedRef.current = false;
    autoSendRef.current = false;
  }, [cleanup]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + secs.toString().padStart(2, '0');
  };

  const getSupportedMimeType = (isVideo: boolean): string => {
    if (isVideo) {
      const videoTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      return videoTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
    }
    const audioTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return audioTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  };

  const extensionFor = (mimeType: string): string => {
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
  };

  /** Yuklab, chatga jo'natish. Xatolik bo'lsa foydalanuvchi ko'radi va qayta urinishi mumkin. */
  const uploadAndSend = useCallback(
    async (blob: Blob, seconds: number, recordMode: RecordingMode) => {
      if (!blob || blob.size === 0) {
        toast({
          variant: 'destructive',
          title: 'Yozuv bo\u2019sh',
          description: 'Mikrofon ovoz yozib olmadi. Yana bir marta urinib ko\u2019ring.',
        });
        resetAll();
        return;
      }

      setState('sending');
      try {
        const ext = extensionFor(mimeTypeRef.current);
        const uploaded = await uploadMedia(blob, {
          filename: recordMode + '_' + Date.now() + '.' + ext,
          type: 'chat',
          visibility: 'public',
        });
        const sent = await onSend(
          uploaded.storageUrl || uploaded.url,
          Math.max(1, seconds),
          recordMode === 'video' ? 'video' : 'audio'
        );
        if (sent === null) {
          throw new Error('Xabar serverga yozilmadi');
        }
        resetAll();
      } catch (error) {
        console.error('Media message upload failed:', error);
        toast({
          variant: 'destructive',
          title: 'Jo\u2019natilmadi',
          description:
            'Yuklashda xatolik yuz berdi. Internetni tekshirib, qayta jo\u2019natishga urinib ko\u2019ring.',
        });
        // Yozuv saqlanadi - foydalanuvchi qayta jo'natishi mumkin
        setState('preview');
      }
    },
    [onSend, resetAll, toast]
  );

  // Real vaqtli ovoz vizualizatsiyasi
  const startAudioVisualization = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevels = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        const bars = 32;
        const newLevels: number[] = [];
        const step = Math.max(1, Math.floor(dataArray.length / bars));

        for (let i = 0; i < bars; i++) {
          const startIdx = i * step;
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[startIdx + j] || 0;
          }
          const avg = sum / step;
          newLevels.push(Math.max(4, (avg / 255) * 100));
        }

        setAudioLevels(newLevels);
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };

      updateLevels();
    } catch (error) {
      console.error('Failed to start audio visualization:', error);
    }
  }, []);

  const startRecording = useCallback(
    async (recordMode: RecordingMode) => {
      try {
        cleanup();
        cancelledRef.current = false;
        autoSendRef.current = false;
        modeRef.current = recordMode;
        setMode(recordMode);
        setDuration(0);
        setElapsedMs(0);
        setMediaBlob(null);
        setMediaUrl(null);
        chunksRef.current = [];

        const isVideo = recordMode === 'video';
        const constraints: MediaStreamConstraints = isVideo
          ? {
              video: {
                facingMode: facingMode,
                width: { ideal: 720 },
                height: { ideal: 720 },
              },
              audio: { echoCancellation: true, noiseSuppression: true },
            }
          : { audio: { echoCancellation: true, noiseSuppression: true } };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (!isVideo) {
          startAudioVisualization(stream);
        }

        if (isVideo) {
          // Video-note faqat Messages composer ustidagi dumaloq local previewda yoziladi.
          // Viewport/full-screen overlay yaratmaymiz; header va sidebar ochiq qoladi.
          lockedRef.current = true;
          setIsLocked(true);
          setState('recording');
          await new Promise((resolve) => requestAnimationFrame(resolve));

          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
            videoPreviewRef.current.muted = true;
            try {
              await videoPreviewRef.current.play();
            } catch (playError) {
              console.warn('Video preview autoplay failed:', playError);
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

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          stopTracks();
          stopVisualization();

          if (cancelledRef.current) {
            chunksRef.current = [];
            return;
          }

          const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
          const elapsedAtStop = Math.max(1, Date.now() - startedAtRef.current);
          const seconds = Math.max(1, Math.round(elapsedAtStop / 1000));
          setElapsedMs(elapsedAtStop);

          if (autoSendRef.current) {
            autoSendRef.current = false;
            setDuration(seconds);
            void uploadAndSend(blob, seconds, modeRef.current);
            return;
          }

          const url = URL.createObjectURL(blob);
          mediaUrlRef.current = url;
          setMediaBlob(blob);
          setMediaUrl(url);
          setDuration(seconds);
          setState('preview');
        };

        recorder.start(100);
        startedAtRef.current = Date.now();

        if (!isVideo) setState('recording');

        if (!isVideo && releaseBeforeRecorderRef.current) {
          releaseBeforeRecorderRef.current = false;
          cancelledRef.current = true;
          recorder.stop();
          setState('idle');
          toast({
            title: 'Juda qisqa',
            description: 'Ruxsat berilgach, yozish uchun tugmani yana bosib turing.',
          });
          return;
        }

        clearTimer();
        timerRef.current = setInterval(() => {
          const elapsedMs = Date.now() - startedAtRef.current;
          const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
          setDuration(elapsedSeconds);
          setElapsedMs(elapsedMs);

          // Telegram video-note 60 soniyada avtomatik previewga o'tadi.
          if (
            isVideo &&
            elapsedMs >= VIDEO_NOTE_MAX_SECONDS * 1000 &&
            mediaRecorderRef.current?.state !== 'inactive'
          ) {
            autoSendRef.current = false;
            mediaRecorderRef.current.stop();
            clearTimer();
          }
        }, 250);
      } catch (error) {
        console.error('Failed to start recording:', error);
        cleanup();
        setState('idle');
        setIsLocked(false);
        lockedRef.current = false;
        const name = (error as { name?: string } | null)?.name;
        toast({
          variant: 'destructive',
          title:
            recordMode === 'video'
              ? 'Kameraga ruxsat yo\u2019q'
              : 'Mikrofonga ruxsat yo\u2019q',
          description:
            name === 'NotAllowedError'
              ? 'Brauzer sozlamalarida ruxsat berib, qayta urinib ko\u2019ring.'
              : 'Qurilma topilmadi yoki band. Boshqa ilovalarni yopib ko\u2019ring.',
        });
      }
    },
    [
      cleanup,
      clearTimer,
      facingMode,
      startAudioVisualization,
      stopTracks,
      stopVisualization,
      toast,
      uploadAndSend,
    ]
  );

  const stopRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    clearTimer();
  }, [clearTimer]);

  /** Yozuvni to'xtatib, darhol jo'natish (Telegramdek qo'yib yuborilganda). */
  const finishAndSend = useCallback(() => {
    const elapsed = Date.now() - startedAtRef.current;
    if (elapsed < MIN_DURATION_MS) {
      cancelledRef.current = true;
      stopRecorder();
      resetAll();
      toast({
        title: 'Juda qisqa',
        description: 'Yozish uchun tugmani bosib turing.',
      });
      return;
    }
    autoSendRef.current = true;
    stopRecorder();
  }, [resetAll, stopRecorder, toast]);

  /** Yozuvni to'xtatib, ko'rib chiqish (preview) holatiga o'tish. */
  const stopToPreview = useCallback(() => {
    autoSendRef.current = false;
    stopRecorder();
  }, [stopRecorder]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    stopRecorder();
    resetAll();
    onCancel?.();
  }, [onCancel, resetAll, stopRecorder]);

  const handleSendFromPreview = useCallback(() => {
    if (!mediaBlob) return;
    void uploadAndSend(mediaBlob, duration, mode);
  }, [duration, mediaBlob, mode, uploadAndSend]);

  const togglePlayback = () => {
    const element = mode === 'video' ? videoPlaybackRef.current : audioPlaybackRef.current;
    if (!element) return;

    if (isPlaying) {
      element.pause();
      element.currentTime = 0;
    } else {
      void element.play();
    }
    setIsPlaying(!isPlaying);
  };

  const switchCamera = async () => {
    if (state !== 'recording') return;

    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      try {
        await videoTrack.applyConstraints({ facingMode: { exact: newFacingMode } });
      } catch {
        await videoTrack.applyConstraints({ facingMode: newFacingMode });
      }
      setFacingMode(newFacingMode);

      if (videoPreviewRef.current && streamRef.current) {
        videoPreviewRef.current.srcObject = streamRef.current;
        void videoPreviewRef.current.play();
      }
    } catch (error) {
      console.error('Failed to switch camera:', error);
      toast({ variant: 'destructive', title: 'Kamera almashtirilmadi' });
    }
  };

  /* ---------- Idle tugma bilan ishlash (Telegram xatti-harakati) ---------- */

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleHoldStart = () => {
    if (state !== 'idle') return;
    holdActiveRef.current = true;
    releaseBeforeRecorderRef.current = false;
    holdTriggeredRef.current = false;
    setIsHolding(true);
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      holdTriggeredRef.current = true;
      void startRecording(mode);
    }, HOLD_TO_RECORD_MS);
  };

  const handleHoldEnd = () => {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    setIsHolding(false);
    clearHoldTimer();

    if (!holdTriggeredRef.current) {
      // Bir marta bosish rejimni almashtiradi (mikrofon <-> video xabar)
      setMode((prev) => (prev === 'voice' ? 'video' : 'voice'));
    } else if (modeRef.current === 'voice' && !lockedRef.current) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        finishAndSend();
      } else {
        // Permission prompt ochiq paytda pointer-up yo'qolib ketmasin.
        releaseBeforeRecorderRef.current = true;
      }
    }

    holdTriggeredRef.current = false;
  };

  const handleHoldCancel = () => {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    setIsHolding(false);
    clearHoldTimer();
    holdTriggeredRef.current = false;
  };

  useEffect(() => {
    if (!isHolding) return;

    const handleWindowPointerUp = () => handleHoldEnd();
    const handleWindowPointerCancel = () => handleHoldCancel();

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [isHolding, state]);

  const lockRecording = () => {
    lockedRef.current = true;
    setIsLocked(true);
  };

  const videoRingProgress = getVideoNoteProgress(
    state === 'recording' ? elapsedMs : duration * 1000
  );
  const videoRingOffset = VIDEO_RING_CIRCUMFERENCE * (1 - videoRingProgress);

  /* ---------------------------- Yuborilmoqda ---------------------------- */

  if (state === 'sending') {
    return (
      <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-muted-foreground">
          {mode === 'video' ? 'Video xabar' : 'Ovozli xabar'} jo{'\u2019'}natilmoqda...
        </span>
      </div>
    );
  }

  /* ------------------------- Video: ko'rib chiqish ------------------------- */

  if (state === 'preview' && mode === 'video' && mediaUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
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
            className="pointer-events-none absolute inset-0 h-full w-full -rotate-90 text-primary"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r={VIDEO_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.18"
              strokeWidth="2.5"
            />
            <circle
              cx="50"
              cy="50"
              r={VIDEO_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={VIDEO_RING_CIRCUMFERENCE}
              strokeDashoffset={videoRingOffset}
            />
          </svg>

          <button
            type="button"
            onClick={togglePlayback}
            aria-label={isPlaying ? "To'xtatish" : "Ko'rish"}
            className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="ml-0.5 h-6 w-6" fill="currentColor" />
            )}
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            {formatDuration(duration)}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 rounded-full border border-border/70 bg-background/90 p-1.5 shadow-lg backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10"
            onClick={cancelRecording}
            aria-label="O'chirish"
            title="O'chirish"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <span className="min-w-[54px] text-center text-[11px] font-medium tabular-nums text-muted-foreground">
            {formatDuration(duration)}
          </span>

          <Button
            variant="default"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={handleSendFromPreview}
            aria-label="Jo'natish"
            title="Jo'natish"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  /* --------------------------- Video: yozilmoqda --------------------------- */

  if (state === 'recording' && mode === 'video') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
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

          <svg
            className="pointer-events-none absolute inset-0 h-full w-full -rotate-90 text-primary"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r={VIDEO_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.18"
              strokeWidth="2.5"
            />
            <motion.circle
              cx="50"
              cy="50"
              r={VIDEO_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={VIDEO_RING_CIRCUMFERENCE}
              animate={{ strokeDashoffset: videoRingOffset }}
              transition={{ duration: 0.2, ease: 'linear' }}
            />
          </svg>

          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            <motion.span
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="h-2 w-2 rounded-full bg-destructive"
            />
            {formatDuration(duration)}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-9 w-9 rounded-full bg-black/55 text-white hover:bg-black/70 hover:text-white"
            onClick={switchCamera}
            aria-label="Kamerani almashtirish"
            title="Kamerani almashtirish"
          >
            <SwitchCamera className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-center gap-2 rounded-full border border-border/70 bg-background/90 p-1.5 shadow-lg backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10"
            onClick={cancelRecording}
            aria-label="Bekor qilish"
            title="Bekor qilish"
          >
            <X className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={stopToPreview}
            aria-label="To'xtatib ko'rish"
            title="To'xtatib ko'rish"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>

          <Button
            variant="default"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={finishAndSend}
            aria-label="Darhol jo'natish"
            title="Darhol jo'natish"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  /* ------------------------- Ovoz: ko'rib chiqish ------------------------- */

  if (state === 'preview' && mode === 'voice' && mediaUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2"
      >
        <audio ref={audioPlaybackRef} src={mediaUrl} onEnded={() => setIsPlaying(false)} />

        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full text-destructive hover:bg-destructive/10"
          onClick={cancelRecording}
          aria-label="O'chirish"
        >
          <Trash2 className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={togglePlayback}
            aria-label="Eshitish"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </Button>

          {/* To'lqin shakli */}
          <div className="flex h-6 w-24 items-center gap-0.5">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-1 rounded-full bg-primary"
                animate={
                  isPlaying
                    ? { height: [4, 12 + ((i * 7) % 11), 4] }
                    : { height: 4 + Math.abs(Math.sin(i * 0.6)) * 8 }
                }
                transition={
                  isPlaying ? { duration: 0.4, repeat: Infinity, delay: i * 0.03 } : {}
                }
              />
            ))}
          </div>

          <span className="w-10 text-xs tabular-nums text-muted-foreground">
            {formatDuration(duration)}
          </span>
        </div>

        <Button
          variant="default"
          size="icon"
          className="h-10 w-10 rounded-full bg-primary"
          onClick={handleSendFromPreview}
          aria-label="Jo'natish"
        >
          <Send className="h-4 w-4" />
        </Button>
      </motion.div>
    );
  }

  /* --------------------------- Ovoz: yozilmoqda --------------------------- */

  if (state === 'recording' && mode === 'voice') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full text-destructive hover:bg-destructive/10"
          onClick={cancelRecording}
          aria-label="Bekor qilish"
        >
          <X className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="h-3 w-3 flex-shrink-0 rounded-full bg-destructive"
          />

          {/* Real vaqtli to'lqin */}
          <div className="flex h-8 w-32 items-center gap-[2px]">
            {audioLevels.map((level, i) => (
              <motion.div
                key={i}
                className="w-[3px] rounded-full bg-primary"
                animate={{ height: level + '%' }}
                transition={{ duration: 0.05, ease: 'linear' }}
              />
            ))}
          </div>

          <span className="w-10 flex-shrink-0 text-xs tabular-nums text-foreground">
            {formatDuration(duration)}
          </span>

          {!isLocked && (
            <button
              onClick={lockRecording}
              title="Qulflash (qo'lni qo'yib yuborsangiz ham yozilishda davom etadi)"
              aria-label="Qulflash"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-background/70 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {isLocked ? (
          <Button
            variant="default"
            size="icon"
            className="h-10 w-10 rounded-full bg-primary"
            onClick={finishAndSend}
            aria-label="Jo'natish"
          >
            <Send className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="default"
            size="icon"
            className="h-10 w-10 rounded-full bg-primary"
            onClick={stopToPreview}
            aria-label="To'xtatish"
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        )}
      </motion.div>
    );
  }

  /* ------------------ Idle: bitta Telegram uslubidagi tugma ------------------ */

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-label={mode === 'voice' ? 'Ovozli xabar (bosib turing)' : 'Video xabar (bosib turing)'}
        title={
          mode === 'voice'
            ? 'Yozish uchun bosib turing \u00b7 video xabarga o\u2019tish uchun bir marta bosing'
            : 'Yozish uchun bosib turing \u00b7 ovozli xabarga o\u2019tish uchun bir marta bosing'
        }
        onPointerDown={handleHoldStart}
        onPointerUp={handleHoldEnd}
        onPointerLeave={handleHoldCancel}
        onPointerCancel={handleHoldCancel}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-muted-foreground transition-colors',
          'hover:bg-muted hover:text-foreground active:scale-95',
          isHolding && 'bg-primary/15 text-primary'
        )}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={mode}
            initial={{ y: 14, opacity: 0, scale: 0.7, rotate: -20 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
            exit={{ y: -14, opacity: 0, scale: 0.7, rotate: 20 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {mode === 'voice' ? <Mic className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </motion.span>
        </AnimatePresence>

        {isHolding && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0.45 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.6, repeat: Infinity }}
            className="pointer-events-none absolute inset-0 rounded-full bg-primary/30"
          />
        )}
      </button>

      <AnimatePresence>
        {isHolding && (
          <motion.span
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            Yozish uchun bosib turing
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
