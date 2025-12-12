import { Button } from '@/components/ui/button';
import { Mic, Square, X, Send, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useState, useRef, useEffect } from 'react';

interface VoiceMessageRecorderProps {
  onSend: (url: string, duration: number) => void;
  onCancel?: () => void;
}

export function VoiceMessageRecorder({ onSend, onCancel }: VoiceMessageRecorderProps) {
  const {
    isRecording,
    formattedDuration,
    audioUrl,
    isUploading,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    uploadVoiceMessage,
    duration,
  } = useVoiceRecorder();

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioUrl) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    return () => {
      audioRef.current?.pause();
    };
  }, [audioUrl]);

  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSend = async () => {
    const result = await uploadVoiceMessage();
    if (result) {
      onSend(result.url, result.duration);
    }
  };

  const handleCancel = () => {
    cancelRecording();
    onCancel?.();
  };

  // Not recording and no audio - show mic button
  if (!isRecording && !audioUrl) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground"
        onClick={startRecording}
      >
        <Mic className="h-5 w-5" />
      </Button>
    );
  }

  // Recording in progress
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 rounded-xl px-3 py-2 animate-pulse">
        <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-sm font-medium text-destructive">{formattedDuration}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={stopRecording}
        >
          <Square className="h-4 w-4 fill-current" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Recording complete - show preview
  if (audioUrl) {
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
          <span className="text-xs text-muted-foreground">{formattedDuration}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
        </Button>
        
        <Button
          variant="hero"
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

  return null;
}
