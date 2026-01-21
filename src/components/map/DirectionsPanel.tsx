import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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

interface DirectionsPanelProps {
  currentLocation: { latitude: number; longitude: number } | null;
  initialDestination?: { lat: number; lng: number; name: string } | null;
  transportMode: TransportMode;
  onTransportModeChange: (mode: TransportMode) => void;
  onRouteCalculated: (route: RouteAlternative | null) => void;
  onStepSelected?: (stepLocation: [number, number]) => void;
  onClose: () => void;
  className?: string;
}

export function DirectionsPanel({
  currentLocation,
  initialDestination,
  transportMode,
  onTransportModeChange,
  onRouteCalculated,
  onStepSelected,
  onClose,
  className,
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

  const [originInput, setOriginInput] = useState('');
  const [destInput, setDestInput] = useState('');
  const [originResults, setOriginResults] = useState<SearchResult[]>([]);
  const [destResults, setDestResults] = useState<SearchResult[]>([]);
  const [showOriginResults, setShowOriginResults] = useState(false);
  const [showDestResults, setShowDestResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const panelRef = useRef<HTMLDivElement>(null);

  // Set initial destination if provided
  useEffect(() => {
    if (initialDestination) {
      setDestination(initialDestination);
      setDestInput(initialDestination.name);
    }
  }, [initialDestination, setDestination]);

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

  // Handle closing
  const handleClose = useCallback(() => {
    clearRoute();
    onRouteCalculated(null);
    onClose();
  }, [clearRoute, onRouteCalculated, onClose]);

  // Prevent all pointer events from propagating to avoid accidental closes
  const handlePanelInteraction = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div 
      ref={panelRef}
      className={cn(
        "flex flex-col bg-background border-r border-border shadow-2xl",
        className
      )}
      onClick={handlePanelInteraction}
      onMouseDown={handlePanelInteraction}
      onPointerDown={handlePanelInteraction}
      onTouchStart={(e) => e.stopPropagation()}
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
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleClose} 
            className="rounded-full h-9 w-9 hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <X className="h-5 w-5" />
          </Button>
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
                placeholder="Qayerdan..."
                value={originInput}
                onChange={(e) => {
                  setOriginInput(e.target.value);
                  handleSearch(e.target.value, 'origin');
                }}
                onFocus={() => originResults.length > 0 && setShowOriginResults(true)}
                onBlur={() => setTimeout(() => setShowOriginResults(false), 200)}
                className="pr-20 h-11 bg-background border-border/60 focus:border-primary/60 rounded-xl shadow-sm"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
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
                placeholder="Qayerga..."
                value={destInput}
                onChange={(e) => {
                  setDestInput(e.target.value);
                  handleSearch(e.target.value, 'destination');
                }}
                onFocus={() => destResults.length > 0 && setShowDestResults(true)}
                onBlur={() => setTimeout(() => setShowDestResults(false), 200)}
                className="pr-10 h-11 bg-background border-border/60 focus:border-destructive/60 rounded-xl shadow-sm"
              />
              {destInput && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg hover:bg-muted"
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
            <div className="w-11 shrink-0" /> {/* Spacer for alignment */}
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
                {selectedRoute.summary && (
                  <>
                    <span className="text-muted-foreground/50">•</span>
                    <span className="truncate max-w-32">{selectedRoute.summary}</span>
                  </>
                )}
              </div>
            </div>
            <Button 
              onClick={startNavigation} 
              size="lg" 
              className="rounded-xl gap-2 shadow-lg shadow-primary/25 h-12 px-5"
            >
              <Play className="h-4 w-4 fill-current" />
              Boshlash
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
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Route className="h-4 w-4" />
              Yo'l ko'rsatmalari ({selectedRoute.steps.length})
            </h3>
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
                  <p className="font-medium text-sm group-hover:text-primary transition-colors">{step.instruction}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistance(step.distance)} • {formatDuration(step.duration)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Navigation Mode */}
      {isNavigating && selectedRoute && currentStep && (
        <div className="flex-1 flex flex-col">
          {/* Current Step Display */}
          <div className="p-6 bg-gradient-to-br from-primary/15 via-primary/10 to-transparent">
            <div className="flex items-center gap-4">
              <div className="text-4xl w-16 h-16 flex items-center justify-center bg-primary/15 rounded-2xl shadow-inner">
                {getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold mb-1">{currentStep.instruction}</p>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="font-medium">{formatDistance(currentStep.distance)}</span>
                  <span className="text-muted-foreground/50">•</span>
                  <span>{formatDuration(currentStep.duration)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="px-6 py-3 border-t border-border bg-muted/30">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                Qadam {currentStepIndex + 1} / {selectedRoute.steps.length}
              </span>
              <span className="font-medium text-primary">
                {formatDistance(selectedRoute.distance)} • {formatDuration(selectedRoute.duration)}
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
              {selectedRoute.steps.slice(currentStepIndex + 1, currentStepIndex + 5).map((step, index) => (
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
  );
}
