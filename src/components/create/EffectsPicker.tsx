import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CAMERA_EFFECTS, EFFECT_CATEGORIES, CameraEffect, getEffectFilterStyle } from './filters/EffectsData';
import { cn } from '@/lib/utils';
import { Wand2, Check, Camera, X, Loader2, RefreshCw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface EffectsPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File, url: string) => void;
  mode?: 'photo' | 'video';
}

export function EffectsPicker({
  open,
  onOpenChange,
  onCapture,
  mode = 'photo'
}: EffectsPickerProps) {
  const isMobile = useIsMobile();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedEffect, setSelectedEffect] = useState<CameraEffect>(CAMERA_EFFECTS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const filteredEffects = useMemo(() => {
    if (selectedCategory === 'all') return CAMERA_EFFECTS;
    return CAMERA_EFFECTS.filter(e => e.category === selectedCategory);
  }, [selectedCategory]);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: mode === 'video'
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
  }, [facingMode, mode]);

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

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Apply filter if it's a color effect
    const filterStyle = getEffectFilterStyle(selectedEffect.id);
    if (filterStyle) {
      ctx.filter = filterStyle;
    }

    ctx.save();
    if (facingMode === 'user') {
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    // Draw overlay effect
    if (selectedEffect.type === 'overlay' || selectedEffect.type === 'mask') {
      ctx.filter = 'none';
      drawEffectOverlay(ctx, canvas.width, canvas.height, selectedEffect);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const file = new File([blob], `effect-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      
      onCapture(file, url);
      onOpenChange(false);
      toast.success('Photo captured!');
    }, 'image/jpeg', 0.9);
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'video/webm;codecs=vp9'
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `effect-video-${Date.now()}.webm`, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      onCapture(file, url);
      onOpenChange(false);
      toast.success('Video recorded!');
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const drawEffectOverlay = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    effect: CameraEffect
  ) => {
    const emoji = effect.emoji;
    
    if (effect.category === 'face' && effect.id !== 'none') {
      // Draw face mask emoji centered
      ctx.font = `${width / 3}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, width / 2, height / 2.2);
    } else if (effect.category === 'fun') {
      // Draw fun overlays at appropriate positions
      ctx.font = `${width / 4}px serif`;
      ctx.textAlign = 'center';
      
      if (['crown', 'party_hat', 'cowboy'].includes(effect.id)) {
        ctx.fillText(emoji, width / 2, height / 5);
      } else if (['sunglasses', 'nerd'].includes(effect.id)) {
        ctx.fillText(emoji, width / 2, height / 3);
      } else if (['mustache', 'beard'].includes(effect.id)) {
        ctx.fillText(emoji, width / 2, height / 1.8);
      } else {
        ctx.fillText(emoji, width / 2, height / 2.5);
      }
    } else if (effect.category === 'ar') {
      // Draw AR effects around the frame
      ctx.font = `${width / 6}px serif`;
      const positions = [
        [0.15, 0.15], [0.85, 0.15], [0.5, 0.1],
        [0.1, 0.5], [0.9, 0.5],
        [0.15, 0.85], [0.85, 0.85], [0.5, 0.9]
      ];
      positions.forEach(([x, y]) => {
        ctx.fillText(emoji, width * x, height * y);
      });
    }
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* Camera Preview */}
      <div className="relative aspect-[9/16] max-h-[45vh] bg-black rounded-xl overflow-hidden mx-4 my-2">
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
            "w-full h-full object-cover transition-all",
            facingMode === 'user' && "scale-x-[-1]"
          )}
          style={{ filter: getEffectFilterStyle(selectedEffect.id) }}
        />

        {/* Effect Overlay Preview */}
        {selectedEffect.id !== 'none' && !isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {selectedEffect.type === 'overlay' || selectedEffect.type === 'mask' ? (
              <span 
                className="text-[100px] opacity-80 select-none"
                style={{
                  marginTop: selectedEffect.category === 'fun' && 
                    ['crown', 'party_hat', 'cowboy'].includes(selectedEffect.id) ? '-40%' : 
                    selectedEffect.category === 'fun' && 
                    ['sunglasses', 'nerd'].includes(selectedEffect.id) ? '-25%' :
                    selectedEffect.category === 'fun' &&
                    ['mustache', 'beard'].includes(selectedEffect.id) ? '20%' : '-10%'
                }}
              >
                {selectedEffect.emoji}
              </span>
            ) : null}
            
            {selectedEffect.category === 'ar' && (
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-4 p-8">
                {[...Array(8)].map((_, i) => (
                  <span 
                    key={i} 
                    className="text-4xl animate-pulse"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    {selectedEffect.emoji}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Camera Switch & Recording Indicator */}
        <div className="absolute top-4 right-4 flex gap-2">
          {isRecording && (
            <div className="flex items-center gap-2 bg-destructive/90 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-xs text-white font-medium">REC</span>
            </div>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={switchCamera}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Category Tabs */}
      <div className="px-4 py-2">
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <ScrollArea className="w-full">
            <TabsList className="inline-flex w-max gap-1 p-1 h-auto">
              {EFFECT_CATEGORIES.map(cat => (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="px-3 py-1.5 text-xs whitespace-nowrap gap-1"
                >
                  <span>{cat.emoji}</span>
                  <span className={isMobile ? "hidden sm:inline" : ""}>{cat.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Tabs>
      </div>

      {/* Effects Grid - FIXED SCROLLING */}
      <ScrollArea className="flex-1 min-h-0 px-4">
        <div className={cn(
          "grid gap-2 py-2",
          isMobile ? "grid-cols-4" : "grid-cols-5 md:grid-cols-6"
        )}>
          {filteredEffects.map(effect => (
            <button
              key={effect.id}
              onClick={() => setSelectedEffect(effect)}
              className={cn(
                "relative flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95",
                selectedEffect.id === effect.id 
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30" 
                  : "bg-secondary/50 hover:bg-secondary"
              )}
            >
              <span className="text-2xl">{effect.emoji}</span>
              <span className={cn(
                "text-[10px] font-medium truncate w-full text-center",
                selectedEffect.id === effect.id ? "text-primary-foreground" : "text-foreground"
              )}>
                {effect.name}
              </span>
              {selectedEffect.id === effect.id && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Capture Controls */}
      <div className={cn(
        "p-4 border-t border-border flex gap-2 items-center justify-center",
        isMobile && "pb-safe"
      )}>
        <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 max-w-[120px]">
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        
        {mode === 'photo' ? (
          <Button 
            onClick={capturePhoto} 
            className="flex-1 max-w-[160px]"
            disabled={isLoading || !!error}
          >
            <Camera className="h-4 w-4 mr-2" />
            Capture Photo
          </Button>
        ) : (
          <Button 
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
            className="flex-1 max-w-[160px]"
            disabled={isLoading || !!error}
          >
            {isRecording ? (
              <>
                <div className="h-3 w-3 bg-white rounded-sm mr-2" />
                Stop Recording
              </>
            ) : (
              <>
                <div className="h-3 w-3 bg-destructive rounded-full mr-2" />
                Start Recording
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-center justify-center">
              <Wand2 className="h-5 w-5 text-primary" />
              Camera Effects
            </DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 pb-0 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Camera Effects
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
