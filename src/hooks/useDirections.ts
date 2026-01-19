import { useState, useCallback, useRef } from 'react';
import { TransportMode } from '@/components/map/TransportModePicker';

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    bearing_before?: number;
    bearing_after?: number;
    location: [number, number];
  };
  name: string;
}

export interface Route {
  geometry: [number, number][];
  distance: number; // meters
  duration: number; // seconds
  steps: RouteStep[];
  summary: string;
}

export interface RouteAlternative extends Route {
  id: number;
}

export interface SearchResult {
  place_id: string;
  display_name: string;
  lat: number;
  lon: number;
  type: string;
  address?: {
    road?: string;
    city?: string;
    country?: string;
  };
}

interface DirectionsState {
  origin: { lat: number; lng: number; name: string } | null;
  destination: { lat: number; lng: number; name: string } | null;
  routes: RouteAlternative[];
  selectedRouteIndex: number;
  isLoading: boolean;
  error: string | null;
  isNavigating: boolean;
  currentStepIndex: number;
}

// OSRM profile mapping
const getOSRMProfile = (mode: TransportMode): string => {
  switch (mode) {
    case 'walking':
      return 'foot';
    case 'cycling':
      return 'bike';
    case 'driving':
    case 'taxi':
    default:
      return 'car';
  }
};

// Get maneuver icon based on type and modifier
export const getManeuverIcon = (type: string, modifier?: string): string => {
  if (type === 'depart') return '🚀';
  if (type === 'arrive') return '🏁';
  if (type === 'roundabout' || type === 'rotary') return '🔄';
  if (type === 'merge') return '↗️';
  if (type === 'fork') return modifier?.includes('left') ? '↙️' : '↗️';
  if (type === 'end of road') return '⬆️';
  if (type === 'continue') return '⬆️';
  if (type === 'new name') return '⬆️';
  
  // Turn based
  if (type === 'turn' || type === 'ramp' || type === 'exit roundabout') {
    switch (modifier) {
      case 'left': return '⬅️';
      case 'right': return '➡️';
      case 'sharp left': return '↖️';
      case 'sharp right': return '↗️';
      case 'slight left': return '↖️';
      case 'slight right': return '↗️';
      case 'uturn': return '↩️';
      case 'straight': return '⬆️';
      default: return '⬆️';
    }
  }
  
  return '📍';
};

// Translate maneuver to Uzbek
const translateManeuver = (type: string, modifier?: string, name?: string): string => {
  const street = name ? ` ${name} ko'chasiga` : '';
  
  if (type === 'depart') return `Yo'lga chiqing${street}`;
  if (type === 'arrive') return `Manzilga yetib keldingiz${street}`;
  if (type === 'roundabout' || type === 'rotary') return `Aylanma yo'ldan o'ting${street}`;
  if (type === 'merge') return `Yo'lga qo'shiling${street}`;
  if (type === 'fork') return `${modifier?.includes('left') ? 'Chapga' : "O'ngga"} buruling${street}`;
  if (type === 'end of road') return `Yo'l oxirida${street}`;
  if (type === 'continue') return `Davom eting${street}`;
  if (type === 'new name') return `Davom eting${street}`;
  
  if (type === 'turn' || type === 'ramp' || type === 'exit roundabout') {
    switch (modifier) {
      case 'left': return `Chapga buruling${street}`;
      case 'right': return `O'ngga buruling${street}`;
      case 'sharp left': return `Keskin chapga buruling${street}`;
      case 'sharp right': return `Keskin o'ngga buruling${street}`;
      case 'slight left': return `Biroz chapga buruling${street}`;
      case 'slight right': return `Biroz o'ngga buruling${street}`;
      case 'uturn': return `Orqaga buruling${street}`;
      case 'straight': return `To'g'ri davom eting${street}`;
      default: return `Davom eting${street}`;
    }
  }
  
  return `Davom eting${street}`;
};

// Format distance for display
export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
};

// Format duration for display
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)} sek`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} daq`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours} soat ${mins} daq`;
};

export function useDirections() {
  const [state, setState] = useState<DirectionsState>({
    origin: null,
    destination: null,
    routes: [],
    selectedRouteIndex: 0,
    isLoading: false,
    error: null,
    isNavigating: false,
    currentStepIndex: 0,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search for places using Nominatim
  const searchPlaces = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!query || query.length < 2) return [];
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'uz,ru,en',
          },
        }
      );
      
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      
      return data.map((item: any) => ({
        place_id: item.place_id,
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: item.type,
        address: item.address,
      }));
    } catch (error) {
      console.error('Place search error:', error);
      return [];
    }
  }, []);

  // Reverse geocode a location
  const reverseGeocode = useCallback(async (lat: number, lon: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'uz,ru,en',
          },
        }
      );
      
      if (!response.ok) return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      
      const data = await response.json();
      return data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
  }, []);

  // Get route from OSRM
  const getRoute = useCallback(async (
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: TransportMode = 'driving',
    alternatives: boolean = true
  ): Promise<RouteAlternative[]> => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const profile = getOSRMProfile(mode);
    
    // Use OSRM demo server (for production, consider hosting your own or using a paid service)
    const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;
    
    try {
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) throw new Error('Routing failed');
      
      const data = await response.json();
      
      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error('No route found');
      }
      
      return data.routes.map((route: any, index: number) => {
        const steps: RouteStep[] = [];
        
        route.legs?.[0]?.steps?.forEach((step: any) => {
          steps.push({
            instruction: translateManeuver(
              step.maneuver?.type,
              step.maneuver?.modifier,
              step.name
            ),
            distance: step.distance,
            duration: step.duration,
            maneuver: {
              type: step.maneuver?.type || 'turn',
              modifier: step.maneuver?.modifier,
              bearing_before: step.maneuver?.bearing_before,
              bearing_after: step.maneuver?.bearing_after,
              location: step.maneuver?.location || [origin.lng, origin.lat],
            },
            name: step.name || '',
          });
        });
        
        // Convert GeoJSON coordinates to [lat, lng] pairs for Leaflet
        const geometry: [number, number][] = route.geometry?.coordinates?.map(
          (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
        ) || [];
        
        return {
          id: index,
          geometry,
          distance: route.distance,
          duration: route.duration,
          steps,
          summary: route.legs?.[0]?.summary || '',
        };
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return [];
      }
      throw error;
    }
  }, []);

  // Calculate route
  const calculateRoute = useCallback(async (
    origin: { lat: number; lng: number; name: string },
    destination: { lat: number; lng: number; name: string },
    mode: TransportMode = 'driving'
  ) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const routes = await getRoute(origin, destination, mode, true);
      
      if (!routes.length) {
        throw new Error("Yo'l topilmadi");
      }
      
      setState(prev => ({
        ...prev,
        origin,
        destination,
        routes,
        selectedRouteIndex: 0,
        isLoading: false,
        error: null,
      }));
      
      return routes[0];
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || "Yo'l hisoblashda xatolik",
        routes: [],
      }));
      return null;
    }
  }, [getRoute]);

  // Select alternative route
  const selectRoute = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      selectedRouteIndex: index,
    }));
  }, []);

  // Start navigation mode
  const startNavigation = useCallback(() => {
    if (state.routes.length === 0) return;
    
    setState(prev => ({
      ...prev,
      isNavigating: true,
      currentStepIndex: 0,
    }));
  }, [state.routes.length]);

  // Stop navigation
  const stopNavigation = useCallback(() => {
    setState(prev => ({
      ...prev,
      isNavigating: false,
      currentStepIndex: 0,
    }));
  }, []);

  // Move to next step
  const nextStep = useCallback(() => {
    setState(prev => {
      const route = prev.routes[prev.selectedRouteIndex];
      if (!route) return prev;
      
      const nextIndex = Math.min(prev.currentStepIndex + 1, route.steps.length - 1);
      return { ...prev, currentStepIndex: nextIndex };
    });
  }, []);

  // Move to previous step
  const prevStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStepIndex: Math.max(0, prev.currentStepIndex - 1),
    }));
  }, []);

  // Clear route
  const clearRoute = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setState({
      origin: null,
      destination: null,
      routes: [],
      selectedRouteIndex: 0,
      isLoading: false,
      error: null,
      isNavigating: false,
      currentStepIndex: 0,
    });
  }, []);

  // Set origin
  const setOrigin = useCallback((origin: { lat: number; lng: number; name: string } | null) => {
    setState(prev => ({ ...prev, origin, routes: [], selectedRouteIndex: 0 }));
  }, []);

  // Set destination
  const setDestination = useCallback((destination: { lat: number; lng: number; name: string } | null) => {
    setState(prev => ({ ...prev, destination, routes: [], selectedRouteIndex: 0 }));
  }, []);

  // Get currently selected route
  const selectedRoute = state.routes[state.selectedRouteIndex] || null;
  const currentStep = selectedRoute?.steps[state.currentStepIndex] || null;

  return {
    ...state,
    selectedRoute,
    currentStep,
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
    formatDistance,
    formatDuration,
    getManeuverIcon,
  };
}
