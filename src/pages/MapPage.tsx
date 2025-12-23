import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  PersonStanding
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

type MapLayer = 'standard' | 'satellite' | 'terrain';
type TransportMode = 'driving' | 'walking' | 'cycling';

export default function MapPage() {
  const navigate = useNavigate();
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
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
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
  const [offlineLocations, setOfflineLocations] = useState<any[]>([]);
  const [zoom, setZoom] = useState(15);
  const [activeTab, setActiveTab] = useState<'nearby' | 'following' | 'activity'>('nearby');
  
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
      // Sync offline locations
      if (offlineLocations.length > 0) {
        // Would sync to backend here
        setOfflineLocations([]);
      }
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
  }, [offlineLocations]);
  
  // Start tracking on mount
  useEffect(() => {
    startTracking();
    
    // Fetch users periodically
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
      await getCurrentPosition();
      toast.success('Location updated');
    } catch (err) {
      toast.error('Failed to get location');
    }
  }, [getCurrentPosition]);
  
  // Open directions
  const openDirections = useCallback((destLat: number, destLng: number, userName: string) => {
    const url = getDirectionsUrl(destLat, destLng);
    if (url) {
      window.open(url, '_blank');
      toast.success(`Opening directions to ${userName}`);
    } else {
      toast.error('Current location not available');
    }
  }, [getDirectionsUrl]);
  
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
    return { icon: Signal, color: 'text-success', label: 'Connected' };
  };
  
  const connectionStatus = getConnectionQuality();
  
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
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
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={centerOnLocation}>
            <Locate className="h-5 w-5" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Layers className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setMapLayer('standard')}>
                <Globe className="h-4 w-4 mr-2" />
                Standard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMapLayer('satellite')}>
                <Target className="h-4 w-4 mr-2" />
                Satellite
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMapLayer('terrain')}>
                <Compass className="h-4 w-4 mr-2" />
                Terrain
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
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
      </div>
      
      {/* Map Container */}
      <div className="flex-1 relative">
        {/* Map Placeholder - In production, integrate with Mapbox/Google Maps */}
        <div 
          ref={mapContainerRef}
          className={cn(
            "absolute inset-0 bg-gradient-to-br",
            mapLayer === 'standard' && "from-blue-100 to-green-100 dark:from-blue-950 dark:to-green-950",
            mapLayer === 'satellite' && "from-gray-800 to-gray-900",
            mapLayer === 'terrain' && "from-amber-100 to-green-200 dark:from-amber-950 dark:to-green-900"
          )}
        >
          {/* Simulated map with users */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Current user marker */}
            {currentLocation && (
              <div className="absolute z-20" style={{ 
                left: '50%', 
                top: '50%',
                transform: 'translate(-50%, -50%)'
              }}>
                <div className="relative">
                  <div className="absolute -inset-4 bg-primary/20 rounded-full animate-ping" />
                  <div className="relative w-12 h-12 rounded-full border-4 border-primary bg-primary/20 flex items-center justify-center">
                    <Navigation className="h-6 w-6 text-primary" />
                  </div>
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap bg-background/90 px-2 py-0.5 rounded">
                    You
                  </span>
                </div>
              </div>
            )}
            
            {/* Nearby users markers */}
            {showNearby && filteredNearby.map((user, i) => {
              const angle = (i / filteredNearby.length) * Math.PI * 2;
              const distance = 80 + Math.random() * 60;
              const x = Math.cos(angle) * distance;
              const y = Math.sin(angle) * distance;
              
              return (
                <div
                  key={user.user_id}
                  className="absolute z-10 cursor-pointer transition-transform hover:scale-110"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={() => setSelectedUser(user.user_id)}
                >
                  <div className="relative group">
                    <Avatar className="h-10 w-10 border-2 border-background shadow-lg">
                      <AvatarImage src={user.profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {user.profile?.display_name?.[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                    {user.profile?.is_online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                    )}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-background/95 backdrop-blur-sm rounded-lg px-2 py-1 shadow-lg border border-border whitespace-nowrap">
                        <p className="text-xs font-medium">{user.profile?.display_name}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Following users markers */}
            {showFollowing && filteredFollowing.map((user, i) => {
              const angle = ((i + 5) / (filteredFollowing.length + 5)) * Math.PI * 2;
              const distance = 120 + Math.random() * 80;
              const x = Math.cos(angle) * distance;
              const y = Math.sin(angle) * distance;
              
              return (
                <div
                  key={user.user_id}
                  className="absolute z-10 cursor-pointer transition-transform hover:scale-110"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={() => setSelectedUser(user.user_id)}
                >
                  <div className="relative group">
                    <Avatar className="h-10 w-10 border-2 border-primary shadow-lg">
                      <AvatarImage src={user.profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {user.profile?.display_name?.[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                    {user.profile?.is_online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                    )}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-background/95 backdrop-blur-sm rounded-lg px-2 py-1 shadow-lg border border-border whitespace-nowrap">
                        <p className="text-xs font-medium">{user.profile?.display_name}</p>
                        <p className="text-xs text-muted-foreground">Following</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Zoom controls */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
            <Button 
              variant="secondary" 
              size="icon" 
              className="shadow-lg"
              onClick={() => setZoom((z) => Math.min(z + 1, 20))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button 
              variant="secondary" 
              size="icon" 
              className="shadow-lg"
              onClick={() => setZoom((z) => Math.max(z - 1, 1))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Location error */}
          {error && (
            <div className="absolute top-4 left-4 right-4 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          
          {/* Offline indicator */}
          {!isOnline && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-yellow-950 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
              <SignalZero className="h-4 w-4" />
              Offline Mode - Locations saved locally
            </div>
          )}
        </div>
        
        {/* Bottom Panel */}
        <div className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border rounded-t-3xl max-h-[50vh] overflow-hidden">
          {/* Activity Summary Card */}
          <div className="p-4 border-b border-border">
            <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                      <Footprints className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stepsToday.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">
                        steps today • {Math.round(stepsToday * 0.7)}m
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{Math.round(stepProgress)}%</p>
                    <p className="text-xs text-muted-foreground">of {DAILY_STEP_GOAL.toLocaleString()}</p>
                  </div>
                </div>
                <Progress value={stepProgress} className="mt-3 h-2" />
              </CardContent>
            </Card>
          </div>
          
          {/* Search */}
          <div className="px-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search people..."
                className="pl-10"
              />
            </div>
          </div>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid grid-cols-3 mx-4">
              <TabsTrigger value="nearby" className="gap-1">
                <Users className="h-4 w-4" />
                Nearby
                {filteredNearby.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {filteredNearby.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="following" className="gap-1">
                <UserPlus className="h-4 w-4" />
                Following
                {filteredFollowing.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {filteredFollowing.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1">
                <Activity className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>
            
            <ScrollArea className="h-[200px]">
              {/* Nearby Users */}
              <TabsContent value="nearby" className="p-4 space-y-2 mt-0">
                {filteredNearby.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No nearby users found</p>
                    <p className="text-sm">Try increasing the radius</p>
                  </div>
                ) : (
                  filteredNearby.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.profile?.avatar_url || ''} />
                        <AvatarFallback>
                          {user.profile?.display_name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {user.profile?.display_name}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {user.profile?.is_online ? 'Online now' : 'Last seen recently'}
                        </p>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openDirections(user.latitude, user.longitude, user.profile?.display_name || 'User')}
                      >
                        <Route className="h-4 w-4 mr-1" />
                        Directions
                      </Button>
                    </div>
                  ))
                )}
              </TabsContent>
              
              {/* Following Users */}
              <TabsContent value="following" className="p-4 space-y-2 mt-0">
                {filteredFollowing.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No following users sharing location</p>
                    <p className="text-sm">They may have location sharing off</p>
                  </div>
                ) : (
                  filteredFollowing.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      <Avatar className="h-12 w-12 border-2 border-primary">
                        <AvatarImage src={user.profile?.avatar_url || ''} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user.profile?.display_name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate flex items-center gap-1">
                          {user.profile?.display_name}
                          <Badge variant="secondary" className="text-xs">Following</Badge>
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          {user.profile?.is_online ? (
                            <>
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              Online now
                            </>
                          ) : (
                            'Last seen recently'
                          )}
                        </p>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openDirections(user.latitude, user.longitude, user.profile?.display_name || 'User')}
                      >
                        <Navigation className="h-4 w-4 mr-1" />
                        Go
                      </Button>
                    </div>
                  ))
                )}
              </TabsContent>
              
              {/* Activity */}
              <TabsContent value="activity" className="p-4 space-y-4 mt-0">
                {/* Weekly steps chart */}
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Weekly Activity
                  </h4>
                  <div className="flex items-end gap-1 h-24">
                    {stepHistory.length > 0 ? (
                      stepHistory.map((day, i) => {
                        const height = (day.steps / DAILY_STEP_GOAL) * 100;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div 
                              className="w-full bg-primary/80 rounded-t-sm transition-all"
                              style={{ height: `${Math.min(height, 100)}%` }}
                            />
                            <span className="text-xs text-muted-foreground">
                              {new Date(day.date).toLocaleDateString('en', { weekday: 'short' }).charAt(0)}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                        No activity data yet
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-3 text-center">
                    <p className="text-lg font-bold text-primary">{Math.round(stepsToday * 0.0007)}</p>
                    <p className="text-xs text-muted-foreground">km today</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-lg font-bold text-primary">{Math.round(stepsToday * 0.04)}</p>
                    <p className="text-xs text-muted-foreground">calories</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-lg font-bold text-primary">{Math.round(stepsToday / 100)}</p>
                    <p className="text-xs text-muted-foreground">minutes</p>
                  </Card>
                </div>
                
                {/* Battery status */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-center gap-2">
                    <Battery className={cn(
                      "h-5 w-5",
                      batteryLevel > 50 ? "text-green-500" :
                      batteryLevel > 20 ? "text-yellow-500" : "text-red-500"
                    )} />
                    <span className="text-sm">Battery</span>
                  </div>
                  <span className="font-medium">{batteryLevel}%</span>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
