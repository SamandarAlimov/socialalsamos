import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Scissors, 
  Crop, 
  RotateCcw, 
  FlipHorizontal,
  FlipVertical,
  Play, 
  Pause, 
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  Move
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface VideoEditorProps {
  videoUrl: string;
  onSave: (editedData: VideoEditData) => void;
  onCancel: () => void;
  open: boolean;
}

export interface VideoEditData {
  trimStart: number;
  trimEnd: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

type EditorMode = 'trim' | 'crop' | 'transform';

export function VideoEditor({ videoUrl, onSave, onCancel, open }: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Video state
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  
  // Edit state
  const [mode, setMode] = useState<EditorMode>('trim');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  
  // Crop state
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [aspectRatio, setAspectRatio] = useState<'free' | '1:1' | '16:9' | '9:16' | '4:3'>('free');
  
  // Timeline thumbnails
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  
  // Generate thumbnails from video
  useEffect(() => {
    if (!videoUrl || !open) return;
    
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    
    video.onloadedmetadata = () => {
      const dur = video.duration;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 80;
      canvas.height = 60;
      
      const thumbs: string[] = [];
      const count = Math.min(10, Math.ceil(dur));
      let loaded = 0;
      
      for (let i = 0; i < count; i++) {
        const time = (dur / count) * i;
        video.currentTime = time;
        
        video.onseeked = () => {
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbs[i] = canvas.toDataURL();
            loaded++;
            if (loaded === count) {
              setThumbnails([...thumbs]);
            }
          }
        };
      }
    };
  }, [videoUrl, open]);
  
  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setTrimEnd(100);
    };
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      // Loop within trim range
      const endTime = (trimEnd / 100) * duration;
      if (video.currentTime >= endTime) {
        video.currentTime = (trimStart / 100) * duration;
      }
    };
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [duration, trimStart, trimEnd]);
  
  // Playback controls
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isPlaying) {
      video.pause();
    } else {
      const startTime = (trimStart / 100) * duration;
      if (video.currentTime < startTime || video.currentTime >= (trimEnd / 100) * duration) {
        video.currentTime = startTime;
      }
      video.play();
    }
  }, [isPlaying, duration, trimStart, trimEnd]);
  
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);
  
  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    const vol = value[0];
    video.volume = vol;
    setVolume(vol);
    if (vol === 0) {
      video.muted = true;
      setIsMuted(true);
    } else if (isMuted) {
      video.muted = false;
      setIsMuted(false);
    }
  }, [isMuted]);
  
  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  }, []);
  
  const skipBackward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max((trimStart / 100) * duration, video.currentTime - 5);
  }, [duration, trimStart]);
  
  const skipForward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min((trimEnd / 100) * duration, video.currentTime + 5);
  }, [duration, trimEnd]);
  
  // Trim handlers
  const handleTrimChange = useCallback((values: number[]) => {
    setTrimStart(values[0]);
    setTrimEnd(values[1]);
  }, []);
  
  // Rotation
  const rotate90 = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
  }, []);
  
  // Crop handlers
  const handleCropMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode !== 'crop') return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [mode]);
  
  const handleCropMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || mode !== 'crop') return;
    
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    
    setCropArea((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(100 - prev.width, prev.x + dx / 3)),
      y: Math.max(0, Math.min(100 - prev.height, prev.y + dy / 3)),
    }));
    
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, mode, dragStart]);
  
  const handleCropMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  // Set aspect ratio preset
  const setAspectRatioPreset = useCallback((ratio: typeof aspectRatio) => {
    setAspectRatio(ratio);
    
    let w = 100, h = 100;
    switch (ratio) {
      case '1:1':
        w = 80; h = 80;
        break;
      case '16:9':
        w = 100; h = 56.25;
        break;
      case '9:16':
        w = 56.25; h = 100;
        break;
      case '4:3':
        w = 100; h = 75;
        break;
    }
    
    setCropArea({
      x: (100 - w) / 2,
      y: (100 - h) / 2,
      width: w,
      height: h,
    });
  }, []);
  
  // Save edits
  const handleSave = useCallback(() => {
    const editData: VideoEditData = {
      trimStart: (trimStart / 100) * duration,
      trimEnd: (trimEnd / 100) * duration,
      cropX: cropArea.x,
      cropY: cropArea.y,
      cropWidth: cropArea.width,
      cropHeight: cropArea.height,
      rotation,
      flipHorizontal,
      flipVertical,
    };
    onSave(editData);
  }, [trimStart, trimEnd, duration, cropArea, rotation, flipHorizontal, flipVertical, onSave]);
  
  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle>Edit Video</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col lg:flex-row h-[70vh]">
          {/* Video Preview */}
          <div 
            ref={containerRef}
            className="flex-1 relative bg-black flex items-center justify-center overflow-hidden"
            onMouseDown={handleCropMouseDown}
            onMouseMove={handleCropMouseMove}
            onMouseUp={handleCropMouseUp}
            onMouseLeave={handleCropMouseUp}
          >
            <div 
              className="relative"
              style={{
                transform: `rotate(${rotation}deg) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1})`,
                transition: 'transform 0.3s ease',
              }}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                className="max-w-full max-h-[50vh] object-contain"
                playsInline
              />
              
              {/* Crop overlay */}
              {mode === 'crop' && (
                <>
                  <div className="absolute inset-0 bg-black/50" />
                  <div 
                    className="absolute border-2 border-primary cursor-move"
                    style={{
                      left: `${cropArea.x}%`,
                      top: `${cropArea.y}%`,
                      width: `${cropArea.width}%`,
                      height: `${cropArea.height}%`,
                      backgroundColor: 'transparent',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                    }}
                  >
                    {/* Corner handles */}
                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full cursor-nw-resize" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full cursor-ne-resize" />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary rounded-full cursor-sw-resize" />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full cursor-se-resize" />
                    
                    {/* Grid */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-primary/30" />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Playback controls overlay */}
            <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-sm rounded-xl p-3 space-y-3">
              {/* Progress */}
              <div className="flex items-center gap-2 text-sm">
                <span>{formatTime(currentTime)}</span>
                <div 
                  className="flex-1 h-1 bg-muted rounded-full cursor-pointer relative"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    seekTo(percent * duration);
                  }}
                >
                  <div 
                    className="absolute h-full bg-primary rounded-full"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <span>{formatTime(duration)}</span>
              </div>
              
              {/* Controls */}
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" size="icon" onClick={skipBackward}>
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button variant="default" size="icon" onClick={togglePlay}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={skipForward}>
                  <SkipForward className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center gap-2 ml-4">
                  <Button variant="ghost" size="icon" onClick={toggleMute}>
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    onValueChange={handleVolumeChange}
                    max={1}
                    step={0.1}
                    className="w-20"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Editor Panel */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card p-4 space-y-4 overflow-y-auto">
            {/* Mode tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <Button
                variant={mode === 'trim' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => setMode('trim')}
              >
                <Scissors className="h-4 w-4 mr-1" />
                Trim
              </Button>
              <Button
                variant={mode === 'crop' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => setMode('crop')}
              >
                <Crop className="h-4 w-4 mr-1" />
                Crop
              </Button>
              <Button
                variant={mode === 'transform' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => setMode('transform')}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Transform
              </Button>
            </div>
            
            {/* Trim mode */}
            {mode === 'trim' && (
              <div className="space-y-4">
                <h4 className="font-medium">Trim Video</h4>
                
                {/* Timeline with thumbnails */}
                <div className="relative h-16 bg-muted rounded-lg overflow-hidden">
                  <div className="absolute inset-0 flex">
                    {thumbnails.map((thumb, i) => (
                      <img 
                        key={i} 
                        src={thumb} 
                        alt=""
                        className="h-full flex-1 object-cover"
                      />
                    ))}
                  </div>
                  
                  {/* Trim overlay */}
                  <div 
                    className="absolute inset-y-0 bg-black/60"
                    style={{ left: 0, width: `${trimStart}%` }}
                  />
                  <div 
                    className="absolute inset-y-0 bg-black/60"
                    style={{ right: 0, width: `${100 - trimEnd}%` }}
                  />
                  
                  {/* Trim handles */}
                  <div 
                    className="absolute inset-y-0 w-1 bg-primary cursor-ew-resize"
                    style={{ left: `${trimStart}%` }}
                  />
                  <div 
                    className="absolute inset-y-0 w-1 bg-primary cursor-ew-resize"
                    style={{ left: `${trimEnd}%` }}
                  />
                </div>
                
                {/* Trim slider */}
                <Slider
                  value={[trimStart, trimEnd]}
                  onValueChange={handleTrimChange}
                  min={0}
                  max={100}
                  step={0.1}
                  className="mt-2"
                />
                
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Start: {formatTime((trimStart / 100) * duration)}</span>
                  <span>End: {formatTime((trimEnd / 100) * duration)}</span>
                </div>
                
                <div className="text-sm text-muted-foreground text-center">
                  Duration: {formatTime(((trimEnd - trimStart) / 100) * duration)}
                </div>
              </div>
            )}
            
            {/* Crop mode */}
            {mode === 'crop' && (
              <div className="space-y-4">
                <h4 className="font-medium">Crop Video</h4>
                
                <div className="grid grid-cols-3 gap-2">
                  {(['free', '1:1', '16:9', '9:16', '4:3'] as const).map((ratio) => (
                    <Button
                      key={ratio}
                      variant={aspectRatio === ratio ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAspectRatioPreset(ratio)}
                    >
                      {ratio === 'free' ? 'Free' : ratio}
                    </Button>
                  ))}
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Drag the crop area on the video to adjust
                </p>
              </div>
            )}
            
            {/* Transform mode */}
            {mode === 'transform' && (
              <div className="space-y-4">
                <h4 className="font-medium">Transform Video</h4>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Rotation</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={rotate90}>
                        <RotateCcw className="h-4 w-4 mr-1" />
                        90°
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setRotation(0)}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground text-center">
                    Current: {rotation}°
                  </div>
                </div>
                
                <div className="space-y-3">
                  <span className="text-sm">Flip</span>
                  <div className="flex gap-2">
                    <Button
                      variant={flipHorizontal ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setFlipHorizontal(!flipHorizontal)}
                    >
                      <FlipHorizontal className="h-4 w-4 mr-1" />
                      Horizontal
                    </Button>
                    <Button
                      variant={flipVertical ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setFlipVertical(!flipVertical)}
                    >
                      <FlipVertical className="h-4 w-4 mr-1" />
                      Vertical
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="p-4 border-t border-border">
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Check className="h-4 w-4 mr-2" />
            Apply Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
