import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Camera, 
  Video, 
  X, 
  RotateCcw, 
  Square, 
  Play, 
  Pause,
  Check,
  FlipHorizontal2,
  Sparkles,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FILTERS } from './filters/FilterData';
import { useIsMobile } from '@/hooks/use-mobile';

interface CameraVideoRecorderProps {
  onCapture: (file: File, type: 'image' | 'video', url: string) => void;
  onClose: () => void;
  mode?: 'photo' | 'video' | 'both';
  aspectRatio?: '1:1' | '9:16' | '16:9' | 'auto';
}

export function CameraVideoRecorder({ 
  onCapture, 
  onClose, 
  mode = 'both',
  aspectRatio = 'auto'
}: CameraVideoRecorderProps) {
  const isMobile = useIsMobile();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>(mode === 'video' ? 'video' : 'photo');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('none');
  const [showFilters, setShowFilters] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const computedAspectRatio = useMemo(() => {
    if (aspectRatio === 'auto') {
      return isMobile ? '9:16' : '16:9';
    }
    return aspectRatio;
  }, [aspectRatio, isMobile]);

  const aspectRatioClass = useMemo(() => ({
    '1:1': 'aspect-square',
    '9:16': 'aspect-[9/16]',
    '16:9': 'aspect-video'
  }[computedAspectRatio]), [computedAspectRatio]);

  const startCamera = useCallback(async () => {
    try {
      setCameraReady(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Use flexible constraints for better mobile compatibility
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1280, max: 1920, min: 320 },
          height: { ideal: 720, max: 1080, min: 240 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: captureMode === 'video'
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (error) {
        // Fallback to basic constraints
        console.warn('Using fallback camera constraints');
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: captureMode === 'video'
        });
        streamRef.current = fallbackStream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  }, [facingMode, captureMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [startCamera]);

  const switchCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Mirror if using front camera
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      // Apply filter if selected
      if (currentFilter !== 'none') {
        const filterStyle = FILTERS.find(f => f.id === currentFilter)?.style;
        if (filterStyle) {
          ctx.filter = filterStyle;
        }
      }
      
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedPhoto(dataUrl);
    }
  }, [facingMode, currentFilter]);

  const getSupportedMimeType = useCallback(() => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mimeType = getSupportedMimeType();
    
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      setRecordedBlob(blob);
    };

    recorder.start(1000);
    setIsRecording(true);
    setRecordingDuration(0);

    timerRef.current = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);
  }, [getSupportedMimeType]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  }, [isRecording]);

  const retake = useCallback(() => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedUrl(null);
    setRecordedBlob(null);
    setCapturedPhoto(null);
    setRecordingDuration(0);
    startCamera();
  }, [recordedUrl, startCamera]);

  const confirmCapture = useCallback(() => {
    if (capturedPhoto) {
      fetch(capturedPhoto)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
          onCapture(file, 'image', capturedPhoto);
        });
    } else if (recordedBlob && recordedUrl) {
      const file = new File([recordedBlob], `video_${Date.now()}.webm`, { type: recordedBlob.type });
      onCapture(file, 'video', recordedUrl);
    }
  }, [capturedPhoto, recordedBlob, recordedUrl, onCapture]);

  const togglePlayback = useCallback(() => {
    if (previewVideoRef.current) {
      if (isPlaying) {
        previewVideoRef.current.pause();
      } else {
        previewVideoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Quick filter presets
  const quickFilters = useMemo(() => 
    FILTERS.slice(0, 8).filter(f => f.id !== 'none'),
  []);

  // Preview mode (photo or video captured)
  if (capturedPhoto || recordedUrl) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col safe-area-inset">
        <canvas ref={canvasRef} className="hidden" />
        
        <div className="flex-1 flex items-center justify-center bg-black p-4">
          {capturedPhoto ? (
            <img 
              src={capturedPhoto} 
              alt="Captured" 
              className={cn(
                "max-h-full max-w-full object-contain rounded-2xl",
                isMobile ? "w-full" : "max-h-[70vh]"
              )}
            />
          ) : recordedUrl ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={previewVideoRef}
                src={recordedUrl}
                className={cn(
                  "max-h-full max-w-full object-contain rounded-2xl",
                  isMobile ? "w-full" : "max-h-[70vh]"
                )}
                loop
                playsInline
                onEnded={() => setIsPlaying(false)}
              />
              <button
                onClick={togglePlayback}
                className="absolute inset-0 flex items-center justify-center"
              >
                {!isPlaying && (
                  <div className="w-16 h-16 rounded-full bg-background/80 flex items-center justify-center">
                    <Play className="h-8 w-8 ml-1" />
                  </div>
                )}
              </button>
            </div>
          ) : null}
        </div>

        <div className={cn(
          "p-4 flex items-center justify-center gap-4 bg-background",
          isMobile && "pb-safe"
        )}>
          <Button
            variant="outline"
            size="lg"
            onClick={retake}
            className="gap-2"
          >
            <RotateCcw className="h-5 w-5" />
            Retake
          </Button>
          <Button
            variant="hero"
            size="lg"
            onClick={confirmCapture}
            className="gap-2"
          >
            <Check className="h-5 w-5" />
            Use {capturedPhoto ? 'Photo' : 'Video'}
          </Button>
        </div>
      </div>
    );
  }

  // Recording mode
  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col safe-area-inset">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between pt-safe">
        <Button variant="ghost" size="icon" onClick={onClose} className="bg-background/50 backdrop-blur-sm">
          <X className="h-6 w-6" />
        </Button>
        
        {isRecording && (
          <div className="flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 bg-destructive-foreground rounded-full animate-pulse" />
            <span className="font-medium">{formatDuration(recordingDuration)}</span>
          </div>
        )}
        
        <Button variant="ghost" size="icon" onClick={switchCamera} className="bg-background/50 backdrop-blur-sm">
          <FlipHorizontal2 className="h-6 w-6" />
        </Button>
      </div>

      {/* Camera View */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "max-h-full max-w-full object-cover",
            isMobile ? "w-full h-full" : aspectRatioClass,
            facingMode === 'user' && "scale-x-[-1]"
          )}
          style={{ 
            filter: currentFilter !== 'none' 
              ? FILTERS.find(f => f.id === currentFilter)?.style 
              : undefined 
          }}
        />
        
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Filter Quick Access */}
      {showFilters && (
        <div className="absolute bottom-32 left-0 right-0 px-4 z-10">
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              <button
                onClick={() => setCurrentFilter('none')}
                className={cn(
                  "flex-shrink-0 w-14 h-14 rounded-xl border-2 flex items-center justify-center bg-background/80 backdrop-blur-sm",
                  currentFilter === 'none' ? "border-primary" : "border-transparent"
                )}
              >
                <X className="h-5 w-5" />
              </button>
              {quickFilters.map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setCurrentFilter(filter.id)}
                  className={cn(
                    "flex-shrink-0 w-14 h-14 rounded-xl border-2 overflow-hidden",
                    currentFilter === filter.id ? "border-primary" : "border-transparent"
                  )}
                >
                  <div 
                    className="w-full h-full bg-gradient-to-br from-primary/60 via-accent/50 to-secondary"
                    style={{ filter: filter.style }}
                  />
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Controls */}
      <div className={cn(
        "p-4 bg-background/90 backdrop-blur-sm",
        isMobile && "pb-safe"
      )}>
        {/* Filter Toggle */}
        <div className="flex justify-center mb-4">
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Filters
          </Button>
        </div>

        {/* Mode Switcher */}
        {mode === 'both' && !isRecording && (
          <div className="flex justify-center gap-8 mb-4">
            <button
              onClick={() => setCaptureMode('photo')}
              className={cn(
                "text-sm font-medium transition-colors",
                captureMode === 'photo' ? "text-primary" : "text-muted-foreground"
              )}
            >
              PHOTO
            </button>
            <button
              onClick={() => setCaptureMode('video')}
              className={cn(
                "text-sm font-medium transition-colors",
                captureMode === 'video' ? "text-primary" : "text-muted-foreground"
              )}
            >
              VIDEO
            </button>
          </div>
        )}

        {/* Capture Button */}
        <div className="flex justify-center">
          {captureMode === 'photo' ? (
            <button
              onClick={takePhoto}
              disabled={!cameraReady}
              className="w-20 h-20 rounded-full border-4 border-primary bg-primary/20 flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50"
            >
              <div className="w-14 h-14 rounded-full bg-primary" />
            </button>
          ) : (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!cameraReady}
              className={cn(
                "w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all disabled:opacity-50",
                isRecording 
                  ? "border-destructive bg-destructive/20" 
                  : "border-destructive bg-destructive/10"
              )}
            >
              {isRecording ? (
                <Square className="h-8 w-8 text-destructive fill-destructive" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-destructive" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
