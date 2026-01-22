import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface OnlineUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  last_seen: string;
}

interface CountryStats {
  country: string;
  count: number;
  users: OnlineUser[];
  // Approximate center coordinates for major countries
  lat: number;
  lng: number;
}

// Country coordinates mapping
const COUNTRY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Uzbekistan': { lat: 41.3775, lng: 64.5853 },
  'Russia': { lat: 55.7558, lng: 37.6173 },
  'Kazakhstan': { lat: 51.1694, lng: 71.4491 },
  'USA': { lat: 37.0902, lng: -95.7129 },
  'United States': { lat: 37.0902, lng: -95.7129 },
  'Germany': { lat: 51.1657, lng: 10.4515 },
  'Turkey': { lat: 38.9637, lng: 35.2433 },
  'United Kingdom': { lat: 55.3781, lng: -3.4360 },
  'UK': { lat: 55.3781, lng: -3.4360 },
  'France': { lat: 46.2276, lng: 2.2137 },
  'Italy': { lat: 41.8719, lng: 12.5674 },
  'Spain': { lat: 40.4637, lng: -3.7492 },
  'China': { lat: 35.8617, lng: 104.1954 },
  'Japan': { lat: 36.2048, lng: 138.2529 },
  'South Korea': { lat: 35.9078, lng: 127.7669 },
  'India': { lat: 20.5937, lng: 78.9629 },
  'Brazil': { lat: -14.2350, lng: -51.9253 },
  'Canada': { lat: 56.1304, lng: -106.3468 },
  'Australia': { lat: -25.2744, lng: 133.7751 },
  'UAE': { lat: 23.4241, lng: 53.8478 },
  'Saudi Arabia': { lat: 23.8859, lng: 45.0792 },
  'Egypt': { lat: 26.8206, lng: 30.8025 },
  'Poland': { lat: 51.9194, lng: 19.1451 },
  'Ukraine': { lat: 48.3794, lng: 31.1656 },
  'Tajikistan': { lat: 38.8610, lng: 71.2761 },
  'Kyrgyzstan': { lat: 41.2044, lng: 74.7661 },
  'Turkmenistan': { lat: 38.9697, lng: 59.5563 },
  'Azerbaijan': { lat: 40.1431, lng: 47.5769 },
  'Unknown': { lat: 0, lng: 0 },
};

export function useAdminOnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [countryStats, setCountryStats] = useState<CountryStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalOnline, setTotalOnline] = useState(0);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, country, last_seen')
        .eq('is_online', true)
        .gte('last_seen', thirtySecondsAgo)
        .limit(500);

      if (error) {
        console.error('Error fetching online users:', error);
        return;
      }

      const users = (data || []) as OnlineUser[];
      setOnlineUsers(users);
      setTotalOnline(users.length);

      // Group by country
      const countryMap = new Map<string, OnlineUser[]>();
      users.forEach(user => {
        const country = user.country || 'Unknown';
        if (!countryMap.has(country)) {
          countryMap.set(country, []);
        }
        countryMap.get(country)!.push(user);
      });

      // Convert to array with coordinates
      const stats: CountryStats[] = Array.from(countryMap.entries())
        .map(([country, users]) => ({
          country,
          count: users.length,
          users,
          ...(COUNTRY_COORDS[country] || COUNTRY_COORDS['Unknown'])
        }))
        .filter(s => s.lat !== 0 || s.lng !== 0) // Filter out unknown locations
        .sort((a, b) => b.count - a.count);

      setCountryStats(stats);
    } catch (err) {
      console.error('Error in fetchOnlineUsers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOnlineUsers();

    // Set up realtime subscription for presence changes
    const channel: RealtimeChannel = supabase
      .channel('admin-online-users')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: 'is_online=eq.true'
        },
        () => {
          fetchOnlineUsers();
        }
      )
      .subscribe();

    // Refresh every 10 seconds
    const interval = setInterval(fetchOnlineUsers, 10000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, [fetchOnlineUsers]);

  return {
    onlineUsers,
    countryStats,
    totalOnline,
    isLoading,
    refetch: fetchOnlineUsers
  };
}
