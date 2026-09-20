import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import db from '@/lib/supabaseAny';
import { useToast } from '@/hooks/use-toast';

export type MarketplaceActivityRole = 'buyer' | 'seller';

export interface MarketplaceActivityNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

interface MarketplaceActivityOptions {
  announce?: boolean;
}

function roleOf(notification: MarketplaceActivityNotification): MarketplaceActivityRole | null {
  const role = notification.data?.role;
  return role === 'buyer' || role === 'seller' ? role : null;
}

export function useMarketplaceActivity(options: MarketplaceActivityOptions = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const announce = Boolean(options.announce);
  const [notifications, setNotifications] = useState<MarketplaceActivityNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const announcedIdsRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const { data, error } = await db
      .from('marketplace_notifications')
      .select('id,type,title,body,data,action_url,is_read,created_at')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      console.warn('Marketplace activity notifications unavailable:', error);
      setLoading(false);
      return;
    }

    setNotifications(
      ((data ?? []) as any[]).map(row => ({
        id: String(row.id),
        type: String(row.type || ''),
        title: String(row.title || ''),
        body: row.body ? String(row.body) : null,
        data: row.data && typeof row.data === 'object' ? row.data : {},
        action_url: row.action_url ? String(row.action_url) : null,
        is_read: Boolean(row.is_read),
        created_at: String(row.created_at || ''),
      })),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`marketplace-activity-${user.id}-${announce ? 'announce' : 'silent'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'marketplace_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        payload => {
          const row = payload.new as any;
          const notification: MarketplaceActivityNotification = {
            id: String(row.id),
            type: String(row.type || ''),
            title: String(row.title || ''),
            body: row.body ? String(row.body) : null,
            data: row.data && typeof row.data === 'object' ? row.data : {},
            action_url: row.action_url ? String(row.action_url) : null,
            is_read: Boolean(row.is_read),
            created_at: String(row.created_at || ''),
          };

          setNotifications(previous => {
            if (previous.some(item => item.id === notification.id)) return previous;
            return [notification, ...previous].slice(0, 250);
          });

          if (announce && !announcedIdsRef.current.has(notification.id)) {
            announcedIdsRef.current.add(notification.id);
            toast({
              title: notification.title,
              description: notification.body || undefined,
              className:
                'rounded-2xl border-white/10 bg-zinc-950 text-white shadow-[0_20px_55px_rgba(0,0,0,0.28)]',
            });
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'marketplace_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [announce, refresh, toast, user]);

  const buyerNotifications = useMemo(
    () => notifications.filter(notification => roleOf(notification) === 'buyer'),
    [notifications],
  );
  const sellerNotifications = useMemo(
    () => notifications.filter(notification => roleOf(notification) === 'seller'),
    [notifications],
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!user) return;

      const target = notifications.find(notification => notification.id === notificationId);
      if (!target) return;

      setNotifications(previous =>
        previous.filter(notification => notification.id !== notificationId),
      );

      const { error } = await db
        .from('marketplace_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) {
        console.warn('Marketplace notification could not be marked read:', error);
        void refresh();
      }
    },
    [notifications, refresh, user],
  );

  const markRoleRead = useCallback(
    async (role: MarketplaceActivityRole) => {
      if (!user) return;

      const ids = notifications
        .filter(notification => roleOf(notification) === role)
        .map(notification => notification.id);

      if (ids.length === 0) return;

      setNotifications(previous =>
        previous.filter(notification => roleOf(notification) !== role),
      );

      const { error } = await db
        .from('marketplace_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .in('id', ids);

      if (error) {
        console.warn('Marketplace notifications could not be marked read:', error);
        void refresh();
      }
    },
    [notifications, refresh, user],
  );

  const markBuyerRead = useCallback(
    () => markRoleRead('buyer'),
    [markRoleRead],
  );
  const markSellerRead = useCallback(
    () => markRoleRead('seller'),
    [markRoleRead],
  );

  return {
    buyerUnreadCount: buyerNotifications.length,
    sellerUnreadCount: sellerNotifications.length,
    totalUnreadCount: buyerNotifications.length + sellerNotifications.length,
    buyerNotifications,
    sellerNotifications,
    loading,
    refresh,
    markBuyerRead,
    markSellerRead,
    markNotificationRead,
  };
}
