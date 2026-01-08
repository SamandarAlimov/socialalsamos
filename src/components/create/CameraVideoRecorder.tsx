import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Camera, 
  Video, 
  X, 
  RotateCcw, 
  Square, 
  Play, 
  Pause,
  Check,
  FlipHorizontal2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CameraVideoRecorderProps {
  onCapture: (file: File, type: 'image' | 'video', url: string) => void;
  onClose: () => void;
  mode?: 'photo' | 'video' | 'both';
  aspectRatio?: '1:1' | '9:16' | '16:9';
}

export function CameraVideoRecorder({ 
  onCapture, 
  onClose, 
  mode = 'both',
  aspectRatio = '9:16'
}: CameraVideoRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>(mode === 'video' ? 'video' : 'photo');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const aspectRatioClass = {
    '1:1': 'aspect-square',
    '9:16': 'aspect-[9/16]',
    '16:9': 'aspect-video'
  }[aspectRatio];

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: captureMode === 'video'
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
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
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedPhoto(dataUrl);
    }
  }, [facingMode]);

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
      // Convert data URL to blob
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

  // Preview mode (photo or video captured)
  if (capturedPhoto || recordedUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-black">
          {capturedPhoto ? (
            <img 
              src={capturedPhoto} 
              alt="Captured" 
              className={cn("max-h-full max-w-full object-contain", aspectRatioClass)}
            />
          ) : recordedUrl ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={previewVideoRef}
                src={recordedUrl}
                className={cn("max-h-full max-w-full object-contain", aspectRatioClass)}
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

        <div className="p-6 flex items-center justify-center gap-8">
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
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-6 w-6" />
        </Button>
        
        {isRecording && (
          <div className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="font-medium">{formatDuration(recordingDuration)}</span>
          </div>
        )}
        
        <Button variant="ghost" size="icon" onClick={switchCamera}>
          <FlipHorizontal2 className="h-6 w-6" />
        </Button>
      </div>

      {/* Camera View */}
      <div className="flex-1 flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "max-h-full max-w-full object-cover",
            aspectRatioClass,
            facingMode === 'user' && "scale-x-[-1]"
          )}
        />
      </div>

      {/* Controls */}
      <div className="p-6 bg-background/90 backdrop-blur-sm">
        {/* Mode Switcher */}
        {mode === 'both' && !isRecording && (
          <div className="flex justify-center gap-8 mb-6">
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
              className="w-20 h-20 rounded-full border-4 border-primary bg-primary/20 flex items-center justify-center transition-transform active:scale-95"
            >
              <div className="w-14 h-14 rounded-full bg-primary" />
            </button>
          ) : (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                "w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all",
                isRecording 
                  ? "border-red-500 bg-red-500/20" 
                  : "border-red-500 bg-red-500/10"
              )}
            >
              {isRecording ? (
                <Square className="h-8 w-8 text-red-500 fill-red-500" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-red-500" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}