import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Video, StopCircle, X, Send, Play, Pause, RotateCcw, SwitchCamera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type RecordMode = 'voice' | 'video';

interface MediaRecorderToggleProps {
  onSend: (url: string, duration: number, type: 'audio' | 'video') => void;
  onCancel?: () => void;
}

export function MediaRecorderToggle({ onSend, onCancel }: MediaRecorderToggleProps) {
  const [mode, setMode] = useState<RecordMode>('voice');
  const [isRecording, setIsRecording] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const constraints = mode === 'video' 
        ? { video: { facingMode, width: 480, height: 640 }, audio: true }
        : { audio: true };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (mode === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
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
        setShowPreview(true);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [mode, facingMode]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
    
    setMediaUrl(null);
    setMediaBlob(null);
    setDuration(0);
    setShowPreview(false);
    onCancel?.();
  }, [isRecording, stopRecording, mediaUrl, onCancel]);

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
      
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
      setMediaUrl(null);
      setMediaBlob(null);
      setShowPreview(false);
      setDuration(0);
      
    } catch (error) {
      console.error('Error uploading media:', error);
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
      if (!audioRef.current) {
        audioRef.current = new Audio(mediaUrl!);
        audioRef.current.onended = () => setIsPlaying(false);
      }
      if (isPlaying) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } else {
        audioRef.current.play();
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
        video: { facingMode: newFacingMode, width: 480, height: 640 },
        audio: true,
      });
      
      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      
      // Update media recorder
      if (mediaRecorderRef.current && isRecording) {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
          ? 'video/webm;codecs=vp9' 
          : 'video/webm';
        const newRecorder = new MediaRecorder(newStream, { mimeType });
        
        newRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };
        
        newRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          setMediaBlob(blob);
          setMediaUrl(url);
          setShowPreview(true);
          
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
        };
        
        mediaRecorderRef.current = newRecorder;
        newRecorder.start(100);
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

  const toggleMode = () => {
    if (!isRecording && !showPreview) {
      setMode(mode === 'voice' ? 'video' : 'voice');
    }
  };

  // Video preview mode
  if (showPreview && mediaUrl && mode === 'video') {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Button variant="ghost" size="icon" onClick={cancelRecording}>
            <X className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium">Video Preview</span>
          <span className="text-sm text-muted-foreground">{formatDuration(duration)}</span>
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
        
        <div className="flex items-center justify-center gap-4 p-4 border-t border-border">
          <Button variant="outline" size="lg" onClick={cancelRecording} disabled={isUploading}>
            <RotateCcw className="h-5 w-5 mr-2" />
            Retake
          </Button>
          <Button size="lg" onClick={handleSend} disabled={isUploading}>
            {isUploading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-2" />
            ) : (
              <Send className="h-5 w-5 mr-2" />
            )}
            Send
          </Button>
        </div>
      </div>
    );
  }

  // Video recording mode
  if (isRecording && mode === 'video') {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Button variant="ghost" size="icon" onClick={cancelRecording}>
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium">Recording</span>
          </div>
          <span className="text-sm text-muted-foreground">{formatDuration(duration)}</span>
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
        
        <div className="flex items-center justify-center gap-4 p-4 border-t border-border">
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12"
            onClick={switchCamera}
          >
            <SwitchCamera className="h-6 w-6" />
          </Button>
          <Button 
            size="lg" 
            variant="destructive"
            className="h-16 w-16 rounded-full"
            onClick={stopRecording}
          >
            <StopCircle className="h-8 w-8" />
          </Button>
          <div className="w-12" />
        </div>
      </div>
    );
  }

  // Voice recording state
  if (isRecording && mode === 'voice') {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 rounded-xl px-3 py-2 animate-pulse">
        <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-sm font-medium text-destructive">{formatDuration(duration)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={stopRecording}
        >
          <StopCircle className="h-4 w-4 fill-current" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={cancelRecording}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Voice preview state
  if (showPreview && mediaUrl && mode === 'voice') {
    return (
      <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={togglePlayback}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        
        <div className="flex-1">
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full bg-primary transition-all",
                isPlaying && "animate-pulse"
              )} 
              style={{ width: isPlaying ? '100%' : '0%' }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{formatDuration(duration)}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={cancelRecording}
        >
          <X className="h-4 w-4" />
        </Button>
        
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8"
          onClick={handleSend}
          disabled={isUploading}
        >
          {isUploading ? (
            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  }

  // Default state - toggle button
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        onClick={startRecording}
        onContextMenu={(e) => {
          e.preventDefault();
          toggleMode();
        }}
      >
        {mode === 'voice' ? (
          <Mic className="h-5 w-5" />
        ) : (
          <Video className="h-5 w-5" />
        )}
      </Button>
      <button 
        onClick={toggleMode}
        className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
      >
        {mode === 'voice' ? 'Video' : 'Voice'}
      </button>
    </div>
  );
}
