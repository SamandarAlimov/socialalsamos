import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from '@/hooks/useLocation';
import { useMapPresence } from '@/hooks/useMapPresence';
import { toast } from 'sonner';
import {
  MapPin,
  Navigation,
  Users,
  UserPlus,
  Settings,
  Search,
  Locate,
  Eye,
  EyeOff,
  Battery,
  Signal,
  SignalLow,
  SignalZero,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Compass,
  Target,
  Globe,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  X,
  Layers,
  Menu,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { StepTrackingCharts } from '@/components/map/StepTrackingCharts';
import { TransportModePicker, TransportQuickBar, type TransportMode } from '@/components/map/TransportModePicker';
import { MapQuickActions, MapQuickActionsGrid } from '@/components/map/MapQuickActions';

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom user marker
const createUserIcon = (avatarUrl?: string, isCurrentUser = false, isOnline = false) => {
  const color = isCurrentUser ? '#3b82f6' : isOnline ? '#22c55e' : '#6b7280';
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 3px solid ${color};
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        ${isCurrentUser ? 'animation: pulse 2s infinite;' : ''}
      ">
        ${avatarUrl 
          ? `<img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />`
          : `<div style="width: 32px; height: 32px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">?</div>`
        }
      </div>
      ${isCurrentUser ? '<div style="position: absolute; inset: -8px; border-radius: 50%; border: 2px solid #3b82f6; animation: ping 1.5s infinite;"></div>' : ''}
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

// Destination marker
const destinationIcon = L.divIcon({
  className: 'destination-marker',
  html: `
    <div style="
      width: 32px;
      height: 32px;
      background: #ef4444;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    "></div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

type MapLayer = 'standard' | 'satellite' | 'terrain';

// Map event handler component
function MapEventHandler({ 
  center, 
  zoom 
}: { 
  center: [number, number]; 
  zoom: number;
}) {
  const map = useMap();
  const hasSetInitialView = useRef(false);
  
  useEffect(() => {
    if (center && !hasSetInitialView.current) {
      map.setView(center, zoom);
      hasSetInitialView.current = true;
    }
  }, [center, zoom, map]);
  
  useEffect(() => {
    if (center && hasSetInitialView.current) {
      map.flyTo(center, zoom, { duration: 0.5 });
    }
  }, [center, map, zoom]);
  
  return null;
}

export default function MapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const {
    currentLocation,
    isTracking,
    isSharing,
    error,
    nearbyUsers,
    followingLocations,
    stepsToday,
    stepHistory,
    getCurrentPosition,
    startTracking,
    stopTracking,
    toggleSharing,
    fetchNearbyUsers,
    fetchFollowingLocations,
    calculateDistance,
  } = useLocation();
  
  const { usersOnMap } = useMapPresence(user?.id || null, profile);
  
  const DEFAULT_CENTER: [number, number] = [41.2995, 69.2401];
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  const [zoom, setZoom] = useState(15);
  const [mapLayer, setMapLayer] = useState<MapLayer>('standard');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNearby, setShowNearby] = useState(true);
  const [showFollowing, setShowFollowing] = useState(true);
  const [nearbyRadius, setNearbyRadius] = useState(5);
  const [isLocationPrivate, setIsLocationPrivate] = useState(false);
  const [transportMode, setTransportMode] = useState<TransportMode>('driving');
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeTab, setActiveTab] = useState<'nearby' | 'following' | 'activity'>('nearby');
  const [destination, setDestination] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [showDirections, setShowDirections] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  
  // Parse destination from URL params
  useEffect(() => {
    const destLat = searchParams.get('destLat');
    const destLng = searchParams.get('destLng');
    const destName = searchParams.get('destName');
    
    if (destLat && destLng) {
      setDestination({
        lat: parseFloat(destLat),
        lng: parseFloat(destLng),
        name: destName || 'Shared Location'
      });
      setShowDirections(true);
    }
  }, [searchParams]);
  
  const DAILY_STEP_GOAL = 10000;
  
  // Battery API
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      });
    }
  }, []);
  
  // Online/Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Internetga ulandi!');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Internet yo\'q. Joylashuv lokal saqlanadi.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Enhanced permission check and location tracking
  useEffect(() => {
    const checkAndStartTracking = async () => {
      setIsCheckingPermission(true);
      
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        setHasLocationPermission(false);
        setIsCheckingPermission(false);
        return;
      }
      
      // First check the permission status via Permissions API
      try {
        if ('permissions' in navigator) {
          const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
          
          if (permissionStatus.state === 'granted') {
            setHasLocationPermission(true);
            // Get location immediately
            const loc = await getCurrentPosition();
            setMapCenter([loc.latitude, loc.longitude]);
            startTracking();
          } else if (permissionStatus.state === 'prompt') {
            // Will prompt - try to get position
            try {
              const loc = await getCurrentPosition();
              setMapCenter([loc.latitude, loc.longitude]);
              setHasLocationPermission(true);
              startTracking();
            } catch (err) {
              setHasLocationPermission(false);
            }
          } else {
            setHasLocationPermission(false);
          }
          
          // Listen for permission changes
          permissionStatus.addEventListener('change', () => {
            if (permissionStatus.state === 'granted') {
              setHasLocationPermission(true);
              startTracking();
            } else {
              setHasLocationPermission(false);
            }
          });
        } else {
          // Fallback for browsers without Permissions API
          try {
            const loc = await getCurrentPosition();
            setMapCenter([loc.latitude, loc.longitude]);
            setHasLocationPermission(true);
            startTracking();
          } catch (err) {
            setHasLocationPermission(false);
          }
        }
      } catch (err) {
        console.error('Permission check failed:', err);
        // Fallback: try to get position directly
        try {
          const loc = await getCurrentPosition();
          setMapCenter([loc.latitude, loc.longitude]);
          setHasLocationPermission(true);
          startTracking();
        } catch (locErr) {
          setHasLocationPermission(false);
        }
      }
      
      setIsCheckingPermission(false);
    };
    
    checkAndStartTracking();
    
    const interval = setInterval(() => {
      if (isOnline && currentLocation) {
        fetchNearbyUsers(nearbyRadius);
        fetchFollowingLocations();
      }
    }, 30000);
    
    return () => {
      stopTracking();
      clearInterval(interval);
    };
  }, []);
  
  // Update map center when location becomes available
  useEffect(() => {
    if (currentLocation) {
      setMapCenter([currentLocation.latitude, currentLocation.longitude]);
      if (!hasLocationPermission) {
        setHasLocationPermission(true);
      }
    }
  }, [currentLocation]);
  
  // Initial fetch
  useEffect(() => {
    if (currentLocation && isOnline) {
      fetchNearbyUsers(nearbyRadius);
      fetchFollowingLocations();
    }
  }, [currentLocation, fetchNearbyUsers, fetchFollowingLocations, nearbyRadius, isOnline]);
  
  // Center map on current location
  const centerOnLocation = useCallback(async () => {
    try {
      const loc = await getCurrentPosition();
      setMapCenter([loc.latitude, loc.longitude]);
      setHasLocationPermission(true);
      toast.success('Joylashuv yangilandi');
    } catch (err: any) {
      if (err.code === 1) {
        toast.error('Joylashuv ruxsati berilmagan');
        setHasLocationPermission(false);
      } else if (err.code === 2) {
        toast.error('Joylashuvni aniqlab bo\'lmadi');
      } else if (err.code === 3) {
        toast.error('Vaqt tugadi, qayta urinib ko\'ring');
      } else {
        toast.error('Joylashuvni olishda xatolik');
      }
    }
  }, [getCurrentPosition]);
  
  // Request location permission
  const requestLocationPermission = useCallback(async () => {
    try {
      const loc = await getCurrentPosition();
      setMapCenter([loc.latitude, loc.longitude]);
      setHasLocationPermission(true);
      startTracking();
      toast.success('Joylashuv yoqildi!');
    } catch (err: any) {
      toast.error('Joylashuv ruxsatini bering');
    }
  }, [getCurrentPosition, startTracking]);
  
  // Open directions in external app
  const openDirections = useCallback((destLat: number, destLng: number, userName: string, mode: TransportMode = 'driving') => {
    if (!currentLocation) {
      toast.error('Joylashuv mavjud emas');
      return;
    }
    
    let travelMode = 'driving';
    if (mode === 'walking') travelMode = 'walking';
    else if (mode === 'cycling') travelMode = 'bicycling';
    else if (mode === 'transit' || mode === 'metro') travelMode = 'transit';
    
    const url = `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${destLat},${destLng}&travelmode=${travelMode}`;
    window.open(url, '_blank');
    toast.success(`${userName} ga yo'nalish`);
  }, [currentLocation]);
  
  // Filter users by search
  const filteredNearby = nearbyUsers.filter((u) =>
    u.profile?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.profile?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredFollowing = followingLocations.filter((u) =>
    u.profile?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.profile?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Get connection quality indicator
  const getConnectionQuality = () => {
    if (!isOnline) return { icon: SignalZero, color: 'text-destructive', label: 'Oflayn' };
    if (batteryLevel < 20) return { icon: SignalLow, color: 'text-yellow-500', label: 'Past batareya' };
    return { icon: Signal, color: 'text-green-500', label: 'Ulangan' };
  };
  
  const connectionStatus = getConnectionQuality();

  const getTileUrl = () => {
    switch (mapLayer) {
      case 'satellite':
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      case 'terrain':
        return 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      default:
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
  };

  // Determine if we should show permission prompt
  const showPermissionPrompt = hasLocationPermission === false && !currentLocation && !isCheckingPermission;

  return (
    <div className="h-full min-h-[calc(100vh-3.5rem-5rem)] md:min-h-screen flex flex-col md:flex-row bg-background relative">
      {/* Mobile Header - Fixed at top for mobile only */}
      <div className="md:hidden sticky top-0 left-0 right-0 z-[100] flex items-center justify-between px-3 py-2 border-b border-border bg-background/95 backdrop-blur-lg safe-area-top">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Xarita</h1>
          <Badge variant="secondary" className="text-[10px]">
            <connectionStatus.icon className={cn("h-3 w-3 mr-1", connectionStatus.color)} />
            {connectionStatus.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={centerOnLocation}>
            <Locate className="h-5 w-5" />
          </Button>
          <Sheet open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] z-[1002]">
              <SheetHeader>
                <SheetTitle>Sozlamalar</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isSharing ? <Eye className="h-5 w-5 text-primary" /> : <EyeOff className="h-5 w-5 text-muted-foreground" />}
                    <div>
                      <p className="font-medium">Joylashuvni ulashish</p>
                      <p className="text-sm text-muted-foreground">Boshqalar sizni ko'radi</p>
                    </div>
                  </div>
                  <Switch checked={isSharing} onCheckedChange={toggleSharing} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isLocationPrivate ? <Lock className="h-5 w-5 text-primary" /> : <Unlock className="h-5 w-5 text-muted-foreground" />}
                    <div>
                      <p className="font-medium">Maxfiy rejim</p>
                      <p className="text-sm text-muted-foreground">Faqat do'stlar ko'radi</p>
                    </div>
                  </div>
                  <Switch checked={isLocationPrivate} onCheckedChange={setIsLocationPrivate} />
                </div>
                <TransportModePicker selected={transportMode} onSelect={setTransportMode} />
                <div className="space-y-2">
                  <p className="font-medium">Xarita turi</p>
                  <div className="flex gap-2">
                    <Button variant={mapLayer === 'standard' ? 'default' : 'outline'} size="sm" onClick={() => setMapLayer('standard')}>
                      <Globe className="h-4 w-4 mr-1" /> Oddiy
                    </Button>
                    <Button variant={mapLayer === 'satellite' ? 'default' : 'outline'} size="sm" onClick={() => setMapLayer('satellite')}>
                      <Target className="h-4 w-4 mr-1" /> Sputnik
                    </Button>
                    <Button variant={mapLayer === 'terrain' ? 'default' : 'outline'} size="sm" onClick={() => setMapLayer('terrain')}>
                      <Compass className="h-4 w-4 mr-1" /> Yer
                    </Button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl z-[1002]">
              <SheetHeader className="pb-2">
                <SheetTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Odamlar & Statistika
                </SheetTitle>
              </SheetHeader>
              
              {/* Quick Actions */}
              <MapQuickActionsGrid onSearch={() => {}} currentLocation={currentLocation} />
              
              <Tabs defaultValue="nearby" className="flex-1">
                <TabsList className="w-full">
                  <TabsTrigger value="nearby" className="flex-1">Yaqinda</TabsTrigger>
                  <TabsTrigger value="following" className="flex-1">Kuzatuvlar</TabsTrigger>
                  <TabsTrigger value="activity" className="flex-1">Statistika</TabsTrigger>
                </TabsList>
                
                <TabsContent value="nearby" className="mt-2">
                  <ScrollArea className="h-[40vh]">
                    {filteredNearby.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Yaqinda hech kim yo'q</p>
                      </div>
                    ) : (
                      <div className="space-y-2 pr-4">
                        {filteredNearby.map((u) => (
                          <div
                            key={u.user_id}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer"
                            onClick={() => { setMapCenter([u.latitude, u.longitude]); setMobileMenuOpen(false); }}
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={u.profile?.avatar_url || ''} />
                              <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{u.profile?.display_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {currentLocation && calculateDistance(currentLocation.latitude, currentLocation.longitude, u.latitude, u.longitude).toFixed(1)}km
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi', transportMode); }}>
                              <Navigation className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="following" className="mt-2">
                  <ScrollArea className="h-[40vh]">
                    {filteredFollowing.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <UserPlus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Kuzatuvlar joylashuvni ulashmayapti</p>
                      </div>
                    ) : (
                      <div className="space-y-2 pr-4">
                        {filteredFollowing.map((u) => (
                          <div
                            key={u.user_id}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer"
                            onClick={() => { setMapCenter([u.latitude, u.longitude]); setMobileMenuOpen(false); }}
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={u.profile?.avatar_url || ''} />
                              <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{u.profile?.display_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {currentLocation && calculateDistance(currentLocation.latitude, currentLocation.longitude, u.latitude, u.longitude).toFixed(1)}km
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi', transportMode); }}>
                              <Navigation className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="activity" className="mt-2">
                  <ScrollArea className="h-[40vh]">
                    <StepTrackingCharts stepsToday={stepsToday} stepHistory={stepHistory} dailyGoal={DAILY_STEP_GOAL} />
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={cn(
        "hidden md:flex flex-col border-r border-border bg-background transition-all duration-300",
        sidebarOpen ? "w-80" : "w-0 overflow-hidden"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Xarita
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <connectionStatus.icon className={cn("h-3 w-3", connectionStatus.color)} />
              {connectionStatus.label}
            </p>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Xarita sozlamalari</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isSharing ? <Eye className="h-5 w-5 text-primary" /> : <EyeOff className="h-5 w-5 text-muted-foreground" />}
                    <div>
                      <p className="font-medium">Joylashuvni ulashish</p>
                      <p className="text-sm text-muted-foreground">Boshqalar sizni ko'radi</p>
                    </div>
                  </div>
                  <Switch checked={isSharing} onCheckedChange={toggleSharing} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isLocationPrivate ? <Lock className="h-5 w-5 text-primary" /> : <Unlock className="h-5 w-5 text-muted-foreground" />}
                    <div>
                      <p className="font-medium">Maxfiy rejim</p>
                      <p className="text-sm text-muted-foreground">Faqat kuzatuvlar ko'radi</p>
                    </div>
                  </div>
                  <Switch checked={isLocationPrivate} onCheckedChange={setIsLocationPrivate} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Yaqindagilarni ko'rsatish</p>
                      <p className="text-sm text-muted-foreground">{nearbyRadius}km radiusda</p>
                    </div>
                  </div>
                  <Switch checked={showNearby} onCheckedChange={setShowNearby} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserPlus className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Kuzatuvlarni ko'rsatish</p>
                    </div>
                  </div>
                  <Switch checked={showFollowing} onCheckedChange={setShowFollowing} />
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Qidiruv radiusi</p>
                  <div className="flex gap-2">
                    {[1, 5, 10, 25, 50].map((r) => (
                      <Button key={r} variant={nearbyRadius === r ? 'default' : 'outline'} size="sm" onClick={() => setNearbyRadius(r)}>
                        {r}km
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Xarita turi</p>
                  <div className="flex gap-2">
                    <Button variant={mapLayer === 'standard' ? 'default' : 'outline'} size="sm" onClick={() => setMapLayer('standard')}>
                      <Globe className="h-4 w-4 mr-1" /> Oddiy
                    </Button>
                    <Button variant={mapLayer === 'satellite' ? 'default' : 'outline'} size="sm" onClick={() => setMapLayer('satellite')}>
                      <Target className="h-4 w-4 mr-1" /> Sputnik
                    </Button>
                    <Button variant={mapLayer === 'terrain' ? 'default' : 'outline'} size="sm" onClick={() => setMapLayer('terrain')}>
                      <Compass className="h-4 w-4 mr-1" /> Yer
                    </Button>
                  </div>
                </div>
                <TransportModePicker selected={transportMode} onSelect={setTransportMode} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Qidirish..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
        </div>
        
        {/* Quick Actions */}
        <MapQuickActions onSearch={() => {}} currentLocation={currentLocation} />
        
        {usersOnMap.length > 0 && (
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Hozir ko'rayotganlar</span>
              <Badge variant="secondary" className="ml-auto">{usersOnMap.length}</Badge>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {usersOnMap.slice(0, 8).map((presenceUser) => (
                <div key={presenceUser.user_id} className="relative group shrink-0" title={presenceUser.display_name || presenceUser.username || 'Foydalanuvchi'}>
                  <Avatar className="h-8 w-8 border-2 border-primary ring-2 ring-primary/20">
                    <AvatarImage src={presenceUser.avatar_url || ''} />
                    <AvatarFallback className="text-xs">{presenceUser.display_name?.[0] || presenceUser.username?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                </div>
              ))}
              {usersOnMap.length > 8 && (
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium">+{usersOnMap.length - 8}</span>
                </div>
              )}
            </div>
          </div>
        )}
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start px-3 pt-2">
            <TabsTrigger value="nearby" className="flex-1"><Users className="h-4 w-4 mr-1" />Yaqinda</TabsTrigger>
            <TabsTrigger value="following" className="flex-1"><UserPlus className="h-4 w-4 mr-1" />Kuzatuvlar</TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">Statistika</TabsTrigger>
          </TabsList>
          
          <TabsContent value="nearby" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-3">
              {filteredNearby.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Yaqinda hech kim topilmadi</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredNearby.map((u) => (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => { setMapCenter([u.latitude, u.longitude]); setSelectedUser(u.user_id); }}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.profile?.avatar_url || ''} />
                          <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        {u.profile?.is_online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{u.profile?.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {currentLocation && calculateDistance(currentLocation.latitude, currentLocation.longitude, u.latitude, u.longitude).toFixed(1)}km uzoqlikda
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi', transportMode); }}>
                        <Navigation className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="following" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-3">
              {filteredFollowing.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <UserPlus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Kuzatuvlar joylashuvni ulashmayapti</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFollowing.map((u) => (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => { setMapCenter([u.latitude, u.longitude]); setSelectedUser(u.user_id); }}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.profile?.avatar_url || ''} />
                          <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        {u.profile?.is_online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{u.profile?.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {currentLocation && calculateDistance(currentLocation.latitude, currentLocation.longitude, u.latitude, u.longitude).toFixed(1)}km uzoqlikda
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi', transportMode); }}>
                        <Navigation className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="activity" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-3">
              <StepTrackingCharts stepsToday={stepsToday} stepHistory={stepHistory} dailyGoal={DAILY_STEP_GOAL} />
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Battery className="h-4 w-4" />Batareya</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Progress value={batteryLevel} className="flex-1" />
                    <span className="text-sm font-medium">{batteryLevel}%</span>
                  </div>
                </CardContent>
              </Card>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
      
      <Button
        variant="secondary"
        size="icon"
        className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-[50] rounded-l-none"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{ left: sidebarOpen ? '320px' : '0' }}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
      
      {/* Map Container */}
      <div className="flex-1 relative min-h-[400px] md:h-full">
        <MapContainer
          center={mapCenter}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url={getTileUrl()}
          />
          <MapEventHandler center={mapCenter} zoom={zoom} />
          
          {currentLocation && showNearby && (
            <Circle
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={nearbyRadius * 1000}
              pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 2, dashArray: '5, 5' }}
            />
          )}
          
          {currentLocation && (
            <Marker position={[currentLocation.latitude, currentLocation.longitude]} icon={createUserIcon(profile?.avatar_url || undefined, true)}>
              <Popup>
                <div className="text-center">
                  <Avatar className="h-12 w-12 mx-auto mb-2">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback>{profile?.display_name?.[0] || 'Men'}</AvatarFallback>
                  </Avatar>
                  <p className="font-medium">{profile?.display_name || 'Siz'}</p>
                  <p className="text-xs text-muted-foreground">Sizning joylashuvingiz</p>
                </div>
              </Popup>
            </Marker>
          )}
          
          {showNearby && filteredNearby.map((u) => (
            <Marker key={u.user_id} position={[u.latitude, u.longitude]} icon={createUserIcon(u.profile?.avatar_url || undefined, false, u.profile?.is_online)}>
              <Popup>
                <div className="text-center min-w-[150px]">
                  <Avatar className="h-12 w-12 mx-auto mb-2">
                    <AvatarImage src={u.profile?.avatar_url || ''} />
                    <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <p className="font-medium">{u.profile?.display_name}</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {currentLocation && calculateDistance(currentLocation.latitude, currentLocation.longitude, u.latitude, u.longitude).toFixed(1)}km uzoqlikda
                  </p>
                  <Button size="sm" className="w-full" onClick={() => openDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi', transportMode)}>
                    <Navigation className="h-4 w-4 mr-1" /> Yo'nalish
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}
          
          {showFollowing && filteredFollowing.map((u) => (
            <Marker key={u.user_id} position={[u.latitude, u.longitude]} icon={createUserIcon(u.profile?.avatar_url || undefined, false, u.profile?.is_online)}>
              <Popup>
                <div className="text-center min-w-[150px]">
                  <Avatar className="h-12 w-12 mx-auto mb-2">
                    <AvatarImage src={u.profile?.avatar_url || ''} />
                    <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <p className="font-medium">{u.profile?.display_name}</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {currentLocation && calculateDistance(currentLocation.latitude, currentLocation.longitude, u.latitude, u.longitude).toFixed(1)}km uzoqlikda
                  </p>
                  <Button size="sm" className="w-full" onClick={() => openDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi', transportMode)}>
                    <Navigation className="h-4 w-4 mr-1" /> Yo'nalish
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}
          
          {destination && (
            <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
              <Popup>
                <div className="text-center min-w-[150px]">
                  <MapPin className="h-8 w-8 mx-auto mb-2 text-destructive" />
                  <p className="font-medium">{destination.name}</p>
                  {currentLocation && (
                    <p className="text-xs text-muted-foreground mb-2">{calculateDistance(currentLocation.latitude, currentLocation.longitude, destination.lat, destination.lng).toFixed(1)}km uzoqlikda</p>
                  )}
                  <div className="flex gap-1">
                    <Button size="sm" className="flex-1" onClick={() => openDirections(destination.lat, destination.lng, destination.name, transportMode)}>
                      <Navigation className="h-4 w-4 mr-1" /> Borish
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setDestination(null); setShowDirections(false); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
          
          {currentLocation && destination && showDirections && (
            <Polyline positions={[[currentLocation.latitude, currentLocation.longitude], [destination.lat, destination.lng]]} pathOptions={{ color: '#3b82f6', weight: 4, dashArray: '10, 10' }} />
          )}
        </MapContainer>
        
        {/* Location permission prompt overlay */}
        {showPermissionPrompt && (
          <div className="absolute inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="text-center p-6 bg-card rounded-xl shadow-lg border max-w-sm w-full">
              <div className="p-4 rounded-full bg-primary/10 w-fit mx-auto mb-4">
                <MapPin className="h-10 w-10 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Joylashuvni yoqing</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Xaritada o'z joylashuvingizni ko'rish va yaqindagi odamlarni topish uchun joylashuv ruxsatini bering.
              </p>
              <Button onClick={requestLocationPermission} className="w-full" size="lg">
                <Locate className="h-5 w-5 mr-2" />
                Joylashuvni yoqish
              </Button>
            </div>
          </div>
        )}
        
        {/* Destination Bar */}
        {destination && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[50] bg-background/95 backdrop-blur-lg rounded-xl shadow-lg border p-3 flex items-center gap-3 max-w-[90%]">
            <MapPin className="h-5 w-5 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate">{destination.name}</p>
              {currentLocation && (
                <p className="text-xs text-muted-foreground">{calculateDistance(currentLocation.latitude, currentLocation.longitude, destination.lat, destination.lng).toFixed(1)}km uzoqlikda</p>
              )}
            </div>
            <TransportQuickBar selected={transportMode} onSelect={setTransportMode} />
            <Button size="sm" onClick={() => openDirections(destination.lat, destination.lng, destination.name, transportMode)}>
              <ExternalLink className="h-4 w-4 mr-1" /> Ochish
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDestination(null); setShowDirections(false); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {/* Map Controls */}
        <div className="absolute bottom-20 md:bottom-4 right-4 z-[50] flex flex-col gap-1">
          <Button variant="secondary" size="icon" className="shadow-lg" onClick={centerOnLocation}>
            <Locate className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" className="shadow-lg" onClick={() => setZoom(Math.min(zoom + 1, 18))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" className="shadow-lg" onClick={() => setZoom(Math.max(zoom - 1, 3))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Layer switcher */}
        <div className="absolute top-2 right-2 z-[50]">
          <Button variant="secondary" size="icon" className="shadow-lg" onClick={() => {
            const layers: MapLayer[] = ['standard', 'satellite', 'terrain'];
            const currentIndex = layers.indexOf(mapLayer);
            setMapLayer(layers[(currentIndex + 1) % layers.length]);
          }}>
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Global styles for marker animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
        .destination-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
