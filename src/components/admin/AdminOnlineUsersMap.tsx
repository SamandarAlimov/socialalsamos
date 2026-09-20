import { useMemo, useRef, useState } from 'react';
import { Globe2, LocateFixed, MapPin, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

import { AlsamosMapSurface } from '@/components/map/AlsamosMapSurface';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminOnlineUsers } from '@/hooks/useAdminOnlineUsers';
import type { MapEngineController, MapSceneMarker } from '@/lib/mapEngine';

export function AdminOnlineUsersMap() {
  const { countryStats, totalOnline, isLoading, refetch } = useAdminOnlineUsers();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const controllerRef = useRef<MapEngineController | null>(null);
  const home = { latitude: 41.3775, longitude: 64.5853 };

  const focusCountry = (country: string, lat: number, lng: number) => {
    setSelectedCountry((current) => {
      const next = current === country ? null : country;
      if (next) controllerRef.current?.flyTo([lat, lng], 4, { animate: true, duration: 480 });
      else controllerRef.current?.flyTo([home.latitude, home.longitude], 3, { animate: true, duration: 420 });
      return next;
    });
  };

  const mapMarkers = useMemo<MapSceneMarker[]>(
    () =>
      countryStats.map((stat) => ({
        id: 'country|' + stat.country,
        kind: 'cluster' as const,
        latitude: stat.lat,
        longitude: stat.lng,
        count: Math.max(1, stat.count),
        label: stat.country,
        active: selectedCountry === stat.country,
      })),
    [countryStats, selectedCountry],
  );

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe2 className="h-4 w-4" />
            Real-time foydalanuvchilar xaritasi
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <Skeleton className="h-[460px] w-full rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b bg-muted/10 p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe2 className="h-4 w-4" />
                Real-time foydalanuvchilar xaritasi
              </CardTitle>
              <Badge variant="outline" className="rounded-full text-[11px] font-normal">
                Alsamos Map
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Faol sessiyalar davlatlar kesimida platformaning yagona vector map engine’ida.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1 font-normal">
              <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              {totalOnline} onlayn
            </Badge>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void refetch()}
              className="h-9 w-9 rounded-xl"
              aria-label="Xaritani yangilash"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid min-h-[460px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="relative min-h-[420px] overflow-hidden bg-muted lg:min-h-[460px]">
            <AlsamosMapSurface
              controllerRef={controllerRef}
              center={home}
              referenceCenter={home}
              zoom={3}
              layerId="map"
              engineOverride="vector"
              vectorStyleOverride="https://tiles.openfreemap.org/styles/liberty"
              markers={mapMarkers}
              onMarkerClick={(id) => {
                if (!id.startsWith('country|')) return;
                const country = id.slice('country|'.length);
                const stat = countryStats.find((item) => item.country === country);
                if (stat) focusCountry(stat.country, stat.lat, stat.lng);
              }}
            />

            <div className="absolute right-4 top-4 z-[500] flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-9 w-9 rounded-xl border bg-background/95 shadow-lg backdrop-blur-xl"
                onClick={() => controllerRef.current?.zoomIn()}
                aria-label="Xaritani yaqinlashtirish"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-9 w-9 rounded-xl border bg-background/95 shadow-lg backdrop-blur-xl"
                onClick={() => controllerRef.current?.zoomOut()}
                aria-label="Xaritani uzoqlashtirish"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-9 w-9 rounded-xl border bg-background/95 shadow-lg backdrop-blur-xl"
                onClick={() => {
                  setSelectedCountry(null);
                  controllerRef.current?.flyTo([home.latitude, home.longitude], 3, {
                    animate: true,
                    duration: 420,
                  });
                }}
                aria-label="Xaritani markazga qaytarish"
              >
                <LocateFixed className="h-4 w-4" />
              </Button>
            </div>

            <div className="pointer-events-none absolute bottom-4 left-4 z-[500] max-w-[calc(100%-2rem)] rounded-xl border border-border/60 bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur-xl">
              Alsamos live presence · marker soni shu davlatdagi oxirgi faol sessiyalar.
            </div>
          </div>

          <div className="border-t bg-card lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4" />
                Davlatlar bo‘yicha
              </h3>
              <span className="text-xs text-muted-foreground">{countryStats.length} hudud</span>
            </div>

            <ScrollArea className="h-[360px] lg:h-[415px]">
              <div className="space-y-1 p-2">
                {countryStats.length === 0 ? (
                  <div className="flex min-h-44 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    Hozircha xaritada ko‘rsatish uchun faol hudud yo‘q.
                  </div>
                ) : (
                  countryStats.map((stat, index) => {
                    const active = selectedCountry === stat.country;
                    return (
                      <button
                        key={stat.country}
                        type="button"
                        onClick={() => focusCountry(stat.country, stat.lat, stat.lng)}
                        className={
                          'w-full rounded-xl border px-3 py-3 text-left transition-colors ' +
                          (active
                            ? 'border-foreground/15 bg-muted/70'
                            : 'border-transparent hover:border-border hover:bg-muted/35')
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="w-5 text-[11px] tabular-nums text-muted-foreground">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <span className="truncate text-sm font-semibold">{stat.country}</span>
                            </div>
                          </div>
                          <Badge
                            variant={active ? 'default' : 'secondary'}
                            className="rounded-full tabular-nums"
                          >
                            {stat.count}
                          </Badge>
                        </div>

                        {active && (
                          <div className="mt-3 space-y-2 border-t pt-3">
                            {stat.users.slice(0, 6).map((user) => (
                              <div key={user.id} className="flex items-center gap-2.5">
                                <Avatar className="h-7 w-7 ring-1 ring-border">
                                  <AvatarImage src={user.avatar_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {(user.display_name || user.username || '?')
                                      .slice(0, 1)
                                      .toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium">
                                    {user.display_name || user.username || 'Nomsiz profil'}
                                  </p>
                                  {user.username && (
                                    <p className="truncate text-[11px] text-muted-foreground">
                                      @{user.username}
                                    </p>
                                  )}
                                </div>
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              </div>
                            ))}
                            {stat.users.length > 6 && (
                              <p className="pl-9 text-[11px] text-muted-foreground">
                                +{stat.users.length - 6} boshqa faol foydalanuvchi
                              </p>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
