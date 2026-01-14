import { Button } from '@/components/ui/button';
import { 
  Search,
  Navigation,
  Coffee,
  Fuel,
  CircleParking,
  Building2,
  Utensils,
  ShoppingCart,
  Hotel,
  Hospital,
  GraduationCap,
  Landmark,
  Bus,
  Train
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface QuickAction {
  id: string;
  icon: React.ElementType;
  label: string;
  labelUz: string;
  query: string;
  color: string;
}

const quickActions: QuickAction[] = [
  { id: 'restaurants', icon: Utensils, label: 'Food', labelUz: 'Ovqat', query: 'restaurant', color: 'text-orange-500' },
  { id: 'gas', icon: Fuel, label: 'Gas', labelUz: 'Yoqilg\'i', query: 'gas_station', color: 'text-red-500' },
  { id: 'parking', icon: CircleParking, label: 'Parking', labelUz: 'Parkovka', query: 'parking', color: 'text-blue-500' },
  { id: 'coffee', icon: Coffee, label: 'Cafe', labelUz: 'Kofe', query: 'cafe', color: 'text-amber-600' },
  { id: 'shopping', icon: ShoppingCart, label: 'Shop', labelUz: 'Do\'kon', query: 'shopping_mall', color: 'text-purple-500' },
  { id: 'hotel', icon: Hotel, label: 'Hotel', labelUz: 'Mehmonxona', query: 'hotel', color: 'text-teal-500' },
  { id: 'hospital', icon: Hospital, label: 'Hospital', labelUz: 'Shifoxona', query: 'hospital', color: 'text-red-600' },
  { id: 'atm', icon: Building2, label: 'ATM', labelUz: 'Bankomat', query: 'atm', color: 'text-green-500' },
  { id: 'bus', icon: Bus, label: 'Bus Stop', labelUz: 'Bekat', query: 'bus_station', color: 'text-indigo-500' },
  { id: 'metro', icon: Train, label: 'Metro', labelUz: 'Metro', query: 'subway_station', color: 'text-red-500' },
  { id: 'university', icon: GraduationCap, label: 'Education', labelUz: 'Ta\'lim', query: 'university', color: 'text-blue-600' },
  { id: 'government', icon: Landmark, label: 'Government', labelUz: 'Davlat', query: 'local_government_office', color: 'text-slate-600' },
];

interface MapQuickActionsProps {
  onSearch: (query: string, label: string) => void;
  currentLocation?: { latitude: number; longitude: number } | null;
}

export function MapQuickActions({ onSearch, currentLocation }: MapQuickActionsProps) {
  const handleSearch = (action: QuickAction) => {
    if (!currentLocation) return;
    
    // Open Google Maps search for nearby places
    const url = `https://www.google.com/maps/search/${action.query}/@${currentLocation.latitude},${currentLocation.longitude},15z`;
    window.open(url, '_blank');
  };
  
  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex gap-2 p-3">
        {quickActions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            className="flex flex-col h-auto py-2 px-3 gap-1 shrink-0 hover:bg-muted"
            onClick={() => handleSearch(action)}
          >
            <action.icon className={cn("h-4 w-4", action.color)} />
            <span className="text-[10px]">{action.labelUz}</span>
          </Button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

// Compact version for mobile bottom sheet
export function MapQuickActionsGrid({ 
  onSearch, 
  currentLocation 
}: MapQuickActionsProps) {
  const handleSearch = (action: QuickAction) => {
    if (!currentLocation) return;
    const url = `https://www.google.com/maps/search/${action.query}/@${currentLocation.latitude},${currentLocation.longitude},15z`;
    window.open(url, '_blank');
  };
  
  return (
    <div className="grid grid-cols-4 gap-3 p-3">
      {quickActions.slice(0, 8).map((action) => (
        <Button
          key={action.id}
          variant="ghost"
          className="flex flex-col h-auto py-3 gap-1.5 hover:bg-muted"
          onClick={() => handleSearch(action)}
        >
          <div className={cn(
            "p-2 rounded-full bg-muted",
            action.color.replace('text-', 'bg-').replace('500', '100').replace('600', '100')
          )}>
            <action.icon className={cn("h-5 w-5", action.color)} />
          </div>
          <span className="text-[10px] text-muted-foreground">{action.labelUz}</span>
        </Button>
      ))}
    </div>
  );
}
