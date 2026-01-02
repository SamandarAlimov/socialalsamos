import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useNotificationPermission() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);

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

  const showNotification = useCallback((title: string, options?: NotificationOptions & { onClick?: () => void }) => {
    if (permission !== 'granted') return null;

    try {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        requireInteraction: false,
        silent: false,
        ...options,
      });

      if (options?.onClick) {
        notification.onclick = () => {
          window.focus();
          options.onClick?.();
          notification.close();
        };
      }

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      return null;
    }
  }, [permission]);

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
        (payload) => {
          const notification = payload.new as {
            id: string;
            title: string;
            body: string | null;
            type: string;
            data: { post_id?: string; follower_id?: string; liker_id?: string; commenter_id?: string };
          };
          
          // Only show push notification if document is hidden (app in background)
          if (document.hidden) {
            showNotification(notification.title, {
              body: notification.body || undefined,
              tag: notification.id,
              onClick: () => {
                // Navigate based on notification type
                if (notification.type === 'like' || notification.type === 'comment') {
                  if (notification.data?.post_id) {
                    window.location.href = `/home?post=${notification.data.post_id}`;
                  }
                } else if (notification.type === 'follow') {
                  if (notification.data?.follower_id) {
                    window.location.href = `/user/${notification.data.follower_id}`;
                  }
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
  }, [user, permission, showNotification]);

  return {
    permission,
    supported,
    requestPermission,
    showNotification,
  };
}
