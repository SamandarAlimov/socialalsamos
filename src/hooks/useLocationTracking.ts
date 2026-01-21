import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
  recorded_at: string;
}

export interface FrequentPlace {
  id: string;
  user_id: string;
  name: string;
  place_type: 'home' | 'work' | 'study' | 'other';
  latitude: number;
  longitude: number;
  address?: string;
  average_stay_minutes: number;
  visit_count: number;
  last_visited_at?: string;
  is_auto_detected: boolean;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

export interface DailyRoute {
  id: string;
  user_id: string;
  route_date: string;
  total_distance_km: number;
  total_duration_minutes: number;
  places_visited: number;
  route_geometry: [number, number][];
  visits_summary: PlaceVisit[];
  created_at: string;
  updated_at: string;
}

export interface PlaceVisit {
  place_id?: string;
  name: string;
  latitude: number;
  longitude: number;
  arrived_at: string;
  left_at?: string;
  duration_minutes: number;
}

interface StayCluster {
  latitude: number;
  longitude: number;
  points: LocationPoint[];
  startTime: Date;
  endTime: Date;
  averageLat: number;
  averageLng: number;
}

const TRACKING_INTERVAL = 60000; // 1 minute
const STAY_THRESHOLD_METERS = 100; // Consider same location if within 100m
const MIN_STAY_DURATION_MINUTES = 15; // Minimum time to consider a "stay"
const HOME_NIGHT_START = 20; // 8 PM
const HOME_NIGHT_END = 7; // 7 AM
const WORK_DAY_START = 8; // 8 AM
const WORK_DAY_END = 18; // 6 PM

export function useLocationTracking() {
  const { user } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [frequentPlaces, setFrequentPlaces] = useState<FrequentPlace[]>([]);
  const [dailyRoutes, setDailyRoutes] = useState<DailyRoute[]>([]);
  const [todayRoute, setTodayRoute] = useState<DailyRoute | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStay, setCurrentStay] = useState<StayCluster | null>(null);
  
  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRecordedLocationRef = useRef<LocationPoint | null>(null);

  // Calculate distance between two points using Haversine formula
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Record current location to database
  const recordLocation = useCallback(async (latitude: number, longitude: number, accuracy?: number) => {
    if (!user) return;

    const now = new Date().toISOString();
    
    // Check if we should record (moved enough or enough time passed)
    if (lastRecordedLocationRef.current) {
      const distance = calculateDistance(
        lastRecordedLocationRef.current.latitude,
        lastRecordedLocationRef.current.longitude,
        latitude,
        longitude
      );
      
      // Only record if moved more than 10 meters or 5 minutes passed
      const timeDiff = new Date(now).getTime() - new Date(lastRecordedLocationRef.current.recorded_at).getTime();
      if (distance < 10 && timeDiff < 300000) {
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('location_history')
        .insert({
          user_id: user.id,
          latitude,
          longitude,
          accuracy,
          recorded_at: now,
        });

      if (!error) {
        lastRecordedLocationRef.current = { latitude, longitude, accuracy, recorded_at: now };
        
        // Update stay detection
        await updateStayDetection(latitude, longitude, now);
        
        // Update today's route
        await updateTodayRoute(latitude, longitude);
      }
    } catch (err) {
      console.error('Failed to record location:', err);
    }
  }, [user, calculateDistance]);

  // Update stay detection logic
  const updateStayDetection = useCallback(async (latitude: number, longitude: number, timestamp: string) => {
    if (!user) return;

    const now = new Date(timestamp);
    
    if (currentStay) {
      const distance = calculateDistance(
        currentStay.averageLat,
        currentStay.averageLng,
        latitude,
        longitude
      );

      if (distance < STAY_THRESHOLD_METERS) {
        // Still at same location, update cluster
        const newPoints = [...currentStay.points, { latitude, longitude, recorded_at: timestamp }];
        const avgLat = newPoints.reduce((sum, p) => sum + p.latitude, 0) / newPoints.length;
        const avgLng = newPoints.reduce((sum, p) => sum + p.longitude, 0) / newPoints.length;
        
        setCurrentStay({
          ...currentStay,
          points: newPoints,
          endTime: now,
          averageLat: avgLat,
          averageLng: avgLng,
        });
      } else {
        // Moved to new location, process previous stay
        const stayDuration = (currentStay.endTime.getTime() - currentStay.startTime.getTime()) / 60000;
        
        if (stayDuration >= MIN_STAY_DURATION_MINUTES) {
          await processStay(currentStay);
        }
        
        // Start new cluster
        setCurrentStay({
          latitude,
          longitude,
          points: [{ latitude, longitude, recorded_at: timestamp }],
          startTime: now,
          endTime: now,
          averageLat: latitude,
          averageLng: longitude,
        });
      }
    } else {
      // Start first cluster
      setCurrentStay({
        latitude,
        longitude,
        points: [{ latitude, longitude, recorded_at: timestamp }],
        startTime: now,
        endTime: now,
        averageLat: latitude,
        averageLng: longitude,
      });
    }
  }, [user, currentStay, calculateDistance]);

  // Process a detected stay and update frequent places
  const processStay = useCallback(async (stay: StayCluster) => {
    if (!user) return;

    const stayHour = stay.startTime.getHours();
    const stayDuration = (stay.endTime.getTime() - stay.startTime.getTime()) / 60000;
    
    // Determine place type based on time
    let placeType: 'home' | 'work' | 'study' | 'other' = 'other';
    
    if (stayHour >= HOME_NIGHT_START || stayHour < HOME_NIGHT_END) {
      placeType = 'home';
    } else if (stayHour >= WORK_DAY_START && stayHour < WORK_DAY_END && stayDuration >= 120) {
      placeType = 'work';
    }

    // Check if we have a similar place already
    const existingPlace = frequentPlaces.find(p => {
      const distance = calculateDistance(p.latitude, p.longitude, stay.averageLat, stay.averageLng);
      return distance < STAY_THRESHOLD_METERS;
    });

    if (existingPlace) {
      // Update existing place
      const newVisitCount = existingPlace.visit_count + 1;
      const newAvgStay = Math.round(
        (existingPlace.average_stay_minutes * existingPlace.visit_count + stayDuration) / newVisitCount
      );
      
      // Increase confidence if same type detected
      let newConfidence = existingPlace.confidence_score;
      if (existingPlace.place_type === placeType) {
        newConfidence = Math.min(1, existingPlace.confidence_score + 0.1);
      }

      await supabase
        .from('frequent_places')
        .update({
          visit_count: newVisitCount,
          average_stay_minutes: newAvgStay,
          last_visited_at: stay.endTime.toISOString(),
          confidence_score: newConfidence,
        })
        .eq('id', existingPlace.id);
    } else {
      // Create new place
      const placeName = placeType === 'home' ? 'Uy' : placeType === 'work' ? 'Ish joyi' : 'Joy';
      
      await supabase
        .from('frequent_places')
        .insert({
          user_id: user.id,
          name: placeName,
          place_type: placeType,
          latitude: stay.averageLat,
          longitude: stay.averageLng,
          average_stay_minutes: Math.round(stayDuration),
          visit_count: 1,
          last_visited_at: stay.endTime.toISOString(),
          is_auto_detected: true,
          confidence_score: 0.3,
        });
    }

    // Refresh frequent places
    await fetchFrequentPlaces();
  }, [user, frequentPlaces, calculateDistance]);

  // Helper to convert database row to DailyRoute
  const convertToDailyRoute = (data: any): DailyRoute => ({
    id: data.id,
    user_id: data.user_id,
    route_date: data.route_date,
    total_distance_km: data.total_distance_km || 0,
    total_duration_minutes: data.total_duration_minutes || 0,
    places_visited: data.places_visited || 0,
    route_geometry: (data.route_geometry as [number, number][]) || [],
    visits_summary: (data.visits_summary as PlaceVisit[]) || [],
    created_at: data.created_at,
    updated_at: data.updated_at,
  });

  // Update today's route
  const updateTodayRoute = useCallback(async (latitude: number, longitude: number) => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Get or create today's route
      const { data: existingRoute } = await supabase
        .from('daily_routes')
        .select('*')
        .eq('user_id', user.id)
        .eq('route_date', today)
        .single();

      if (existingRoute) {
        // Update existing route
        const geometry = (existingRoute.route_geometry as [number, number][]) || [];
        const lastPoint = geometry[geometry.length - 1];
        
        let newDistance = existingRoute.total_distance_km || 0;
        if (lastPoint) {
          const distance = calculateDistance(lastPoint[0], lastPoint[1], latitude, longitude);
          newDistance += distance / 1000; // Convert to km
        }

        geometry.push([latitude, longitude]);

        await supabase
          .from('daily_routes')
          .update({
            route_geometry: geometry as any,
            total_distance_km: newDistance,
          })
          .eq('id', existingRoute.id);

        setTodayRoute(convertToDailyRoute({
          ...existingRoute,
          route_geometry: geometry,
          total_distance_km: newDistance,
        }));
      } else {
        // Create new route for today
        const { data: newRoute } = await supabase
          .from('daily_routes')
          .insert({
            user_id: user.id,
            route_date: today,
            route_geometry: [[latitude, longitude]] as any,
            total_distance_km: 0,
            total_duration_minutes: 0,
            places_visited: 0,
            visits_summary: [] as any,
          })
          .select()
          .single();

        if (newRoute) {
          setTodayRoute(convertToDailyRoute(newRoute));
        }
      }
    } catch (err) {
      console.error('Failed to update today route:', err);
    }
  }, [user, calculateDistance]);

  // Fetch frequent places
  const fetchFrequentPlaces = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('frequent_places')
        .select('*')
        .eq('user_id', user.id)
        .order('visit_count', { ascending: false });

      if (!error && data) {
        setFrequentPlaces(data as FrequentPlace[]);
      }
    } catch (err) {
      console.error('Failed to fetch frequent places:', err);
    }
  }, [user]);

  // Fetch daily routes
  const fetchDailyRoutes = useCallback(async (days: number = 7) => {
    if (!user) return;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('daily_routes')
        .select('*')
        .eq('user_id', user.id)
        .gte('route_date', startDate.toISOString().split('T')[0])
        .order('route_date', { ascending: false });

      if (!error && data) {
        const routes = data.map(convertToDailyRoute);
        setDailyRoutes(routes);
        
        // Set today's route
        const today = new Date().toISOString().split('T')[0];
        const todayData = routes.find(r => r.route_date === today);
        if (todayData) {
          setTodayRoute(todayData);
        }
      }
    } catch (err) {
      console.error('Failed to fetch daily routes:', err);
    }
  }, [user]);

  // Start background tracking
  const startTracking = useCallback(() => {
    if (!navigator.geolocation || isTracking) return;

    setIsTracking(true);

    // Record immediately
    navigator.geolocation.getCurrentPosition(
      (position) => {
        recordLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
      },
      (err) => console.error('Geolocation error:', err),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Set up interval for continuous tracking
    trackingIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          recordLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
        },
        (err) => console.error('Geolocation error:', err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }, TRACKING_INTERVAL);
  }, [isTracking, recordLocation]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Update place name
  const updatePlaceName = useCallback(async (placeId: string, name: string) => {
    if (!user) return;

    try {
      await supabase
        .from('frequent_places')
        .update({ name, is_auto_detected: false })
        .eq('id', placeId)
        .eq('user_id', user.id);

      await fetchFrequentPlaces();
    } catch (err) {
      console.error('Failed to update place name:', err);
    }
  }, [user, fetchFrequentPlaces]);

  // Delete place
  const deletePlace = useCallback(async (placeId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('frequent_places')
        .delete()
        .eq('id', placeId)
        .eq('user_id', user.id);

      await fetchFrequentPlaces();
    } catch (err) {
      console.error('Failed to delete place:', err);
    }
  }, [user, fetchFrequentPlaces]);

  // Get home location
  const getHomeLocation = useCallback(() => {
    return frequentPlaces.find(p => p.place_type === 'home' && p.confidence_score >= 0.5);
  }, [frequentPlaces]);

  // Get work location
  const getWorkLocation = useCallback(() => {
    return frequentPlaces.find(p => p.place_type === 'work' && p.confidence_score >= 0.5);
  }, [frequentPlaces]);

  // Get total distance for period
  const getTotalDistance = useCallback((days: number = 7) => {
    return dailyRoutes
      .filter(r => {
        const routeDate = new Date(r.route_date);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return routeDate >= cutoff;
      })
      .reduce((sum, r) => sum + (r.total_distance_km || 0), 0);
  }, [dailyRoutes]);

  // Initial fetch and auto-start tracking
  useEffect(() => {
    if (user) {
      setIsLoading(true);
      Promise.all([fetchFrequentPlaces(), fetchDailyRoutes(30)])
        .finally(() => setIsLoading(false));
      
      // Auto-start tracking when user is available
      if (!isTracking && navigator.geolocation) {
        startTracking();
      }
    }
  }, [user, fetchFrequentPlaces, fetchDailyRoutes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
    };
  }, []);

  return {
    isTracking,
    isLoading,
    frequentPlaces,
    dailyRoutes,
    todayRoute,
    startTracking,
    stopTracking,
    fetchFrequentPlaces,
    fetchDailyRoutes,
    updatePlaceName,
    deletePlace,
    getHomeLocation,
    getWorkLocation,
    getTotalDistance,
    recordLocation,
  };
}
