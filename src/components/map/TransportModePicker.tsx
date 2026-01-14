import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Car, 
  PersonStanding, 
  Bike, 
  Bus, 
  Train, 
  Plane,
  Ship,
  CircleParking
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TransportMode = 'driving' | 'walking' | 'cycling' | 'transit' | 'metro' | 'taxi';

interface TransportModePickerProps {
  selected: TransportMode;
  onSelect: (mode: TransportMode) => void;
  compact?: boolean;
  showLabels?: boolean;
}

const transportModes: { 
  id: TransportMode; 
  icon: React.ElementType; 
  label: string; 
  labelUz: string;
  color: string;
}[] = [
  { id: 'driving', icon: Car, label: 'Drive', labelUz: 'Mashina', color: 'text-blue-500' },
  { id: 'walking', icon: PersonStanding, label: 'Walk', labelUz: 'Piyoda', color: 'text-green-500' },
  { id: 'cycling', icon: Bike, label: 'Bike', labelUz: 'Velosiped', color: 'text-orange-500' },
  { id: 'transit', icon: Bus, label: 'Bus', labelUz: 'Avtobus', color: 'text-purple-500' },
  { id: 'metro', icon: Train, label: 'Metro', labelUz: 'Metro', color: 'text-red-500' },
  { id: 'taxi', icon: Car, label: 'Taxi', labelUz: 'Taksi', color: 'text-yellow-500' },
];

export function TransportModePicker({ 
  selected, 
  onSelect, 
  compact = false,
  showLabels = true 
}: TransportModePickerProps) {
  if (compact) {
    return (
      <div className="flex gap-1">
        {transportModes.slice(0, 4).map((mode) => (
          <Button
            key={mode.id}
            variant={selected === mode.id ? 'default' : 'ghost'}
            size="icon"
            className={cn(
              "h-8 w-8",
              selected !== mode.id && mode.color
            )}
            onClick={() => onSelect(mode.id)}
          >
            <mode.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Transport turi</p>
      <div className="grid grid-cols-3 gap-2">
        {transportModes.map((mode) => (
          <Button
            key={mode.id}
            variant={selected === mode.id ? 'default' : 'outline'}
            size="sm"
            className={cn(
              "flex flex-col h-auto py-3 gap-1",
              selected !== mode.id && "hover:bg-muted"
            )}
            onClick={() => onSelect(mode.id)}
          >
            <mode.icon className={cn(
              "h-5 w-5",
              selected === mode.id ? "text-primary-foreground" : mode.color
            )} />
            {showLabels && (
              <span className="text-xs">{mode.labelUz}</span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}

// Quick transport bar for navigation
export function TransportQuickBar({ 
  selected, 
  onSelect,
  estimatedTimes 
}: { 
  selected: TransportMode; 
  onSelect: (mode: TransportMode) => void;
  estimatedTimes?: Record<TransportMode, string>;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {transportModes.slice(0, 5).map((mode) => (
        <Button
          key={mode.id}
          variant={selected === mode.id ? 'default' : 'secondary'}
          size="sm"
          className={cn(
            "flex items-center gap-2 shrink-0",
            selected !== mode.id && "bg-background"
          )}
          onClick={() => onSelect(mode.id)}
        >
          <mode.icon className={cn(
            "h-4 w-4",
            selected === mode.id ? "text-primary-foreground" : mode.color
          )} />
          <span className="text-xs">{mode.labelUz}</span>
          {estimatedTimes?.[mode.id] && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {estimatedTimes[mode.id]}
            </Badge>
          )}
        </Button>
      ))}
    </div>
  );
}
