import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface UserLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  is_sharing: boolean;
  last_updated: string;
  battery_level?: number;
  steps_today?: number;
  profile?: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_online: boolean;
  };
}

interface StepData {
  date: string;
  steps: number;
}

export function useLocation() {
  const { user } = useAuth();
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isSharing, setIsSharing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<UserLocation[]>([]);
  const [followingLocations, setFollowingLocations] = useState<UserLocation[]>([]);
  const [stepsToday, setStepsToday] = useState(0);
  const [stepHistory, setStepHistory] = useState<StepData[]>([]);
  
  const watchIdRef = useRef<number | null>(null);
  const stepCounterRef = useRef<number>(0);
  const lastStepTimeRef = useRef<number>(Date.now());
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Get current position
  const getCurrentPosition = useCallback((): Promise<Location> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          setCurrentLocation(loc);
          resolve(loc);
        },
        (err) => {
          setError(err.message);
          reject(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }, []);
  
  // Start watching position
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    
    setIsTracking(true);
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        setCurrentLocation(loc);
        setError(null);
        
        // Simulate step counter based on movement
        const now = Date.now();
        if (now - lastStepTimeRef.current > 1000) {
          stepCounterRef.current += Math.floor(Math.random() * 5) + 1;
          setStepsToday(stepCounterRef.current);
          lastStepTimeRef.current = now;
        }
        
        // Update location in database if sharing
        if (isSharing && user) {
          await updateLocationInDB(loc);
        }
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  }, [isSharing, user]);
  
  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);
  
  // Update location in database
  const updateLocationInDB = useCallback(async (location: Location) => {
    if (!user) return;
    
    try {
      // Using profiles table to store location temporarily
      await supabase
        .from('profiles')
        .update({
          location: `${location.latitude},${location.longitude}`,
          last_seen: new Date().toISOString(),
        })
        .eq('id', user.id);
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  }, [user]);
  
  // Toggle location sharing
  const toggleSharing = useCallback(async () => {
    const newSharing = !isSharing;
    setIsSharing(newSharing);
    
    if (!newSharing && user) {
      // Clear location from database
      await supabase
        .from('profiles')
        .update({ location: null })
        .eq('id', user.id);
    }
  }, [isSharing, user]);
  
  // Fetch nearby users
  const fetchNearbyUsers = useCallback(async (radiusKm: number = 5) => {
    if (!currentLocation || !user) return;
    
    try {
      // Get all users with locations
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online, location, last_seen')
        .neq('id', user.id)
        .not('location', 'is', null);
      
      if (error) throw error;
      
      // Filter by distance
      const nearby = profiles
        ?.map((profile) => {
          if (!profile.location) return null;
          const [lat, lng] = profile.location.split(',').map(Number);
          const distance = calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            lat,
            lng
          );
          
          if (distance <= radiusKm) {
            return {
              user_id: profile.id,
              latitude: lat,
              longitude: lng,
              is_sharing: true,
              last_updated: profile.last_seen,
              profile: {
                id: profile.id,
                username: profile.username,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
                is_online: profile.is_online,
              },
            } as UserLocation;
          }
          return null;
        })
        .filter(Boolean) as UserLocation[];
      
      setNearbyUsers(nearby || []);
    } catch (err) {
      console.error('Failed to fetch nearby users:', err);
    }
  }, [currentLocation, user]);
  
  // Fetch following users' locations
  const fetchFollowingLocations = useCallback(async () => {
    if (!user) return;
    
    try {
      // Get users I'm following
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);
      
      if (followsError) throw followsError;
      
      if (!follows?.length) {
        setFollowingLocations([]);
        return;
      }
      
      const followingIds = follows.map((f) => f.following_id);
      
      // Get their profiles with locations
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online, location, last_seen')
        .in('id', followingIds)
        .not('location', 'is', null);
      
      if (error) throw error;
      
      const locations = profiles
        ?.map((profile) => {
          if (!profile.location) return null;
          const [lat, lng] = profile.location.split(',').map(Number);
          
          return {
            user_id: profile.id,
            latitude: lat,
            longitude: lng,
            is_sharing: true,
            last_updated: profile.last_seen,
            profile: {
              id: profile.id,
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
              is_online: profile.is_online,
            },
          } as UserLocation;
        })
        .filter(Boolean) as UserLocation[];
      
      setFollowingLocations(locations || []);
    } catch (err) {
      console.error('Failed to fetch following locations:', err);
    }
  }, [user]);
  
  // Subscribe to realtime location updates for followed users
  const subscribeToRealtimeLocations = useCallback(async () => {
    if (!user) return;
    
    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }
    
    // Get list of users I'm following
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    
    if (!follows?.length) return;
    
    const followingIds = follows.map((f) => f.following_id);
    
    // Subscribe to profile updates for followed users
    realtimeChannelRef.current = supabase
      .channel('following-locations')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=in.(${followingIds.join(',')})`,
        },
        (payload) => {
          const updatedProfile = payload.new as any;
          
          if (updatedProfile.location) {
            const [lat, lng] = updatedProfile.location.split(',').map(Number);
            
            setFollowingLocations((prev) => {
              const existing = prev.find((u) => u.user_id === updatedProfile.id);
              
              const updatedUser: UserLocation = {
                user_id: updatedProfile.id,
                latitude: lat,
                longitude: lng,
                is_sharing: true,
                last_updated: updatedProfile.last_seen,
                profile: {
                  id: updatedProfile.id,
                  username: updatedProfile.username,
                  display_name: updatedProfile.display_name,
                  avatar_url: updatedProfile.avatar_url,
                  is_online: updatedProfile.is_online,
                },
              };
              
              if (existing) {
                return prev.map((u) => (u.user_id === updatedProfile.id ? updatedUser : u));
              } else {
                return [...prev, updatedUser];
              }
            });
            
            // Also update nearby users if they're in range
            setNearbyUsers((prev) => {
              const existing = prev.find((u) => u.user_id === updatedProfile.id);
              if (existing) {
                return prev.map((u) =>
                  u.user_id === updatedProfile.id
                    ? {
                        ...u,
                        latitude: lat,
                        longitude: lng,
                        last_updated: updatedProfile.last_seen,
                        profile: {
                          id: updatedProfile.id,
                          username: updatedProfile.username,
                          display_name: updatedProfile.display_name,
                          avatar_url: updatedProfile.avatar_url,
                          is_online: updatedProfile.is_online,
                        },
                      }
                    : u
                );
              }
              return prev;
            });
          } else {
            // User stopped sharing location
            setFollowingLocations((prev) => prev.filter((u) => u.user_id !== updatedProfile.id));
            setNearbyUsers((prev) => prev.filter((u) => u.user_id !== updatedProfile.id));
          }
        }
      )
      .subscribe();
  }, [user]);
  
  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  
  const toRad = (deg: number) => deg * (Math.PI / 180);
  
  // Get directions URL
  const getDirectionsUrl = useCallback((destLat: number, destLng: number) => {
    if (!currentLocation) return '';
    
    // Yandex Maps URL
    return `https://yandex.com/maps/?rtext=${currentLocation.latitude},${currentLocation.longitude}~${destLat},${destLng}&rtt=auto`;
  }, [currentLocation]);
  
  // Get Google Maps directions URL as fallback
  const getGoogleMapsUrl = useCallback((destLat: number, destLng: number) => {
    if (!currentLocation) return '';
    return `https://www.google.com/maps/dir/${currentLocation.latitude},${currentLocation.longitude}/${destLat},${destLng}`;
  }, [currentLocation]);
  
  // Load steps from localStorage
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const savedSteps = localStorage.getItem(`steps_${today}`);
    if (savedSteps) {
      stepCounterRef.current = parseInt(savedSteps, 10);
      setStepsToday(stepCounterRef.current);
    }
    
    // Load step history
    const history: StepData[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const steps = localStorage.getItem(`steps_${dateStr}`);
      if (steps) {
        history.push({ date: dateStr, steps: parseInt(steps, 10) });
      }
    }
    setStepHistory(history);
  }, []);
  
  // Save steps periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(`steps_${today}`, stepCounterRef.current.toString());
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Subscribe to realtime updates when user is available
  useEffect(() => {
    if (user) {
      subscribeToRealtimeLocations();
    }
    
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [user, subscribeToRealtimeLocations]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);
  
  return {
    currentLocation,
    isTracking,
    isSharing,
    error,
    nearbyUsers,
    followingLocations,
    stepsToday,
    stepHistory,
    getCurrentPosition,
    startTracking,
    stopTracking,
    toggleSharing,
    fetchNearbyUsers,
    fetchFollowingLocations,
    getDirectionsUrl,
    getGoogleMapsUrl,
    calculateDistance,
    subscribeToRealtimeLocations,
  };
}
