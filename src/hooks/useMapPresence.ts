import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface MapPresenceUser {
  user_id: string;
  online_at: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

export function useMapPresence(userId: string | null, userProfile?: { display_name?: string | null; avatar_url?: string | null; username?: string | null }) {
  const [usersOnMap, setUsersOnMap] = useState<MapPresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    channelRef.current = supabase.channel('map-presence', {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channelRef.current
      .on('presence', { event: 'sync' }, () => {
        const state = channelRef.current?.presenceState() || {};
        const users: MapPresenceUser[] = [];
        
        Object.entries(state).forEach(([key, presences]) => {
          if (key !== userId && Array.isArray(presences) && presences.length > 0) {
            const presence = presences[0] as any;
            users.push({
              user_id: key,
              online_at: presence.online_at,
              display_name: presence.display_name,
              avatar_url: presence.avatar_url,
              username: presence.username,
            });
          }
        });
        
        setUsersOnMap(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined map:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left map:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        
        await channelRef.current?.track({
          user_id: userId,
          online_at: new Date().toISOString(),
          display_name: userProfile?.display_name || undefined,
          avatar_url: userProfile?.avatar_url || undefined,
          username: userProfile?.username || undefined,
        });
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, userProfile?.display_name, userProfile?.avatar_url, userProfile?.username]);

  return { usersOnMap };
}
