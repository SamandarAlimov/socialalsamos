import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  MoreHorizontal,
  Route,
  Footprints,
  History,
  Crosshair,
  Home,
  Briefcase,
  BookOpen,
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
import { DirectionsPanel } from '@/components/map/DirectionsPanel';
import { DirectionsMobileSheet } from '@/components/map/DirectionsMobileSheet';
import { LocationHistoryPanel } from '@/components/map/LocationHistoryPanel';
import { LocationHistoryMobileSheet } from '@/components/map/LocationHistoryMobileSheet';
import { useLocationTracking, DailyRoute } from '@/hooks/useLocationTracking';
import { type RouteAlternative, formatDistance, formatDuration } from '@/hooks/useDirections';

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

// Frequent place markers - professional SVG icons
const createPlaceIcon = (placeType: 'home' | 'work' | 'study' | 'other', name: string) => {
  const svgIcons: Record<string, string> = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    work: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    study: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    other: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  };
  const colors: Record<string, string> = {
    home: '#f97316',
    work: '#3b82f6',
    study: '#f59e0b',
    other: '#8b5cf6',
  };
  const color = colors[placeType] || colors.other;
  const svg = svgIcons[placeType] || svgIcons.other;

  return L.divIcon({
    className: 'place-marker',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-50%);">
        <div style="
          width:40px;height:40px;background:white;border:2px solid ${color};
          border-radius:50%;display:flex;align-items:center;justify-content:center;
          box-shadow:0 4px 12px rgba(0,0,0,0.2);color:${color};
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${svg}
          </svg>
        </div>
        <div style="
          margin-top:4px;background:${color};color:white;padding:2px 8px;
          border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;
          box-shadow:0 2px 6px rgba(0,0,0,0.15);
        ">${name}</div>
      </div>
    `,
    iconSize: [40, 60],
    iconAnchor: [20, 30],
  });
};

// Search result / picked location marker
const searchPinIcon = L.divIcon({
  className: 'search-pin-marker',
  html: `
    <div style="position:relative;transform:translateY(-100%);">
      <div style="
        width:36px;height:36px;background:#f97316;border:3px solid white;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" style="transform:rotate(45deg)" width="16" height="16" viewBox="0 0 24 24"
             fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [36, 40],
  iconAnchor: [18, 40],
});


type MapLayer = 'standard' | 'satellite' | 'terrain';

// Map event handler component
function MapEventHandler({ 
  center, 
  zoom,
  onMapClick,
  isSelecting,
}: { 
  center: [number, number]; 
  zoom: number;
  onMapClick?: (lat: number, lng: number) => void;
  isSelecting?: boolean;
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

  // Map click handler for selecting locations
  useEffect(() => {
    if (!onMapClick) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onMapClick, isSelecting]);

  // Change cursor when selecting
  useEffect(() => {
    const container = map.getContainer();
    if (isSelecting) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
    return () => {
      container.style.cursor = '';
    };
  }, [map, isSelecting]);
  
  return null;
}

export default function MapPage() {
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
  const [placeSearchResults, setPlaceSearchResults] = useState<Array<{ display_name: string; lat: number; lon: number }>>([]);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
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
  const [showDirectionsPanel, setShowDirectionsPanel] = useState(false);
  const [directionsCollapsed, setDirectionsCollapsed] = useState(false);
  const [activeRoute, setActiveRoute] = useState<RouteAlternative | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [showLocationHistory, setShowLocationHistory] = useState(false);
  const [viewingRoute, setViewingRoute] = useState<DailyRoute | null>(null);
  
  // Map selection mode for directions
  const [mapSelectionMode, setMapSelectionMode] = useState<'origin' | 'destination' | null>(null);
  const [selectedMapLocation, setSelectedMapLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  
  // Location tracking hook
  const { dailyRoutes, todayRoute, frequentPlaces } = useLocationTracking();
  
  // Parse destination from URL params
  useEffect(() => {
    const destLat = searchParams.get('destLat');
    const destLng = searchParams.get('destLng');
    const destName = searchParams.get('destName');
    
    if (destLat && destLng) {
      const dest = {
        lat: parseFloat(destLat),
        lng: parseFloat(destLng),
        name: destName || 'Shared Location'
      };
      setDestination(dest);
      setShowDirections(true);
      setShowDirectionsPanel(true);
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
  
  // Open built-in directions
  const openBuiltInDirections = useCallback((destLat: number, destLng: number, userName: string) => {
    setDestination({ lat: destLat, lng: destLng, name: userName });
    setShowDirectionsPanel(true);
  }, []);

  // Handle route calculated from directions panel
  const handleRouteCalculated = useCallback((route: RouteAlternative | null) => {
    setActiveRoute(route);
    if (route && route.geometry.length > 0) {
      // Center map on route
      const midIndex = Math.floor(route.geometry.length / 2);
      setMapCenter(route.geometry[midIndex]);
    }
  }, []);

  // Handle step selected in directions
  const handleStepSelected = useCallback((location: [number, number]) => {
    setMapCenter(location);
    setZoom(17);
  }, []);

  // Handle map click for location selection OR quick destination pick (Yandex-style)
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    // Reverse geocode to get location name
    let name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'uz,ru,en' } }
      );
      if (response.ok) {
        const data = await response.json();
        const parts = [];
        if (data.address?.road) parts.push(data.address.road);
        if (data.address?.house_number) parts.push(data.address.house_number);
        if (parts.length === 0 && data.display_name) {
          name = data.display_name.split(',').slice(0, 2).join(',').trim();
        } else if (parts.length > 0) {
          name = parts.join(' ');
        }
      }
    } catch {
      // keep coord fallback
    }

    if (mapSelectionMode) {
      setSelectedMapLocation({ lat, lng, name });
      toast.success(`${mapSelectionMode === 'origin' ? "Boshlang'ich nuqta" : 'Manzil'} tanlandi: ${name}`);
      return;
    }

    // Yandex-style: single click pins a destination without closing the panel
    setDestination({ lat, lng, name });
    setShowDirections(true);
  }, [mapSelectionMode]);

  
  // Real place search (Nominatim) — debounced
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setPlaceSearchResults([]);
      setPlaceSearchOpen(false);
      return;
    }
    setPlaceSearchLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`,
          { headers: { 'Accept-Language': 'uz,ru,en' } }
        );
        const data = resp.ok ? await resp.json() : [];
        setPlaceSearchResults(
          data.map((d: any) => ({ display_name: d.display_name, lat: parseFloat(d.lat), lon: parseFloat(d.lon) }))
        );
        setPlaceSearchOpen(true);
      } catch {
        setPlaceSearchResults([]);
      } finally {
        setPlaceSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handlePickSearchResult = useCallback((r: { display_name: string; lat: number; lon: number }) => {
    const name = r.display_name.split(',').slice(0, 2).join(',').trim();
    setDestination({ lat: r.lat, lng: r.lon, name });
    setShowDirections(true);
    setMapCenter([r.lat, r.lon]);
    setZoom(16);
    setPlaceSearchOpen(false);
    setSearchQuery(name);
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
            <SheetContent side="right" className="w-[300px] z-[9999]">
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
            <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl z-[9999]">
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
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openBuiltInDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi'); }}>
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
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openBuiltInDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi'); }}>
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
            <p className="text-xs text-muted-foreground">Real vaqt joylashuv</p>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="z-[9999]">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Input
              placeholder="Joy, manzil yoki foydalanuvchi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => placeSearchResults.length > 0 && setPlaceSearchOpen(true)}
              onBlur={() => setTimeout(() => setPlaceSearchOpen(false), 200)}
              className="pl-9"
            />
            {placeSearchOpen && (placeSearchLoading || placeSearchResults.length > 0) && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-80 overflow-auto z-50">
                {placeSearchLoading && (
                  <div className="p-3 text-sm text-muted-foreground">Qidirilmoqda…</div>
                )}
                {!placeSearchLoading && placeSearchResults.map((r, i) => (
                  <button
                    key={`${r.lat}-${r.lon}-${i}`}
                    onMouseDown={(e) => { e.preventDefault(); handlePickSearchResult(r); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-start gap-2 border-b border-border/40 last:border-0"
                  >
                    <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm line-clamp-2">{r.display_name}</span>
                  </button>
                ))}
              </div>
            )}
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
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openBuiltInDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi'); }}>
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
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openBuiltInDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi'); }}>
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
              <LocationHistoryPanel
                onNavigateToPlace={(lat, lng, name) => openBuiltInDirections(lat, lng, name)}
                onViewRoute={(route) => {
                  setViewingRoute(route);
                  if (route.route_geometry && route.route_geometry.length > 0) {
                    const midIndex = Math.floor(route.route_geometry.length / 2);
                    setMapCenter(route.route_geometry[midIndex]);
                  }
                }}
              />
              <div className="mt-4">
                <StepTrackingCharts stepsToday={stepsToday} stepHistory={stepHistory} dailyGoal={DAILY_STEP_GOAL} />
              </div>
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
        className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-[500] rounded-l-none"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{ left: sidebarOpen ? '320px' : '0' }}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
      
      {/* Map Container - Contains both map and directions panel */}
      <div className="flex-1 relative min-h-[400px] md:h-full overflow-hidden">
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
          <MapEventHandler 
            center={mapCenter} 
            zoom={zoom} 
            onMapClick={handleMapClick}
            isSelecting={!!mapSelectionMode}
          />
          
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
                  <Button size="sm" className="w-full" onClick={() => openBuiltInDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi')}>
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
                  <Button size="sm" className="w-full" onClick={() => openBuiltInDirections(u.latitude, u.longitude, u.profile?.display_name || 'Foydalanuvchi')}>
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
                    <Button size="sm" className="flex-1" onClick={() => setShowDirectionsPanel(true)}>
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
          
          {/* Frequent Places Markers */}
          {frequentPlaces.map((place) => (
            <Marker 
              key={place.id} 
              position={[place.latitude, place.longitude]} 
              icon={createPlaceIcon(place.place_type, place.name)}
            >
              <Popup>
                <div className="text-center min-w-[150px]">
                  <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    {place.place_type === 'home' ? <Home className="h-6 w-6" /> :
                     place.place_type === 'work' ? <Briefcase className="h-6 w-6" /> :
                     place.place_type === 'study' ? <BookOpen className="h-6 w-6" /> :
                     <MapPin className="h-6 w-6" />}
                  </div>
                  <p className="font-medium">{place.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {place.visit_count} marta tashrif • O'rtacha {place.average_stay_minutes} daqiqa
                  </p>
                  {currentLocation && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {(calculateDistance(currentLocation.latitude, currentLocation.longitude, place.latitude, place.longitude) / 1000).toFixed(1)} km uzoqlikda
                    </p>
                  )}
                  <Button 
                    size="sm" 
                    className="w-full mt-2" 
                    onClick={() => openBuiltInDirections(place.latitude, place.longitude, place.name)}
                  >
                    <Navigation className="h-4 w-4 mr-1" /> Borish
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}
          
          {/* Active Route Polyline */}
          {activeRoute && activeRoute.geometry.length > 0 && (
            <Polyline 
              positions={activeRoute.geometry} 
              pathOptions={{ 
                color: '#3b82f6', 
                weight: 5, 
                opacity: 0.8,
              }} 
            />
          )}
          
          {/* Today's Route Polyline - Show user's path today */}
          {todayRoute && todayRoute.route_geometry && todayRoute.route_geometry.length > 1 && !viewingRoute && (
            <Polyline 
              positions={todayRoute.route_geometry} 
              pathOptions={{ 
                color: 'hsl(var(--primary))', 
                weight: 3, 
                opacity: 0.6,
                dashArray: '8, 4',
              }} 
            />
          )}
          
          {/* Viewing Historical Route Polyline */}
          {viewingRoute && viewingRoute.route_geometry && viewingRoute.route_geometry.length > 1 && (
            <Polyline 
              positions={viewingRoute.route_geometry} 
              pathOptions={{ 
                color: 'hsl(142, 76%, 36%)', 
                weight: 4, 
                opacity: 0.8,
              }} 
            />
          )}
          
          {/* Fallback straight line if no route but destination exists */}
          {currentLocation && destination && showDirections && !activeRoute && (
            <Polyline positions={[[currentLocation.latitude, currentLocation.longitude], [destination.lat, destination.lng]]} pathOptions={{ color: '#3b82f6', weight: 4, dashArray: '10, 10' }} />
          )}
        </MapContainer>
        
        {/* Location permission prompt overlay */}
        {showPermissionPrompt && (
          <div className="absolute inset-0 z-[1000] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
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
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] bg-background/95 backdrop-blur-lg rounded-xl shadow-lg border p-3 flex items-center gap-3 max-w-[90%]">
            <MapPin className="h-5 w-5 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate">{destination.name}</p>
              {currentLocation && (
                <p className="text-xs text-muted-foreground">{calculateDistance(currentLocation.latitude, currentLocation.longitude, destination.lat, destination.lng).toFixed(1)}km uzoqlikda</p>
              )}
            </div>
            <TransportQuickBar selected={transportMode} onSelect={setTransportMode} />
            <Button size="sm" onClick={() => setShowDirectionsPanel(true)}>
              <Route className="h-4 w-4 mr-1" /> Yo'nalish
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDestination(null); setShowDirections(false); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {/* Viewing Route Banner */}
        {viewingRoute && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] bg-background/95 backdrop-blur-lg rounded-xl shadow-lg border p-3 flex items-center gap-3 max-w-[90%]">
            <Footprints className="h-5 w-5 text-success shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate">{viewingRoute.route_date} yo'li</p>
              <p className="text-xs text-muted-foreground">{viewingRoute.total_distance_km?.toFixed(1) || 0} km bosib o'tilgan</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setViewingRoute(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {/* Map Selection Mode Indicator */}
        {mapSelectionMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[600] animate-pulse">
            <div className={cn(
              "px-4 py-2 rounded-full shadow-lg border-2 flex items-center gap-2 font-medium text-sm",
              mapSelectionMode === 'origin' 
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-destructive text-destructive-foreground border-destructive"
            )}>
              <Crosshair className="h-4 w-4" />
              {mapSelectionMode === 'origin' 
                ? "Boshlang'ich nuqtani xaritadan tanlang"
                : "Manzilni xaritadan tanlang"
              }
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-1 hover:bg-white/20"
                onClick={() => setMapSelectionMode(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Map Controls */}
        <div className="absolute bottom-20 md:bottom-4 right-4 z-[500] flex flex-col gap-1">
          <Button 
            variant={showLocationHistory ? "default" : "secondary"} 
            size="icon" 
            className="shadow-lg"
            onClick={() => setShowLocationHistory(!showLocationHistory)}
            title="Joylashuv tarixi"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button 
            variant={showDirectionsPanel ? "default" : "secondary"} 
            size="icon" 
            className="shadow-lg"
            onClick={() => setShowDirectionsPanel(!showDirectionsPanel)}
            title="Yo'nalishlar"
          >
            <Route className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" className="shadow-lg" onClick={centerOnLocation} title="Joriy joylashuv">
            <Locate className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" className="shadow-lg" onClick={() => setZoom(Math.min(zoom + 1, 18))} title="Kattalashtirish">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" className="shadow-lg" onClick={() => setZoom(Math.max(zoom - 1, 3))} title="Kichiklashtirish">
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Layer switcher */}
        <div className="absolute top-2 right-2 z-[500]">
          <Button variant="secondary" size="icon" className="shadow-lg" onClick={() => {
            const layers: MapLayer[] = ['standard', 'satellite', 'terrain'];
            const currentIndex = layers.indexOf(mapLayer);
            setMapLayer(layers[(currentIndex + 1) % layers.length]);
          }}>
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Desktop/Tablet Directions Panel - collapsible, isolated from map events */}
      {showDirectionsPanel && (
        <div 
          className="hidden md:flex fixed top-0 bottom-0 z-[9999] pointer-events-auto items-stretch"
          style={{ left: sidebarOpen ? '320px' : '0' }}
        >
          {!directionsCollapsed && (
            <DirectionsPanel
              currentLocation={currentLocation}
              initialDestination={destination}
              transportMode={transportMode}
              onTransportModeChange={setTransportMode}
              onRouteCalculated={handleRouteCalculated}
              onStepSelected={handleStepSelected}
              onClose={() => {
                setShowDirectionsPanel(false);
                setActiveRoute(null);
                setMapSelectionMode(null);
              }}
              className="h-full w-[380px]"
              mapSelectionMode={mapSelectionMode}
              onMapSelectionModeChange={setMapSelectionMode}
              selectedMapLocation={selectedMapLocation}
              onClearSelectedMapLocation={() => setSelectedMapLocation(null)}
            />
          )}
          <button
            type="button"
            aria-label={directionsCollapsed ? "Yo'nalishlar panelini ochish" : "Yo'nalishlar panelini yig'ish"}
            onClick={() => setDirectionsCollapsed((v) => !v)}
            className="self-center h-16 w-6 flex items-center justify-center rounded-r-xl bg-background/90 backdrop-blur border border-l-0 border-border shadow-md hover:bg-accent transition-colors"
          >
            {directionsCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      )}


      {/* Mobile Location History Sheet */}
      <LocationHistoryMobileSheet
        open={showLocationHistory}
        onOpenChange={setShowLocationHistory}
        onNavigateToPlace={(lat, lng, name) => {
          openBuiltInDirections(lat, lng, name);
          setShowLocationHistory(false);
        }}
        onViewRoute={(route) => {
          setViewingRoute(route);
          setShowLocationHistory(false);
          if (route.route_geometry && route.route_geometry.length > 0) {
            const midIndex = Math.floor(route.route_geometry.length / 2);
            setMapCenter(route.route_geometry[midIndex]);
          }
        }}
      />

      {/* Mobile Directions Sheet - Only renders on mobile via internal class */}
      <DirectionsMobileSheet
        open={showDirectionsPanel}
        onOpenChange={(open) => {
          setShowDirectionsPanel(open);
          if (!open) {
            setActiveRoute(null);
            setMapSelectionMode(null);
          }
        }}
        currentLocation={currentLocation}
        initialDestination={destination}
        transportMode={transportMode}
        onTransportModeChange={setTransportMode}
        onRouteCalculated={handleRouteCalculated}
        onStepSelected={handleStepSelected}
        mapSelectionMode={mapSelectionMode}
        onMapSelectionModeChange={setMapSelectionMode}
        selectedMapLocation={selectedMapLocation}
        onClearSelectedMapLocation={() => setSelectedMapLocation(null)}
      />

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
