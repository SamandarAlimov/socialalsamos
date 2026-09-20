import { useCallback, useEffect, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import { getCountryName } from '@/lib/locations';

interface OnlineGeoRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_seen: string;
  country_code: string | null;
  country_source: string | null;
  country_confidence: number | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface OnlineUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  country_code: string | null;
  country_source: string | null;
  country_confidence: number;
  last_seen: string;
}

interface CountryStats {
  country: string;
  country_code: string;
  count: number;
  users: OnlineUser[];
  lat: number;
  lng: number;
  avgConfidence: number;
}

export function useAdminOnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [countryStats, setCountryStats] = useState<CountryStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalOnline, setTotalOnline] = useState(0);
  const [unresolvedOnline, setUnresolvedOnline] = useState(0);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).rpc('admin_online_geo_v1', {
        p_limit: 500,
      });

      if (error) {
        console.error('Error fetching resolved online users:', error);
        return;
      }

      const rows = (Array.isArray(data) ? data : []) as OnlineGeoRow[];
      const users: OnlineUser[] = rows.map((row) => ({
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        last_seen: row.last_seen,
        country_code: row.country_code,
        country: row.country_code ? getCountryName(row.country_code, 'uz') : null,
        country_source: row.country_source,
        country_confidence: Number(row.country_confidence || 0),
      }));

      setOnlineUsers(users);
      setTotalOnline(users.length);
      setUnresolvedOnline(users.filter((user) => !user.country_code).length);

      const grouped = new Map<string, { users: OnlineUser[]; lat: number; lng: number }>();
      rows.forEach((row, index) => {
        const code = row.country_code?.toUpperCase();
        const lat = Number(row.latitude);
        const lng = Number(row.longitude);
        if (!code || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const user = users[index];
        const current = grouped.get(code);
        if (current) current.users.push(user);
        else grouped.set(code, { users: [user], lat, lng });
      });

      setCountryStats(
        Array.from(grouped.entries())
          .map(([country_code, item]) => ({
            country_code,
            country: getCountryName(country_code, 'uz'),
            count: item.users.length,
            users: item.users,
            lat: item.lat,
            lng: item.lng,
            avgConfidence:
              item.users.reduce((sum, user) => sum + user.country_confidence, 0) /
              Math.max(1, item.users.length),
          }))
          .sort((a, b) => b.count - a.count),
      );
    } catch (err) {
      console.error('Error in fetchOnlineUsers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOnlineUsers();

    const channel: RealtimeChannel = supabase
      .channel('admin-online-users')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => void fetchOnlineUsers(),
      )
      .subscribe();

    const interval = window.setInterval(() => void fetchOnlineUsers(), 10_000);

    return () => {
      void channel.unsubscribe();
      window.clearInterval(interval);
    };
  }, [fetchOnlineUsers]);

  return {
    onlineUsers,
    countryStats,
    totalOnline,
    unresolvedOnline,
    isLoading,
    refetch: fetchOnlineUsers,
  };
}
