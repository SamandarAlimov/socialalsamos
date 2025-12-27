import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UserStatus {
  user_id: string;
  is_online: boolean;
  last_seen: string | null;
}

export function useRealtimeStatus() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Map<string, UserStatus>>(new Map());
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update own status periodically
  useEffect(() => {
    if (!user) return;

    const updateStatus = async () => {
      try {
        await supabase
          .from('profiles')
          .update({ 
            is_online: true, 
            last_seen: new Date().toISOString() 
          })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error updating status:', error);
      }
    };

    // Update immediately
    updateStatus();

    // Update every 15 seconds for more responsive status
    updateIntervalRef.current = setInterval(updateStatus, 15000);

    // Set offline on cleanup
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      supabase
        .from('profiles')
        .update({ 
          is_online: false, 
          last_seen: new Date().toISOString() 
        })
        .eq('id', user.id);
    };
  }, [user]);

  // Subscribe to all status changes in realtime
  useEffect(() => {
    const channel = supabase
      .channel('user-status-global')
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
            newMap.set(id, { user_id: id, is_online: is_online ?? false, last_seen });
            return newMap;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isUserOnline = useCallback((userId: string) => {
    const status = onlineUsers.get(userId);
    if (!status) return false;
    
    // Consider user offline if last seen > 30 seconds ago
    if (status.last_seen) {
      const lastSeen = new Date(status.last_seen);
      const now = new Date();
      const diffMs = now.getTime() - lastSeen.getTime();
      return diffMs < 30000; // 30 seconds
    }
    
    return status.is_online;
  }, [onlineUsers]);

  return { onlineUsers, isUserOnline };
}

// Hook to track specific user's status with realtime updates
export function useUserOnlineStatus(userId: string | null) {
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsOnline(false);
      setLastSeen(null);
      return;
    }

    // Fetch initial status
    const fetchStatus = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_online, last_seen')
        .eq('id', userId)
        .single();

      if (!error && data) {
        const lastSeenTime = data.last_seen ? new Date(data.last_seen) : null;
        const now = new Date();
        
        // Consider online if last_seen is within 30 seconds
        if (lastSeenTime) {
          const diffMs = now.getTime() - lastSeenTime.getTime();
          setIsOnline(diffMs < 30000);
        } else {
          setIsOnline(data.is_online ?? false);
        }
        setLastSeen(data.last_seen);
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
          const { is_online, last_seen } = payload.new as any;
          setLastSeen(last_seen);
          
          // Check if truly online based on last_seen time
          if (last_seen) {
            const lastSeenTime = new Date(last_seen);
            const now = new Date();
            const diffMs = now.getTime() - lastSeenTime.getTime();
            setIsOnline(diffMs < 30000);
          } else {
            setIsOnline(is_online ?? false);
          }
        }
      )
      .subscribe();

    // Periodically check if user went offline (for stale connections)
    checkIntervalRef.current = setInterval(() => {
      if (lastSeen) {
        const lastSeenTime = new Date(lastSeen);
        const now = new Date();
        const diffMs = now.getTime() - lastSeenTime.getTime();
        if (diffMs > 30000 && isOnline) {
          setIsOnline(false);
        }
      }
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [userId]);

  return { isOnline, lastSeen };
}