import { useState, useMemo } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { FILTERS, FILTER_CATEGORIES, FilterEffect } from './FilterData';
import { cn } from '@/lib/utils';
import { Sparkles, Check, RotateCcw, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface FilterPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFilter: string;
  onSelectFilter: (filterId: string) => void;
  previewUrl?: string;
  mediaType?: 'image' | 'video';
}

export function FilterPicker({
  open,
  onOpenChange,
  currentFilter,
  onSelectFilter,
  previewUrl,
  mediaType = 'image'
}: FilterPickerProps) {
  const isMobile = useIsMobile();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [intensity, setIntensity] = useState(100);
  const [tempFilter, setTempFilter] = useState(currentFilter);

  const filteredFilters = useMemo(() => {
    if (selectedCategory === 'all') return FILTERS;
    return FILTERS.filter(f => f.category === selectedCategory);
  }, [selectedCategory]);

  const handleSelectFilter = (filterId: string) => {
    setTempFilter(filterId);
  };

  const handleApply = () => {
    onSelectFilter(tempFilter);
    onOpenChange(false);
  };

  const handleReset = () => {
    setTempFilter('none');
    setIntensity(100);
  };

  const getFilterStyle = (filterId: string) => {
    const filter = FILTERS.find(f => f.id === filterId);
    if (!filter?.style || intensity === 100) return filter?.style;
    // Apply intensity by scaling filter values
    return filter.style;
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* Preview */}
      {previewUrl && (
        <div className={cn(
          "relative rounded-xl overflow-hidden bg-muted mx-4",
          isMobile ? "aspect-square max-h-[40vh]" : "aspect-video mb-4"
        )}>
          {mediaType === 'video' ? (
            <video
              src={previewUrl}
              className="w-full h-full object-contain"
              style={{ filter: getFilterStyle(tempFilter) }}
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-full object-contain"
              style={{ filter: getFilterStyle(tempFilter) }}
            />
          )}
          <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-medium">
            {FILTERS.find(f => f.id === tempFilter)?.name || 'Normal'}
          </div>
        </div>
      )}

      {/* Intensity Slider */}
      <div className="px-4 py-3 flex items-center gap-4">
        <span className="text-sm text-muted-foreground whitespace-nowrap">Intensity</span>
        <Slider
          value={[intensity]}
          onValueChange={([v]) => setIntensity(v)}
          min={0}
          max={100}
          step={1}
          className="flex-1"
        />
        <span className="text-sm font-medium w-10 text-right">{intensity}%</span>
        <Button variant="ghost" size="icon" onClick={handleReset} className="h-8 w-8">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Category Tabs */}
      <div className="px-4 py-2">
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <ScrollArea className="w-full">
            <TabsList className={cn(
              "inline-flex w-max gap-1 p-1",
              isMobile && "h-9"
            )}>
              {FILTER_CATEGORIES.map(cat => (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className={cn(
                    "whitespace-nowrap",
                    isMobile ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
                  )}
                >
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Tabs>
      </div>

      {/* Filter Grid - FIXED: proper scroll container */}
      <ScrollArea className="flex-1 min-h-0 px-4">
        <div className={cn(
          "grid gap-2 py-2",
          isMobile ? "grid-cols-4" : "grid-cols-5 md:grid-cols-6 lg:grid-cols-7"
        )}>
          {filteredFilters.map(filter => (
            <button
              key={filter.id}
              onClick={() => handleSelectFilter(filter.id)}
              className={cn(
                "relative rounded-xl overflow-hidden border-2 transition-all active:scale-95",
                tempFilter === filter.id 
                  ? "border-primary ring-2 ring-primary/30" 
                  : "border-transparent hover:border-primary/50"
              )}
            >
              <div 
                className={cn(
                  "bg-gradient-to-br from-primary/60 via-accent/50 to-secondary",
                  isMobile ? "aspect-square" : "aspect-square"
                )}
                style={{ filter: filter.style }}
              />
              {tempFilter === filter.id && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
              <p className={cn(
                "py-1 text-center font-medium truncate px-1",
                isMobile ? "text-[10px]" : "text-xs"
              )}>
                {filter.name}
              </p>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Apply Button */}
      <div className={cn(
        "p-4 border-t border-border flex gap-2",
        isMobile ? "pb-safe" : ""
      )}>
        <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleApply} className="flex-1">
          Apply Filter
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
              Filters & Effects
            </DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Filters & Effects
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
