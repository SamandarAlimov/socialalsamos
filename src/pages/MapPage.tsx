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
import { toast } from 'sonner';
import {
  MapPin,
  Navigation,
  Users,
  UserPlus,
  Settings,
  Search,
  Locate,
  Share2,
  Eye,
  EyeOff,
  Footprints,
  Battery,
  Signal,
  SignalLow,
  SignalZero,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Compass,
  Target,
  Layers,
  ZoomIn,
  ZoomOut,
  MoreVertical,
  Clock,
  TrendingUp,
  Activity,
  Globe,
  Lock,
  Unlock,
  Route,
  Car,
  Bike,
  PersonStanding,
  X,
  Home
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';

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
type TransportMode = 'driving' | 'walking' | 'cycling';

// Map controller component
function MapController({ center, zoom }: { center: [number, number] | null; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  
  return null;
}

// Locate button controller
function LocateControl({ onLocate }: { onLocate: () => void }) {
  const map = useMap();
  
  useEffect(() => {
    const control = new L.Control({ position: 'topright' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      div.innerHTML = `
        <a href="#" title="My Location" style="
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border-radius: 4px;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/>
          </svg>
        </a>
      `;
      div.onclick = (e) => {
        e.preventDefault();
        onLocate();
      };
      return div;
    };
    control.addTo(map);
    return () => { map.removeControl(control); };
  }, [map, onLocate]);
  
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
    getDirectionsUrl,
    getGoogleMapsUrl,
    calculateDistance,
  } = useLocation();
  
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
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
  
  // Parse destination from URL params (from chat location share)
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
  
  // Daily step goal
  const DAILY_STEP_GOAL = 10000;
  const stepProgress = Math.min((stepsToday / DAILY_STEP_GOAL) * 100, 100);
  
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
      toast.success('Back online!');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('You are offline. Location will be saved locally.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Start tracking on mount
  useEffect(() => {
    startTracking();
    
    const interval = setInterval(() => {
      if (isOnline) {
        fetchNearbyUsers(nearbyRadius);
        fetchFollowingLocations();
      }
    }, 30000);
    
    return () => {
      stopTracking();
      clearInterval(interval);
    };
  }, [startTracking, stopTracking, fetchNearbyUsers, fetchFollowingLocations, nearbyRadius, isOnline]);
  
  // Set map center when location available
  useEffect(() => {
    if (currentLocation && !mapCenter) {
      setMapCenter([currentLocation.latitude, currentLocation.longitude]);
    }
  }, [currentLocation, mapCenter]);
  
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
      toast.success('Location updated');
    } catch (err) {
      toast.error('Failed to get location');
    }
  }, [getCurrentPosition]);
  
  // Open directions
  const openDirections = useCallback((destLat: number, destLng: number, userName: string, mode: TransportMode = 'driving') => {
    if (!currentLocation) {
      toast.error('Current location not available');
      return;
    }
    
    // Build URL based on mode
    let url = '';
    if (mode === 'driving') {
      url = `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${destLat},${destLng}&travelmode=driving`;
    } else if (mode === 'walking') {
      url = `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${destLat},${destLng}&travelmode=walking`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${destLat},${destLng}&travelmode=bicycling`;
    }
    
    window.open(url, '_blank');
    toast.success(`Opening directions to ${userName}`);
  }, [currentLocation]);
  
  // Set destination for directions
  const setDirectionTo = useCallback((lat: number, lng: number, name: string) => {
    setDestination({ lat, lng, name });
    setShowDirections(true);
    toast.success(`Directions to ${name}`);
  }, []);
  
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
    if (!isOnline) return { icon: SignalZero, color: 'text-destructive', label: 'Offline' };
    if (batteryLevel < 20) return { icon: SignalLow, color: 'text-yellow-500', label: 'Low Battery' };
    return { icon: Signal, color: 'text-green-500', label: 'Connected' };
  };
  
  const connectionStatus = getConnectionQuality();

  // Get tile layer URL based on layer type
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

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "flex flex-col border-r border-border bg-background transition-all duration-300",
        sidebarOpen ? "w-80" : "w-0 overflow-hidden"
      )}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/home')}>
              <Home className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Map
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <connectionStatus.icon className={cn("h-3 w-3", connectionStatus.color)} />
                {connectionStatus.label}
              </p>
            </div>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Map Settings</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                {/* Location Sharing */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isSharing ? (
                      <Eye className="h-5 w-5 text-primary" />
                    ) : (
                      <EyeOff className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">Share Location</p>
                      <p className="text-sm text-muted-foreground">
                        Others can see where you are
                      </p>
                    </div>
                  </div>
                  <Switch checked={isSharing} onCheckedChange={toggleSharing} />
                </div>
                
                {/* Private Mode */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isLocationPrivate ? (
                      <Lock className="h-5 w-5 text-primary" />
                    ) : (
                      <Unlock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">Private Mode</p>
                      <p className="text-sm text-muted-foreground">
                        Only following can see you
                      </p>
                    </div>
                  </div>
                  <Switch checked={isLocationPrivate} onCheckedChange={setIsLocationPrivate} />
                </div>
                
                {/* Show Nearby */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Show Nearby Users</p>
                      <p className="text-sm text-muted-foreground">
                        Within {nearbyRadius}km radius
                      </p>
                    </div>
                  </div>
                  <Switch checked={showNearby} onCheckedChange={setShowNearby} />
                </div>
                
                {/* Show Following */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserPlus className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Show Following</p>
                      <p className="text-sm text-muted-foreground">
                        People you follow
                      </p>
                    </div>
                  </div>
                  <Switch checked={showFollowing} onCheckedChange={setShowFollowing} />
                </div>
                
                {/* Nearby Radius */}
                <div className="space-y-2">
                  <p className="font-medium">Nearby Radius</p>
                  <div className="flex gap-2">
                    {[1, 5, 10, 25, 50].map((r) => (
                      <Button
                        key={r}
                        variant={nearbyRadius === r ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setNearbyRadius(r)}
                      >
                        {r}km
                      </Button>
                    ))}
                  </div>
                </div>
                
                {/* Map Layer */}
                <div className="space-y-2">
                  <p className="font-medium">Map Style</p>
                  <div className="flex gap-2">
                    <Button
                      variant={mapLayer === 'standard' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMapLayer('standard')}
                    >
                      <Globe className="h-4 w-4 mr-1" />
                      Standard
                    </Button>
                    <Button
                      variant={mapLayer === 'satellite' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMapLayer('satellite')}
                    >
                      <Target className="h-4 w-4 mr-1" />
                      Satellite
                    </Button>
                    <Button
                      variant={mapLayer === 'terrain' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMapLayer('terrain')}
                    >
                      <Compass className="h-4 w-4 mr-1" />
                      Terrain
                    </Button>
                  </div>
                </div>
                
                {/* Transport Mode */}
                <div className="space-y-2">
                  <p className="font-medium">Default Transport</p>
                  <div className="flex gap-2">
                    <Button
                      variant={transportMode === 'driving' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTransportMode('driving')}
                    >
                      <Car className="h-4 w-4 mr-1" />
                      Drive
                    </Button>
                    <Button
                      variant={transportMode === 'walking' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTransportMode('walking')}
                    >
                      <PersonStanding className="h-4 w-4 mr-1" />
                      Walk
                    </Button>
                    <Button
                      variant={transportMode === 'cycling' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTransportMode('cycling')}
                    >
                      <Bike className="h-4 w-4 mr-1" />
                      Bike
                    </Button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        
        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        
        {/* Steps Card */}
        <div className="p-3 border-b border-border">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Footprints className="h-5 w-5 text-primary" />
                  <span className="font-medium">Today's Steps</span>
                </div>
                <Badge variant="secondary">{stepsToday.toLocaleString()}</Badge>
              </div>
              <Progress value={stepProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {stepsToday.toLocaleString()} / {DAILY_STEP_GOAL.toLocaleString()} goal
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* Users Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start px-3 pt-2">
            <TabsTrigger value="nearby" className="flex-1">
              <Users className="h-4 w-4 mr-1" />
              Nearby
            </TabsTrigger>
            <TabsTrigger value="following" className="flex-1">
              <UserPlus className="h-4 w-4 mr-1" />
              Following
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">
              <Activity className="h-4 w-4 mr-1" />
              Activity
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="nearby" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-3">
              {filteredNearby.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No nearby users found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredNearby.map((u) => (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setMapCenter([u.latitude, u.longitude]);
                        setSelectedUser(u.user_id);
                      }}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.profile?.avatar_url || ''} />
                          <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        {u.profile?.is_online && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{u.profile?.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {currentLocation && calculateDistance(
                            currentLocation.latitude,
                            currentLocation.longitude,
                            u.latitude,
                            u.longitude
                          ).toFixed(1)}km away
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDirections(u.latitude, u.longitude, u.profile?.display_name || 'User', transportMode);
                        }}
                      >
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
                  <p>No followed users sharing location</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFollowing.map((u) => (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setMapCenter([u.latitude, u.longitude]);
                        setSelectedUser(u.user_id);
                      }}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.profile?.avatar_url || ''} />
                          <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        {u.profile?.is_online && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{u.profile?.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {currentLocation && calculateDistance(
                            currentLocation.latitude,
                            currentLocation.longitude,
                            u.latitude,
                            u.longitude
                          ).toFixed(1)}km away
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDirections(u.latitude, u.longitude, u.profile?.display_name || 'User', transportMode);
                        }}
                      >
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
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Weekly Steps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stepHistory.map((day) => (
                        <div key={day.date} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{day.date}</span>
                          <span className="font-medium">{day.steps.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Battery className="h-4 w-4" />
                      Battery
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Progress value={batteryLevel} className="flex-1" />
                      <span className="text-sm font-medium">{batteryLevel}%</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Toggle Sidebar Button */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute left-[320px] top-1/2 -translate-y-1/2 z-[1000] rounded-l-none"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{ left: sidebarOpen ? '320px' : '0' }}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
      
      {/* Map Container */}
      <div className="flex-1 relative">
        {mapCenter ? (
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
            <MapController center={mapCenter} zoom={zoom} />
            <LocateControl onLocate={centerOnLocation} />
            
            {/* Nearby radius circle */}
            {currentLocation && showNearby && (
              <Circle
                center={[currentLocation.latitude, currentLocation.longitude]}
                radius={nearbyRadius * 1000}
                pathOptions={{ 
                  color: '#3b82f6', 
                  fillColor: '#3b82f6', 
                  fillOpacity: 0.1,
                  weight: 2,
                  dashArray: '5, 5'
                }}
              />
            )}
            
            {/* Current user marker */}
            {currentLocation && (
              <Marker
                position={[currentLocation.latitude, currentLocation.longitude]}
                icon={createUserIcon(profile?.avatar_url || undefined, true)}
              >
                <Popup>
                  <div className="text-center">
                    <Avatar className="h-12 w-12 mx-auto mb-2">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback>{profile?.display_name?.[0] || 'Me'}</AvatarFallback>
                    </Avatar>
                    <p className="font-medium">{profile?.display_name || 'You'}</p>
                    <p className="text-xs text-muted-foreground">Your location</p>
                  </div>
                </Popup>
              </Marker>
            )}
            
            {/* Nearby users */}
            {showNearby && filteredNearby.map((u) => (
              <Marker
                key={u.user_id}
                position={[u.latitude, u.longitude]}
                icon={createUserIcon(u.profile?.avatar_url || undefined, false, u.profile?.is_online)}
              >
                <Popup>
                  <div className="text-center min-w-[150px]">
                    <Avatar className="h-12 w-12 mx-auto mb-2">
                      <AvatarImage src={u.profile?.avatar_url || ''} />
                      <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <p className="font-medium">{u.profile?.display_name}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {currentLocation && calculateDistance(
                        currentLocation.latitude,
                        currentLocation.longitude,
                        u.latitude,
                        u.longitude
                      ).toFixed(1)}km away
                    </p>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => openDirections(u.latitude, u.longitude, u.profile?.display_name || 'User', transportMode)}
                    >
                      <Navigation className="h-4 w-4 mr-1" />
                      Directions
                    </Button>
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {/* Following users */}
            {showFollowing && filteredFollowing.map((u) => (
              <Marker
                key={u.user_id}
                position={[u.latitude, u.longitude]}
                icon={createUserIcon(u.profile?.avatar_url || undefined, false, u.profile?.is_online)}
              >
                <Popup>
                  <div className="text-center min-w-[150px]">
                    <Avatar className="h-12 w-12 mx-auto mb-2">
                      <AvatarImage src={u.profile?.avatar_url || ''} />
                      <AvatarFallback>{u.profile?.display_name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <p className="font-medium">{u.profile?.display_name}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {currentLocation && calculateDistance(
                        currentLocation.latitude,
                        currentLocation.longitude,
                        u.latitude,
                        u.longitude
                      ).toFixed(1)}km away
                    </p>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => openDirections(u.latitude, u.longitude, u.profile?.display_name || 'User', transportMode)}
                    >
                      <Navigation className="h-4 w-4 mr-1" />
                      Directions
                    </Button>
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {/* Destination marker */}
            {destination && (
              <Marker
                position={[destination.lat, destination.lng]}
                icon={destinationIcon}
              >
                <Popup>
                  <div className="text-center min-w-[150px]">
                    <MapPin className="h-8 w-8 mx-auto mb-2 text-destructive" />
                    <p className="font-medium">{destination.name}</p>
                    {currentLocation && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {calculateDistance(
                          currentLocation.latitude,
                          currentLocation.longitude,
                          destination.lat,
                          destination.lng
                        ).toFixed(1)}km away
                      </p>
                    )}
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => openDirections(destination.lat, destination.lng, destination.name, transportMode)}
                      >
                        <Navigation className="h-4 w-4 mr-1" />
                        Go
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDestination(null);
                          setShowDirections(false);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
            
            {/* Route line to destination */}
            {currentLocation && destination && showDirections && (
              <Polyline
                positions={[
                  [currentLocation.latitude, currentLocation.longitude],
                  [destination.lat, destination.lng]
                ]}
                pathOptions={{ 
                  color: '#3b82f6', 
                  weight: 4,
                  dashArray: '10, 10'
                }}
              />
            )}
          </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center bg-muted/20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Getting your location...</p>
              <Button variant="outline" className="mt-4" onClick={centerOnLocation}>
                <Locate className="h-4 w-4 mr-2" />
                Enable Location
              </Button>
            </div>
          </div>
        )}
        
        {/* Destination Bar */}
        {destination && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-background rounded-lg shadow-lg border p-3 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium">{destination.name}</p>
              {currentLocation && (
                <p className="text-xs text-muted-foreground">
                  {calculateDistance(
                    currentLocation.latitude,
                    currentLocation.longitude,
                    destination.lat,
                    destination.lng
                  ).toFixed(1)}km away
                </p>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={transportMode === 'driving' ? 'default' : 'ghost'}
                onClick={() => setTransportMode('driving')}
              >
                <Car className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={transportMode === 'walking' ? 'default' : 'ghost'}
                onClick={() => setTransportMode('walking')}
              >
                <PersonStanding className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={transportMode === 'cycling' ? 'default' : 'ghost'}
                onClick={() => setTransportMode('cycling')}
              >
                <Bike className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() => openDirections(destination.lat, destination.lng, destination.name, transportMode)}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open in Maps
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDestination(null);
                setShowDirections(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="shadow-lg"
            onClick={() => setZoom(Math.min(zoom + 1, 18))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="shadow-lg"
            onClick={() => setZoom(Math.max(zoom - 1, 3))}
          >
            <ZoomOut className="h-4 w-4" />
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