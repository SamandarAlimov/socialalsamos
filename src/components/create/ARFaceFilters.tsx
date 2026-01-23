import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, Camera, X, Check, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ARFaceFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File, url: string) => void;
}

interface FaceFilter {
  id: string;
  name: string;
  emoji: string;
  overlay: string;
  transform?: string;
}

const FACE_FILTERS: FaceFilter[] = [
  { id: 'none', name: 'None', emoji: '✨', overlay: '' },
  { id: 'dog', name: 'Dog', emoji: '🐶', overlay: '🐶' },
  { id: 'cat', name: 'Cat', emoji: '🐱', overlay: '🐱' },
  { id: 'bunny', name: 'Bunny', emoji: '🐰', overlay: '🐰' },
  { id: 'fox', name: 'Fox', emoji: '🦊', overlay: '🦊' },
  { id: 'bear', name: 'Bear', emoji: '🐻', overlay: '🐻' },
  { id: 'panda', name: 'Panda', emoji: '🐼', overlay: '🐼' },
  { id: 'koala', name: 'Koala', emoji: '🐨', overlay: '🐨' },
  { id: 'lion', name: 'Lion', emoji: '🦁', overlay: '🦁' },
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', overlay: '🦄' },
  { id: 'crown', name: 'Crown', emoji: '👑', overlay: '👑' },
  { id: 'sunglasses', name: 'Cool', emoji: '😎', overlay: '🕶️' },
  { id: 'hearts', name: 'Hearts', emoji: '😍', overlay: '❤️' },
  { id: 'fire', name: 'Fire', emoji: '🔥', overlay: '🔥' },
  { id: 'sparkle', name: 'Sparkle', emoji: '✨', overlay: '✨' },
  { id: 'rainbow', name: 'Rainbow', emoji: '🌈', overlay: '🌈' },
  { id: 'star', name: 'Star', emoji: '⭐', overlay: '⭐' },
  { id: 'butterfly', name: 'Butterfly', emoji: '🦋', overlay: '🦋' },
  { id: 'flower', name: 'Flower', emoji: '🌸', overlay: '🌸' },
  { id: 'alien', name: 'Alien', emoji: '👽', overlay: '👽' },
];

export function ARFaceFilters({ open, onOpenChange, onCapture }: ARFaceFiltersProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<FaceFilter>(FACE_FILTERS[0]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: false
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Could not access camera. Please ensure camera permissions are granted.');
    } finally {
      setIsLoading(false);
    }
  }, [facingMode]);

  useEffect(() => {
    if (open) {
      startCamera();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [open, startCamera]);

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame
    ctx.save();
    if (facingMode === 'user') {
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    // Draw overlay filter
    if (selectedFilter.id !== 'none') {
      ctx.font = `${canvas.width / 3}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw overlay at different positions based on filter
      if (['crown', 'unicorn'].includes(selectedFilter.id)) {
        ctx.fillText(selectedFilter.overlay, canvas.width / 2, canvas.height / 4);
      } else if (['sunglasses'].includes(selectedFilter.id)) {
        ctx.fillText(selectedFilter.overlay, canvas.width / 2, canvas.height / 2.5);
      } else if (['hearts', 'sparkle', 'fire', 'rainbow', 'star', 'butterfly', 'flower'].includes(selectedFilter.id)) {
        // Draw multiple overlays around the frame
        ctx.font = `${canvas.width / 5}px serif`;
        const positions = [
          [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85],
          [0.5, 0.1], [0.5, 0.9], [0.1, 0.5], [0.9, 0.5]
        ];
        positions.forEach(([x, y]) => {
          ctx.fillText(selectedFilter.overlay, canvas.width * x, canvas.height * y);
        });
      } else {
        // Animal faces - center on face area
        ctx.fillText(selectedFilter.overlay, canvas.width / 2, canvas.height / 2.2);
      }
    }

    // Convert to blob and file
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const file = new File([blob], `ar-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      
      onCapture(file, url);
      onOpenChange(false);
      toast.success('Photo captured!');
    }, 'image/jpeg', 0.9);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AR Face Filters
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          {/* Video Preview */}
          <div className="relative aspect-[9/16] max-h-[400px] bg-black overflow-hidden">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-secondary p-4 text-center">
                <X className="h-12 w-12 text-destructive mb-4" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button onClick={startCamera} className="mt-4">
                  Try Again
                </Button>
              </div>
            )}

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover",
                facingMode === 'user' && "scale-x-[-1]"
              )}
            />

            {/* Filter Overlay Preview */}
            {selectedFilter.id !== 'none' && !isLoading && !error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[120px] opacity-80 select-none" 
                  style={{
                    marginTop: ['crown', 'unicorn'].includes(selectedFilter.id) ? '-40%' : 
                               ['sunglasses'].includes(selectedFilter.id) ? '-20%' : '-10%'
                  }}
                >
                  {selectedFilter.overlay}
                </span>
              </div>
            )}

            {/* Camera Switch Button */}
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 right-4"
              onClick={switchCamera}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Filter Selection */}
          <div className="p-4 space-y-4">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-3 pb-2">
                {FACE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setSelectedFilter(filter)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-w-[60px]",
                      selectedFilter.id === filter.id 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-secondary"
                    )}
                  >
                    <span className="text-2xl">{filter.emoji}</span>
                    <span className="text-[10px]">{filter.name}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>

            {/* Capture Button */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button 
                onClick={capturePhoto} 
                className="flex-1"
                disabled={isLoading || !!error}
              >
                <Camera className="h-4 w-4 mr-2" />
                Capture
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
