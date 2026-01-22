import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useServiceWorker } from './useServiceWorker';
import { useNotificationSound } from './useNotificationSound';

export function usePushNotifications() {
  const { user } = useAuth();
  const { isRegistered, showNotification, registration } = useServiceWorker();
  const { playNotificationSound, playMessageSound } = useNotificationSound();
  const lastMessageIdRef = useRef<string | null>(null);
  const lastNotificationIdRef = useRef<string | null>(null);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('[Push] Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('[Push] Notifications denied by user');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch (error) {
      console.error('[Push] Failed to request permission:', error);
      return false;
    }
  }, []);

  // Show notification via service worker
  const sendNotification = useCallback(async (
    title: string,
    body: string,
    data?: { url?: string; type?: string; conversationId?: string }
  ) => {
    const hasPermission = Notification.permission === 'granted';
    
    if (!hasPermission) {
      console.warn('[Push] No permission to show notifications');
      return;
    }

    // Use service worker notification for background support
    if (isRegistered && registration) {
      try {
        await registration.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `notification-${Date.now()}`,
          data: {
            ...data,
            url: data?.conversationId 
              ? `/messages?conversation=${data.conversationId}` 
              : data?.url || '/messages',
          },
          requireInteraction: false,
          silent: false,
        });
        return;
      } catch (error) {
        console.error('[Push] Service worker notification failed:', error);
      }
    }

    // Fallback to regular notification
    try {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `notification-${Date.now()}`,
      });

      notification.onclick = () => {
        window.focus();
        if (data?.conversationId) {
          window.location.href = `/messages?conversation=${data.conversationId}`;
        } else if (data?.url) {
          window.location.href = data.url;
        }
        notification.close();
      };

      setTimeout(() => notification.close(), 8000);
    } catch (error) {
      console.error('[Push] Fallback notification failed:', error);
    }
  }, [isRegistered, registration]);

  // Subscribe to new messages
  useEffect(() => {
    if (!user) return;

    console.log('[Push] Setting up message subscription for user:', user.id);

    const channel = supabase
      .channel(`push-messages:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const message = payload.new as {
            id: string;
            sender_id: string | null;
            conversation_id: string;
            content: string;
          };

          // Skip own messages
          if (message.sender_id === user.id) return;

          // Prevent duplicates
          if (lastMessageIdRef.current === message.id) return;
          lastMessageIdRef.current = message.id;

          // Check if we're part of this conversation
          const { data: participation } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', message.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!participation) return;

          // Get sender info
          let senderName = 'Yangi xabar';
          if (message.sender_id) {
            const { data: sender } = await supabase
              .from('profiles')
              .select('display_name, username')
              .eq('id', message.sender_id)
              .single();

            if (sender) {
              senderName = sender.display_name || sender.username || 'Foydalanuvchi';
            }
          }

          // Play sound
          playMessageSound();

          // Show notification (works in background via service worker)
          const messagePreview = message.content?.length > 50 
            ? message.content.substring(0, 50) + '...' 
            : message.content || 'Yangi xabar';

          sendNotification(
            `✉️ ${senderName}`,
            messagePreview,
            {
              type: 'message',
              conversationId: message.conversation_id,
            }
          );
        }
      )
      .subscribe((status) => {
        console.log('[Push] Message subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, sendNotification, playMessageSound]);

  // Subscribe to other notifications (likes, comments, follows, mentions)
  useEffect(() => {
    if (!user) return;

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
            type: string;
            title: string;
            body: string | null;
            data: {
              post_id?: string;
              follower_id?: string;
              liker_id?: string;
              commenter_id?: string;
              mentioner_id?: string;
            };
          };

          // Prevent duplicates
          if (lastNotificationIdRef.current === notification.id) return;
          lastNotificationIdRef.current = notification.id;

          // Get actor name
          const actorId = notification.data?.liker_id ||
            notification.data?.commenter_id ||
            notification.data?.follower_id ||
            notification.data?.mentioner_id;

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

          // Play sound
          const soundType = notification.type as 'like' | 'comment' | 'follow' | 'mention';
          playNotificationSound(soundType);

          // Build notification content
          const emoji = getNotificationEmoji(notification.type);
          const title = `${emoji} ${getNotificationTitle(notification.type, actorName)}`;
          const body = notification.body || getNotificationBody(notification.type);

          // Determine URL
          let url = '/notifications';
          if (notification.data?.post_id) {
            url = `/home?post=${notification.data.post_id}`;
          } else if (notification.data?.follower_id) {
            url = `/user/${notification.data.follower_id}`;
          }

          sendNotification(title, body, { url, type: notification.type });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, sendNotification, playNotificationSound]);

  return {
    requestPermission,
    sendNotification,
    isServiceWorkerReady: isRegistered,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  };
}

function getNotificationEmoji(type: string): string {
  switch (type) {
    case 'like': return '❤️';
    case 'comment': return '💬';
    case 'follow': return '👤';
    case 'mention': return '📣';
    default: return '🔔';
  }
}

function getNotificationTitle(type: string, actorName?: string): string {
  switch (type) {
    case 'like': return `${actorName || 'Kimdir'} postingizni yoqtirdi`;
    case 'comment': return `${actorName || 'Kimdir'} izoh qoldirdi`;
    case 'follow': return `${actorName || 'Kimdir'} sizni kuzatmoqda`;
    case 'mention': return `${actorName || 'Kimdir'} sizni eslatdi`;
    default: return 'Yangi bildirishnoma';
  }
}

function getNotificationBody(type: string): string {
  switch (type) {
    case 'like': return "Ko'rish uchun bosing";
    case 'comment': return "Izohni ko'rish";
    case 'follow': return "Profilni ko'rish";
    case 'mention': return "Eslatmani ko'rish";
    default: return "Ko'rish";
  }
}
