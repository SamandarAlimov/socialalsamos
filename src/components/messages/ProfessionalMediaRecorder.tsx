import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Video, StopCircle, X, Send, Play, Pause, RotateCcw, SwitchCamera, Lock, Trash2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type RecordMode = 'voice' | 'video';
type RecordState = 'idle' | 'recording' | 'locked' | 'preview';

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

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
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
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const constraints = mode === 'video' 
        ? { video: { facingMode, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true }
        : { audio: true };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (mode === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      const mimeType = mode === 'video'
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const type = mode === 'video' ? 'video/webm' : 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(blob);
        setMediaBlob(blob);
        setMediaUrl(url);
        setState('preview');
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setState('recording');
      setDuration(0);
      
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to access camera/microphone');
    }
  }, [mode, facingMode]);

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
    onCancel?.();
  }, [mediaUrl, onCancel]);

  const handleSend = useCallback(async () => {
    if (!mediaBlob) return;
    
    setIsUploading(true);
    
    try {
      const ext = mode === 'video' ? 'webm' : 'webm';
      const fileName = `${mode}-${Date.now()}.${ext}`;
      
      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, mediaBlob, {
          contentType: mode === 'video' ? 'video/webm' : 'audio/webm',
        });
      
      if (error) throw error;
      
      const { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(data.path);
      
      onSend(urlData.publicUrl, duration, mode === 'video' ? 'video' : 'audio');
      
      cleanup();
      setState('idle');
      setMediaUrl(null);
      setMediaBlob(null);
      setDuration(0);
      
    } catch (error) {
      console.error('Error uploading media:', error);
      toast.error('Failed to send message');
    } finally {
      setIsUploading(false);
    }
  }, [mediaBlob, mediaUrl, duration, mode, onSend]);

  const togglePlayback = useCallback(() => {
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
  }, [isPlaying, mode, mediaUrl]);

  const switchCamera = async () => {
    if (!streamRef.current || mode !== 'video') return;
    
    streamRef.current.getVideoTracks().forEach(track => track.stop());
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    try {
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
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle tap to start/stop recording (Telegram style)
  const handleTap = useCallback(() => {
    if (state === 'idle') {
      startRecording();
    } else if (state === 'recording' || state === 'locked') {
      stopRecording();
    }
  }, [state, startRecording, stopRecording]);

  // Handle long press for hold-to-record
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (state !== 'idle') return;
    
    startPosRef.current = { x: e.clientX, y: e.clientY };
    setSwipeOffset(0);
    
    holdTimeoutRef.current = setTimeout(() => {
      startRecording();
    }, 200);
  }, [state, startRecording]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
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
  }, [state, cancelRecording]);

  const handlePointerUp = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
    }
    
    startPosRef.current = null;
    setSwipeOffset(0);
    
    // If recording (not locked), stop and go to preview
    if (state === 'recording') {
      stopRecording();
    }
  }, [state, stopRecording]);

  const handleModeSwitch = useCallback(() => {
    if (state === 'idle') {
      setMode(mode === 'voice' ? 'video' : 'voice');
    }
  }, [state, mode]);

  // Video preview mode - fullscreen with clear send button
  if (state === 'preview' && mediaUrl && mode === 'video') {
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
              onClick={togglePlayback}
              className="absolute inset-0 flex items-center justify-center bg-black/20"
            >
              <div className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                {isPlaying ? (
                  <Pause className="h-8 w-8 text-white" />
                ) : (
                  <Play className="h-8 w-8 text-white ml-1" />
                )}
              </div>
            </button>
          </div>
        </div>
        
        {/* Clear send and retake buttons at bottom */}
        <div className="flex items-center justify-center gap-6 p-6 pb-8 border-t border-white/10 safe-area-bottom bg-black">
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

  // Video recording mode
  if ((state === 'recording' || state === 'locked') && mode === 'video') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <Button variant="ghost" size="icon" onClick={cancelRecording} className="text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
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
        
        <div className="flex items-center justify-center gap-8 p-6 pb-8 border-t border-white/10 safe-area-bottom bg-black">
          <Button
            variant="ghost"
            size="icon"
            className="h-14 w-14 text-white hover:bg-white/10"
            onClick={switchCamera}
          >
            <SwitchCamera className="h-7 w-7" />
          </Button>
          <Button 
            size="lg" 
            variant="destructive"
            className="h-18 w-18 rounded-full p-0 flex items-center justify-center"
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

  // Voice recording state (Telegram style) - inline
  if ((state === 'recording' || state === 'locked') && mode === 'voice') {
    return (
      <div 
        ref={containerRef}
        className={cn(
          "flex items-center gap-3 bg-destructive/10 rounded-full px-4 py-2 transition-transform w-full",
          swipeOffset < -30 && "bg-destructive/20"
        )}
        style={{ transform: `translateX(${Math.max(swipeOffset, -100)}px)` }}
      >
        {/* Cancel indicator */}
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
            <span className="text-xs text-muted-foreground animate-pulse flex-1">
              ← Slide to cancel
            </span>
            <div className="flex flex-col items-center text-muted-foreground flex-shrink-0">
              <Lock className="h-3 w-3" />
              <span className="text-[10px]">↑</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // Voice preview state with prominent send button
  if (state === 'preview' && mediaUrl && mode === 'voice') {
    return (
      <div className="flex items-center gap-3 bg-muted rounded-full px-4 py-2 w-full">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0"
          onClick={togglePlayback}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        
        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full bg-primary transition-all duration-300",
                isPlaying && "animate-pulse"
              )} 
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
        
        {/* Prominent send button */}
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

  // Idle state - show mic/video toggle buttons
  return (
    <div className="flex items-center gap-1">
      {/* Video mode button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 rounded-full flex-shrink-0 transition-colors",
          mode === 'video' && "text-primary bg-primary/10"
        )}
        onClick={() => setMode('video')}
        onPointerDown={(e) => {
          setMode('video');
          handlePointerDown(e);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <Video className="h-5 w-5" />
      </Button>
      
      {/* Voice mode button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 rounded-full flex-shrink-0 transition-colors",
          mode === 'voice' && "text-primary bg-primary/10"
        )}
        onClick={() => setMode('voice')}
        onPointerDown={(e) => {
          setMode('voice');
          handlePointerDown(e);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <Mic className="h-5 w-5" />
      </Button>
    </div>
  );
}
