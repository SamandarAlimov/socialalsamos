import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UserStatus {
  user_id: string;
  is_online: boolean;
  last_seen: string | null;
}

const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const OFFLINE_THRESHOLD = 30000; // 30 seconds

export function useRealtimeStatus() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Map<string, UserStatus>>(new Map());
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(true);

  // Update own status with heartbeat
  useEffect(() => {
    if (!user) return;

    const updateStatus = async (online: boolean) => {
      try {
        await supabase
          .from('profiles')
          .update({ 
            is_online: online, 
            last_seen: new Date().toISOString() 
          })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error updating status:', error);
      }
    };

    // Set online immediately
    updateStatus(true);

    // Heartbeat every 10 seconds
    updateIntervalRef.current = setInterval(() => {
      if (isActiveRef.current) {
        updateStatus(true);
      }
    }, HEARTBEAT_INTERVAL);

    // Handle visibility change
    const handleVisibilityChange = () => {
      isActiveRef.current = document.visibilityState === 'visible';
      if (isActiveRef.current) {
        updateStatus(true);
      }
    };

    // Handle beforeunload
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable offline status on page close
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`;
      const data = JSON.stringify({ 
        is_online: false, 
        last_seen: new Date().toISOString() 
      });
      
      navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Set offline on cleanup
      updateStatus(false);
    };
  }, [user]);

  // Subscribe to all profile status changes
  useEffect(() => {
    const channel = supabase
      .channel('realtime-status-global')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const { id, is_online, last_seen } = payload.new as any;
          setOnlineUsers(prev => {
            const newMap = new Map(prev);
            newMap.set(id, { 
              user_id: id, 
              is_online: is_online ?? false, 
              last_seen 
            });
            return newMap;
          });
        }
      )
      .subscribe((status) => {
        console.log('User status channel:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isUserOnline = useCallback((userId: string) => {
    const status = onlineUsers.get(userId);
    if (!status) return false;
    
    // Check if last seen is within threshold
    if (status.last_seen) {
      const lastSeen = new Date(status.last_seen);
      const now = new Date();
      const diffMs = now.getTime() - lastSeen.getTime();
      return diffMs < OFFLINE_THRESHOLD;
    }
    
    return status.is_online;
  }, [onlineUsers]);

  const getUserLastSeen = useCallback((userId: string) => {
    const status = onlineUsers.get(userId);
    return status?.last_seen || null;
  }, [onlineUsers]);

  return { onlineUsers, isUserOnline, getUserLastSeen };
}

// Hook to track a specific user's online status with realtime updates
export function useUserOnlineStatus(userId: string | null) {
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSeenRef = useRef<string | null>(null);

  // Keep ref in sync - always runs
  lastSeenRef.current = lastSeen;

  useEffect(() => {
    // Clear interval on every effect run
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }

    if (!userId) {
      setIsOnline(false);
      setLastSeen(null);
      return;
    }

    // Fetch initial status
    const fetchStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_online, last_seen')
          .eq('id', userId)
          .single();

        if (!error && data) {
          setLastSeen(data.last_seen);
          
          // Check if truly online based on last_seen time
          if (data.last_seen) {
            const lastSeenTime = new Date(data.last_seen);
            const now = new Date();
            const diffMs = now.getTime() - lastSeenTime.getTime();
            setIsOnline(diffMs < OFFLINE_THRESHOLD);
          } else {
            setIsOnline(data.is_online ?? false);
          }
        }
      } catch (error) {
        console.error('Error fetching user status:', error);
      }
    };

    fetchStatus();

    // Subscribe to realtime changes for this specific user
    const channel = supabase
      .channel(`user-status-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          const { is_online, last_seen: newLastSeen } = payload.new as any;
          
          setLastSeen(newLastSeen);
          
          // Check if truly online based on last_seen time
          if (newLastSeen) {
            const lastSeenTime = new Date(newLastSeen);
            const now = new Date();
            const diffMs = now.getTime() - lastSeenTime.getTime();
            setIsOnline(diffMs < OFFLINE_THRESHOLD);
          } else {
            setIsOnline(is_online ?? false);
          }
        }
      )
      .subscribe();

    // Periodically check if user went offline (for stale status)
    checkIntervalRef.current = setInterval(() => {
      const currentLastSeen = lastSeenRef.current;
      if (currentLastSeen) {
        const lastSeenTime = new Date(currentLastSeen);
        const now = new Date();
        const diffMs = now.getTime() - lastSeenTime.getTime();
        const shouldBeOnline = diffMs < OFFLINE_THRESHOLD;
        setIsOnline(shouldBeOnline);
      }
    }, 5000); // Check every 5 seconds

    return () => {
      supabase.removeChannel(channel);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [userId]);

  return { isOnline, lastSeen };
}
