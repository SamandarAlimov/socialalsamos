import { useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLACE_CATEGORIES, type PlaceCategoryId } from '@/lib/mapPlaces';

interface PlaceCategoryBarProps {
  active: PlaceCategoryId | null;
  onSelect: (id: PlaceCategoryId | null) => void;
  /** Har bir kategoriya uchun topilgan joylar soni (ixtiyoriy). */
  counts?: Partial<Record<PlaceCategoryId, number>>;
  loading?: boolean;
  className?: string;
}

/**
 * Premium filtr paneli: Restoranlar, Kafe, Zaprovka, Parkovka, Dorixona...
 * Yandex/Google Mapsdagidek gorizontal "pill" tugmalar.
 */
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
    <div className={cn('relative flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => scrollBy(-220)}
        className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:text-foreground md:flex"
        aria-label="Chapga"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div
        ref={scrollRef}
        className="scrollbar-hide flex flex-1 items-center gap-2 overflow-x-auto scroll-smooth py-1"
      >
        {active && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background shadow-sm"
          >
            <X className="h-3.5 w-3.5" />
            Tozalash
          </button>
        )}

        {PLACE_CATEGORIES.map((category) => {
          const isActive = active === category.id;
          const count = counts?.[category.id];
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(isActive ? null : category.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium shadow-sm ring-1 transition-all duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground ring-primary'
                  : 'bg-background/95 text-foreground ring-border hover:bg-muted',
                loading && isActive && 'animate-pulse',
              )}
            >
              <span aria-hidden>{category.emoji}</span>
              {category.label}
              {typeof count === 'number' && count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    isActive ? 'bg-primary-foreground/20' : 'bg-muted',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scrollBy(220)}
        className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:text-foreground md:flex"
        aria-label="O'ngga"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
