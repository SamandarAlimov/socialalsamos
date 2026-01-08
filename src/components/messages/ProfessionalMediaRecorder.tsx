import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mic,
  Video,
  StopCircle,
  X,
  Send,
  Play,
  Pause,
  RotateCcw,
  SwitchCamera,
  Lock,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type RecordMode = 'voice' | 'video';
type RecordState = 'idle' | 'recording' | 'locked' | 'preview';
type VideoQuality = '480p' | '720p' | '1080p';

interface ProfessionalMediaRecorderProps {
  onSend: (url: string, duration: number, type: 'audio' | 'video') => void;
  onCancel?: () => void;
}

export function ProfessionalMediaRecorder({ onSend, onCancel }: ProfessionalMediaRecorderProps) {
  const [mode, setMode] = useState<RecordMode>('voice');
  const [state, setState] = useState<RecordState>('idle');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('720p');
  const [playbackProgress, setPlaybackProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const recordingModeRef = useRef<RecordMode>('voice');

  const qualityVideoConstraints = (q: VideoQuality) => {
    if (q === '480p') return { width: { ideal: 480 }, height: { ideal: 854 } };
    if (q === '1080p') return { width: { ideal: 1080 }, height: { ideal: 1920 } };
    return { width: { ideal: 720 }, height: { ideal: 1280 } };
  };

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, [mediaUrl]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = useCallback(
    async (desiredMode: RecordMode) => {
      recordingModeRef.current = desiredMode;
      setMode(desiredMode);

      try {
        const constraints =
          desiredMode === 'video'
            ? {
                video: { facingMode, ...qualityVideoConstraints(videoQuality) },
                audio: true,
              }
            : { audio: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (desiredMode === 'video' && videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const mimeType =
          desiredMode === 'video'
            ? MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
              ? 'video/webm;codecs=vp9'
              : 'video/webm'
            : MediaRecorder.isTypeSupported('audio/webm')
              ? 'audio/webm'
              : 'audio/mp4';

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const actualMode = recordingModeRef.current;
          const type = actualMode === 'video' ? 'video/webm' : 'audio/webm';
          const blob = new Blob(chunksRef.current, { type });
          const url = URL.createObjectURL(blob);
          setMediaBlob(blob);
          setMediaUrl(url);
          setState('preview');

          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100);
        setState('recording');
        setDuration(0);

        timerRef.current = setInterval(() => setDuration((prev) => prev + 1), 1000);
      } catch (error) {
        console.error('Error starting recording:', error);
        toast.error('Failed to access camera/microphone');
      }
    },
    [facingMode, videoQuality]
  );

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (state === 'recording' || state === 'locked')) {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [state]);

  const cancelRecording = useCallback(() => {
    cleanup();
    setState('idle');
    setMediaUrl(null);
    setMediaBlob(null);
    setDuration(0);
    setSwipeOffset(0);
    setIsPlaying(false);
    setPlaybackProgress(0);
    onCancel?.();
  }, [cleanup, onCancel]);

  const handleSend = useCallback(async () => {
    if (!mediaBlob) return;

    setIsUploading(true);
    try {
      const actualMode = recordingModeRef.current;
      const fileName = `${actualMode}-${Date.now()}.webm`;

      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, mediaBlob, {
          contentType: actualMode === 'video' ? 'video/webm' : 'audio/webm',
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(data.path);

      onSend(urlData.publicUrl, duration, actualMode === 'video' ? 'video' : 'audio');

      cleanup();
      setState('idle');
      setMediaUrl(null);
      setMediaBlob(null);
      setDuration(0);
      setIsPlaying(false);
      setPlaybackProgress(0);
    } catch (error) {
      console.error('Error uploading media:', error);
      toast.error('Failed to send message');
    } finally {
      setIsUploading(false);
    }
  }, [cleanup, duration, mediaBlob, onSend]);

  const togglePlayback = useCallback(() => {
    const actualMode = recordingModeRef.current;

    if (actualMode === 'video') {
      if (!previewVideoRef.current) return;
      if (isPlaying) {
        previewVideoRef.current.pause();
      } else {
        previewVideoRef.current.play();
      }
    } else {
      if (!audioRef.current && mediaUrl) {
        audioRef.current = new Audio(mediaUrl);
        audioRef.current.onended = () => {
          setIsPlaying(false);
          setPlaybackProgress(0);
        };
        audioRef.current.ontimeupdate = () => {
          if (audioRef.current) {
            setPlaybackProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
          }
        };
      }
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play();
        }
      }
    }

    setIsPlaying(!isPlaying);
  }, [isPlaying, mediaUrl]);

  const switchCamera = async () => {
    if (!streamRef.current || recordingModeRef.current !== 'video') return;

    streamRef.current.getVideoTracks().forEach((track) => track.stop());

    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode, ...qualityVideoConstraints(videoQuality) },
        audio: true,
      });

      streamRef.current = newStream;
      if (videoRef.current) videoRef.current.srcObject = newStream;
      setFacingMode(newFacingMode);
    } catch (error) {
      console.error('Error switching camera:', error);
      toast.error('Failed to switch camera');
    }
  };

  // Touch handlers for voice recording
  const beginHoldToRecord = useCallback(
    (e: React.PointerEvent, recordMode: RecordMode) => {
      if (state !== 'idle') return;

      startPosRef.current = { x: e.clientX, y: e.clientY };
      setSwipeOffset(0);

      holdTimeoutRef.current = setTimeout(() => {
        startRecording(recordMode);
      }, 150);
    },
    [state, startRecording]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPosRef.current || state !== 'recording') return;

      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = startPosRef.current.y - e.clientY;

      // Swipe left to cancel
      if (deltaX < -50) {
        setSwipeOffset(deltaX);
        if (deltaX < -120) {
          cancelRecording();
          return;
        }
      }

      // Swipe up to lock
      if (deltaY > 60 && state === 'recording') {
        setState('locked');
      }
    },
    [state, cancelRecording]
  );

  const handlePointerUp = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    startPosRef.current = null;
    setSwipeOffset(0);

    // Release-to-stop if not locked
    if (state === 'recording') stopRecording();
  }, [state, stopRecording]);

  const cycleQuality = () => {
    setVideoQuality((q) => (q === '480p' ? '720p' : q === '720p' ? '1080p' : '480p'));
  };

  // ===== Video preview (fullscreen) =====
  if (state === 'preview' && mediaUrl && recordingModeRef.current === 'video') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col safe-area-inset">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <Button variant="ghost" size="icon" onClick={cancelRecording} className="text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium text-white">Video Message</span>
          <span className="text-sm text-white/60">{formatDuration(duration)}</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative max-w-md w-full aspect-[9/16] bg-black rounded-xl overflow-hidden">
            <video
              ref={previewVideoRef}
              src={mediaUrl}
              className="w-full h-full object-cover"
              playsInline
              onEnded={() => setIsPlaying(false)}
            />
            <button
              type="button"
              onClick={togglePlayback}
              className="absolute inset-0 flex items-center justify-center bg-black/20"
            >
              <div className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                {isPlaying ? <Pause className="h-8 w-8 text-white" /> : <Play className="h-8 w-8 text-white ml-1" />}
              </div>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 p-6 pb-8 border-t border-white/10 bg-black safe-area-bottom">
          <Button
            variant="outline"
            size="lg"
            onClick={cancelRecording}
            disabled={isUploading}
            className="border-white/30 text-white hover:bg-white/10 px-6"
          >
            <RotateCcw className="h-5 w-5 mr-2" />
            Retake
          </Button>
          <Button
            size="lg"
            onClick={handleSend}
            disabled={isUploading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 min-w-[140px]"
          >
            {isUploading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground" />
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ===== Video recording (fullscreen) =====
  if ((state === 'recording' || state === 'locked') && recordingModeRef.current === 'video') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col safe-area-inset">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <Button variant="ghost" size="icon" onClick={cancelRecording} className="text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-white">Recording</span>
          </div>
          <span className="text-sm text-white/60 tabular-nums">{formatDuration(duration)}</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative max-w-md w-full aspect-[9/16] bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover mirror"
              autoPlay
              playsInline
              muted
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-8 p-6 pb-8 border-t border-white/10 bg-black safe-area-bottom">
          <Button variant="ghost" size="icon" className="h-14 w-14 text-white hover:bg-white/10" onClick={switchCamera}>
            <SwitchCamera className="h-7 w-7" />
          </Button>

          <Button
            size="lg"
            variant="destructive"
            className="rounded-full p-0 flex items-center justify-center"
            style={{ width: '72px', height: '72px' }}
            onClick={stopRecording}
          >
            <StopCircle className="h-10 w-10" />
          </Button>

          <div className="w-14" />
        </div>
      </div>
    );
  }

  // ===== Voice recording (inline) =====
  if ((state === 'recording' || state === 'locked') && recordingModeRef.current === 'voice') {
    return (
      <div
        ref={containerRef}
        className={cn(
          'flex items-center gap-3 bg-destructive/10 rounded-full px-4 py-2 transition-transform w-full relative',
          swipeOffset < -30 && 'bg-destructive/20'
        )}
        style={{ transform: `translateX(${Math.max(swipeOffset, -100)}px)` }}
      >
        {swipeOffset < -50 && (
          <div className="absolute -left-8 flex items-center gap-1 text-destructive">
            <Trash2 className="h-4 w-4" />
          </div>
        )}

        <div className="h-3 w-3 rounded-full bg-destructive animate-pulse flex-shrink-0" />
        <span className="text-sm font-medium text-destructive tabular-nums min-w-[40px]">{formatDuration(duration)}</span>

        {state === 'locked' ? (
          <>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={cancelRecording}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              className="h-11 w-11 rounded-full flex-shrink-0 bg-primary hover:bg-primary/90"
              onClick={stopRecording}
            >
              <Send className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground animate-pulse flex-1">← Slide to cancel</span>
            <div className="flex flex-col items-center text-muted-foreground flex-shrink-0">
              <Lock className="h-3 w-3" />
              <span className="text-[10px]">↑</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // ===== Voice preview (inline) =====
  if (state === 'preview' && mediaUrl && recordingModeRef.current === 'voice') {
    return (
      <div className="flex items-center gap-3 bg-muted rounded-full px-4 py-2 w-full">
        <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" onClick={togglePlayback}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${playbackProgress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(duration)}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive flex-shrink-0"
          onClick={cancelRecording}
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        <Button
          variant="default"
          size="icon"
          className="h-11 w-11 rounded-full flex-shrink-0 bg-primary hover:bg-primary/90"
          onClick={handleSend}
          disabled={isUploading}
        >
          {isUploading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
    );
  }

  // ===== Idle - Two separate buttons for Voice and Video =====
  return (
    <div className="flex items-center gap-1">
      {/* Voice Message Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full flex-shrink-0 transition-all touch-none select-none hover:bg-accent active:bg-accent/80"
        onPointerDown={(e) => {
          e.preventDefault();
          beginHoldToRecord(e, 'voice');
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Hold to record voice message"
      >
        <Mic className="h-5 w-5" />
      </Button>

      {/* Video Message Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full flex-shrink-0 transition-all touch-none select-none hover:bg-accent active:bg-accent/80 relative"
        onClick={() => startRecording('video')}
        title="Record video message"
      >
        <Video className="h-5 w-5" />
        <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-0.5 rounded-full text-[9px] font-semibold bg-blue-500 text-white flex items-center justify-center">
          {videoQuality.replace('p', '')}
        </span>
      </Button>

      {/* Quality selector for video */}
      <button
        type="button"
        onClick={cycleQuality}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-0.5"
        aria-label="Change video quality"
      >
        {videoQuality}
      </button>
    </div>
  );
}
