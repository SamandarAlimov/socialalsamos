import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Home,
  Briefcase,
  MapPin,
  Clock,
  Calendar,
  Route,
  TrendingUp,
  Edit2,
  Trash2,
  Eye,
  Navigation,
  Footprints,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocationTracking, FrequentPlace, DailyRoute } from '@/hooks/useLocationTracking';
import { format, formatDistanceToNow } from 'date-fns';
import { uz } from 'date-fns/locale';

interface LocationHistoryMobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewRoute?: (route: DailyRoute) => void;
  onNavigateToPlace?: (lat: number, lng: number, name: string) => void;
}

export function LocationHistoryMobileSheet({
  open,
  onOpenChange,
  onViewRoute,
  onNavigateToPlace,
}: LocationHistoryMobileSheetProps) {
  const {
    isTracking,
    isLoading,
    frequentPlaces,
    dailyRoutes,
    todayRoute,
    startTracking,
    stopTracking,
    updatePlaceName,
    deletePlace,
    getTotalDistance,
  } = useLocationTracking();

  const [editingPlace, setEditingPlace] = useState<string | null>(null);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [activeTab, setActiveTab] = useState('places');

  const getPlaceIcon = (type: string) => {
    switch (type) {
      case 'home':
        return <Home className="h-4 w-4" />;
      case 'work':
        return <Briefcase className="h-4 w-4" />;
      case 'study':
        return <Briefcase className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getPlaceColor = (type: string) => {
    switch (type) {
      case 'home':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'work':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'study':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const handleSavePlaceName = async (placeId: string) => {
    if (newPlaceName.trim()) {
      await updatePlaceName(placeId, newPlaceName.trim());
      setEditingPlace(null);
      setNewPlaceName('');
    }
  };

  const totalDistanceWeek = getTotalDistance(7);
  const totalDistanceMonth = getTotalDistance(30);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl px-0 z-[9999]">
        <SheetHeader className="px-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Footprints className="h-5 w-5 text-primary" />
              Joylashuv tarixi
            </SheetTitle>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100%-60px)] px-4">
          <div className="py-4 space-y-4">
            {/* Stats Summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground">Haftalik masofa</p>
                <p className="text-lg font-bold text-primary">{totalDistanceWeek.toFixed(1)} km</p>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
                <p className="text-xs text-muted-foreground">Oylik masofa</p>
                <p className="text-lg font-bold">{totalDistanceMonth.toFixed(1)} km</p>
              </div>
            </div>

            {/* Today's Route Summary */}
            {todayRoute && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <Route className="h-4 w-4 text-primary" />
                    Bugungi yo'l
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {todayRoute.total_distance_km?.toFixed(1) || 0} km
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {todayRoute.route_geometry?.length || 0} nuqta
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {todayRoute.places_visited || 0} joy
                  </span>
                </div>
              </div>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="places" className="flex-1">
                  <MapPin className="h-4 w-4 mr-1" />
                  Joylar
                </TabsTrigger>
                <TabsTrigger value="routes" className="flex-1">
                  <Route className="h-4 w-4 mr-1" />
                  Yo'llar
                </TabsTrigger>
              </TabsList>

              {/* Frequent Places */}
              <TabsContent value="places" className="mt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center h-20">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : frequentPlaces.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium">Hali joylar aniqlanmadi</p>
                    <p className="text-xs mt-1">Kuzatishni yoqing va harakatlaning</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {frequentPlaces.map((place) => (
                      <div
                        key={place.id}
                        className="p-3 rounded-xl border bg-background"
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('p-2.5 rounded-xl border', getPlaceColor(place.place_type))}>
                            {getPlaceIcon(place.place_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            {editingPlace === place.id ? (
                              <div className="flex gap-2">
                                <Input
                                  value={newPlaceName}
                                  onChange={(e) => setNewPlaceName(e.target.value)}
                                  placeholder="Joy nomi"
                                  className="h-9"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  className="h-9"
                                  onClick={() => handleSavePlaceName(place.id)}
                                >
                                  Saqlash
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{place.name}</p>
                                  <Badge variant="outline" className="text-[10px] px-1.5">
                                    {Math.round(place.confidence_score * 100)}%
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    ~{place.average_stay_minutes} min
                                  </span>
                                  <span>•</span>
                                  <span>{place.visit_count} tashrif</span>
                                </div>
                                {place.last_visited_at && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {formatDistanceToNow(new Date(place.last_visited_at), { 
                                      addSuffix: true, 
                                      locale: uz 
                                    })}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {editingPlace !== place.id && (
                          <div className="flex items-center gap-2 mt-3 pt-2 border-t">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-8 text-xs"
                              onClick={() => {
                                setEditingPlace(place.id);
                                setNewPlaceName(place.name);
                              }}
                            >
                              <Edit2 className="h-3 w-3 mr-1" />
                              Tahrirlash
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-8 text-xs"
                              onClick={() => onNavigateToPlace?.(place.latitude, place.longitude, place.name)}
                            >
                              <Navigation className="h-3 w-3 mr-1" />
                              Yo'nalish
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-destructive"
                              onClick={() => deletePlace(place.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Daily Routes */}
              <TabsContent value="routes" className="mt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center h-20">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : dailyRoutes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Route className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium">Hali yo'llar saqlanmadi</p>
                    <p className="text-xs mt-1">Kuzatishni yoqing va harakatlaning</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dailyRoutes.map((route) => (
                      <div
                        key={route.id}
                        className="p-3 rounded-xl border bg-background"
                        onClick={() => {
                          onViewRoute?.(route);
                          onOpenChange(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                              <Calendar className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {format(new Date(route.route_date), 'd MMMM, EEEE', { locale: uz })}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3" />
                                  {route.total_distance_km?.toFixed(1) || 0} km
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {route.route_geometry?.length || 0} nuqta
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-9 w-9">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
