import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationSound } from './useNotificationSound';

interface CustomNotificationOptions {
  body?: string;
  tag?: string;
  onClick?: () => void;
  vibrate?: number[];
  imageUrl?: string;
}

export function useNotificationPermission() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);
  const { playNotificationSound } = useNotificationSound();
  const lastNotificationRef = useRef<string | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!supported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [supported]);

  const showNotification = useCallback((title: string, options?: CustomNotificationOptions) => {
    if (permission !== 'granted') return null;

    try {
      // Create enhanced notification with better styling
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        requireInteraction: false,
        silent: false,
        tag: options?.tag || `notification-${Date.now()}`,
        body: options?.body,
      });

      // Vibrate on mobile if supported
      if ('vibrate' in navigator && options?.vibrate) {
        navigator.vibrate(options.vibrate);
      }

      if (options?.onClick) {
        notification.onclick = () => {
          window.focus();
          options.onClick?.();
          notification.close();
        };
      }

      // Auto-close after 6 seconds
      setTimeout(() => notification.close(), 6000);

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      return null;
    }
  }, [permission]);

  // Helper to get notification icon based on type
  const getNotificationIcon = (type: string): string => {
    // Return appropriate icon URL based on type
    // For now using favicon, but could be customized
    return '/favicon.ico';
  };

  // Get notification title based on type
  const getNotificationTitle = (type: string, actorName?: string): string => {
    switch (type) {
      case 'like':
        return `❤️ ${actorName || 'Someone'} liked your post`;
      case 'comment':
        return `💬 ${actorName || 'Someone'} commented`;
      case 'follow':
        return `👤 New follower`;
      case 'mention':
        return `@ ${actorName || 'Someone'} mentioned you`;
      case 'message':
        return `✉️ New message from ${actorName || 'Someone'}`;
      default:
        return 'New notification';
    }
  };

  // Subscribe to real-time notifications for push alerts
  useEffect(() => {
    if (!user || permission !== 'granted') return;

    const channel = supabase
      .channel(`push-notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const notification = payload.new as {
            id: string;
            title: string;
            body: string | null;
            type: string;
            data: { 
              post_id?: string; 
              follower_id?: string; 
              liker_id?: string; 
              commenter_id?: string;
              mentioner_id?: string;
              actor_id?: string;
            };
          };
          
          // Only show push notification if document is hidden (app in background)
          if (document.hidden) {
            // Prevent duplicate notifications
            if (lastNotificationRef.current === notification.id) return;
            lastNotificationRef.current = notification.id;
            // Get actor info for better notification
            const actorId = notification.data?.liker_id || 
                           notification.data?.commenter_id || 
                           notification.data?.follower_id ||
                           notification.data?.mentioner_id ||
                           notification.data?.actor_id;
            
            let actorName: string | undefined;
            if (actorId) {
              const { data: actor } = await supabase
                .from('profiles')
                .select('display_name, username')
                .eq('id', actorId)
                .single();
              
              if (actor) {
                actorName = actor.display_name || actor.username || undefined;
              }
            }

            // Get post thumbnail if available
            let postImage: string | undefined;
            if (notification.data?.post_id) {
              const { data: post } = await supabase
                .from('posts')
                .select('media_urls')
                .eq('id', notification.data.post_id)
                .single();
              
              if (post?.media_urls?.[0]) {
                postImage = post.media_urls[0];
              }
            }

            const title = getNotificationTitle(notification.type, actorName);
            
            // Play notification sound based on type
            const soundType = notification.type as 'like' | 'comment' | 'follow' | 'mention' | 'message';
            playNotificationSound(soundType);

            showNotification(title, {
              body: notification.body || getNotificationBody(notification.type, actorName),
              tag: notification.id,
              imageUrl: postImage,
              vibrate: [100, 50, 100], // Vibration pattern
              onClick: () => {
                // Navigate based on notification type
                if (notification.type === 'like' || notification.type === 'comment' || notification.type === 'mention') {
                  if (notification.data?.post_id) {
                    window.location.href = `/home?post=${notification.data.post_id}`;
                  }
                } else if (notification.type === 'follow') {
                  if (notification.data?.follower_id) {
                    window.location.href = `/user/${notification.data.follower_id}`;
                  }
                } else if (notification.type === 'message') {
                  window.location.href = '/messages';
                } else {
                  window.location.href = '/notifications';
                }
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, permission, showNotification, playNotificationSound]);

  return {
    permission,
    supported,
    requestPermission,
    showNotification,
  };
}

// Helper function for notification body text
function getNotificationBody(type: string, actorName?: string): string {
  switch (type) {
    case 'like':
      return 'Tap to view your post';
    case 'comment':
      return 'Tap to see what they said';
    case 'follow':
      return `${actorName || 'Someone'} started following you`;
    case 'mention':
      return 'Tap to view the mention';
    case 'message':
      return 'Tap to read the message';
    default:
      return 'Tap to view';
  }
}
