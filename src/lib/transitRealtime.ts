import { supabase } from '@/integrations/supabase/client';

export interface TransitRealtimeStatus {
  configured: boolean;
  staticGtfs?: boolean;
  arrivals?: boolean;
  vehicles?: boolean;
  routing?: boolean;
}

export interface TransitRealtimeArrival {
  routeId: string;
  ref: string;
  name: string;
  color?: string | null;
  minutes: number;
  tripId?: string;
  gtfsStopId?: string;
}

export interface TransitJourneyStep {
  distanceM?: number;
  durationS?: number;
  instruction?: string;
  name?: string;
  maneuver?: string;
  modifier?: string;
  mode?: string;
  routeRef?: string;
  from?: string;
  to?: string;
}

export interface TransitJourneyRoute {
  mode: 'transit';
  durationS: number;
  distanceM: number;
  coordinates: [number, number][];
  steps: TransitJourneyStep[];
  label: string;
  transfers?: number;
  fare?: unknown;
  legs?: unknown[];
}

export interface TransitRealtimeVehicle {
  id: string;
  label?: string;
  routeId: string;
  ref: string;
  name: string;
  color?: string | null;
  tripId?: string;
  latitude: number;
  longitude: number;
  bearing?: number | null;
  speedMps?: number | null;
  timestamp?: number | null;
}

interface ArrivalsResponse {
  configured?: boolean;
  realtime?: boolean;
  stale?: boolean;
  gtfsStopId?: string;
  matchedStopName?: string | null;
  arrivals?: TransitRealtimeArrival[];
}

interface VehiclesResponse {
  configured?: boolean;
  realtime?: boolean;
  stale?: boolean;
  vehicles?: TransitRealtimeVehicle[];
}

async function invokeTransit<T>(payload: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke('transit-realtime', {
      body: payload,
    });
    if (error) return null;
    return data as T;
  } catch {
    return null;
  }
}

export async function fetchTransitRealtimeStatus(): Promise<TransitRealtimeStatus> {
  const data = await invokeTransit<TransitRealtimeStatus>({ action: 'status' });
  return data ?? { configured: false };
}

export async function fetchTransitArrivals(input: {
  stopId?: string;
  latitude: number;
  longitude: number;
}): Promise<ArrivalsResponse | null> {
  return await invokeTransit<ArrivalsResponse>({
    action: 'arrivals',
    stopId: input.stopId,
    latitude: input.latitude,
    longitude: input.longitude,
  });
}

export async function fetchTransitVehicles(input: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<VehiclesResponse | null> {
  return await invokeTransit<VehiclesResponse>({
    action: 'vehicles',
    ...input,
  });
}


export async function fetchTransitJourneyRoutes(input: {
  from: { latitude: number; longitude: number; name?: string };
  to: { latitude: number; longitude: number; name?: string };
  departureTime?: string | null;
  arriveBy?: boolean;
}): Promise<{ configured?: boolean; routes?: TransitJourneyRoute[] } | null> {
  return await invokeTransit({
    action: 'route',
    ...input,
  });
}
