import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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

interface LocationHistoryPanelProps {
  onViewRoute?: (route: DailyRoute) => void;
  onNavigateToPlace?: (lat: number, lng: number, name: string) => void;
  className?: string;
}

export function LocationHistoryPanel({
  onViewRoute,
  onNavigateToPlace,
  className,
}: LocationHistoryPanelProps) {
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

  const handleDeletePlace = async (placeId: string) => {
    await deletePlace(placeId);
  };

  const totalDistanceWeek = getTotalDistance(7);
  const totalDistanceMonth = getTotalDistance(30);

  return (
    <Card className={cn('border-0 shadow-none bg-transparent', className)}>
      <CardHeader className="pb-3 px-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Footprints className="h-5 w-5 text-primary" />
            Joylashuv tarixi
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="px-0 space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground">Haftalik masofa</p>
            <p className="text-lg font-bold text-primary">{totalDistanceWeek.toFixed(1)} km</p>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
            <p className="text-xs text-muted-foreground">Oylik masofa</p>
            <p className="text-lg font-bold text-accent-foreground">{totalDistanceMonth.toFixed(1)} km</p>
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

        {/* Tabs for Places and Routes */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="places" className="flex-1 text-xs">
              <MapPin className="h-3 w-3 mr-1" />
              Joylar
            </TabsTrigger>
            <TabsTrigger value="routes" className="flex-1 text-xs">
              <Route className="h-3 w-3 mr-1" />
              Yo'llar
            </TabsTrigger>
          </TabsList>

          {/* Frequent Places */}
          <TabsContent value="places" className="mt-3">
            <ScrollArea className="h-[250px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : frequentPlaces.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Hali joylar aniqlanmadi</p>
                  <p className="text-xs">Kuzatishni yoqing va harakatlaning</p>
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {frequentPlaces.map((place) => (
                    <div
                      key={place.id}
                      className="p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={cn('p-2 rounded-lg border', getPlaceColor(place.place_type))}>
                            {getPlaceIcon(place.place_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            {editingPlace === place.id ? (
                              <div className="flex gap-1">
                                <Input
                                  value={newPlaceName}
                                  onChange={(e) => setNewPlaceName(e.target.value)}
                                  placeholder="Joy nomi"
                                  className="h-7 text-sm"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => handleSavePlaceName(place.id)}
                                >
                                  Saqlash
                                </Button>
                              </div>
                            ) : (
                              <>
                                <p className="font-medium text-sm truncate">{place.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
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
                        <div className="flex items-center gap-1">
                          <Badge 
                            variant="outline" 
                            className="text-[10px] px-1.5"
                          >
                            {Math.round(place.confidence_score * 100)}%
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingPlace(place.id);
                              setNewPlaceName(place.name);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeletePlace(place.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => onNavigateToPlace?.(place.latitude, place.longitude, place.name)}
                          >
                            <Navigation className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Daily Routes */}
          <TabsContent value="routes" className="mt-3">
            <ScrollArea className="h-[250px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : dailyRoutes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Route className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Hali yo'llar saqlanmadi</p>
                  <p className="text-xs">Kuzatishni yoqing va harakatlaning</p>
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {dailyRoutes.map((route) => (
                    <div
                      key={route.id}
                      className="p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => onViewRoute?.(route)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {format(new Date(route.route_date), 'd MMMM', { locale: uz })}
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
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
