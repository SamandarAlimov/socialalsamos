import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn(
        "max-h-[90vh] rounded-t-3xl bg-background/95 backdrop-blur-xl",
        isNavigating && "h-[70vh]"
      )}>
        {/* Handle bar */}
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted-foreground/30 my-3" />
        
        <DrawerHeader className="pb-2 px-4">
          <div className="flex items-center justify-between">
            <DrawerTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Navigation className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="text-lg font-semibold">Yo'nalishlar</span>
                <p className="text-xs text-muted-foreground font-normal">Qayerdan qayerga</p>
              </div>
            </DrawerTitle>
            <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-safe overflow-hidden flex flex-col">
          {/* Transport Mode Selector */}
          <div className="mb-4">
            <TransportQuickBar
              selected={transportMode}
              onSelect={onTransportModeChange}
            />
          </div>

          {/* Search Inputs - Hide during navigation */}
          {!isNavigating && (
            <div className="space-y-3 mb-4">
              {/* Origin Input */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-primary/20" />
                  <div className="w-0.5 h-6 bg-gradient-to-b from-primary/50 to-destructive/50 my-1" />
                </div>
                <div className="relative flex-1">
                  <Input
                    placeholder="Boshlang'ich nuqta..."
                    value={originInput}
                    onChange={(e) => {
                      setOriginInput(e.target.value);
                      handleSearch(e.target.value, 'origin');
                    }}
                    onFocus={() => setActiveSearch('origin')}
                    className="pr-16 h-12 bg-muted/50 border-border/50 rounded-xl text-base"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                    {currentLocation && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" onClick={useCurrentLocation}>
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
                <Button variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-xl hover:bg-primary/10" onClick={swapLocations}>
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Destination Input */}
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-destructive ring-4 ring-destructive/20" />
                <div className="relative flex-1">
                  <Input
                    placeholder="Boradigan manzil..."
                    value={destInput}
                    onChange={(e) => {
                      setDestInput(e.target.value);
                      handleSearch(e.target.value, 'destination');
                    }}
                    onFocus={() => setActiveSearch('destination')}
                    className="pr-10 h-12 bg-muted/50 border-border/50 rounded-xl text-base"
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
                <div className="w-12" /> {/* Spacer for alignment */}
              </div>
            </div>
          )}

          {/* Search Results */}
          {activeSearch && currentResults.length > 0 && !isNavigating && (
            <ScrollArea className="h-44 mb-4 -mx-2 px-2">
              <div className="space-y-1">
                {currentResults.map((result) => (
                  <button
                    key={result.place_id}
                    className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-muted text-left transition-colors group"
                    onClick={() => selectResult(result, activeSearch)}
                  >
                    <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10">
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
            <div className="p-4 mb-4 bg-destructive/10 rounded-xl border border-destructive/20 flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Route Summary */}
          {selectedRoute && !isNavigating && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl mb-4">
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
                  <Button onClick={startNavigation} size="lg" className="rounded-xl gap-2 shadow-lg shadow-primary/20 h-14 px-6">
                    <Play className="h-5 w-5 fill-current" />
                    Boshlash
                  </Button>
                </div>

                {/* Alternative Routes */}
                {routes.length > 1 && (
                  <div className="flex gap-2 mt-4 overflow-x-auto -mx-2 px-2 pb-1">
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
                className="w-full mb-2 rounded-xl"
                onClick={() => setExpandedView(!expandedView)}
              >
                {expandedView ? (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Qisqartirish
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Yo'l ko'rsatmalari
                  </>
                )}
              </Button>

              {/* Turn-by-Turn Instructions */}
              {expandedView && (
                <ScrollArea className="flex-1 max-h-48">
                  <div className="space-y-1 pb-4">
                    {selectedRoute.steps.map((step, index) => (
                      <button
                        key={index}
                        className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 text-left transition-all group"
                        onClick={() => {
                          onStepSelected?.([step.maneuver.location[1], step.maneuver.location[0]]);
                        }}
                      >
                        <div className="text-xl shrink-0 w-10 h-10 flex items-center justify-center bg-muted/50 rounded-xl group-hover:bg-primary/10">
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
                </ScrollArea>
              )}
            </div>
          )}

          {/* Navigation Mode */}
          {isNavigating && selectedRoute && currentStep && (
            <div className="flex flex-col flex-1 -mx-4">
              {/* Current Step - Large Display */}
              <div className="p-6 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground mx-4 rounded-2xl">
                <div className="text-5xl mb-3 text-center drop-shadow-lg">
                  {getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
                </div>
                <p className="text-xl font-bold text-center mb-2">
                  {currentStep.instruction}
                </p>
                <div className="flex items-center justify-center gap-3 text-primary-foreground/90">
                  <span className="text-lg font-semibold">{formatDistance(currentStep.distance)}</span>
                </div>
              </div>

              {/* Progress */}
              <div className="p-4 mx-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                  <span className="font-medium">{currentStepIndex + 1} / {selectedRoute.steps.length}</span>
                  <span>{formatDuration(selectedRoute.duration)} qoldi</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300"
                    style={{ width: `${((currentStepIndex + 1) / selectedRoute.steps.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Next Steps Preview */}
              <ScrollArea className="flex-1 px-4 mb-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Keyingi qadamlar</h4>
                {selectedRoute.steps.slice(currentStepIndex + 1, currentStepIndex + 3).map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 opacity-60">
                    <span className="text-xl">{getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{step.instruction}</p>
                      <p className="text-xs text-muted-foreground">{formatDistance(step.distance)}</p>
                    </div>
                  </div>
                ))}
              </ScrollArea>

              {/* Navigation Controls */}
              <div className="flex items-center gap-3 px-4 pb-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={prevStep}
                  disabled={currentStepIndex === 0}
                  className="flex-1 rounded-xl h-14"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={stopNavigation}
                  className="flex-[2] rounded-xl h-14 gap-2 shadow-lg shadow-destructive/20"
                >
                  <Square className="h-5 w-5 fill-current" />
                  To'xtatish
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={nextStep}
                  disabled={currentStepIndex >= selectedRoute.steps.length - 1}
                  className="flex-1 rounded-xl h-14"
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
