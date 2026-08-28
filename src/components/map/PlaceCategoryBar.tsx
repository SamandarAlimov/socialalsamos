import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { CATEGORY_BAR_ORDER, categoryUi } from '@/lib/placeIcons';
import { cn } from '@/lib/utils';

interface PlaceCategoryBarProps {
  active: string | null;
  onSelect: (id: string | null) => void;
  counts?: Record<string, number>;
  loading?: boolean;
  className?: string;
}

export function PlaceCategoryBar({
  active,
  onSelect,
  counts,
  loading,
  className,
}: PlaceCategoryBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className={cn('relative flex items-center', className)}>
      <button
        type="button"
        onClick={() => scrollBy(-220)}
        className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm hover:text-foreground"
        aria-label="Chapga"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div
        ref={scrollRef}
        className="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-hide px-1 py-1"
      >
        {active && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-sm font-medium text-background"
          >
            <X className="h-3.5 w-3.5" />
            Tozalash
          </button>
        )}

        {CATEGORY_BAR_ORDER.map((id) => {
          const ui = categoryUi(id);
          const isActive = active === id;
          const count = counts?.[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(isActive ? null : id)}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-border/70 bg-background/95 text-foreground hover:bg-muted',
              )}
              style={isActive ? { backgroundColor: ui.color } : undefined}
            >
              <ui.Icon
                className="h-4 w-4"
                style={isActive ? undefined : { color: ui.color }}
              />
              <span className="whitespace-nowrap">{ui.label}</span>
              {isActive && loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isActive && !loading && typeof count === 'number' && (
                <span className="rounded-full bg-white/25 px-1.5 text-xs">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scrollBy(220)}
        className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm hover:text-foreground"
        aria-label="O'ngga"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default PlaceCategoryBar;
