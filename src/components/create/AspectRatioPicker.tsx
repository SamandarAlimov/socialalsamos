import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Crop, Check, RotateCcw } from 'lucide-react';

export interface AspectRatioOption {
  id: string;
  label: string;
  ratio: number; // width / height
  icon: React.ReactNode;
}

const ASPECT_RATIOS: AspectRatioOption[] = [
  { 
    id: 'original', 
    label: 'Original', 
    ratio: 0, // 0 means use original
    icon: <RotateCcw className="h-3 w-3" />
  },
  { 
    id: '1:1', 
    label: '1:1', 
    ratio: 1,
    icon: <div className="w-3 h-3 border border-current rounded-sm" />
  },
  { 
    id: '4:5', 
    label: '4:5', 
    ratio: 4/5,
    icon: <div className="w-2.5 h-3 border border-current rounded-sm" />
  },
  { 
    id: '3:4', 
    label: '3:4', 
    ratio: 3/4,
    icon: <div className="w-2.5 h-3.5 border border-current rounded-sm" />
  },
  { 
    id: '9:16', 
    label: '9:16', 
    ratio: 9/16,
    icon: <div className="w-2 h-3.5 border border-current rounded-sm" />
  },
  { 
    id: '16:9', 
    label: '16:9', 
    ratio: 16/9,
    icon: <div className="w-4 h-2.5 border border-current rounded-sm" />
  },
  { 
    id: '4:3', 
    label: '4:3', 
    ratio: 4/3,
    icon: <div className="w-3.5 h-2.5 border border-current rounded-sm" />
  },
];

interface AspectRatioPickerProps {
  selectedRatio: string;
  originalRatio?: number;
  onSelectRatio: (ratioId: string, ratioValue: number) => void;
  className?: string;
  disabled?: boolean;
}

export function AspectRatioPicker({
  selectedRatio,
  originalRatio,
  onSelectRatio,
  className,
  disabled
}: AspectRatioPickerProps) {
  const [open, setOpen] = useState(false);
  
  const currentOption = ASPECT_RATIOS.find(r => r.id === selectedRatio) || ASPECT_RATIOS[0];
  
  const getDisplayLabel = () => {
    if (selectedRatio === 'original' && originalRatio) {
      return getAspectRatioLabel(originalRatio);
    }
    return currentOption.label;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn("gap-2", className)}
          disabled={disabled}
        >
          <Crop className="h-4 w-4" />
          <span className="text-xs font-medium">{getDisplayLabel()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-56 p-2" 
        align="start"
        sideOffset={8}
      >
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground px-2 py-1 font-medium">
            Aspect Ratio
          </p>
          {ASPECT_RATIOS.map((option) => {
            const isSelected = selectedRatio === option.id;
            const displayLabel = option.id === 'original' && originalRatio 
              ? `Original (${getAspectRatioLabel(originalRatio)})`
              : option.label;
            
            return (
              <button
                key={option.id}
                onClick={() => {
                  const ratioValue = option.id === 'original' 
                    ? (originalRatio || 1) 
                    : option.ratio;
                  onSelectRatio(option.id, ratioValue);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors",
                  isSelected 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center",
                  isSelected ? "bg-primary-foreground/20" : "bg-muted"
                )}>
                  {option.icon}
                </div>
                <span className="flex-1 text-left font-medium">{displayLabel}</span>
                {isSelected && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Helper function to get aspect ratio label from number
function getAspectRatioLabel(ratio: number): string {
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 16/9) < 0.05) return '16:9';
  if (Math.abs(ratio - 9/16) < 0.05) return '9:16';
  if (Math.abs(ratio - 4/3) < 0.05) return '4:3';
  if (Math.abs(ratio - 3/4) < 0.05) return '3:4';
  if (Math.abs(ratio - 4/5) < 0.05) return '4:5';
  if (Math.abs(ratio - 5/4) < 0.05) return '5:4';
  if (ratio > 1.7) return '16:9';
  if (ratio > 1.2) return '4:3';
  if (ratio < 0.6) return '9:16';
  if (ratio < 0.8) return '3:4';
  return ratio.toFixed(2);
}

export { ASPECT_RATIOS, getAspectRatioLabel };
