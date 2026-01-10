import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Mic, 
  Video, 
  X, 
  Send, 
  Play, 
  Pause,
  Lock,
  Trash2,
  SwitchCamera
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

interface TelegramMediaRecorderProps {
  onSend: (url: string, duration: number, type: 'audio' | 'video') => void;
  onCancel?: () => void;
}

type RecordingState = 'idle' | 'recording' | 'locked' | 'preview';
type RecordingMode = 'voice' | 'video';

export function TelegramMediaRecorder({ onSend, onCancel }: TelegramMediaRecorderProps) {
  // Core state
  const [state, setState] = useState<RecordingState>('idle');
  const [mode, setMode] = useState<RecordingMode>('voice');
  const [duration, setDuration] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  // Gesture tracking
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [showLockHint, setShowLockHint] = useState(false);
  const [showCancelHint, setShowCancelHint] = useState(false);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoPlaybackRef = useRef<HTMLVideoElement>(null);
  const audioPlaybackRef = useRef<HTMLAudioElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isRecordingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, [mediaUrl]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSupportedMimeType = (isVideo: boolean): string => {
    if (isVideo) {
      const videoTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
      return videoTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
    }
    const audioTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return audioTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
  };

  const startRecording = async (recordMode: RecordingMode) => {
    try {
      cleanup();
      setMode(recordMode);
      setDuration(0);
      chunksRef.current = [];
      
      const isVideo = recordMode === 'video';
      const constraints: MediaStreamConstraints = isVideo
        ? { 
            video: { 
              facingMode: facingMode, 
              width: { ideal: 1280 }, 
              height: { ideal: 720 } 
            }, 
            audio: { echoCancellation: true, noiseSuppression: true } 
          }
        : { audio: { echoCancellation: true, noiseSuppression: true } };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (isVideo && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.muted = true;
        await videoPreviewRef.current.play();
      }
      
      const mimeType = getSupportedMimeType(isVideo);
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setMediaBlob(blob);
        setMediaUrl(url);
        setState('preview');
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
      
      recorder.start(100);
      isRecordingRef.current = true;
      setState('recording');
      
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      cleanup();
      setState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelRecording = () => {
    stopRecording();
    cleanup();
    setState('idle');
    setMediaUrl(null);
    setMediaBlob(null);
    setDuration(0);
    setSwipeOffset({ x: 0, y: 0 });
    onCancel?.();
  };

  const handleSend = async () => {
    if (!mediaBlob) return;
    
    setIsUploading(true);
    try {
      const ext = mode === 'video' ? 'webm' : 'webm';
      const fileName = `${mode}_${Date.now()}.${ext}`;
      
      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, mediaBlob, { contentType: mediaBlob.type });
      
      if (error) throw error;
      
      const { data: publicData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(data.path);
      
      onSend(publicData.publicUrl, duration, mode === 'video' ? 'video' : 'audio');
      
      cleanup();
      setState('idle');
      setMediaUrl(null);
      setMediaBlob(null);
      setDuration(0);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const togglePlayback = () => {
    const element = mode === 'video' ? videoPlaybackRef.current : audioPlaybackRef.current;
    if (!element) return;
    
    if (isPlaying) {
      element.pause();
      element.currentTime = 0;
    } else {
      element.play();
    }
    setIsPlaying(!isPlaying);
  };

  const switchCamera = async () => {
    if (state !== 'recording' && state !== 'locked') return;
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    // Stop current stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      
      streamRef.current = stream;
      
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      
      // Update MediaRecorder with new stream
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        
        const mimeType = getSupportedMimeType(true);
        const newRecorder = new MediaRecorder(stream, { mimeType });
        
        newRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };
        
        newRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setMediaBlob(blob);
          setMediaUrl(url);
          setState('preview');
          
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }
        };
        
        mediaRecorderRef.current = newRecorder;
        newRecorder.start(100);
      }
    } catch (error) {
      console.error('Failed to switch camera:', error);
    }
  };

  // Telegram-style gesture handlers
  const handlePointerDown = (e: React.PointerEvent, recordMode: RecordingMode) => {
    if (state !== 'idle') return;
    
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    startPosRef.current = { x: e.clientX, y: e.clientY };
    setSwipeOffset({ x: 0, y: 0 });
    setShowLockHint(false);
    setShowCancelHint(false);
    
    startRecording(recordMode);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (state !== 'recording') return;
    
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;
    
    setSwipeOffset({ x: Math.min(0, deltaX), y: Math.min(0, deltaY) });
    
    // Show hints based on swipe direction
    setShowCancelHint(deltaX < -50);
    setShowLockHint(deltaY < -50);
    
    // Cancel if swiped left enough
    if (deltaX < -120) {
      cancelRecording();
    }
    
    // Lock if swiped up enough
    if (deltaY < -80) {
      setState('locked');
      setSwipeOffset({ x: 0, y: 0 });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    if (state === 'recording') {
      // Normal release - stop and go to preview
      stopRecording();
    }
    
    setSwipeOffset({ x: 0, y: 0 });
    setShowLockHint(false);
    setShowCancelHint(false);
  };

  // Render video preview/playback
  if (state === 'preview' && mode === 'video' && mediaUrl) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed inset-0 z-50 bg-black flex flex-col"
      >
        <video
          ref={videoPlaybackRef}
          src={mediaUrl}
          className="flex-1 object-contain"
          playsInline
          loop
          onEnded={() => setIsPlaying(false)}
        />
        
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent safe-area-bottom">
          <div className="flex items-center justify-center gap-8">
            <Button
              variant="ghost"
              size="icon"
              className="h-14 w-14 rounded-full bg-destructive/20 text-destructive hover:bg-destructive/30"
              onClick={cancelRecording}
            >
              <Trash2 className="h-6 w-6" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-16 w-16 rounded-full bg-white/10 border-2 border-white/20"
              onClick={togglePlayback}
            >
              {isPlaying ? <Pause className="h-6 w-6 text-white" /> : <Play className="h-6 w-6 text-white" />}
            </Button>
            
            <Button
              variant="default"
              size="icon"
              className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90"
              onClick={handleSend}
              disabled={isUploading}
            >
              {isUploading ? (
                <div className="h-6 w-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-6 w-6" />
              )}
            </Button>
          </div>
          
          <p className="text-center text-white/60 text-sm mt-4">{formatDuration(duration)}</p>
        </div>
      </motion.div>
    );
  }

  // Render video recording
  if ((state === 'recording' || state === 'locked') && mode === 'video') {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed inset-0 z-50 bg-black flex flex-col"
      >
        <video
          ref={videoPreviewRef}
          className="flex-1 object-cover"
          playsInline
          muted
        />
        
        {/* Recording indicator */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full safe-area-top">
          <motion.div
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="h-3 w-3 rounded-full bg-destructive"
          />
          <span className="text-white font-medium tabular-nums">{formatDuration(duration)}</span>
          {state === 'locked' && <Lock className="h-4 w-4 text-white ml-1" />}
        </div>
        
        {/* Camera switch button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/50 text-white safe-area-top"
          onClick={switchCamera}
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>
        
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent safe-area-bottom">
          {state === 'locked' ? (
            <div className="flex items-center justify-center gap-8">
              <Button
                variant="ghost"
                size="icon"
                className="h-14 w-14 rounded-full bg-destructive/20 text-destructive"
                onClick={cancelRecording}
              >
                <Trash2 className="h-6 w-6" />
              </Button>
              
              <Button
                variant="default"
                size="icon"
                className="h-14 w-14 rounded-full bg-primary"
                onClick={stopRecording}
              >
                <Send className="h-6 w-6" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-white/60 text-sm">Release to send</p>
              <p className="text-white/40 text-xs">↑ Swipe up to lock</p>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // Render voice preview
  if (state === 'preview' && mode === 'voice' && mediaUrl) {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2"
      >
        <audio
          ref={audioPlaybackRef}
          src={mediaUrl}
          onEnded={() => setIsPlaying(false)}
        />
        
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full text-destructive hover:bg-destructive/10"
          onClick={cancelRecording}
        >
          <Trash2 className="h-5 w-5" />
        </Button>
        
        <div className="flex items-center gap-2 bg-muted rounded-full px-3 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={togglePlayback}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          
          {/* Waveform visualization */}
          <div className="flex items-center gap-0.5 h-6">
            {Array.from({ length: 24 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-1 bg-primary rounded-full"
                animate={isPlaying ? {
                  height: [4, 12 + Math.random() * 12, 4],
                } : { height: 4 + Math.sin(i * 0.5) * 8 }}
                transition={isPlaying ? {
                  duration: 0.3,
                  repeat: Infinity,
                  delay: i * 0.02,
                } : { duration: 0 }}
                style={{ height: 4 + Math.sin(i * 0.5) * 8 }}
              />
            ))}
          </div>
          
          <span className="text-xs text-muted-foreground min-w-[32px] tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
        
        <Button
          variant="default"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={handleSend}
          disabled={isUploading}
        >
          {isUploading ? (
            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </motion.div>
    );
  }

  // Render voice recording (Telegram style)
  if ((state === 'recording' || state === 'locked') && mode === 'voice') {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 flex-1"
        style={{ transform: `translateX(${swipeOffset.x}px)` }}
      >
        {/* Cancel hint overlay */}
        <AnimatePresence>
          {showCancelHint && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute left-4 flex items-center gap-2 text-destructive"
            >
              <X className="h-5 w-5" />
              <span className="text-sm font-medium">Release to cancel</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="flex-1 flex items-center justify-center gap-3">
          {/* Recording pulse */}
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="h-3 w-3 rounded-full bg-destructive"
          />
          
          <span className="font-medium text-destructive tabular-nums">{formatDuration(duration)}</span>
          
          {state === 'locked' ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span className="text-sm">Locked</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              ← Slide to cancel
            </span>
          )}
        </div>
        
        {state === 'locked' ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-destructive hover:bg-destructive/10"
              onClick={cancelRecording}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={stopRecording}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <motion.div
            animate={showLockHint ? { y: -8, scale: 1.1 } : { y: 0, scale: 1 }}
            className="flex flex-col items-center pr-2"
          >
            <Lock className={cn(
              "h-4 w-4 transition-colors",
              showLockHint ? "text-primary" : "text-muted-foreground/50"
            )} />
            <span className="text-[10px] text-muted-foreground/50">↑</span>
          </motion.div>
        )}
      </motion.div>
    );
  }

  // Idle state - single mic button (hold to record, Telegram style)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground touch-none select-none"
      onPointerDown={(e) => handlePointerDown(e, 'voice')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}
