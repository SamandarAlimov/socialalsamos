import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/** Guruh/kanal ruxsatlari (Telegramdek) */
export interface ConversationPermissions {
  send_messages: boolean;
  send_media: boolean;
  send_stickers: boolean;
  send_polls: boolean;
  send_voice: boolean;
  send_video_messages: boolean;
  embed_links: boolean;
  add_members: boolean;
  pin_messages: boolean;
  change_info: boolean;
  manage_topics: boolean;
}

export const DEFAULT_PERMISSIONS: ConversationPermissions = {
  send_messages: true,
  send_media: true,
  send_stickers: true,
  send_polls: true,
  send_voice: true,
  send_video_messages: true,
  embed_links: true,
  add_members: true,
  pin_messages: false,
  change_info: false,
  manage_topics: false,
};

export interface ConversationSettings {
  id: string;
  name: string | null;
  description: string | null;
  username: string | null;
  avatar_url: string | null;
  type: 'private' | 'group' | 'channel';
  owner_id: string | null;
  is_public: boolean | null;
  slow_mode_seconds: number;
  auto_delete_seconds: number;
  sign_messages: boolean;
  hide_members: boolean;
  join_by_request: boolean;
  is_forum: boolean;
  anti_spam: boolean;
  aggressive_anti_spam: boolean;
  restrict_saving_content: boolean;
  linked_chat_id: string | null;
  reactions_mode: 'all' | 'some' | 'none';
  allowed_reactions: string[] | null;
  boost_level: number;
  boosts_count: number;
  theme: string | null;
  wallpaper_url: string | null;
  emoji_status: string | null;
  permissions: ConversationPermissions;
}

export interface InviteLink {
  id: string;
  slug: string;
  title: string | null;
  member_limit: number | null;
  used_count: number;
  requires_approval: boolean;
  expires_at: string | null;
  is_revoked: boolean;
  is_primary: boolean;
  created_at: string;
}

export interface JoinRequest {
  id: string;
  user_id: string;
  bio: string | null;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface ForumTopic {
  id: string;
  title: string;
  icon_emoji: string | null;
  color: string | null;
  is_closed: boolean;
  is_pinned: boolean;
  is_general: boolean;
  last_message_at: string | null;
}

/** Slow mode uchun Telegramdagi variantlar (sekund) */
export const SLOW_MODE_OPTIONS = [0, 10, 30, 60, 300, 900, 3600];

/** Avtomatik o'chirish uchun variantlar (sekund) */
export const AUTO_DELETE_OPTIONS = [0, 86400, 604800, 2678400];

/** Boost darajasi uchun kerakli boostlar */
export const BOOST_THRESHOLDS = [1, 10, 25, 50, 100];

function randomSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Guruh va kanallar uchun Telegram Premium darajasidagi sozlamalar hooki.
 *
 * Ruxsatlar, slow mode, avtomatik o'chirish, taklif havolalari, qo'shilish
 * so'rovlari, banlar, boostlar va forum topiklari bilan ishlaydi.
 */
export function useConversationPremium(conversationId: string | null) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ConversationSettings | null>(null);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      const raw = data as Record<string, any>;
      setSettings({
        id: raw.id,
        name: raw.name ?? null,
        description: raw.description ?? null,
        username: raw.username ?? null,
        avatar_url: raw.avatar_url ?? null,
        type: raw.type,
        owner_id: raw.owner_id ?? null,
        is_public: raw.is_public ?? null,
        slow_mode_seconds: raw.slow_mode_seconds ?? 0,
        auto_delete_seconds: raw.auto_delete_seconds ?? 0,
        sign_messages: raw.sign_messages ?? false,
        hide_members: raw.hide_members ?? false,
        join_by_request: raw.join_by_request ?? false,
        is_forum: raw.is_forum ?? false,
        anti_spam: raw.anti_spam ?? false,
        aggressive_anti_spam: raw.aggressive_anti_spam ?? false,
        restrict_saving_content: raw.restrict_saving_content ?? false,
        linked_chat_id: raw.linked_chat_id ?? null,
        reactions_mode: (raw.reactions_mode as 'all' | 'some' | 'none') ?? 'all',
        allowed_reactions: raw.allowed_reactions ?? null,
        boost_level: raw.boost_level ?? 0,
        boosts_count: raw.boosts_count ?? 0,
        theme: raw.theme ?? null,
        wallpaper_url: raw.wallpaper_url ?? null,
        emoji_status: raw.emoji_status ?? null,
        permissions: { ...DEFAULT_PERMISSIONS, ...(raw.permissions || {}) },
      });
    } catch (error) {
      console.error('Sozlamalarni yuklashda xatolik:', error);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const fetchInviteLinks = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { data } = await supabase
        .from('conversation_invite_links')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });
      setInviteLinks((data as InviteLink[]) || []);
    } catch (error) {
      console.error('Havolalarni yuklashda xatolik:', error);
    }
  }, [conversationId]);

  const fetchJoinRequests = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { data } = await supabase
        .from('conversation_join_requests')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const rows = (data as JoinRequest[]) || [];
      if (rows.length === 0) {
        setJoinRequests([]);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in(
          'id',
          rows.map((r) => r.user_id)
        );

      const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
      setJoinRequests(rows.map((r) => ({ ...r, profile: byId.get(r.user_id) || null })));
    } catch (error) {
      console.error("So'rovlarni yuklashda xatolik:", error);
    }
  }, [conversationId]);

  const fetchTopics = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { data } = await supabase
        .from('conversation_topics')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('is_pinned', { ascending: false })
        .order('last_message_at', { ascending: false, nullsFirst: false });
      setTopics((data as ForumTopic[]) || []);
    } catch (error) {
      console.error('Topiklarni yuklashda xatolik:', error);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setSettings(null);
      setInviteLinks([]);
      setJoinRequests([]);
      setTopics([]);
      return;
    }
    void fetchSettings();
    void fetchInviteLinks();
    void fetchJoinRequests();
    void fetchTopics();
  }, [conversationId, fetchSettings, fetchInviteLinks, fetchJoinRequests, fetchTopics]);

  /** Sozlamalarni yangilash (optimistik) */
  const updateSettings = useCallback(
    async (patch: Partial<ConversationSettings>) => {
      if (!conversationId) return false;
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      setIsSaving(true);
      try {
        const { error } = await supabase
          .from('conversations')
          .update(patch as Record<string, unknown>)
          .eq('id', conversationId);
        if (error) throw error;
        return true;
      } catch (error) {
        console.error('Sozlamani saqlashda xatolik:', error);
        void fetchSettings();
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [conversationId, fetchSettings]
  );

  const updatePermission = useCallback(
    async (key: keyof ConversationPermissions, value: boolean) => {
      if (!settings) return false;
      const next = { ...settings.permissions, [key]: value };
      return updateSettings({ permissions: next });
    },
    [settings, updateSettings]
  );

  /** Yangi taklif havolasi */
  const createInviteLink = useCallback(
    async (options?: {
      title?: string;
      memberLimit?: number | null;
      requiresApproval?: boolean;
      expiresInSeconds?: number | null;
    }) => {
      if (!conversationId || !user) return null;
      try {
        const { data, error } = await supabase
          .from('conversation_invite_links')
          .insert({
            conversation_id: conversationId,
            created_by: user.id,
            slug: randomSlug(),
            title: options?.title || null,
            member_limit: options?.memberLimit ?? null,
            requires_approval: options?.requiresApproval ?? false,
            expires_at: options?.expiresInSeconds
              ? new Date(Date.now() + options.expiresInSeconds * 1000).toISOString()
              : null,
          })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        if (data) setInviteLinks((prev) => [data as InviteLink, ...prev]);
        return data as InviteLink | null;
      } catch (error) {
        console.error('Havola yaratishda xatolik:', error);
        return null;
      }
    },
    [conversationId, user]
  );

  const revokeInviteLink = useCallback(async (linkId: string) => {
    try {
      await supabase
        .from('conversation_invite_links')
        .update({ is_revoked: true })
        .eq('id', linkId);
      setInviteLinks((prev) =>
        prev.map((l) => (l.id === linkId ? { ...l, is_revoked: true } : l))
      );
      return true;
    } catch (error) {
      console.error('Havolani bekor qilishda xatolik:', error);
      return false;
    }
  }, []);

  const deleteInviteLink = useCallback(async (linkId: string) => {
    try {
      await supabase.from('conversation_invite_links').delete().eq('id', linkId);
      setInviteLinks((prev) => prev.filter((l) => l.id !== linkId));
      return true;
    } catch (error) {
      console.error("Havolani o'chirishda xatolik:", error);
      return false;
    }
  }, []);

  /** Qo'shilish so'rovini qabul qilish */
  const approveJoinRequest = useCallback(
    async (request: JoinRequest) => {
      if (!conversationId) return false;
      try {
        await supabase.from('conversation_participants').insert({
          conversation_id: conversationId,
          user_id: request.user_id,
          role: 'member',
        });
        await supabase
          .from('conversation_join_requests')
          .update({ status: 'approved' })
          .eq('id', request.id);
        setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
        return true;
      } catch (error) {
        console.error("So'rovni qabul qilishda xatolik:", error);
        return false;
      }
    },
    [conversationId]
  );

  const declineJoinRequest = useCallback(async (request: JoinRequest) => {
    try {
      await supabase
        .from('conversation_join_requests')
        .update({ status: 'declined' })
        .eq('id', request.id);
      setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
      return true;
    } catch (error) {
      console.error("So'rovni rad etishda xatolik:", error);
      return false;
    }
  }, []);

  /** A'zoni cheklash yoki ban qilish */
  const restrictMember = useCallback(
    async (
      targetUserId: string,
      options?: {
        ban?: boolean;
        reason?: string;
        untilDate?: string | null;
        restrictions?: Partial<ConversationPermissions>;
      }
    ) => {
      if (!conversationId || !user) return false;
      try {
        await supabase.from('conversation_bans').upsert(
          {
            conversation_id: conversationId,
            user_id: targetUserId,
            banned_by: user.id,
            reason: options?.reason || null,
            is_banned: options?.ban ?? true,
            until_date: options?.untilDate ?? null,
            restrictions: options?.restrictions || {},
          },
          { onConflict: 'conversation_id,user_id' }
        );

        if (options?.ban) {
          await supabase
            .from('conversation_participants')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', targetUserId);
        }
        return true;
      } catch (error) {
        console.error('Cheklashda xatolik:', error);
        return false;
      }
    },
    [conversationId, user]
  );

  const unbanMember = useCallback(
    async (targetUserId: string) => {
      if (!conversationId) return false;
      try {
        await supabase
          .from('conversation_bans')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', targetUserId);
        return true;
      } catch (error) {
        console.error('Bandan chiqarishda xatolik:', error);
        return false;
      }
    },
    [conversationId]
  );

  /** Kanal/guruhni boost qilish */
  const boostConversation = useCallback(
    async (slots = 1) => {
      if (!conversationId || !user) return false;
      try {
        await supabase.from('conversation_boosts').upsert(
          {
            conversation_id: conversationId,
            user_id: user.id,
            slots,
            expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          },
          { onConflict: 'conversation_id,user_id' }
        );
        await fetchSettings();
        return true;
      } catch (error) {
        console.error('Boost qilishda xatolik:', error);
        return false;
      }
    },
    [conversationId, user, fetchSettings]
  );

  const removeBoost = useCallback(async () => {
    if (!conversationId || !user) return false;
    try {
      await supabase
        .from('conversation_boosts')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);
      await fetchSettings();
      return true;
    } catch (error) {
      console.error('Boostni olishda xatolik:', error);
      return false;
    }
  }, [conversationId, user, fetchSettings]);

  /** Forum topiklari */
  const createTopic = useCallback(
    async (title: string, iconEmoji?: string, color?: string) => {
      if (!conversationId || !user) return null;
      try {
        const { data, error } = await supabase
          .from('conversation_topics')
          .insert({
            conversation_id: conversationId,
            created_by: user.id,
            title,
            icon_emoji: iconEmoji || null,
            color: color || null,
          })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        if (data) setTopics((prev) => [data as ForumTopic, ...prev]);
        return data as ForumTopic | null;
      } catch (error) {
        console.error('Topik yaratishda xatolik:', error);
        return null;
      }
    },
    [conversationId, user]
  );

  const updateTopic = useCallback(async (topicId: string, patch: Partial<ForumTopic>) => {
    try {
      await supabase
        .from('conversation_topics')
        .update(patch as Record<string, unknown>)
        .eq('id', topicId);
      setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, ...patch } : t)));
      return true;
    } catch (error) {
      console.error('Topikni yangilashda xatolik:', error);
      return false;
    }
  }, []);

  const deleteTopic = useCallback(async (topicId: string) => {
    try {
      await supabase.from('conversation_topics').delete().eq('id', topicId);
      setTopics((prev) => prev.filter((t) => t.id !== topicId));
      return true;
    } catch (error) {
      console.error("Topikni o'chirishda xatolik:", error);
      return false;
    }
  }, []);

  const isOwner = useMemo(
    () => Boolean(settings?.owner_id && user?.id && settings.owner_id === user.id),
    [settings?.owner_id, user?.id]
  );

  const nextBoostGoal = useMemo(() => {
    const count = settings?.boosts_count ?? 0;
    return BOOST_THRESHOLDS.find((t) => t > count) ?? null;
  }, [settings?.boosts_count]);

  return {
    settings,
    inviteLinks,
    joinRequests,
    topics,
    isLoading,
    isSaving,
    isOwner,
    nextBoostGoal,
    refresh: fetchSettings,
    refreshInviteLinks: fetchInviteLinks,
    refreshJoinRequests: fetchJoinRequests,
    refreshTopics: fetchTopics,
    updateSettings,
    updatePermission,
    createInviteLink,
    revokeInviteLink,
    deleteInviteLink,
    approveJoinRequest,
    declineJoinRequest,
    restrictMember,
    unbanMember,
    boostConversation,
    removeBoost,
    createTopic,
    updateTopic,
    deleteTopic,
  };
}
