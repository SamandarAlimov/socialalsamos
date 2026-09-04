import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';
import { getStructuredPostMediaPreviewMap } from '@/lib/postMediaPreview';

export const NOTIFICATION_PAGE_SIZE = 30;

export interface NotificationActor {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean | null;
}

export interface NotificationPost {
  id: string;
  media_urls: string[] | null;
  media_type: string | null;
  preview_poster?: string | null;
}

export interface NotificationComment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
}

export type NotificationType =
  | 'message'
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'comment_mention'
  | 'reply'
  | 'comment_like'
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
  comment?: NotificationComment;
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
    data.replier_id ||
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
 * Notificationning o'zi source-of-truth hisoblanadi. Actor/post/comment lookup
 * faqat UI ni boyitish uchun ishlatiladi. Muhim: post SELECT RLS sabab qatorni
 * qaytarmasa, notificationni "o'chirilgan post" deb taxmin qilib yashirmaymiz
 * va bazadan o'chirmaymiz. Aks holda vaqtinchalik visibility/RLS muammosi
 * foydalanuvchining notification tarixini qaytarib bo'lmaydigan tarzda o'chirar edi.
 */
async function enrichNotifications(rows: RawNotificationRow[]): Promise<Notification[]> {
  const actorIds = new Set<string>();
  const postIds = new Set<string>();
  const commentIds = new Set<string>();

  const normalized = rows.map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const actorId = resolveActorId(data);
    const postId = resolvePostId(data);
    const commentId =
      typeof data.comment_id === 'string' && data.comment_id.length > 0
        ? data.comment_id
        : undefined;

    if (actorId) actorIds.add(actorId);
    if (postId) postIds.add(postId);
    if (commentId) commentIds.add(commentId);

    return { row, data, actorId, postId, commentId };
  });

  const [profilesResult, postsResult, commentsResult] = await Promise.all([
    actorIds.size > 0
      ? supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_verified')
          .in('id', Array.from(actorIds))
      : Promise.resolve({ data: [], error: null } as const),
    postIds.size > 0
      ? supabase
          .from('posts')
          .select('id, media_urls, media_type')
          .in('id', Array.from(postIds))
      : Promise.resolve({ data: [], error: null } as const),
    commentIds.size > 0
      ? supabase
          .from('comments')
          .select('id, post_id, user_id, parent_id, content')
          .in('id', Array.from(commentIds))
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (profilesResult.error) {
    console.warn('Bildirishnoma profillarini yuklab bo‘lmadi:', profilesResult.error);
  }
  if (postsResult.error) {
    console.warn('Bildirishnoma postlarini yuklab bo‘lmadi:', postsResult.error);
  }
  if (commentsResult.error) {
    console.warn('Bildirishnoma izohlarini yuklab bo‘lmadi:', commentsResult.error);
  }

  const profileMap = new Map<string, NotificationActor>(
    ((profilesResult.data as NotificationActor[] | null) || []).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  const postMap = new Map<string, NotificationPost>(
    ((postsResult.data as NotificationPost[] | null) || []).map((post) => [post.id, post]),
  );

  const postsMissingPreview = Array.from(postMap.values())
    .filter((post) => !post.media_urls?.some(Boolean))
    .map((post) => post.id);

  if (postsMissingPreview.length > 0) {
    try {
      const previewMap = await getStructuredPostMediaPreviewMap(postsMissingPreview);
      previewMap.forEach((preview, postId) => {
        const post = postMap.get(postId);
        if (!post || post.media_urls?.some(Boolean)) return;
        postMap.set(postId, {
          ...post,
          media_urls: [preview.url],
          media_type: preview.mediaType,
          preview_poster: preview.poster,
        });
      });
    } catch (error) {
      console.warn('Bildirishnoma media previewlarini yuklab bo‘lmadi:', error);
    }
  }

  const commentMap = new Map<string, NotificationComment>(
    ((commentsResult.data as NotificationComment[] | null) || []).map((comment) => [
      comment.id,
      comment,
    ]),
  );

  return normalized.map(({ row, data, actorId, postId, commentId }) => ({
    ...row,
    data,
    type: row.type as NotificationType,
    actor: actorId ? profileMap.get(actorId) : undefined,
    post: postId ? postMap.get(postId) : undefined,
    comment: commentId ? commentMap.get(commentId) : undefined,
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

  const requestIdRef = useRef(0);
  const loadedCountRef = useRef(0);

  /**
   * Unread count notification jadvalidan olinadi. Post enrichment natijasi bu
   * songa ta'sir qilmaydi: RLS sabab post preview ko'rinmasligi notificationning
   * o'zi yo'q degani emas.
   */
  const refreshUnreadCount = useCallback(async (userId: string) => {
    const { count, error: unreadError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (unreadError) {
      console.warn('O‘qilmagan bildirishnomalar sonini yuklab bo‘lmadi:', unreadError);
      return;
    }

    setUnreadCount(count ?? 0);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setHasMore(false);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
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
      if (requestId === requestIdRef.current) setLoading(false);
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

      setNotifications((previous) => {
        const merged = dedupe([...previous, ...enriched]);
        loadedCountRef.current = merged.length;
        return merged;
      });
      setHasMore(rows.length === NOTIFICATION_PAGE_SIZE);
    } catch (err) {
      console.error('Qo‘shimcha bildirishnomalarni yuklash xatosi:', err);
      setError('Qo‘shimcha bildirishnomalarni yuklab bo‘lmadi');
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;

    let wasUnread = false;
    setNotifications((previous) =>
      previous.map((notification) => {
        if (notification.id !== notificationId) return notification;
        if (!notification.is_read) wasUnread = true;
        return { ...notification, is_read: true };
      }),
    );

    if (!wasUnread) return;
    setUnreadCount((previous) => Math.max(0, previous - 1));

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Bildirishnomani o‘qilgan deb belgilash xatosi:', updateError);
      setNotifications((previous) =>
        previous.map((notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: false }
            : notification,
        ),
      );
      setUnreadCount((previous) => previous + 1);
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    const snapshot = notifications;
    const previousUnread = unreadCount;
    setNotifications((previous) =>
      previous.map((notification) => ({ ...notification, is_read: true })),
    );
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
    setNotifications((previous) => {
      removed = previous.find((notification) => notification.id === notificationId);
      const next = previous.filter((notification) => notification.id !== notificationId);
      loadedCountRef.current = next.length;
      return next;
    });

    if (removed && !removed.is_read) {
      setUnreadCount((previous) => Math.max(0, previous - 1));
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
        setNotifications((previous) =>
          dedupe([...previous, restored]).sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
        );
        if (!restored.is_read) setUnreadCount((previous) => previous + 1);
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
          setNotifications((previous) => {
            const target = previous.find((notification) => notification.id === updated.id);
            if (target && target.is_read !== updated.is_read) {
              setUnreadCount((count) =>
                updated.is_read ? Math.max(0, count - 1) : count + 1,
              );
            }
            return previous.map((notification) =>
              notification.id === updated.id
                ? { ...notification, is_read: updated.is_read }
                : notification,
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
          setNotifications((previous) => {
            const removed = previous.find((notification) => notification.id === deleted.id);
            if (removed && !removed.is_read) {
              setUnreadCount((count) => Math.max(0, count - 1));
            }
            const next = previous.filter((notification) => notification.id !== deleted.id);
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
