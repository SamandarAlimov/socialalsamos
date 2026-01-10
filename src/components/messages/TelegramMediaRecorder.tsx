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
  SwitchCamera
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

interface TelegramMediaRecorderProps {
  onSend: (url: string, duration: number, type: 'audio' | 'video') => void;
  onCancel?: () => void;
}

type RecordingState = 'idle' | 'recording' | 'preview';
type RecordingMode = 'voice' | 'video';

export function TelegramMediaRecorder({ onSend, onCancel }: TelegramMediaRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [mode, setMode] = useState<RecordingMode>('voice');
  const [duration, setDuration] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(32).fill(4));
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoPlaybackRef = useRef<HTMLVideoElement>(null);
  const audioPlaybackRef = useRef<HTMLAudioElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    analyserRef.current = null;
    setAudioLevels(Array(32).fill(4));
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

  // Real-time audio visualization
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
        
        // Map frequency data to waveform bars
        const bars = 32;
        const newLevels: number[] = [];
        const step = Math.floor(dataArray.length / bars);
        
        for (let i = 0; i < bars; i++) {
          const startIdx = i * step;
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[startIdx + j] || 0;
          }
          const avg = sum / step;
          // Scale to 4-100% height
          const height = Math.max(4, (avg / 255) * 100);
          newLevels.push(height);
        }
        
        setAudioLevels(newLevels);
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };
      
      updateLevels();
    } catch (error) {
      console.error('Failed to start audio visualization:', error);
    }
  }, []);

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
              width: { ideal: 720 }, 
              height: { ideal: 720 } 
            }, 
            audio: { echoCancellation: true, noiseSuppression: true } 
          }
        : { audio: { echoCancellation: true, noiseSuppression: true } };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      // Start audio visualization for voice recording
      if (!isVideo) {
        startAudioVisualization(stream);
      }
      
      // For video, set state first so the video element renders, then attach stream
      if (isVideo) {
        setState('recording');
        // Wait for next frame to ensure video element is mounted
        await new Promise(resolve => requestAnimationFrame(resolve));
        
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
        
        // Stop audio visualization
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
      
      recorder.start(100);
      
      // For voice, set state after recorder starts
      if (!isVideo) {
        setState('recording');
      }
      
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
    onCancel?.();
  };

  const handleSend = async () => {
    if (!mediaBlob) return;
    
    setIsUploading(true);
    try {
      const ext = 'webm';
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
    if (state !== 'recording') return;
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode, width: { ideal: 720 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      
      streamRef.current = stream;
      
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Failed to switch camera:', error);
    }
  };

  // Video Preview Screen
  if (state === 'preview' && mode === 'video' && mediaUrl) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
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
          <div className="flex items-center justify-center gap-6">
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
              className="h-16 w-16 rounded-full bg-white/10 border-2 border-white/30"
              onClick={togglePlayback}
            >
              {isPlaying ? <Pause className="h-7 w-7 text-white" /> : <Play className="h-7 w-7 text-white ml-1" />}
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

  // Video Recording Screen
  if (state === 'recording' && mode === 'video') {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed inset-0 z-50 bg-black flex flex-col"
      >
        <video
          ref={videoPreviewRef}
          className="flex-1 object-cover"
          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
          playsInline
          muted
          autoPlay
        />
        
        {/* Recording indicator */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full safe-area-top">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="h-3 w-3 rounded-full bg-destructive"
          />
          <span className="text-white font-medium tabular-nums">{formatDuration(duration)}</span>
        </div>
        
        {/* Camera switch */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 h-11 w-11 rounded-full bg-black/60 text-white safe-area-top"
          onClick={switchCamera}
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>
        
        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent safe-area-bottom">
          <div className="flex items-center justify-center gap-6">
            <Button
              variant="ghost"
              size="icon"
              className="h-14 w-14 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={cancelRecording}
            >
              <X className="h-6 w-6" />
            </Button>
            
            <Button
              variant="default"
              size="icon"
              className="h-16 w-16 rounded-full bg-destructive hover:bg-destructive/90"
              onClick={stopRecording}
            >
              <Square className="h-6 w-6 fill-current" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Voice Preview
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
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </Button>
          
          {/* Waveform */}
          <div className="flex items-center gap-0.5 h-6 w-24">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-1 bg-primary rounded-full"
                animate={isPlaying ? {
                  height: [4, 12 + Math.random() * 10, 4],
                } : { height: 4 + Math.sin(i * 0.6) * 8 }}
                transition={isPlaying ? {
                  duration: 0.3,
                  repeat: Infinity,
                  delay: i * 0.03,
                } : {}}
              />
            ))}
          </div>
          
          <span className="text-xs text-muted-foreground tabular-nums w-10">
            {formatDuration(duration)}
          </span>
        </div>
        
        <Button
          variant="default"
          size="icon"
          className="h-10 w-10 rounded-full bg-primary"
          onClick={handleSend}
          disabled={isUploading}
        >
          {isUploading ? (
            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </motion.div>
    );
  }

  // Voice Recording with real-time waveform
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
        >
          <X className="h-5 w-5" />
        </Button>
        
        <div className="flex items-center gap-2 bg-muted rounded-full px-3 py-1.5">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="h-3 w-3 rounded-full bg-destructive flex-shrink-0"
          />
          
          {/* Real-time waveform visualization */}
          <div className="flex items-center gap-[2px] h-8 w-32">
            {audioLevels.map((level, i) => (
              <motion.div
                key={i}
                className="w-[3px] bg-primary rounded-full"
                animate={{ height: `${level}%` }}
                transition={{ duration: 0.05, ease: 'linear' }}
              />
            ))}
          </div>
          
          <span className="text-xs text-foreground tabular-nums w-10 flex-shrink-0">
            {formatDuration(duration)}
          </span>
        </div>
        
        <Button
          variant="default"
          size="icon"
          className="h-10 w-10 rounded-full bg-primary"
          onClick={stopRecording}
        >
          <Square className="h-4 w-4 fill-current" />
        </Button>
      </motion.div>
    );
  }

  // Idle State - Two Buttons
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
        onClick={() => startRecording('voice')}
      >
        <Mic className="h-5 w-5" />
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
        onClick={() => startRecording('video')}
      >
        <Video className="h-5 w-5" />
      </Button>
    </div>
  );
}
