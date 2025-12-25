import { useState, useEffect, useCallback } from 'react';
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

  // Update own status periodically
  useEffect(() => {
    if (!user) return;

    const updateStatus = async () => {
      await supabase
        .from('profiles')
        .update({ 
          is_online: true, 
          last_seen: new Date().toISOString() 
        })
        .eq('id', user.id);
    };

    // Update immediately
    updateStatus();

    // Update every 30 seconds
    const interval = setInterval(updateStatus, 30000);

    // Set offline on cleanup
    return () => {
      clearInterval(interval);
      supabase
        .from('profiles')
        .update({ 
          is_online: false, 
          last_seen: new Date().toISOString() 
        })
        .eq('id', user.id);
    };
  }, [user]);

  // Subscribe to status changes
  useEffect(() => {
    const channel = supabase
      .channel('user-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: 'is_online=eq.true'
        },
        (payload) => {
          const { id, is_online, last_seen } = payload.new as any;
          setOnlineUsers(prev => {
            const newMap = new Map(prev);
            newMap.set(id, { user_id: id, is_online, last_seen });
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
    
    // Consider user offline if last seen > 1 minute ago
    if (status.last_seen) {
      const lastSeen = new Date(status.last_seen);
      const now = new Date();
      const diffMs = now.getTime() - lastSeen.getTime();
      return diffMs < 60000; // 1 minute
    }
    
    return status.is_online;
  }, [onlineUsers]);

  return { onlineUsers, isUserOnline };
}

// Hook to track specific user's status
export function useUserOnlineStatus(userId: string | null) {
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Fetch initial status
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_online, last_seen')
        .eq('id', userId)
        .single();

      if (data) {
        setIsOnline(data.is_online ?? false);
        setLastSeen(data.last_seen);
      }
    };

    fetchStatus();

    // Subscribe to changes
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
          setIsOnline(is_online ?? false);
          setLastSeen(last_seen);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { isOnline, lastSeen };
}
