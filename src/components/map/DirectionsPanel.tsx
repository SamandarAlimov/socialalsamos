import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Search,
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
  CornerDownLeft,
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

  const originInputRef = useRef<HTMLInputElement>(null);
  const destInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

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
        const name = await reverseGeocode(currentLocation.latitude, currentLocation.longitude);
        setOrigin({
          lat: currentLocation.latitude,
          lng: currentLocation.longitude,
          name: 'Joriy joylashuv',
        });
        setOriginInput('Joriy joylashuv');
      };
      setupOrigin();
    }
  }, [currentLocation, origin, reverseGeocode, setOrigin]);

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

  return (
    <div className={cn("flex flex-col bg-background border-r border-border", className)}>
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Yo'nalishlar</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
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
      <div className="p-3 space-y-2">
        {/* Origin Input */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary shrink-0" />
            <div className="relative flex-1">
              <Input
                ref={originInputRef}
                placeholder="Qayerdan..."
                value={originInput}
                onChange={(e) => {
                  setOriginInput(e.target.value);
                  handleSearch(e.target.value, 'origin');
                }}
                onFocus={() => setShowOriginResults(originResults.length > 0)}
                onBlur={() => setTimeout(() => setShowOriginResults(false), 200)}
                className="pr-20"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                {currentLocation && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
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
          </div>
          
          {/* Origin Search Results */}
          {showOriginResults && originResults.length > 0 && (
            <Card className="absolute left-5 right-0 top-full mt-1 z-50 max-h-48 overflow-auto">
              <CardContent className="p-1">
                {originResults.map((result) => (
                  <button
                    key={result.place_id}
                    className="w-full text-left p-2 hover:bg-muted rounded-md text-sm"
                    onClick={() => selectResult(result, 'origin')}
                  >
                    <p className="font-medium truncate">{result.display_name.split(',')[0]}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {result.display_name.split(',').slice(1, 3).join(',')}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Swap Button */}
        <div className="flex items-center gap-2">
          <div className="w-3 flex justify-center">
            <div className="w-0.5 h-4 bg-muted-foreground/30" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={swapLocations}
            disabled={!origin && !destination}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>

        {/* Destination Input */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive shrink-0" />
            <div className="relative flex-1">
              <Input
                ref={destInputRef}
                placeholder="Qayerga..."
                value={destInput}
                onChange={(e) => {
                  setDestInput(e.target.value);
                  handleSearch(e.target.value, 'destination');
                }}
                onFocus={() => setShowDestResults(destResults.length > 0)}
                onBlur={() => setTimeout(() => setShowDestResults(false), 200)}
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
          </div>
          
          {/* Destination Search Results */}
          {showDestResults && destResults.length > 0 && (
            <Card className="absolute left-5 right-0 top-full mt-1 z-50 max-h-48 overflow-auto">
              <CardContent className="p-1">
                {destResults.map((result) => (
                  <button
                    key={result.place_id}
                    className="w-full text-left p-2 hover:bg-muted rounded-md text-sm"
                    onClick={() => selectResult(result, 'destination')}
                  >
                    <p className="font-medium truncate">{result.display_name.split(',')[0]}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {result.display_name.split(',').slice(1, 3).join(',')}
                    </p>
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
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Yo'l hisoblanmoqda...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 mx-3 mb-3 bg-destructive/10 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Route Summary & Alternatives */}
      {selectedRoute && !isNavigating && (
        <div className="p-3 border-t border-border">
          {/* Main Route Info */}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-lg font-semibold">{formatDuration(selectedRoute.duration)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Route className="h-3.5 w-3.5" />
                <span>{formatDistance(selectedRoute.distance)}</span>
                {selectedRoute.summary && (
                  <>
                    <span>•</span>
                    <span className="truncate">{selectedRoute.summary}</span>
                  </>
                )}
              </div>
            </div>
            <Button onClick={startNavigation}>
              <Navigation className="h-4 w-4 mr-2" />
              Boshlash
            </Button>
          </div>

          {/* Alternative Routes */}
          {routes.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
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
                  <span className="font-medium">{formatDuration(route.duration)}</span>
                  <Badge variant="secondary" className="ml-2">
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
          <div className="p-3 space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Yo'l ko'rsatmalari</h3>
            {selectedRoute.steps.map((step, index) => (
              <button
                key={index}
                className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 text-left transition-colors"
                onClick={() => {
                  onStepSelected?.([step.maneuver.location[1], step.maneuver.location[0]]);
                }}
              >
                <div className="text-xl shrink-0 w-8 text-center">
                  {getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{step.instruction}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistance(step.distance)} • {formatDuration(step.duration)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Navigation Mode */}
      {isNavigating && selectedRoute && currentStep && (
        <div className="flex-1 flex flex-col">
          {/* Current Step - Large Display */}
          <div className="p-4 bg-primary text-primary-foreground">
            <div className="text-4xl mb-2 text-center">
              {getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
            </div>
            <p className="text-xl font-semibold text-center mb-1">
              {currentStep.instruction}
            </p>
            <p className="text-center text-primary-foreground/80">
              {formatDistance(currentStep.distance)} • {formatDuration(currentStep.duration)}
            </p>
          </div>

          {/* Progress */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span>Qadam {currentStepIndex + 1} / {selectedRoute.steps.length}</span>
              <span>{formatDistance(selectedRoute.distance)} qoldi</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((currentStepIndex + 1) / selectedRoute.steps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Next Steps Preview */}
          <ScrollArea className="flex-1 p-3">
            {selectedRoute.steps.slice(currentStepIndex + 1, currentStepIndex + 4).map((step, idx) => (
              <div key={idx} className="flex items-start gap-3 p-2 opacity-70">
                <span className="text-lg">{getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{step.instruction}</p>
                  <p className="text-xs text-muted-foreground">{formatDistance(step.distance)}</p>
                </div>
              </div>
            ))}
          </ScrollArea>

          {/* Navigation Controls */}
          <div className="p-3 border-t border-border flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={prevStep}
              disabled={currentStepIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={stopNavigation}
            >
              <X className="h-4 w-4 mr-2" />
              To'xtatish
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={nextStep}
              disabled={currentStepIndex >= selectedRoute.steps.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
