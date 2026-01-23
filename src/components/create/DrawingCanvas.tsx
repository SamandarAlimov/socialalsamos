import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Pencil, 
  Eraser, 
  Undo2, 
  Redo2, 
  Trash2, 
  Download,
  Check,
  X,
  Circle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawingCanvasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backgroundImage?: string;
  onSave: (imageDataUrl: string) => void;
}

interface DrawingPath {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  tool: 'brush' | 'eraser';
}

const COLORS = [
  '#FFFFFF', '#000000', '#FF0000', '#FF6B00', '#FFD700',
  '#00FF00', '#00CED1', '#0080FF', '#8B5CF6', '#FF1493',
  '#A855F7', '#EC4899', '#84CC16', '#22C55E', '#F97316'
];

const BRUSH_SIZES = [2, 4, 8, 16, 32];

export function DrawingCanvas({ open, onOpenChange, backgroundImage, onSave }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [color, setColor] = useState('#FF0000');
  const [brushSize, setBrushSize] = useState(4);
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawingPath | null>(null);
  const [undoneHistory, setUndoneHistory] = useState<DrawingPath[]>([]);

  // Initialize canvas
  useEffect(() => {
    if (!open || !canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Draw background
    if (backgroundImage) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = backgroundImage;
    } else {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [open, backgroundImage]);

  // Redraw all paths
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and redraw background
    if (backgroundImage) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Redraw all paths
        paths.forEach(path => drawPath(ctx, path));
        if (currentPath) drawPath(ctx, currentPath);
      };
      img.src = backgroundImage;
    } else {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      paths.forEach(path => drawPath(ctx, path));
      if (currentPath) drawPath(ctx, currentPath);
    }
  }, [paths, currentPath, backgroundImage]);

  useEffect(() => {
    if (open) redraw();
  }, [paths, open, redraw]);

  const drawPath = (ctx: CanvasRenderingContext2D, path: DrawingPath) => {
    if (path.points.length < 2) return;
    
    ctx.beginPath();
    ctx.strokeStyle = path.tool === 'eraser' ? '#1a1a2e' : path.color;
    ctx.lineWidth = path.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.stroke();
  };

  const getCoordinates = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    setIsDrawing(true);
    setCurrentPath({
      points: [coords],
      color,
      size: brushSize,
      tool
    });
    setUndoneHistory([]);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || !currentPath) return;
    e.preventDefault();
    
    const coords = getCoordinates(e);
    const newPath = {
      ...currentPath,
      points: [...currentPath.points, coords]
    };
    setCurrentPath(newPath);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) drawPath(ctx, newPath);
  };

  const stopDrawing = () => {
    if (isDrawing && currentPath && currentPath.points.length > 1) {
      setPaths(prev => [...prev, currentPath]);
    }
    setIsDrawing(false);
    setCurrentPath(null);
  };

  const undo = () => {
    if (paths.length === 0) return;
    const lastPath = paths[paths.length - 1];
    setPaths(prev => prev.slice(0, -1));
    setUndoneHistory(prev => [...prev, lastPath]);
  };

  const redo = () => {
    if (undoneHistory.length === 0) return;
    const path = undoneHistory[undoneHistory.length - 1];
    setUndoneHistory(prev => prev.slice(0, -1));
    setPaths(prev => [...prev, path]);
  };

  const clear = () => {
    setPaths([]);
    setUndoneHistory([]);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Draw
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Canvas */}
          <div 
            ref={containerRef} 
            className="relative aspect-[9/16] max-h-[400px] rounded-xl overflow-hidden bg-secondary touch-none"
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>

          {/* Tools */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button
                variant={tool === 'brush' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setTool('brush')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant={tool === 'eraser' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setTool('eraser')}
              >
                <Eraser className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={undo} disabled={paths.length === 0}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={redo} disabled={undoneHistory.length === 0}>
                <Redo2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={clear}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Brush Size */}
          <div className="flex items-center gap-3">
            <Circle className="h-3 w-3 text-muted-foreground" />
            <div className="flex gap-2">
              {BRUSH_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setBrushSize(size)}
                  className={cn(
                    "rounded-full transition-all",
                    brushSize === size ? "ring-2 ring-primary" : ""
                  )}
                  style={{
                    width: size + 12,
                    height: size + 12,
                    backgroundColor: tool === 'brush' ? color : '#666'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "w-8 h-8 rounded-full transition-all",
                  color === c ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex-1">
              <Check className="h-4 w-4 mr-2" />
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
