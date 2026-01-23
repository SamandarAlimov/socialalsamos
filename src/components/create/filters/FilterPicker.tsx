import { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FILTERS, FILTER_CATEGORIES, FilterEffect } from './FilterData';
import { cn } from '@/lib/utils';
import { Sparkles, Check } from 'lucide-react';

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
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [intensity, setIntensity] = useState(100);

  const filteredFilters = useMemo(() => {
    if (selectedCategory === 'all') return FILTERS;
    return FILTERS.filter(f => f.category === selectedCategory);
  }, [selectedCategory]);

  const handleSelectFilter = (filterId: string) => {
    onSelectFilter(filterId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Filters & Effects
          </DialogTitle>
        </DialogHeader>

        {/* Preview */}
        {previewUrl && (
          <div className="relative aspect-video rounded-xl overflow-hidden bg-muted mb-4">
            {mediaType === 'video' ? (
              <video
                src={previewUrl}
                className="w-full h-full object-contain"
                style={{ filter: FILTERS.find(f => f.id === currentFilter)?.style }}
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
                style={{ filter: FILTERS.find(f => f.id === currentFilter)?.style }}
              />
            )}
            <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
              {FILTERS.find(f => f.id === currentFilter)?.name || 'Normal'}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <ScrollArea className="w-full">
            <TabsList className="inline-flex w-max gap-1 p-1">
              {FILTER_CATEGORIES.map(cat => (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="px-4 py-2 text-sm whitespace-nowrap"
                >
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>
        </Tabs>

        {/* Filter Grid */}
        <ScrollArea className="h-[300px] mt-4">
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 p-1">
            {filteredFilters.map(filter => (
              <button
                key={filter.id}
                onClick={() => handleSelectFilter(filter.id)}
                className={cn(
                  "relative rounded-xl overflow-hidden border-2 transition-all hover:scale-105",
                  currentFilter === filter.id 
                    ? "border-primary ring-2 ring-primary/30" 
                    : "border-transparent hover:border-primary/50"
                )}
              >
                <div 
                  className="aspect-square bg-gradient-to-br from-primary/60 via-accent/50 to-secondary"
                  style={{ filter: filter.style }}
                />
                {currentFilter === filter.id && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <p className="text-xs py-1.5 text-center font-medium truncate px-1">
                  {filter.name}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Apply Button */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Apply Filter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
