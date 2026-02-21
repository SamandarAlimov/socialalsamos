import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Channel {
  id: string;
  owner_id: string;
  name: string;
  username: string | null;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  channel_type: string;
  is_paid: boolean;
  subscription_price: number;
  subscriber_count: number;
  posts_count: number;
  invite_code: string | null;
  linked_group_id: string | null;
  allow_comments: boolean;
  created_at: string;
  updated_at: string;
  is_member?: boolean;
  member_role?: string;
  owner_profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export interface ChannelPost {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  channel_id: string;
  user_id: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
  channel?: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
  is_liked?: boolean;
}

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchChannels = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .order('subscriber_count', { ascending: false });

      if (error) throw error;

      if (user && data) {
        const { data: memberships } = await supabase
          .from('channel_members')
          .select('channel_id, role')
          .eq('user_id', user.id);

        const memberMap = new Map(memberships?.map(m => [m.channel_id, m.role]) || []);

        setChannels(data.map(ch => ({
          ...ch,
          is_member: memberMap.has(ch.id),
          member_role: memberMap.get(ch.id),
        })));
      } else {
        setChannels(data || []);
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const fetchMyChannels = useCallback(async () => {
    if (!user) return [];
    try {
      const { data: memberships } = await supabase
        .from('channel_members')
        .select('channel_id')
        .eq('user_id', user.id);

      if (!memberships?.length) return [];

      const channelIds = memberships.map(m => m.channel_id);
      const { data } = await supabase
        .from('channels')
        .select('*')
        .in('id', channelIds)
        .order('updated_at', { ascending: false });

      return data || [];
    } catch {
      return [];
    }
  }, [user]);

  const createChannel = useCallback(async (
    name: string,
    channelType: 'public' | 'private',
    description?: string,
    username?: string,
    avatarUrl?: string
  ) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('channels')
        .insert({
          owner_id: user.id,
          name,
          channel_type: channelType,
          description: description || null,
          username: username || null,
          avatar_url: avatarUrl || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Kanal yaratildi!', description: `"${name}" kanali muvaffaqiyatli yaratildi.` });
      fetchChannels();
      return data;
    } catch (error: any) {
      console.error('Error creating channel:', error);
      toast({ title: 'Xatolik', description: error.message || 'Kanal yaratishda xatolik', variant: 'destructive' });
      return null;
    }
  }, [user, toast, fetchChannels]);

  const joinChannel = useCallback(async (channelId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('channel_members')
        .insert({ channel_id: channelId, user_id: user.id, role: 'member' });

      if (error) throw error;

      toast({ title: "Obuna bo'ldingiz!" });
      fetchChannels();
      return true;
    } catch (error: any) {
      console.error('Error joining channel:', error);
      toast({ title: 'Xatolik', description: 'Kanalga qo\'shilishda xatolik', variant: 'destructive' });
      return false;
    }
  }, [user, toast, fetchChannels]);

  const leaveChannel = useCallback(async (channelId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('channel_members')
        .delete()
        .eq('channel_id', channelId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({ title: "Obunadan chiqdingiz" });
      fetchChannels();
      return true;
    } catch (error: any) {
      console.error('Error leaving channel:', error);
      return false;
    }
  }, [user, toast, fetchChannels]);

  const createChannelPost = useCallback(async (
    channelId: string,
    content: string,
    mediaUrls: string[] = [],
    mediaType = 'text'
  ) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          channel_id: channelId,
          content,
          media_urls: mediaUrls,
          media_type: mediaType,
          visibility: 'public',
        })
        .select(`
          *,
          profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, is_verified)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Error creating channel post:', error);
      toast({ title: 'Xatolik', description: 'Post yaratishda xatolik', variant: 'destructive' });
      return null;
    }
  }, [user, toast]);

  const fetchChannelPosts = useCallback(async (channelId: string, page = 0) => {
    const PAGE_SIZE = 20;
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, is_verified),
          channel:channels!posts_channel_id_fkey (id, name, username, avatar_url)
        `)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      if (user && data) {
        const postIds = data.map(p => p.id);
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);

        const likedSet = new Set(likes?.map(l => l.post_id) || []);
        return data.map(p => ({ ...p, is_liked: likedSet.has(p.id) }));
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching channel posts:', error);
      return [];
    }
  }, [user]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('channels-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => {
        fetchChannels();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchChannels]);

  return {
    channels,
    isLoading,
    fetchChannels,
    fetchMyChannels,
    createChannel,
    joinChannel,
    leaveChannel,
    createChannelPost,
    fetchChannelPosts,
  };
}
