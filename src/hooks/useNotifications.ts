import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';

export const NOTIFICATION_PAGE_SIZE = 30;

export interface NotificationActor {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  /** Tasdiqlangan foydalanuvchi nishoni ro'yxatda ham ko'rinishi uchun. */
  is_verified?: boolean | null;
}

export interface NotificationPost {
  id: string;
  media_urls: string[] | null;
}

export type NotificationType =
  | 'message'
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'collaboration_invite'
  | 'collaboration_accepted'
  | 'collaboration_declined'
  | 'collaboration_revoked'
  | 'collaboration_removed'
  | 'collaboration_left';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  actor?: NotificationActor;
  post?: NotificationPost;
}

type RawNotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  is_read: boolean;
  created_at: string;
};

function resolveActorId(data: Record<string, unknown> | null | undefined): string | undefined {
  if (!data) return undefined;
  const candidate =
    data.liker_id ||
    data.commenter_id ||
    data.follower_id ||
    data.mentioner_id ||
    data.actor_id ||
    data.inviter_id ||
    data.collaborator_id;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function resolvePostId(data: Record<string, unknown> | null | undefined): string | undefined {
  const candidate = data?.post_id;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

/**
 * Bildirishnomalarni aktyor profili va post rasmi bilan boyitadi.
 * Profil/post so'rovlari alohida yuboriladi — biri xato bersa ham
 * bildirishnomalar ro'yxati baribir ko'rsatiladi (embed bilan bog'liq
 * PGRST200/PGRST201 xatolaridan himoya).
 */
async function enrichNotifications(rows: RawNotificationRow[]): Promise<Notification[]> {
  const actorIds = new Set<string>();
  const postIds = new Set<string>();

  const normalized = rows.map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const actorId = resolveActorId(data);
    const postId = resolvePostId(data);
    if (actorId) actorIds.add(actorId);
    if (postId) postIds.add(postId);
    return { row, data, actorId, postId };
  });

  const [profilesResult, postsResult] = await Promise.all([
    actorIds.size > 0
      ? supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_verified')
          .in('id', Array.from(actorIds))
      : Promise.resolve({ data: [], error: null } as const),
    postIds.size > 0
      ? supabase.from('posts').select('id, media_urls').in('id', Array.from(postIds))
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (profilesResult.error) {
    console.warn('Bildirishnoma profillarini yuklab bo‘lmadi:', profilesResult.error);
  }
  if (postsResult.error) {
    console.warn('Bildirishnoma postlarini yuklab bo‘lmadi:', postsResult.error);
  }

  const profileMap = new Map<string, NotificationActor>(
    ((profilesResult.data as NotificationActor[] | null) || []).map((p) => [p.id, p]),
  );
  const postMap = new Map<string, NotificationPost>(
    ((postsResult.data as NotificationPost[] | null) || []).map((p) => [p.id, p]),
  );

  return normalized.map(({ row, data, actorId, postId }) => ({
    ...row,
    data,
    type: row.type as NotificationType,
    actor: actorId ? profileMap.get(actorId) : undefined,
    post: postId ? postMap.get(postId) : undefined,
  }));
}

function dedupe(items: Notification[]): Notification[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kechikkan javob yangi javobning ustiga yozib yubormasligi uchun.
  const requestIdRef = useRef(0);
  const loadedCountRef = useRef(0);

  const refreshUnreadCount = useCallback(async (userId: string) => {
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (!countError && typeof count === 'number') {
      setUnreadCount(count);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      // Login qilinmagan bo'lsa ham skeleton abadiy aylanib turmasin.
      setNotifications([]);
      setUnreadCount(0);
      setHasMore(false);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    // Refresh paytida allaqachon yuklangan sahifalar saqlanib qolsin.
    const limit = Math.max(NOTIFICATION_PAGE_SIZE, loadedCountRef.current);

    try {
      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(0, limit - 1);

      if (requestId !== requestIdRef.current) return;

      if (fetchError) {
        console.error('Bildirishnomalarni yuklash xatosi:', fetchError);
        setError('Bildirishnomalarni yuklab bo‘lmadi');
        return;
      }

      const rows = (data || []) as RawNotificationRow[];
      const enriched = dedupe(await enrichNotifications(rows));

      if (requestId !== requestIdRef.current) return;

      loadedCountRef.current = enriched.length;
      setNotifications(enriched);
      setHasMore(rows.length === limit);
      setError(null);
      void refreshUnreadCount(user.id);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Bildirishnomalarni yuklash xatosi:', err);
      setError('Bildirishnomalarni yuklab bo‘lmadi');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [refreshUnreadCount, user]);

  const loadMore = useCallback(async () => {
    if (!user || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const from = loadedCountRef.current;
      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + NOTIFICATION_PAGE_SIZE - 1);

      if (fetchError) {
        console.error('Qo‘shimcha bildirishnomalarni yuklash xatosi:', fetchError);
        setError('Qo‘shimcha bildirishnomalarni yuklab bo‘lmadi');
        return;
      }

      const rows = (data || []) as RawNotificationRow[];
      const enriched = await enrichNotifications(rows);

      setNotifications((prev) => {
        const merged = dedupe([...prev, ...enriched]);
        loadedCountRef.current = merged.length;
        return merged;
      });
      setHasMore(rows.length === NOTIFICATION_PAGE_SIZE);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;

    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== notificationId) return n;
        if (!n.is_read) wasUnread = true;
        return { ...n, is_read: true };
      }),
    );
    if (!wasUnread) return;
    setUnreadCount((prev) => Math.max(0, prev - 1));

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Bildirishnomani o‘qilgan deb belgilash xatosi:', updateError);
      // Optimistik o'zgarishni qaytaramiz.
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: false } : n)),
      );
      setUnreadCount((prev) => prev + 1);
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    const snapshot = notifications;
    const previousUnread = unreadCount;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (updateError) {
      console.error('Hammasini o‘qilgan deb belgilash xatosi:', updateError);
      setNotifications(snapshot);
      setUnreadCount(previousUnread);
      throw updateError;
    }
  }, [notifications, unreadCount, user]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user) return;

    let removed: Notification | undefined;
    setNotifications((prev) => {
      removed = prev.find((n) => n.id === notificationId);
      const next = prev.filter((n) => n.id !== notificationId);
      loadedCountRef.current = next.length;
      return next;
    });
    if (removed && !removed.is_read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Bildirishnomani o‘chirish xatosi:', deleteError);
      if (removed) {
        const restored = removed;
        setNotifications((prev) =>
          dedupe([...prev, restored]).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
        );
        if (!restored.is_read) setUnreadCount((prev) => prev + 1);
      }
      throw deleteError;
    }
  }, [user]);

  const respondToCollaboration = useCallback(
    async (collaborationId: string, accept: boolean) => {
      if (!user) throw new Error('Autentifikatsiya talab qilinadi');

      const { error: rpcError } = await db.rpc('respond_post_collaboration', {
        p_collaboration_id: collaborationId,
        p_accept: accept,
      });

      if (rpcError) throw rpcError;
      await fetchNotifications();
    },
    [fetchNotifications, user],
  );

  useEffect(() => {
    loadedCountRef.current = 0;
    setLoading(true);
    void fetchNotifications();
  }, [fetchNotifications]);

  // Real-time: INSERT bo'lganda qayta yuklaymiz (aktyor/post ma'lumoti kerak).
  // MUHIM: `notifications` ni dependency qilib qo'ymaymiz, aks holda kanal
  // har bir state o'zgarishida qayta yaratiladi va handlerlar ikki marta ishlaydi.
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
          void fetchNotifications();
        },
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
          setNotifications((prev) => {
            const target = prev.find((n) => n.id === updated.id);
            if (target && target.is_read !== updated.is_read) {
              setUnreadCount((c) => (updated.is_read ? Math.max(0, c - 1) : c + 1));
            }
            return prev.map((n) =>
              n.id === updated.id ? { ...n, is_read: updated.is_read } : n,
            );
          });
        },
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
          setNotifications((prev) => {
            const next = prev.filter((n) => n.id !== deleted.id);
            loadedCountRef.current = next.length;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    respondToCollaboration,
    refetch: fetchNotifications,
  };
}
