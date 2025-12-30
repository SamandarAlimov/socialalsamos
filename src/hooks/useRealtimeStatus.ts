import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UserPresence {
  user_id: string;
  online_at: string;
}

interface UserStatus {
  isOnline: boolean;
  lastSeen: string | null;
}

const HEARTBEAT_INTERVAL = 15000; // 15 seconds
const OFFLINE_THRESHOLD = 45000; // 45 seconds

/**
 * Hook for managing global realtime user presence using Supabase Presence API
 * This broadcasts the current user's online status to all subscribers
 */
export function useRealtimeStatus() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Map<string, UserPresence>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Create presence channel
    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channelRef.current = channel;

    // Handle presence sync (called when joining or when presence state changes)
    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState<UserPresence>();
      const newOnlineUsers = new Map<string, UserPresence>();
      
      Object.entries(presenceState).forEach(([userId, presences]) => {
        if (presences.length > 0) {
          newOnlineUsers.set(userId, presences[0]);
        }
      });
      
      setOnlineUsers(newOnlineUsers);
    });

    // Handle user joining
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (newPresences.length > 0) {
        const presence = newPresences[0] as unknown as UserPresence;
        setOnlineUsers(prev => {
          const newMap = new Map(prev);
          newMap.set(key, presence);
          return newMap;
        });
      }
    });

    // Handle user leaving
    channel.on('presence', { event: 'leave' }, ({ key }) => {
      setOnlineUsers(prev => {
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      });
    });

    // Subscribe and track own presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: user.id,
          online_at: new Date().toISOString(),
        });
      }
    });

    // Update last_seen in database periodically (for when user goes offline)
    const updateLastSeen = async () => {
      await supabase
        .from('profiles')
        .update({ 
          is_online: true, 
          last_seen: new Date().toISOString() 
        })
        .eq('id', user.id);
    };

    updateLastSeen();
    const heartbeatInterval = setInterval(updateLastSeen, HEARTBEAT_INTERVAL);

    // Handle visibility change - track/untrack presence
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await channel.track({
          user_id: user.id,
          online_at: new Date().toISOString(),
        });
        updateLastSeen();
      } else {
        await channel.untrack();
      }
    };

    // Handle page close - update database
    const handleBeforeUnload = () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Prefer': 'return=minimal',
      };
      
      navigator.sendBeacon(url, new Blob([JSON.stringify({ 
        is_online: false, 
        last_seen: new Date().toISOString() 
      })], { type: 'application/json' }));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Set offline in database
      supabase
        .from('profiles')
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {});
      
      supabase.removeChannel(channel);
    };
  }, [user]);

  const isUserOnline = useCallback((userId: string) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  const getUserLastSeen = useCallback((userId: string) => {
    const presence = onlineUsers.get(userId);
    return presence?.online_at || null;
  }, [onlineUsers]);

  return { onlineUsers, isUserOnline, getUserLastSeen };
}

/**
 * Hook to track a specific user's online status with realtime updates
 * Combines Presence API for realtime online status with database fallback for last seen
 */
export function useUserOnlineStatus(userId: string | null): UserStatus {
  const [status, setStatus] = useState<UserStatus>({ isOnline: false, lastSeen: null });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Cleanup previous
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }

    if (!userId) {
      setStatus({ isOnline: false, lastSeen: null });
      return;
    }

    // Fetch initial status from database
    const fetchInitialStatus = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_online, last_seen')
        .eq('id', userId)
        .single();

      if (!error && data) {
        const lastSeenTime = data.last_seen ? new Date(data.last_seen) : null;
        const isRecentlyOnline = lastSeenTime && 
          (Date.now() - lastSeenTime.getTime()) < OFFLINE_THRESHOLD;
        
        setStatus({
          isOnline: data.is_online && isRecentlyOnline,
          lastSeen: data.last_seen,
        });
      }
    };

    fetchInitialStatus();

    // Subscribe to presence channel to detect when user comes online
    const channel = supabase.channel('online-users');
    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState<UserPresence>();
      const isOnline = Object.keys(presenceState).includes(userId);
      
      if (isOnline) {
        const userPresences = presenceState[userId];
        if (userPresences && userPresences.length > 0) {
          setStatus({
            isOnline: true,
            lastSeen: userPresences[0].online_at,
          });
        }
      }
    });

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (key === userId && newPresences.length > 0) {
        const presence = newPresences[0] as unknown as UserPresence;
        setStatus({
          isOnline: true,
          lastSeen: presence.online_at,
        });
      }
    });

    channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (key === userId) {
        setStatus(prev => ({
          isOnline: false,
          lastSeen: new Date().toISOString(),
        }));
      }
    });

    channel.subscribe();

    // Also subscribe to database changes for last_seen updates
    const dbChannel = supabase
      .channel(`user-status-db-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const { is_online, last_seen } = payload.new as { is_online: boolean; last_seen: string };
          
          // Only update if user is not in presence channel
          const presenceState = channelRef.current?.presenceState<UserPresence>() || {};
          const isInPresence = Object.keys(presenceState).includes(userId);
          
          if (!isInPresence) {
            const lastSeenTime = last_seen ? new Date(last_seen) : null;
            const isRecentlyOnline = lastSeenTime && 
              (Date.now() - lastSeenTime.getTime()) < OFFLINE_THRESHOLD;
            
            setStatus({
              isOnline: is_online && isRecentlyOnline,
              lastSeen: last_seen,
            });
          }
        }
      )
      .subscribe();

    // Periodic check to handle stale status
    checkIntervalRef.current = setInterval(() => {
      setStatus(prev => {
        if (prev.isOnline && prev.lastSeen) {
          const lastSeenTime = new Date(prev.lastSeen);
          const isStillOnline = (Date.now() - lastSeenTime.getTime()) < OFFLINE_THRESHOLD;
          if (!isStillOnline) {
            return { ...prev, isOnline: false };
          }
        }
        return prev;
      });
    }, 10000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      supabase.removeChannel(dbChannel);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [userId]);

  return status;
}
