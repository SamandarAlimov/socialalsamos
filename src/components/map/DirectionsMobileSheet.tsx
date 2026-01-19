import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Search,
  X,
  Navigation,
  MapPin,
  Clock,
  Route,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ArrowUpDown,
  Loader2,
  Locate,
  AlertCircle,
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-2xl transition-all duration-300",
          isNavigating ? "h-[60vh]" : expandedView ? "h-[85vh]" : "h-auto max-h-[70vh]"
        )}
      >
        <SheetHeader className="pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" />
              Yo'nalishlar
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Transport Mode Selector */}
        <div className="mb-3">
          <TransportQuickBar
            selected={transportMode}
            onSelect={onTransportModeChange}
          />
        </div>

        {/* Search Inputs - Hide during navigation */}
        {!isNavigating && (
          <div className="space-y-2 mb-3">
            {/* Origin Input */}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary shrink-0" />
              <div className="relative flex-1">
                <Input
                  placeholder="Qayerdan..."
                  value={originInput}
                  onChange={(e) => {
                    setOriginInput(e.target.value);
                    handleSearch(e.target.value, 'origin');
                  }}
                  onFocus={() => setActiveSearch('origin')}
                  className="pr-16"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                  {currentLocation && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={useCurrentLocation}>
                      <Locate className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {originInput && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
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
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={swapLocations}>
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Destination Input */}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive shrink-0" />
              <div className="relative flex-1">
                <Input
                  placeholder="Qayerga..."
                  value={destInput}
                  onChange={(e) => {
                    setDestInput(e.target.value);
                    handleSearch(e.target.value, 'destination');
                  }}
                  onFocus={() => setActiveSearch('destination')}
                  className="pr-10"
                />
                {destInput && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
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
              <div className="w-9" /> {/* Spacer for alignment */}
            </div>
          </div>
        )}

        {/* Search Results */}
        {activeSearch && currentResults.length > 0 && !isNavigating && (
          <ScrollArea className="h-40 mb-3">
            <div className="space-y-1">
              {currentResults.map((result) => (
                <button
                  key={result.place_id}
                  className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-muted text-left"
                  onClick={() => selectResult(result, activeSearch)}
                >
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{result.display_name.split(',')[0]}</p>
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
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground text-sm">Yo'l hisoblanmoqda...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-3 mb-3 bg-destructive/10 rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Route Summary */}
        {selectedRoute && !isNavigating && (
          <>
            <div className="p-3 bg-muted/50 rounded-lg mb-3">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-lg font-bold">{formatDuration(selectedRoute.duration)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Route className="h-3.5 w-3.5" />
                    <span>{formatDistance(selectedRoute.distance)}</span>
                  </div>
                </div>
                <Button onClick={startNavigation} size="lg">
                  <Navigation className="h-4 w-4 mr-2" />
                  Boshlash
                </Button>
              </div>

              {/* Alternative Routes */}
              {routes.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {routes.map((route, index) => (
                    <Button
                      key={route.id}
                      variant={selectedRouteIndex === index ? 'default' : 'outline'}
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        selectRoute(index);
                        onRouteCalculated(route);
                      }}
                    >
                      {formatDuration(route.duration)}
                      <Badge variant="secondary" className="ml-1 text-[10px]">
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
              className="w-full mb-2"
              onClick={() => setExpandedView(!expandedView)}
            >
              <ChevronUp className={cn("h-4 w-4 mr-2 transition-transform", expandedView && "rotate-180")} />
              {expandedView ? "Qisqartirish" : "Batafsil"}
            </Button>

            {/* Turn-by-Turn Instructions */}
            {expandedView && (
              <ScrollArea className="h-48">
                <div className="space-y-1">
                  {selectedRoute.steps.map((step, index) => (
                    <button
                      key={index}
                      className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 text-left"
                      onClick={() => {
                        onStepSelected?.([step.maneuver.location[1], step.maneuver.location[0]]);
                      }}
                    >
                      <span className="text-lg shrink-0 w-8 text-center">
                        {getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{step.instruction}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistance(step.distance)} • {formatDuration(step.duration)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}

        {/* Navigation Mode */}
        {isNavigating && selectedRoute && currentStep && (
          <div className="flex flex-col h-full">
            {/* Current Step - Large Display */}
            <div className="p-4 bg-primary text-primary-foreground rounded-lg mb-3">
              <div className="text-5xl mb-2 text-center">
                {getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
              </div>
              <p className="text-xl font-bold text-center mb-1">
                {currentStep.instruction}
              </p>
              <p className="text-center text-primary-foreground/80">
                {formatDistance(currentStep.distance)}
              </p>
            </div>

            {/* Progress */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-1">
                <span>{currentStepIndex + 1} / {selectedRoute.steps.length}</span>
                <span>{formatDuration(selectedRoute.duration)} qoldi</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${((currentStepIndex + 1) / selectedRoute.steps.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Next Steps Preview */}
            <ScrollArea className="flex-1 mb-3">
              {selectedRoute.steps.slice(currentStepIndex + 1, currentStepIndex + 3).map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2 opacity-60">
                  <span className="text-lg">{getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{step.instruction}</p>
                    <p className="text-xs text-muted-foreground">{formatDistance(step.distance)}</p>
                  </div>
                </div>
              ))}
            </ScrollArea>

            {/* Navigation Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="lg"
                onClick={prevStep}
                disabled={currentStepIndex === 0}
                className="flex-1"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={stopNavigation}
                className="flex-[2]"
              >
                <X className="h-5 w-5 mr-2" />
                To'xtatish
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={nextStep}
                disabled={currentStepIndex >= selectedRoute.steps.length - 1}
                className="flex-1"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
