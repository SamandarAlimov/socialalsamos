import {
  Bookmark,
  Bus,
  Clock3,
  Fuel,
  History,
  Layers,
  MapPinned,
  MoonStar,
  CircleParking,
  Pill,
  Coffee,
  Utensils,
} from 'lucide-react';
import type { SavedPlace } from '@/hooks/useSavedPlaces';
import type { PlaceVisit } from '@/hooks/useVisitTracking';
import { cn } from '@/lib/utils';

interface MapOverviewPanelProps {
  savedPlaces: SavedPlace[];
  visits: PlaceVisit[];
  onCategory: (id: string) => void;
  onSaved: () => void;
  onHistory: () => void;
  onStops: () => void;
  onLayers: () => void;
  className?: string;
}

const shortcuts = [
  { id: 'restaurant', label: 'Restoran', Icon: Utensils },
  { id: 'cafe', label: 'Kafe', Icon: Coffee },
  { id: 'fuel', label: 'Yoqilg\'i', Icon: Fuel },
  { id: 'parking', label: 'Parkovka', Icon: CircleParking },
  { id: 'pharmacy', label: 'Dorixona', Icon: Pill },
  { id: 'mosque', label: 'Masjid', Icon: MoonStar },
];

export function MapOverviewPanel({
  savedPlaces,
  visits,
  onCategory,
  onSaved,
  onHistory,
  onStops,
  onLayers,
  className,
}: MapOverviewPanelProps) {
  return (
    <div className={cn('min-h-full px-3.5 py-3.5', className)}>
      <div className="rounded-[22px] border border-border/45 bg-background/52 p-4 shadow-sm backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-sm ring-1 ring-primary/10">
            <MapPinned className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold tracking-tight">Alsamos Xarita</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Joy qidiring, yaqin xizmatlarni toping, bekatlarni ko‘ring va marshrut tuzing.
            </p>
          </div>
        </div>

      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Yaqin atrofda
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {shortcuts.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onCategory(id)}
              className="group flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/40 bg-background/46 px-2 py-3 text-center text-xs font-semibold backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-background/72 hover:shadow-md"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <Icon className="h-4 w-4" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tez amallar
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSaved}
            className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/46 p-3 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-background/72 hover:shadow-sm"
          >
            <Bookmark className="h-4 w-4 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Saqlangan</span>
              <span className="block text-xs text-muted-foreground">{savedPlaces.length} ta joy</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onHistory}
            className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/46 p-3 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-background/72 hover:shadow-sm"
          >
            <History className="h-4 w-4 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Tashriflar</span>
              <span className="block text-xs text-muted-foreground">{visits.length} ta yozuv</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onStops}
            className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/46 p-3 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-background/72 hover:shadow-sm"
          >
            <Bus className="h-4 w-4 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Bekatlar</span>
              <span className="block text-xs text-muted-foreground">Transport</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onLayers}
            className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/46 p-3 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-background/72 hover:shadow-sm"
          >
            <Layers className="h-4 w-4 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Qatlamlar</span>
              <span className="block text-xs text-muted-foreground">Xarita / Sputnik</span>
            </span>
          </button>
        </div>
      </div>

      {savedPlaces.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Yaqinda saqlangan
            </p>
            <button type="button" onClick={onSaved} className="text-xs font-semibold text-primary">
              Barchasi
            </button>
          </div>
          <div className="space-y-2">
            {savedPlaces.slice(0, 3).map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={onSaved}
                className="flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-background/46 p-3 text-left backdrop-blur transition-all hover:bg-background/72 hover:shadow-sm"
              >
                <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{place.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {place.address || 'Saqlangan joy'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {visits.length > 0 && (
        <div className="mt-4 pb-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Oxirgi tashrif
            </p>
            <button type="button" onClick={onHistory} className="text-xs font-semibold text-primary">
              Tarix
            </button>
          </div>
          <div className="rounded-2xl border border-border/40 bg-background/46 p-3 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="h-4 w-4 text-primary" />
              <span className="truncate">{visits[0].name || 'Joylashuv'}</span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {visits[0].address || new Date(visits[0].arrived_at).toLocaleString('uz-UZ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapOverviewPanel;
