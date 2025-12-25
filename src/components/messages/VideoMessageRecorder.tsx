import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Video, StopCircle, X, Send, Play, Pause, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface VideoMessageRecorderProps {
  onSend: (url: string, duration: number) => void;
  onCancel?: () => void;
}

export function VideoMessageRecorder({ onSend, onCancel }: VideoMessageRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 480, height: 640 },
        audio: true 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
          ? 'video/webm;codecs=vp9' 
          : 'video/webm'
      });
      
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setVideoBlob(blob);
        setVideoUrl(url);
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
      console.error('Error starting video recording:', error);
    }
  }, []);

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
    
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    
    setVideoUrl(null);
    setVideoBlob(null);
    setDuration(0);
    setShowPreview(false);
    onCancel?.();
  }, [isRecording, stopRecording, videoUrl, onCancel]);

  const handleSend = useCallback(async () => {
    if (!videoBlob) return;
    
    setIsUploading(true);
    
    try {
      const fileName = `video-${Date.now()}.webm`;
      
      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, videoBlob, {
          contentType: 'video/webm',
        });
      
      if (error) throw error;
      
      const { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(data.path);
      
      onSend(urlData.publicUrl, duration);
      
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      setVideoUrl(null);
      setVideoBlob(null);
      setShowPreview(false);
      
    } catch (error) {
      console.error('Error uploading video:', error);
    } finally {
      setIsUploading(false);
    }
  }, [videoBlob, videoUrl, duration, onSend]);

  const togglePlayback = useCallback(() => {
    if (!previewVideoRef.current) return;
    
    if (isPlaying) {
      previewVideoRef.current.pause();
    } else {
      previewVideoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Preview mode
  if (showPreview && videoUrl) {
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
              src={videoUrl}
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

  // Recording mode
  if (isRecording) {
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
        
        <div className="flex items-center justify-center p-4 border-t border-border">
          <Button 
            size="lg" 
            variant="destructive"
            className="h-16 w-16 rounded-full"
            onClick={stopRecording}
          >
            <StopCircle className="h-8 w-8" />
          </Button>
        </div>
      </div>
    );
  }

  // Initial state - button to start
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10"
      onClick={startRecording}
    >
      <Video className="h-5 w-5" />
    </Button>
  );
}
