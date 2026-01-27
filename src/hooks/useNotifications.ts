import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationActor {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface NotificationPost {
  id: string;
  media_urls: string[] | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'message' | 'like' | 'comment' | 'follow' | 'mention' | 'collaboration_invite' | 'collaboration_accepted';
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  actor?: NotificationActor;
  post?: NotificationPost;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      // Extract unique actor IDs and post IDs
      const actorIds = new Set<string>();
      const postIds = new Set<string>();
      
      data.forEach(n => {
        const d = n.data as Record<string, unknown>;
        const actorId = (d?.liker_id || d?.commenter_id || d?.follower_id || d?.mentioner_id || d?.actor_id || d?.inviter_id || d?.collaborator_id) as string;
        if (actorId) actorIds.add(actorId);
        const postId = d?.post_id as string;
        if (postId) postIds.add(postId);
      });

      // Fetch profiles for actors
      const profilesResult = actorIds.size > 0
        ? await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', Array.from(actorIds))
        : { data: [] as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[] };

      // Fetch posts for thumbnails
      const postsResult = postIds.size > 0
        ? await supabase
            .from('posts')
            .select('id, media_urls')
            .in('id', Array.from(postIds))
        : { data: [] as { id: string; media_urls: string[] | null }[] };

      const profiles = profilesResult.data || [];
      const posts = postsResult.data || [];

      const profileMap = new Map<string, NotificationActor>(
        profiles.map(p => [p.id, p as NotificationActor])
      );
      const postMap = new Map<string, NotificationPost>(
        posts.map(p => [p.id, p as NotificationPost])
      );

      // Enrich notifications with actor and post data
      const enrichedNotifications: Notification[] = data.map(n => {
        const d = n.data as Record<string, unknown>;
        const actorId = (d?.liker_id || d?.commenter_id || d?.follower_id || d?.mentioner_id || d?.actor_id || d?.inviter_id || d?.collaborator_id) as string;
        const postId = d?.post_id as string;
        
        return {
          ...n,
          data: d,
          type: n.type as Notification['type'],
          actor: actorId ? profileMap.get(actorId) : undefined,
          post: postId ? postMap.get(postId) : undefined,
        };
      });

      setNotifications(enrichedNotifications);
      setUnreadCount(enrichedNotifications.filter(n => !n.is_read).length);
    }
    setLoading(false);
  }, [user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user) return;

    await supabase.from('notifications').delete().eq('id', notificationId);

    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription - refetch to get actor/post data
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refetch to get enriched data
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; is_read: boolean };
          // Update local state for is_read changes
          setNotifications(prev =>
            prev.map(n => (n.id === updated.id ? { ...n, is_read: updated.is_read } : n))
          );
          setUnreadCount(prev => {
            const notification = notifications.find(n => n.id === updated.id);
            if (notification && !notification.is_read && updated.is_read) {
              return Math.max(0, prev - 1);
            }
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setNotifications(prev => prev.filter(n => n.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications, notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch: fetchNotifications,
  };
}
