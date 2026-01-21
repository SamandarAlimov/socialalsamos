import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  X,
  Navigation,
  MapPin,
  Clock,
  Route,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
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
  Calendar,
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

interface DirectionsMobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLocation: { latitude: number; longitude: number } | null;
  initialDestination?: { lat: number; lng: number; name: string } | null;
  transportMode: TransportMode;
  onTransportModeChange: (mode: TransportMode) => void;
  onRouteCalculated: (route: RouteAlternative | null) => void;
  onStepSelected?: (stepLocation: [number, number]) => void;
  // Map selection props
  mapSelectionMode?: MapSelectionMode;
  onMapSelectionModeChange?: (mode: MapSelectionMode) => void;
  selectedMapLocation?: { lat: number; lng: number; name: string } | null;
  onClearSelectedMapLocation?: () => void;
}

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

export function DirectionsMobileSheet({
  open,
  onOpenChange,
  currentLocation,
  initialDestination,
  transportMode,
  onTransportModeChange,
  onRouteCalculated,
  onStepSelected,
  mapSelectionMode,
  onMapSelectionModeChange,
  selectedMapLocation,
  onClearSelectedMapLocation,
}: DirectionsMobileSheetProps) {
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
  const [activeSearch, setActiveSearch] = useState<'origin' | 'destination' | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedView, setExpandedView] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<'origin' | 'destination' | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout>();

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

  // Set initial destination if provided
  useEffect(() => {
    if (initialDestination && open) {
      setDestination(initialDestination);
      setDestInput(initialDestination.name);
    }
  }, [initialDestination, open, setDestination]);

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
    if (currentLocation && !origin && open) {
      setOrigin({
        lat: currentLocation.latitude,
        lng: currentLocation.longitude,
        name: 'Joriy joylashuv',
      });
      setOriginInput('Joriy joylashuv');
    }
  }, [currentLocation, origin, open, setOrigin]);

  // Auto-calculate route when both points are set
  useEffect(() => {
    if (origin && destination && open) {
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
  }, [origin, destination, transportMode, open]);

  // Clear when closed
  useEffect(() => {
    if (!open) {
      clearRoute();
      setOriginInput('');
      setDestInput('');
      setOriginResults([]);
      setDestResults([]);
      setActiveSearch(null);
      setExpandedView(false);
      setShowSuggestions(false);
    }
  }, [open, clearRoute]);

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
    setActiveSearch(type);
    setShowSuggestions(false);
    
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchPlaces(query);
      if (type === 'origin') {
        setOriginResults(results);
      } else {
        setDestResults(results);
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
    setActiveSearch(null);
    setOriginResults([]);
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
      setOriginResults([]);
    } else {
      setDestination(location);
      setDestInput(location.name);
      setDestResults([]);
    }
    setActiveSearch(null);
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
    setActiveSearch(null);
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

  const handleClose = useCallback(() => {
    clearRoute();
    onRouteCalculated(null);
    onOpenChange(false);
  }, [clearRoute, onRouteCalculated, onOpenChange]);

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

  const currentResults = activeSearch === 'origin' ? originResults : destResults;
  const hasSuggestions = favoritePlaces.length > 0 || recentPlaces.length > 0;

  // Calculate sheet height based on content
  const getSheetHeight = () => {
    if (isNavigating) return 'h-[85vh]';
    if (expandedView && selectedRoute) return 'h-[90vh]';
    if (selectedRoute) return 'h-[75vh]';
    if (currentResults.length > 0 || showSuggestions) return 'h-[75vh]';
    return 'h-[55vh]';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className={cn(
          "rounded-t-3xl px-0 pb-20 flex flex-col z-[9999] md:hidden overflow-hidden",
          getSheetHeight()
        )}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 bg-muted-foreground/40 rounded-full" />
        </div>

        <SheetHeader className="px-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/15">
                <Navigation className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <span className="text-lg font-semibold block">Yo'nalishlar</span>
                <span className="text-xs text-muted-foreground font-normal">Marshrutni rejalashtiring</span>
              </div>
            </SheetTitle>
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
                >
                  {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleClose} 
                className="rounded-full h-9 w-9 hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Transport Mode Selector */}
          <div className="px-4 py-3 bg-muted/30">
            <TransportQuickBar
              selected={transportMode}
              onSelect={onTransportModeChange}
            />
          </div>

          {/* Search Inputs - Hide during navigation */}
          {!isNavigating && (
            <div className="px-4 py-3 space-y-3 border-b border-border">
              {/* Origin Input */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-3 h-3 rounded-full bg-primary ring-3 ring-primary/20" />
                  <div className="w-0.5 h-8 bg-gradient-to-b from-primary/50 to-destructive/50 my-1" />
                </div>
                <div className="relative flex-1">
                  <Input
                    placeholder="Qayerdan..."
                    value={originInput}
                    onChange={(e) => {
                      setOriginInput(e.target.value);
                      handleSearch(e.target.value, 'origin');
                    }}
                    onFocus={() => {
                      setActiveSearch('origin');
                      if (!originInput && hasSuggestions) setShowSuggestions(true);
                    }}
                    className={cn(
                      "pr-20 h-11 bg-background border-border/60 rounded-xl text-base",
                      isListening && activeVoiceField === 'origin' && "ring-2 ring-primary animate-pulse"
                    )}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                    {voiceEnabled && voiceSupported && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={cn(
                          "h-8 w-8 rounded-lg",
                          isListening && activeVoiceField === 'origin' 
                            ? "bg-primary text-primary-foreground" 
                            : "hover:bg-primary/10 hover:text-primary"
                        )}
                        onClick={() => handleVoiceSearch('origin')}
                      >
                        {isListening && activeVoiceField === 'origin' ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {currentLocation && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" 
                        onClick={useCurrentLocation}
                      >
                        <Locate className="h-4 w-4" />
                      </Button>
                    )}
                    {originInput && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => {
                          setOriginInput('');
                          setOrigin(null);
                          setOriginResults([]);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-11 w-11 shrink-0 rounded-xl hover:bg-primary/10" 
                  onClick={swapLocations}
                  disabled={!origin && !destination}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Destination Input */}
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-destructive ring-3 ring-destructive/20 shrink-0" />
                <div className="relative flex-1">
                  <Input
                    placeholder="Qayerga..."
                    value={destInput}
                    onChange={(e) => {
                      setDestInput(e.target.value);
                      handleSearch(e.target.value, 'destination');
                    }}
                    onFocus={() => {
                      setActiveSearch('destination');
                      if (!destInput && hasSuggestions) setShowSuggestions(true);
                    }}
                    className={cn(
                      "pr-16 h-11 bg-background border-border/60 rounded-xl text-base",
                      isListening && activeVoiceField === 'destination' && "ring-2 ring-destructive animate-pulse"
                    )}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                    {voiceEnabled && voiceSupported && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={cn(
                          "h-8 w-8 rounded-lg",
                          isListening && activeVoiceField === 'destination' 
                            ? "bg-destructive text-destructive-foreground" 
                            : "hover:bg-destructive/10 hover:text-destructive"
                        )}
                        onClick={() => handleVoiceSearch('destination')}
                      >
                        {isListening && activeVoiceField === 'destination' ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {destInput && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => {
                          setDestInput('');
                          setDestination(null);
                          setDestResults([]);
                          clearRoute();
                          onRouteCalculated(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="w-11 shrink-0" />
              </div>
            </div>
          )}

          {/* Suggestions (Favorites & Recent) - Show when focused and no query */}
          {showSuggestions && !isNavigating && hasSuggestions && currentResults.length === 0 && (
            <div className="border-b border-border">
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
                  <ScrollArea className="h-32">
                    {favoritePlaces.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                        <Star className="h-6 w-6 mb-1 opacity-50" />
                        <p className="text-xs">Sevimli joylar yo'q</p>
                      </div>
                    ) : (
                      <div className="p-2 space-y-0.5">
                        {favoritePlaces.slice(0, 5).map((place) => (
                          <button
                            key={place.id}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/70 text-left"
                            onClick={() => selectSavedPlace(place, activeSearch || 'destination')}
                          >
                            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                              {getPlaceIcon(place)}
                            </div>
                            <p className="font-medium text-sm truncate">{place.name}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="recent" className="m-0">
                  <ScrollArea className="h-32">
                    {recentPlaces.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                        <History className="h-6 w-6 mb-1 opacity-50" />
                        <p className="text-xs">Oxirgi qidiruvlar yo'q</p>
                      </div>
                    ) : (
                      <div className="p-2 space-y-0.5">
                        {recentPlaces.slice(0, 5).map((place) => (
                          <button
                            key={place.id}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/70 text-left"
                            onClick={() => selectSavedPlace(place, activeSearch || 'destination')}
                          >
                            <div className="p-2 rounded-lg bg-muted shrink-0">
                              <History className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="font-medium text-sm truncate">{place.name}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Search Results */}
          {activeSearch && currentResults.length > 0 && !isNavigating && (
            <ScrollArea className="max-h-40 border-b border-border">
              <div className="p-2 space-y-0.5">
                {currentResults.map((result) => (
                  <button
                    key={result.place_id}
                    className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-muted text-left transition-colors group"
                    onClick={() => selectResult(result, activeSearch)}
                  >
                    <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 shrink-0">
                      <MapPin className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate group-hover:text-primary">{result.display_name.split(',')[0]}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {result.display_name.split(',').slice(1, 3).join(',')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

          {/* Route Summary */}
          {selectedRoute && !isNavigating && (
            <ScrollArea className="flex-1">
              <div className="p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-5 w-5 text-primary" />
                      <span className="text-2xl font-bold">{formatDuration(selectedRoute.duration)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Route className="h-4 w-4" />
                      <span>{formatDistance(selectedRoute.distance)}</span>
                      <span className="opacity-50">•</span>
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{getArrivalTime(selectedRoute.duration)}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button 
                    onClick={startNavigation} 
                    size="lg" 
                    className="flex-1 rounded-xl gap-2 shadow-lg shadow-primary/25 h-12"
                  >
                    <Play className="h-5 w-5 fill-current" />
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
                  >
                    <Share2 className="h-5 w-5" />
                  </Button>
                </div>

                {/* Alternative Routes */}
                {routes.length > 1 && (
                  <div className="flex gap-2 mt-4 overflow-x-auto -mx-2 px-2 pb-1 scrollbar-hide">
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
                        {formatDuration(route.duration)}
                        <Badge variant="secondary" className="ml-1.5 text-[10px]">
                          {formatDistance(route.distance)}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Toggle Expanded View */}
              <Button
                variant="ghost"
                className="w-full rounded-none border-y border-border h-11"
                onClick={() => setExpandedView(!expandedView)}
              >
                {expandedView ? (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Yashirish
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Yo'l ko'rsatmalari ({selectedRoute.steps.length})
                  </>
                )}
              </Button>

              {/* Turn-by-Turn Instructions */}
              {expandedView && (
                <div className="p-4 space-y-1">
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
                          <div className="w-0.5 h-5 bg-border my-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{step.instruction}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{formatDistance(step.distance)}</span>
                          <span className="opacity-50">•</span>
                          <span>{formatDuration(step.duration)}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          )}

          {/* Navigation Mode */}
          {isNavigating && selectedRoute && currentStep && (
            <div className="flex-1 flex flex-col">
              {/* Current Step - Large Display */}
              <div className="p-5 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-3xl shadow-lg">
                    {getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold mb-1 truncate">{currentStep.instruction}</p>
                    <div className="flex items-center gap-2 text-sm">
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
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Qadam {currentStepIndex + 1} / {selectedRoute.steps.length}</span>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="font-medium">{getArrivalTime(selectedRoute.duration)}</span>
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
      </SheetContent>
    </Sheet>
  );
}
