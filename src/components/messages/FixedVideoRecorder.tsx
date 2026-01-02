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
  Trash2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type RecordMode = 'voice' | 'video';
type RecordState = 'idle' | 'recording' | 'preview';

interface FixedVideoRecorderProps {
  onSend: (url: string, duration: number, type: 'audio' | 'video') => void;
  onCancel?: () => void;
}

export function FixedVideoRecorder({ onSend, onCancel }: FixedVideoRecorderProps) {
  const [state, setState] = useState<RecordState>('idle');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Use refs to track current mode to avoid race conditions
  const currentModeRef = useRef<RecordMode>('voice');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
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

  const getSupportedMimeType = (mode: RecordMode) => {
    const candidates =
      mode === 'video'
        ? [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
          ]
        : ['audio/webm', 'audio/mp4'];

    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return null;
  };

  const mimeTypeRef = useRef<string | null>(null);

  const startRecording = useCallback(async (mode: RecordMode) => {
    currentModeRef.current = mode;

    try {
      const constraints =
        mode === 'video'
          ? {
              video: {
                facingMode,
                width: { ideal: 720 },
                height: { ideal: 1280 },
              },
              audio: true,
            }
          : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (mode === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        // Best-effort: don't fail the entire flow if autoplay is blocked
        videoRef.current.play().catch(() => {});
      }

      const mimeType = getSupportedMimeType(mode);
      mimeTypeRef.current = mimeType;

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const recordedMode = currentModeRef.current;
        const type = mimeTypeRef.current || (recordedMode === 'video' ? 'video/webm' : 'audio/webm');
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

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to access camera/microphone');
      cleanup();
    }
  }, [facingMode, cleanup]);

  const stopRecording = useCallback(() => {
    console.log('Stopping recording');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  const cancelRecording = useCallback(() => {
    console.log('Canceling recording');
    cleanup();
    setState('idle');
    setMediaUrl(null);
    setMediaBlob(null);
    setDuration(0);
    setIsPlaying(false);
    onCancel?.();
  }, [cleanup, onCancel]);

  const handleSend = useCallback(async () => {
    if (!mediaBlob) {
      console.log('No media blob to send');
      return;
    }

    console.log('Sending media, mode:', currentModeRef.current);
    setIsUploading(true);
    
    try {
      const recordedMode = currentModeRef.current;
      const fileName = `${recordedMode}-${Date.now()}.webm`;

      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, mediaBlob, {
          contentType: recordedMode === 'video' ? 'video/webm' : 'audio/webm',
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(data.path);

      console.log('Upload successful, URL:', urlData.publicUrl);
      onSend(urlData.publicUrl, duration, recordedMode === 'video' ? 'video' : 'audio');

      cleanup();
      setState('idle');
      setMediaUrl(null);
      setMediaBlob(null);
      setDuration(0);
      setIsPlaying(false);
    } catch (error) {
      console.error('Error uploading media:', error);
      toast.error('Failed to send message');
    } finally {
      setIsUploading(false);
    }
  }, [cleanup, duration, mediaBlob, onSend]);

  const togglePlayback = useCallback(() => {
    const mode = currentModeRef.current;
    console.log('Toggle playback, mode:', mode);

    if (mode === 'video') {
      if (!previewVideoRef.current) return;
      if (isPlaying) {
        previewVideoRef.current.pause();
      } else {
        previewVideoRef.current.play();
      }
    } else {
      if (!audioRef.current && mediaUrl) {
        audioRef.current = new Audio(mediaUrl);
        audioRef.current.onended = () => setIsPlaying(false);
      }
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } else {
          audioRef.current.play();
        }
      }
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, mediaUrl]);

  const switchCamera = useCallback(async () => {
    if (!streamRef.current || currentModeRef.current !== 'video') return;
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    console.log('Switching camera to:', newFacingMode);
    
    try {
      // Stop current video tracks
      streamRef.current.getVideoTracks().forEach((track) => track.stop());
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode, width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });

      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setFacingMode(newFacingMode);
    } catch (error) {
      console.error('Error switching camera:', error);
      toast.error('Failed to switch camera');
    }
  }, [facingMode]);

  // ===== Video preview (fullscreen) =====
  if (state === 'preview' && mediaUrl && currentModeRef.current === 'video') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <Button variant="ghost" size="icon" onClick={cancelRecording} className="text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium text-white">Video Preview</span>
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

        <div className="flex items-center justify-center gap-6 p-6 pb-8 border-t border-white/10 bg-black">
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
  if (state === 'recording' && currentModeRef.current === 'video') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <Button variant="ghost" size="icon" onClick={cancelRecording} className="text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium text-white">Recording</span>
          </div>
          <span className="text-sm text-white/60">{formatDuration(duration)}</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative max-w-md w-full aspect-[9/16] bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover transform scale-x-[-1]"
              autoPlay
              playsInline
              muted
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-8 p-6 pb-8 border-t border-white/10 bg-black">
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
  if (state === 'recording' && currentModeRef.current === 'voice') {
    return (
      <div className="flex items-center gap-3 bg-destructive/10 rounded-full px-4 py-2 w-full">
        <div className="h-3 w-3 rounded-full bg-destructive animate-pulse flex-shrink-0" />
        <span className="text-sm font-medium text-destructive tabular-nums min-w-[40px]">{formatDuration(duration)}</span>
        
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
          <StopCircle className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  // ===== Voice preview (inline) =====
  if (state === 'preview' && mediaUrl && currentModeRef.current === 'voice') {
    return (
      <div className="flex items-center gap-3 bg-muted rounded-full px-4 py-2 w-full">
        <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" onClick={togglePlayback}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={cn('h-full bg-primary transition-all duration-300', isPlaying && 'animate-pulse')}
              style={{ width: isPlaying ? '100%' : '0%' }}
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
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full transition-all hover:bg-accent"
        onClick={() => startRecording('voice')}
        title="Voice message"
      >
        <Mic className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full transition-all hover:bg-accent"
        onClick={() => startRecording('video')}
        title="Video message"
      >
        <Video className="h-5 w-5" />
      </Button>
    </div>
  );
}
