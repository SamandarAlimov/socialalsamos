import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdminOnlineUsers } from '@/hooks/useAdminOnlineUsers';
import { Globe, Users, RefreshCw, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlsamosMapSurface } from '@/components/map/AlsamosMapSurface';
import type { MapSceneMarker } from '@/lib/mapEngine';

export function AdminOnlineUsersMap() {
  const { countryStats, totalOnline, isLoading, refetch } = useAdminOnlineUsers();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const mapMarkers = useMemo<MapSceneMarker[]>(
    () =>
      countryStats.map((stat) => ({
        id: 'country|' + stat.country,
        kind: 'cluster' as const,
        latitude: stat.lat,
        longitude: stat.lng,
        count: Math.max(1, stat.count),
        label: stat.country,
      })),
    [countryStats],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Real-time foydalanuvchilar xaritasi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const selectedStats = countryStats.find(s => s.country === selectedCountry);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Real-time foydalanuvchilar xaritasi
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              {totalOnline} onlayn
            </Badge>
            <Button variant="ghost" size="icon" onClick={refetch} className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
          {/* Map */}
          <div className="lg:col-span-2 h-[400px] relative rounded-bl-lg overflow-hidden">
            <AlsamosMapSurface
              center={{ latitude: 41.3775, longitude: 64.5853 }}
              referenceCenter={{ latitude: 41.3775, longitude: 64.5853 }}
              zoom={2}
              layerId="night"
              markers={mapMarkers}
              onMarkerClick={(id) => {
                if (!id.startsWith('country|')) return;
                setSelectedCountry(id.slice('country|'.length));
              }}
            />

            <div className="absolute bottom-4 left-4 z-[500] rounded-xl border border-border/60 bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur-xl">
              Marker ichidagi son — shu davlatdagi onlayn foydalanuvchilar
            </div>
          </div>

          {/* Country List */}
          <div className="border-l">
            <div className="p-3 border-b bg-muted/30">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Davlatlar bo'yicha
              </h3>
            </div>
            <ScrollArea className="h-[352px]">
              <div className="p-2 space-y-1">
                {countryStats.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Hozircha onlayn foydalanuvchilar yo'q
                  </div>
                ) : (
                  countryStats.map((stat, index) => (
                    <button
                      key={stat.country}
                      onClick={() => setSelectedCountry(selectedCountry === stat.country ? null : stat.country)}
                      className={`w-full p-2 rounded-lg text-left transition-colors ${
                        selectedCountry === stat.country 
                          ? 'bg-primary/10 border border-primary/20' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5">#{index + 1}</span>
                          <span className="font-medium text-sm truncate">{stat.country}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {stat.count}
                        </Badge>
                      </div>

                      {/* Expanded user list */}
                      {selectedCountry === stat.country && (
                        <div className="mt-2 pt-2 border-t space-y-2">
                          {stat.users.slice(0, 5).map(user => (
                            <div key={user.id} className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={user.avatar_url || ''} />
                                <AvatarFallback className="text-xs">
                                  {user.display_name?.[0] || user.username?.[0] || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">
                                  {user.display_name || user.username || 'Unknown'}
                                </p>
                                {user.username && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    @{user.username}
                                  </p>
                                )}
                              </div>
                              <div className="h-2 w-2 rounded-full bg-green-500" />
                            </div>
                          ))}
                          {stat.users.length > 5 && (
                            <p className="text-xs text-muted-foreground text-center">
                              +{stat.users.length - 5} boshqa
                            </p>
                          )}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
