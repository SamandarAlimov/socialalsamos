import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TEXT_BACKGROUNDS } from './filters/FilterData';
import { cn } from '@/lib/utils';
import { Check, Type, Palette } from 'lucide-react';

interface TextBackgroundPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBackground: string;
  onSelectBackground: (backgroundId: string) => void;
  previewText?: string;
}

export function TextBackgroundPicker({
  open,
  onOpenChange,
  currentBackground,
  onSelectBackground,
  previewText = 'Your text here'
}: TextBackgroundPickerProps) {
  const currentBg = TEXT_BACKGROUNDS.find(b => b.id === currentBackground) || TEXT_BACKGROUNDS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Text Background
          </DialogTitle>
        </DialogHeader>

        {/* Preview */}
        <div className="rounded-xl overflow-hidden border border-border p-8 flex items-center justify-center bg-muted/50">
          <div
            className={cn(
              "px-4 py-2 rounded-lg font-semibold text-lg transition-all",
              currentBg.textColor
            )}
            style={{
              background: currentBg.color,
            }}
          >
            {previewText}
          </div>
        </div>

        {/* Solid Colors */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Solid Colors</p>
          <div className="grid grid-cols-8 gap-2">
            {TEXT_BACKGROUNDS.filter(b => !b.id.startsWith('gradient')).map(bg => (
              <button
                key={bg.id}
                onClick={() => onSelectBackground(bg.id)}
                className={cn(
                  "relative w-8 h-8 rounded-lg border-2 transition-all hover:scale-110",
                  currentBackground === bg.id 
                    ? "border-primary ring-2 ring-primary/30" 
                    : "border-border hover:border-primary/50"
                )}
                style={{
                  background: bg.color === 'transparent' 
                    ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 10px 10px'
                    : bg.color
                }}
                title={bg.name}
              >
                {currentBackground === bg.id && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Check className={cn("h-4 w-4", bg.textColor)} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Gradients */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Gradients</p>
          <div className="grid grid-cols-4 gap-2">
            {TEXT_BACKGROUNDS.filter(b => b.id.startsWith('gradient')).map(bg => (
              <button
                key={bg.id}
                onClick={() => onSelectBackground(bg.id)}
                className={cn(
                  "relative h-12 rounded-lg border-2 transition-all hover:scale-105",
                  currentBackground === bg.id 
                    ? "border-primary ring-2 ring-primary/30" 
                    : "border-border hover:border-primary/50"
                )}
                style={{ background: bg.color }}
              >
                {currentBackground === bg.id && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Check className="h-5 w-5 text-white drop-shadow-md" />
                  </div>
                )}
                <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white text-center font-medium drop-shadow-md">
                  {bg.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Apply Button */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
