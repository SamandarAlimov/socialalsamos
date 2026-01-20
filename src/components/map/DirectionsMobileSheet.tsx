import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
  GripHorizontal,
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
import { TransportQuickBar, type TransportMode } from './TransportModePicker';

interface DirectionsMobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLocation: { latitude: number; longitude: number } | null;
  initialDestination?: { lat: number; lng: number; name: string } | null;
  transportMode: TransportMode;
  onTransportModeChange: (mode: TransportMode) => void;
  onRouteCalculated: (route: RouteAlternative | null) => void;
  onStepSelected?: (stepLocation: [number, number]) => void;
}

export function DirectionsMobileSheet({
  open,
  onOpenChange,
  currentLocation,
  initialDestination,
  transportMode,
  onTransportModeChange,
  onRouteCalculated,
  onStepSelected,
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

  const [originInput, setOriginInput] = useState('');
  const [destInput, setDestInput] = useState('');
  const [originResults, setOriginResults] = useState<SearchResult[]>([]);
  const [destResults, setDestResults] = useState<SearchResult[]>([]);
  const [activeSearch, setActiveSearch] = useState<'origin' | 'destination' | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedView, setExpandedView] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Set initial destination if provided
  useEffect(() => {
    if (initialDestination && open) {
      setDestination(initialDestination);
      setDestInput(initialDestination.name);
    }
  }, [initialDestination, open, setDestination]);

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

  const handleClose = useCallback(() => {
    clearRoute();
    onRouteCalculated(null);
    onOpenChange(false);
  }, [clearRoute, onRouteCalculated, onOpenChange]);

  const currentResults = activeSearch === 'origin' ? originResults : destResults;

  // Calculate sheet height based on content
  const getSheetHeight = () => {
    if (isNavigating) return 'h-[60vh]';
    if (expandedView && selectedRoute) return 'h-[85vh]';
    if (selectedRoute) return 'h-auto max-h-[70vh]';
    if (currentResults.length > 0) return 'h-auto max-h-[70vh]';
    return 'h-auto';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className={cn(
          "rounded-t-3xl px-0 pb-20 flex flex-col z-[9999]",
          getSheetHeight()
        )}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
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
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleClose} 
              className="rounded-full h-9 w-9 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
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
                    onFocus={() => setActiveSearch('origin')}
                    className="pr-16 h-11 bg-background border-border/60 rounded-xl text-base"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
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
                    onFocus={() => setActiveSearch('destination')}
                    className="pr-10 h-11 bg-background border-border/60 rounded-xl text-base"
                  />
                  {destInput && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg"
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
                <div className="w-11 shrink-0" /> {/* Spacer for alignment */}
              </div>
            </div>
          )}

          {/* Search Results */}
          {activeSearch && currentResults.length > 0 && !isNavigating && (
            <ScrollArea className="max-h-44 border-b border-border">
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
            <div className="flex-1 overflow-auto">
              <div className="p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-5 w-5 text-primary" />
                      <span className="text-2xl font-bold">{formatDuration(selectedRoute.duration)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Route className="h-4 w-4" />
                      <span>{formatDistance(selectedRoute.distance)}</span>
                    </div>
                  </div>
                  <Button 
                    onClick={startNavigation} 
                    size="lg" 
                    className="rounded-xl gap-2 shadow-lg shadow-primary/25 h-12 px-5"
                  >
                    <Play className="h-5 w-5 fill-current" />
                    Boshlash
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
                      onClick={() => {
                        onStepSelected?.([step.maneuver.location[1], step.maneuver.location[0]]);
                      }}
                    >
                      <div className="text-lg shrink-0 w-9 h-9 flex items-center justify-center bg-muted/60 rounded-lg group-hover:bg-primary/10">
                        {getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm group-hover:text-primary">{step.instruction}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistance(step.distance)} • {formatDuration(step.duration)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Navigation Mode */}
          {isNavigating && selectedRoute && currentStep && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Current Step Display */}
              <div className="p-5 bg-gradient-to-br from-primary/15 via-primary/10 to-transparent">
                <div className="flex items-center gap-4">
                  <div className="text-3xl w-14 h-14 flex items-center justify-center bg-primary/15 rounded-2xl">
                    {getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-bold mb-1">{currentStep.instruction}</p>
                    <div className="flex items-center gap-3 text-muted-foreground text-sm">
                      <span className="font-medium">{formatDistance(currentStep.distance)}</span>
                      <span className="text-muted-foreground/50">•</span>
                      <span>{formatDuration(currentStep.duration)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="px-5 py-3 border-t border-border bg-muted/30">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    Qadam {currentStepIndex + 1} / {selectedRoute.steps.length}
                  </span>
                  <span className="font-medium text-primary">
                    {formatDistance(selectedRoute.distance)}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${((currentStepIndex + 1) / selectedRoute.steps.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Upcoming Steps */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Keyingi qadamlar
                  </h4>
                  {selectedRoute.steps.slice(currentStepIndex + 1, currentStepIndex + 4).map((step, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2.5 rounded-lg text-sm opacity-70"
                    >
                      <div className="text-base w-7 h-7 flex items-center justify-center bg-muted/50 rounded-md">
                        {getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{step.instruction}</p>
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
                  size="lg" 
                  onClick={prevStep} 
                  disabled={currentStepIndex === 0}
                  className="rounded-xl h-12"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button 
                  variant="destructive" 
                  size="lg" 
                  onClick={() => {
                    stopNavigation();
                    onRouteCalculated(null);
                  }} 
                  className="flex-1 rounded-xl h-12 gap-2"
                >
                  <Square className="h-4 w-4 fill-current" />
                  To'xtatish
                </Button>
                <Button 
                  variant="default" 
                  size="lg" 
                  onClick={nextStep} 
                  disabled={currentStepIndex === selectedRoute.steps.length - 1}
                  className="rounded-xl h-12"
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
