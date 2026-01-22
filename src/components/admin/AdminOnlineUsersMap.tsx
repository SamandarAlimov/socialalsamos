import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdminOnlineUsers } from '@/hooks/useAdminOnlineUsers';
import { Globe, Users, RefreshCw, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import 'leaflet/dist/leaflet.css';

// Component to handle map updates
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 2);
  }, [center, map]);
  return null;
}

export function AdminOnlineUsersMap() {
  const { countryStats, totalOnline, isLoading, refetch } = useAdminOnlineUsers();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const getMarkerRadius = (count: number) => {
    if (count >= 100) return 30;
    if (count >= 50) return 25;
    if (count >= 20) return 20;
    if (count >= 10) return 15;
    if (count >= 5) return 12;
    return 8;
  };

  const getMarkerColor = (count: number) => {
    if (count >= 50) return 'hsl(var(--destructive))';
    if (count >= 20) return 'hsl(var(--chart-1))';
    if (count >= 10) return 'hsl(var(--chart-2))';
    return 'hsl(var(--primary))';
  };

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
            <MapContainer
              center={[41.3775, 64.5853]}
              zoom={2}
              className="h-full w-full z-0"
              ref={mapRef}
              scrollWheelZoom={true}
              style={{ background: 'hsl(var(--muted))' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              
              {countryStats.map((stat) => (
                <CircleMarker
                  key={stat.country}
                  center={[stat.lat, stat.lng]}
                  radius={getMarkerRadius(stat.count)}
                  pathOptions={{
                    fillColor: getMarkerColor(stat.count),
                    fillOpacity: 0.7,
                    color: 'white',
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => setSelectedCountry(stat.country),
                  }}
                >
                  <Popup>
                    <div className="text-center p-1">
                      <p className="font-semibold">{stat.country}</p>
                      <p className="text-sm">{stat.count} foydalanuvchi onlayn</p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 border shadow-sm z-[1000]">
              <p className="text-xs font-medium mb-2">Foydalanuvchilar soni</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'hsl(var(--destructive))' }} />
                  <span>50+</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-1))' }} />
                  <span>20-49</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-2))' }} />
                  <span>10-19</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                  <span>1-9</span>
                </div>
              </div>
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
