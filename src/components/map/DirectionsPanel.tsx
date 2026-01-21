import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  X,
  Navigation,
  MapPin,
  Clock,
  Route,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  Loader2,
  Locate,
  AlertCircle,
  Play,
  Square,
  Mic,
  MicOff,
  History,
  Star,
  StarOff,
  Trash2,
  Home,
  Briefcase,
  Coffee,
  Share2,
  Copy,
  Calendar,
  Fuel,
  AlertTriangle,
  CheckCircle2,
  Volume2,
  VolumeX,
  Crosshair,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  useDirections, 
  formatDistance, 
  formatDuration, 
  getManeuverIcon,
  type SearchResult,
  type RouteAlternative,
} from '@/hooks/useDirections';
import { useDirectionsHistory, type SavedPlace } from '@/hooks/useDirectionsHistory';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { TransportQuickBar, type TransportMode } from './TransportModePicker';
import { toast } from 'sonner';

type MapSelectionMode = 'origin' | 'destination' | null;

interface DirectionsPanelProps {
  currentLocation: { latitude: number; longitude: number } | null;
  initialDestination?: { lat: number; lng: number; name: string } | null;
  transportMode: TransportMode;
  onTransportModeChange: (mode: TransportMode) => void;
  onRouteCalculated: (route: RouteAlternative | null) => void;
  onStepSelected?: (stepLocation: [number, number]) => void;
  onClose: () => void;
  className?: string;
  // Map selection mode
  mapSelectionMode?: MapSelectionMode;
  onMapSelectionModeChange?: (mode: MapSelectionMode) => void;
  // When a location is selected from map
  selectedMapLocation?: { lat: number; lng: number; name: string } | null;
  onClearSelectedMapLocation?: () => void;
}

export type { MapSelectionMode };

// Get arrival time estimation
const getArrivalTime = (durationSeconds: number): string => {
  const arrival = new Date(Date.now() + durationSeconds * 1000);
  return arrival.toLocaleTimeString('uz-UZ', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
};

// Get icon for saved place
const getPlaceIcon = (place: SavedPlace) => {
  if (place.icon === '🏠') return <Home className="h-4 w-4" />;
  if (place.icon === '💼') return <Briefcase className="h-4 w-4" />;
  if (place.icon === '☕') return <Coffee className="h-4 w-4" />;
  return <Star className="h-4 w-4" />;
};

export function DirectionsPanel({
  currentLocation,
  initialDestination,
  transportMode,
  onTransportModeChange,
  onRouteCalculated,
  onStepSelected,
  onClose,
  className,
  mapSelectionMode,
  onMapSelectionModeChange,
  selectedMapLocation,
  onClearSelectedMapLocation,
}: DirectionsPanelProps) {
  const {
    origin,
    destination,
    routes,
    selectedRouteIndex,
    selectedRoute,
    currentStep,
    isLoading,
    error,
    isNavigating,
    currentStepIndex,
    searchPlaces,
    reverseGeocode,
    calculateRoute,
    selectRoute,
    startNavigation,
    stopNavigation,
    nextStep,
    prevStep,
    clearRoute,
    setOrigin,
    setDestination,
  } = useDirections();

  const { 
    recentPlaces, 
    favoritePlaces, 
    addRecent, 
    toggleFavorite, 
    isFavorite, 
    clearRecent,
    deletePlace 
  } = useDirectionsHistory();

  const [originInput, setOriginInput] = useState('');
  const [destInput, setDestInput] = useState('');
  const [originResults, setOriginResults] = useState<SearchResult[]>([]);
  const [destResults, setDestResults] = useState<SearchResult[]>([]);
  const [showOriginResults, setShowOriginResults] = useState(false);
  const [showDestResults, setShowDestResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<'origin' | 'destination' | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const panelRef = useRef<HTMLDivElement>(null);
  const originInputRef = useRef<HTMLInputElement>(null);
  const destInputRef = useRef<HTMLInputElement>(null);

  // Voice search
  const { isListening, isSupported: voiceSupported, startListening, stopListening } = useVoiceSearch({
    onResult: (transcript) => {
      if (activeVoiceField === 'origin') {
        setOriginInput(transcript);
        handleSearch(transcript, 'origin');
      } else if (activeVoiceField === 'destination') {
        setDestInput(transcript);
        handleSearch(transcript, 'destination');
      }
      setActiveVoiceField(null);
    },
    onError: (error) => {
      toast.error(error);
      setActiveVoiceField(null);
    },
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showOriginResults || showDestResults) {
          setShowOriginResults(false);
          setShowDestResults(false);
        } else if (!isNavigating) {
          handleClose();
        }
      }
      
      // Navigate between inputs with Tab
      if (e.key === 'Enter') {
        if (document.activeElement === originInputRef.current && origin) {
          destInputRef.current?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showOriginResults, showDestResults, isNavigating, origin]);

  // Set initial destination if provided
  useEffect(() => {
    if (initialDestination) {
      setDestination(initialDestination);
      setDestInput(initialDestination.name);
    }
  }, [initialDestination, setDestination]);

  // Handle map selection
  useEffect(() => {
    if (selectedMapLocation && mapSelectionMode) {
      if (mapSelectionMode === 'origin') {
        setOrigin(selectedMapLocation);
        setOriginInput(selectedMapLocation.name);
      } else if (mapSelectionMode === 'destination') {
        setDestination(selectedMapLocation);
        setDestInput(selectedMapLocation.name);
      }
      onMapSelectionModeChange?.(null);
      onClearSelectedMapLocation?.();
    }
  }, [selectedMapLocation, mapSelectionMode, setOrigin, setDestination, onMapSelectionModeChange, onClearSelectedMapLocation]);

  // Auto-set origin to current location
  useEffect(() => {
    if (currentLocation && !origin) {
      const setupOrigin = async () => {
        setOrigin({
          lat: currentLocation.latitude,
          lng: currentLocation.longitude,
          name: 'Joriy joylashuv',
        });
        setOriginInput('Joriy joylashuv');
      };
      setupOrigin();
    }
  }, [currentLocation, origin, setOrigin]);

  // Auto-calculate route when both points are set
  useEffect(() => {
    if (origin && destination) {
      calculateRoute(origin, destination, transportMode).then(route => {
        onRouteCalculated(route);
        
        // Save to recent
        if (destination.name !== 'Joriy joylashuv') {
          addRecent({
            name: destination.name,
            lat: destination.lat,
            lng: destination.lng,
          });
        }
      });
    }
  }, [origin, destination, transportMode]);

  // Search with debounce
  const handleSearch = useCallback(async (query: string, type: 'origin' | 'destination') => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length < 2) {
      if (type === 'origin') {
        setOriginResults([]);
      } else {
        setDestResults([]);
      }
      return;
    }

    setIsSearching(true);
    setShowSuggestions(false);
    
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchPlaces(query);
      if (type === 'origin') {
        setOriginResults(results);
        setShowOriginResults(true);
      } else {
        setDestResults(results);
        setShowDestResults(true);
      }
      setIsSearching(false);
    }, 300);
  }, [searchPlaces]);

  // Use current location as origin
  const useCurrentLocation = useCallback(async () => {
    if (!currentLocation) return;
    
    setOrigin({
      lat: currentLocation.latitude,
      lng: currentLocation.longitude,
      name: 'Joriy joylashuv',
    });
    setOriginInput('Joriy joylashuv');
    setShowOriginResults(false);
  }, [currentLocation, setOrigin]);

  // Select search result
  const selectResult = useCallback((result: SearchResult, type: 'origin' | 'destination') => {
    const location = {
      lat: result.lat,
      lng: result.lon,
      name: result.display_name.split(',')[0],
    };

    if (type === 'origin') {
      setOrigin(location);
      setOriginInput(location.name);
      setShowOriginResults(false);
    } else {
      setDestination(location);
      setDestInput(location.name);
      setShowDestResults(false);
    }
  }, [setOrigin, setDestination]);

  // Select saved place
  const selectSavedPlace = useCallback((place: SavedPlace, type: 'origin' | 'destination') => {
    const location = {
      lat: place.lat,
      lng: place.lng,
      name: place.name,
    };

    if (type === 'origin') {
      setOrigin(location);
      setOriginInput(location.name);
    } else {
      setDestination(location);
      setDestInput(location.name);
    }
    setShowSuggestions(false);
  }, [setOrigin, setDestination]);

  // Swap origin and destination
  const swapLocations = useCallback(() => {
    if (!origin && !destination) return;
    
    const tempOrigin = origin;
    const tempInput = originInput;
    
    setOrigin(destination);
    setOriginInput(destInput);
    setDestination(tempOrigin);
    setDestInput(tempInput);
  }, [origin, destination, originInput, destInput, setOrigin, setDestination]);

  // Share route
  const shareRoute = useCallback(() => {
    if (!origin || !destination) return;
    
    const url = `https://www.google.com/maps/dir/${origin.lat},${origin.lng}/${destination.lat},${destination.lng}`;
    
    if (navigator.share) {
      navigator.share({
        title: `Yo'nalish: ${origin.name} → ${destination.name}`,
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Havola nusxalandi!");
    }
  }, [origin, destination]);

  // Handle closing
  const handleClose = useCallback(() => {
    clearRoute();
    onRouteCalculated(null);
    onClose();
  }, [clearRoute, onRouteCalculated, onClose]);

  // Start voice search
  const handleVoiceSearch = useCallback((field: 'origin' | 'destination') => {
    if (isListening) {
      stopListening();
      setActiveVoiceField(null);
    } else {
      setActiveVoiceField(field);
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Prevent all events from propagating to underlying map
  const stopAllEvents = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    // Some event types/browsers may not expose stopImmediatePropagation
    (e.nativeEvent as any)?.stopImmediatePropagation?.();
  }, []);

  const hasSuggestions = favoritePlaces.length > 0 || recentPlaces.length > 0;

  return (
    <div 
      ref={panelRef}
      className={cn(
        "flex flex-col bg-background border-r border-border shadow-2xl w-[400px]",
        className
      )}
      onClick={stopAllEvents}
      onMouseDown={stopAllEvents}
      onMouseUp={stopAllEvents}
      onPointerDown={stopAllEvents}
      onPointerUp={stopAllEvents}
      onTouchStart={stopAllEvents}
      onTouchEnd={stopAllEvents}
      onDoubleClick={stopAllEvents}
      onContextMenu={stopAllEvents}
      onWheel={stopAllEvents}
    >
      {/* Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/15 shadow-sm">
              <Navigation className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Yo'nalishlar</h2>
              <p className="text-xs text-muted-foreground">Marshrutni rejalashtiring</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {voiceSupported && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "rounded-full h-9 w-9",
                  voiceEnabled ? "text-primary" : "text-muted-foreground"
                )}
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                title={voiceEnabled ? "Ovozli qidiruvni o'chirish" : "Ovozli qidiruvni yoqish"}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleClose} 
              className="rounded-full h-9 w-9 hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Transport Mode Selector */}
        <TransportQuickBar
          selected={transportMode}
          onSelect={onTransportModeChange}
          estimatedTimes={routes.length > 0 ? {
            driving: formatDuration(routes[0]?.duration || 0),
            walking: undefined,
            cycling: undefined,
            transit: undefined,
            metro: undefined,
            taxi: undefined,
          } : undefined}
        />
      </div>

      {/* Search Inputs */}
      <div className="p-4 space-y-3 bg-muted/30">
        {/* Origin Input */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-primary/20 shadow-sm" />
              <div className="w-0.5 h-10 bg-gradient-to-b from-primary/60 to-destructive/60 my-1.5" />
            </div>
            <div className="relative flex-1">
              <Input
                ref={originInputRef}
                placeholder="Qayerdan..."
                value={originInput}
                onChange={(e) => {
                  setOriginInput(e.target.value);
                  handleSearch(e.target.value, 'origin');
                }}
                onFocus={() => {
                  if (originResults.length > 0) setShowOriginResults(true);
                  else setShowSuggestions(true);
                }}
                onBlur={() => setTimeout(() => {
                  setShowOriginResults(false);
                  setShowSuggestions(false);
                }, 200)}
                className={cn(
                  "pr-24 h-11 bg-background border-border/60 focus:border-primary/60 rounded-xl shadow-sm",
                  isListening && activeVoiceField === 'origin' && "ring-2 ring-primary animate-pulse"
                )}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                {voiceEnabled && voiceSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 rounded-lg",
                      isListening && activeVoiceField === 'origin' 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-primary/10 hover:text-primary"
                    )}
                    onClick={() => handleVoiceSearch('origin')}
                    title="Ovoz bilan qidirish"
                  >
                    {isListening && activeVoiceField === 'origin' ? (
                      <MicOff className="h-3.5 w-3.5" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                {onMapSelectionModeChange && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 rounded-lg",
                      mapSelectionMode === 'origin'
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-primary/10 hover:text-primary"
                    )}
                    onClick={() => onMapSelectionModeChange(mapSelectionMode === 'origin' ? null : 'origin')}
                    title="Xaritadan tanlash"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </Button>
                )}
                {currentLocation && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg hover:bg-primary/10 hover:text-primary"
                    onClick={useCurrentLocation}
                    title="Joriy joylashuv"
                  >
                    <Locate className="h-3.5 w-3.5" />
                  </Button>
                )}
                {originInput && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg hover:bg-muted"
                    onClick={() => {
                      setOriginInput('');
                      setOrigin(null);
                      setOriginResults([]);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl shrink-0 hover:bg-primary/10 hover:border-primary/50 shadow-sm"
              onClick={swapLocations}
              disabled={!origin && !destination}
              title="Joylarni almashtirish"
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Origin Search Results */}
          {showOriginResults && originResults.length > 0 && (
            <Card className="absolute left-6 right-12 top-full mt-2 z-50 border-border shadow-xl bg-background rounded-xl overflow-hidden">
              <CardContent className="p-1.5 max-h-52 overflow-auto">
                {originResults.map((result) => (
                  <button
                    key={result.place_id}
                    className="w-full text-left p-3 hover:bg-primary/5 rounded-lg text-sm transition-colors group"
                    onClick={() => selectResult(result, 'origin')}
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate group-hover:text-primary">{result.display_name.split(',')[0]}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {result.display_name.split(',').slice(1, 3).join(',')}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Destination Input */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className="w-3 h-3 rounded-full bg-destructive ring-4 ring-destructive/20 shadow-sm" />
            </div>
            <div className="relative flex-1">
              <Input
                ref={destInputRef}
                placeholder="Qayerga..."
                value={destInput}
                onChange={(e) => {
                  setDestInput(e.target.value);
                  handleSearch(e.target.value, 'destination');
                }}
                onFocus={() => {
                  if (destResults.length > 0) setShowDestResults(true);
                  else setShowSuggestions(true);
                }}
                onBlur={() => setTimeout(() => {
                  setShowDestResults(false);
                  setShowSuggestions(false);
                }, 200)}
                className={cn(
                  "pr-20 h-11 bg-background border-border/60 focus:border-destructive/60 rounded-xl shadow-sm",
                  isListening && activeVoiceField === 'destination' && "ring-2 ring-destructive animate-pulse"
                )}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                {voiceEnabled && voiceSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 rounded-lg",
                      isListening && activeVoiceField === 'destination' 
                        ? "bg-destructive text-destructive-foreground" 
                        : "hover:bg-destructive/10 hover:text-destructive"
                    )}
                    onClick={() => handleVoiceSearch('destination')}
                    title="Ovoz bilan qidirish"
                  >
                    {isListening && activeVoiceField === 'destination' ? (
                      <MicOff className="h-3.5 w-3.5" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                {onMapSelectionModeChange && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 rounded-lg",
                      mapSelectionMode === 'destination'
                        ? "bg-destructive text-destructive-foreground"
                        : "hover:bg-destructive/10 hover:text-destructive"
                    )}
                    onClick={() => onMapSelectionModeChange(mapSelectionMode === 'destination' ? null : 'destination')}
                    title="Xaritadan tanlash"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </Button>
                )}
                {destInput && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg hover:bg-muted"
                    onClick={() => {
                      setDestInput('');
                      setDestination(null);
                      setDestResults([]);
                      clearRoute();
                      onRouteCalculated(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {/* Map selection button for destination */}
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "h-11 w-11 rounded-xl shrink-0 shadow-sm",
                mapSelectionMode === 'destination'
                  ? "bg-destructive text-destructive-foreground border-destructive"
                  : "hover:bg-destructive/10 hover:border-destructive/50"
              )}
              onClick={() => onMapSelectionModeChange?.(mapSelectionMode === 'destination' ? null : 'destination')}
              title="Xaritadan manzilni tanlash"
            >
              <MapPin className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Destination Search Results */}
          {showDestResults && destResults.length > 0 && (
            <Card className="absolute left-6 right-12 top-full mt-2 z-50 border-border shadow-xl bg-background rounded-xl overflow-hidden">
              <CardContent className="p-1.5 max-h-52 overflow-auto">
                {destResults.map((result) => (
                  <button
                    key={result.place_id}
                    className="w-full text-left p-3 hover:bg-destructive/5 rounded-lg text-sm transition-colors group"
                    onClick={() => selectResult(result, 'destination')}
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-destructive shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate group-hover:text-destructive">{result.display_name.split(',')[0]}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {result.display_name.split(',').slice(1, 3).join(',')}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Suggestions (Favorites & Recent) - Show when no route */}
      {!selectedRoute && !isLoading && hasSuggestions && showSuggestions && (
        <div className="border-t border-border">
          <Tabs defaultValue="favorites" className="w-full">
            <TabsList className="w-full rounded-none h-10 bg-muted/50">
              <TabsTrigger value="favorites" className="flex-1 gap-1.5 text-xs">
                <Star className="h-3.5 w-3.5" />
                Sevimlilar
              </TabsTrigger>
              <TabsTrigger value="recent" className="flex-1 gap-1.5 text-xs">
                <History className="h-3.5 w-3.5" />
                Oxirgi
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="favorites" className="m-0">
              <ScrollArea className="h-36">
                {favoritePlaces.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-36 text-muted-foreground">
                    <Star className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Sevimli joylar yo'q</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {favoritePlaces.map((place) => (
                      <div
                        key={place.id}
                        className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/70 group transition-colors"
                      >
                        <button
                          className="flex-1 flex items-center gap-3 text-left min-w-0"
                          onClick={() => selectSavedPlace(place, 'destination')}
                        >
                          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                            {getPlaceIcon(place)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{place.name}</p>
                            {place.address && (
                              <p className="text-xs text-muted-foreground truncate">{place.address}</p>
                            )}
                          </div>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={() => deletePlace(place.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="recent" className="m-0">
              <ScrollArea className="h-36">
                {recentPlaces.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-36 text-muted-foreground">
                    <History className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Oxirgi qidiruvlar yo'q</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {recentPlaces.map((place) => (
                      <div
                        key={place.id}
                        className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/70 group transition-colors"
                      >
                        <button
                          className="flex-1 flex items-center gap-3 text-left min-w-0"
                          onClick={() => selectSavedPlace(place, 'destination')}
                        >
                          <div className="p-2 rounded-lg bg-muted shrink-0">
                            <History className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="font-medium text-sm truncate">{place.name}</p>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={() => toggleFavorite(place, '⭐')}
                          title="Sevimlilarga qo'shish"
                        >
                          <Star className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs text-muted-foreground"
                      onClick={clearRecent}
                    >
                      <Trash2 className="h-3 w-3 mr-1.5" />
                      Tarixni tozalash
                    </Button>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="absolute inset-0 animate-ping opacity-30">
                <Loader2 className="h-8 w-8 text-primary" />
              </div>
            </div>
            <span className="text-muted-foreground text-sm">Yo'l hisoblanmoqda...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mx-4 my-4 p-4 bg-destructive/10 rounded-xl border border-destructive/20 flex items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Route Summary & Alternatives */}
      {selectedRoute && !isNavigating && (
        <div className="p-4 border-t border-border bg-gradient-to-b from-primary/5 to-transparent">
          {/* Main Route Info */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{formatDuration(selectedRoute.duration)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Route className="h-4 w-4" />
                <span>{formatDistance(selectedRoute.distance)}</span>
                <span className="text-muted-foreground/50">•</span>
                <Calendar className="h-3.5 w-3.5" />
                <span>{getArrivalTime(selectedRoute.duration)} da yetib kelish</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mb-4">
            <Button 
              onClick={startNavigation} 
              size="lg" 
              className="flex-1 rounded-xl gap-2 shadow-lg shadow-primary/25 h-12"
            >
              <Play className="h-4 w-4 fill-current" />
              Boshlash
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={() => {
                if (destination) {
                  toggleFavorite(destination, '⭐');
                  toast.success(isFavorite(destination.lat, destination.lng) 
                    ? "Sevimlilardan olib tashlandi" 
                    : "Sevimlilarga qo'shildi"
                  );
                }
              }}
              title={destination && isFavorite(destination.lat, destination.lng) ? "Sevimlilardan o'chirish" : "Sevimlilarga qo'shish"}
            >
              {destination && isFavorite(destination.lat, destination.lng) ? (
                <Star className="h-5 w-5 fill-primary text-primary" />
              ) : (
                <StarOff className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={shareRoute}
              title="Ulashish"
            >
              <Share2 className="h-5 w-5" />
            </Button>
          </div>

          {/* Alternative Routes */}
          {routes.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
              {routes.map((route, index) => (
                <Button
                  key={route.id}
                  variant={selectedRouteIndex === index ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    "shrink-0 rounded-xl",
                    selectedRouteIndex === index && "shadow-md"
                  )}
                  onClick={() => {
                    selectRoute(index);
                    onRouteCalculated(route);
                  }}
                >
                  <span className="font-semibold">{formatDuration(route.duration)}</span>
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {formatDistance(route.distance)}
                  </Badge>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Turn-by-Turn Instructions */}
      {selectedRoute && !isNavigating && (
        <ScrollArea className="flex-1 border-t border-border">
          <div className="p-4 space-y-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-muted-foreground">
                Yo'l ko'rsatmalari ({selectedRoute.steps.length})
              </h3>
            </div>
            {selectedRoute.steps.map((step, index) => (
              <button
                key={index}
                className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 text-left transition-all group"
                onClick={() => onStepSelected?.(step.maneuver.location)}
              >
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg group-hover:scale-110 transition-transform">
                    {getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}
                  </div>
                  {index < selectedRoute.steps.length - 1 && (
                    <div className="w-0.5 h-6 bg-border my-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="font-medium text-sm">{step.instruction}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>{formatDistance(step.distance)}</span>
                    <span className="opacity-50">•</span>
                    <span>{formatDuration(step.duration)}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Navigation Mode */}
      {isNavigating && selectedRoute && currentStep && (
        <div className="flex-1 flex flex-col">
          {/* Current Step - Large Display */}
          <div className="p-6 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-4xl shadow-lg">
                {getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
              </div>
              <div className="flex-1">
                <p className="text-xl font-bold mb-1">{currentStep.instruction}</p>
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="secondary" className="gap-1">
                    <Route className="h-3 w-3" />
                    {formatDistance(currentStep.distance)}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(currentStep.duration)}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="px-6 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Qadam {currentStepIndex + 1} / {selectedRoute.steps.length}</span>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="font-medium">{getArrivalTime(selectedRoute.duration)} da yetish</span>
              </div>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${((currentStepIndex + 1) / selectedRoute.steps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Upcoming Steps */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">KEYINGI QADAMLAR</h4>
              {selectedRoute.steps.slice(currentStepIndex + 1, currentStepIndex + 4).map((step, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base">
                    {getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{step.instruction}</p>
                    <p className="text-xs text-muted-foreground">{formatDistance(step.distance)}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Navigation Controls */}
          <div className="p-4 border-t border-border bg-background flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={prevStep}
              disabled={currentStepIndex === 0}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="destructive"
              size="lg"
              className="flex-1 h-12 rounded-xl gap-2"
              onClick={stopNavigation}
            >
              <Square className="h-4 w-4 fill-current" />
              To'xtatish
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={nextStep}
              disabled={currentStepIndex === selectedRoute.steps.length - 1}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
