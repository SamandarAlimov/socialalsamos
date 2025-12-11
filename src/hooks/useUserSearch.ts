import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  followers_count: number | null;
  following_count: number | null;
  is_following?: boolean;
}

export function useUserSearch() {
  const { user } = useAuth();
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const searchTerm = `%${query}%`;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_verified, followers_count, following_count')
      .or(`username.ilike.${searchTerm},display_name.ilike.${searchTerm}`)
      .neq('id', user?.id || '')
      .limit(20);

    if (!error && data) {
      // Check if current user is following each result
      if (user) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        const followingIds = new Set(follows?.map(f => f.following_id) || []);
        
        setResults(
          data.map(profile => ({
            ...profile,
            is_following: followingIds.has(profile.id),
          }))
        );
      } else {
        setResults(data);
      }
    }
    setLoading(false);
  }, [user]);

  const fetchSuggestedUsers = useCallback(async () => {
    if (!user) return;

    // Get users the current user is not following
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followingIds = follows?.map(f => f.following_id) || [];

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_verified, followers_count, following_count')
      .neq('id', user.id)
      .not('id', 'in', `(${followingIds.length > 0 ? followingIds.join(',') : 'null'})`)
      .order('followers_count', { ascending: false })
      .limit(10);

    if (!error && data) {
      setSuggestedUsers(data.map(p => ({ ...p, is_following: false })));
    }
  }, [user]);

  const followUser = useCallback(async (userId: string) => {
    if (!user) return false;

    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, following_id: userId });

    if (!error) {
      setResults(prev =>
        prev.map(p => (p.id === userId ? { ...p, is_following: true } : p))
      );
      setSuggestedUsers(prev =>
        prev.map(p => (p.id === userId ? { ...p, is_following: true } : p))
      );
      return true;
    }
    return false;
  }, [user]);

  const unfollowUser = useCallback(async (userId: string) => {
    if (!user) return false;

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', userId);

    if (!error) {
      setResults(prev =>
        prev.map(p => (p.id === userId ? { ...p, is_following: false } : p))
      );
      setSuggestedUsers(prev =>
        prev.map(p => (p.id === userId ? { ...p, is_following: false } : p))
      );
      return true;
    }
    return false;
  }, [user]);

  return {
    results,
    loading,
    suggestedUsers,
    searchUsers,
    fetchSuggestedUsers,
    followUser,
    unfollowUser,
  };
}
