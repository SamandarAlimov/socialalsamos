import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';

export interface SavedPostPlaylist {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

export interface SavedPostProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

export interface SavedPost {
  id: string;
  user_id: string;
  content: string | null;
  formatted_content?: unknown;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  reposts_count: number;
  views_count: number;
  is_pinned: boolean;
  is_liked?: boolean;
  is_bookmarked: boolean;
  profile_hidden_at?: string | null;
  post_kind?: string | null;
  has_poll?: boolean | null;
  created_at: string;
  profile?: SavedPostProfile | null;
}

type BookmarkRow = {
  post_id: string;
  created_at: string | null;
};

type PlaylistItemRow = {
  playlist_id: string;
  post_id: string;
};

const POST_COLUMNS = [
  'id',
  'user_id',
  'content',
  'formatted_content',
  'media_urls',
  'media_type',
  'likes_count',
  'comments_count',
  'shares_count',
  'reposts_count',
  'views_count',
  'is_pinned',
  'profile_hidden_at',
  'post_kind',
  'has_poll',
  'created_at',
].join(',');

const PROFILE_COLUMNS = 'id,username,display_name,avatar_url,is_verified';

function normalizeSavedPost(row: Record<string, any>, profile?: SavedPostProfile | null): SavedPost {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    content: row.content ?? null,
    formatted_content: row.formatted_content ?? null,
    media_urls: Array.isArray(row.media_urls) ? row.media_urls : [],
    media_type: row.media_type ?? null,
    likes_count: Number(row.likes_count ?? 0),
    comments_count: Number(row.comments_count ?? 0),
    shares_count: Number(row.shares_count ?? 0),
    reposts_count: Number(row.reposts_count ?? 0),
    views_count: Number(row.views_count ?? 0),
    is_pinned: Boolean(row.is_pinned),
    is_bookmarked: true,
    profile_hidden_at: row.profile_hidden_at ?? null,
    post_kind: row.post_kind ?? null,
    has_poll: row.has_poll ?? null,
    created_at: String(row.created_at),
    profile: profile ?? null,
  };
}

export function useSavedPostPlaylists() {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<SavedPostPlaylist[]>([]);
  const [allSavedPosts, setAllSavedPosts] = useState<SavedPost[]>([]);
  const [playlistPostIds, setPlaylistPostIds] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async (showLoading = true) => {
    if (!user?.id) {
      setPlaylists([]);
      setAllSavedPosts([]);
      setPlaylistPostIds({});
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      const [playlistResult, bookmarkResult] = await Promise.all([
        db
          .from('saved_post_playlists')
          .select('id,user_id,name,is_default,created_at')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true }),
        db
          .from('bookmarks')
          .select('post_id,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (playlistResult.error) throw playlistResult.error;
      if (bookmarkResult.error) throw bookmarkResult.error;

      const nextPlaylists = (playlistResult.data ?? []) as SavedPostPlaylist[];
      const bookmarks = (bookmarkResult.data ?? []) as BookmarkRow[];
      const playlistIds = nextPlaylists.map((playlist) => playlist.id);

      let items: PlaylistItemRow[] = [];
      if (playlistIds.length > 0) {
        const itemResult = await db
          .from('saved_post_playlist_items')
          .select('playlist_id,post_id')
          .eq('user_id', user.id)
          .in('playlist_id', playlistIds);
        if (itemResult.error) throw itemResult.error;
        items = (itemResult.data ?? []) as PlaylistItemRow[];
      }

      const nextPlaylistPostIds: Record<string, string[]> = {};
      for (const playlist of nextPlaylists) nextPlaylistPostIds[playlist.id] = [];
      for (const item of items) {
        const list = nextPlaylistPostIds[item.playlist_id];
        if (list && !list.includes(item.post_id)) list.push(item.post_id);
      }

      const bookmarkPostIds = bookmarks.map((bookmark) => bookmark.post_id);
      let posts: SavedPost[] = [];

      if (bookmarkPostIds.length > 0) {
        const postResult = await db
          .from('posts')
          .select(POST_COLUMNS)
          .in('id', bookmarkPostIds);
        if (postResult.error) throw postResult.error;

        const rawPosts = (postResult.data ?? []) as Array<Record<string, any>>;
        const authorIds = Array.from(
          new Set(rawPosts.map((post) => String(post.user_id)).filter(Boolean)),
        );

        const profilesById = new Map<string, SavedPostProfile>();
        if (authorIds.length > 0) {
          const profileResult = await db
            .from('profiles')
            .select(PROFILE_COLUMNS)
            .in('id', authorIds);
          if (profileResult.error) throw profileResult.error;

          for (const profile of (profileResult.data ?? []) as SavedPostProfile[]) {
            profilesById.set(profile.id, profile);
          }
        }

        const postsById = new Map(
          rawPosts.map((post) => [
            String(post.id),
            normalizeSavedPost(post, profilesById.get(String(post.user_id)) ?? null),
          ]),
        );

        posts = bookmarks.flatMap((bookmark) => {
          const post = postsById.get(bookmark.post_id);
          return post ? [post] : [];
        });
      }

      setPlaylists(nextPlaylists);
      setPlaylistPostIds(nextPlaylistPostIds);
      setAllSavedPosts(posts);
    } catch (nextError) {
      console.error('Saved post playlists load failed', nextError);
      setError(nextError);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.id) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh(false);
      }, 120);
    };

    const filter = `user_id=eq.${user.id}`;
    const channel = db
      .channel(`saved-post-playlists:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks', filter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_post_playlists', filter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_post_playlist_items', filter }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [refresh, user?.id]);

  const defaultPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.is_default) ?? null,
    [playlists],
  );

  const createPlaylist = useCallback(async (name: string) => {
    if (!user?.id) throw new Error('Authentication required');

    const trimmed = name.trim();
    if (!trimmed) throw new Error('Playlist name is required');
    if (trimmed.length > 80) throw new Error('Playlist name is too long');

    const result = await db
      .from('saved_post_playlists')
      .insert({ user_id: user.id, name: trimmed, is_default: false })
      .select('id,user_id,name,is_default,created_at')
      .single();

    if (result.error) throw result.error;
    await refresh(false);
    return result.data as SavedPostPlaylist;
  }, [refresh, user?.id]);

  const deletePlaylist = useCallback(async (playlistId: string) => {
    if (!user?.id) throw new Error('Authentication required');

    const playlist = playlists.find((item) => item.id === playlistId);
    if (!playlist || playlist.is_default) return;

    const result = await db
      .from('saved_post_playlists')
      .delete()
      .eq('id', playlistId)
      .eq('user_id', user.id)
      .eq('is_default', false);

    if (result.error) throw result.error;
    await refresh(false);
  }, [playlists, refresh, user?.id]);

  const updatePlaylistPosts = useCallback(async (playlistId: string, postIds: string[]) => {
    if (!user?.id) throw new Error('Authentication required');

    const playlist = playlists.find((item) => item.id === playlistId);
    if (!playlist || playlist.is_default) return;

    const savedPostIds = new Set(allSavedPosts.map((post) => post.id));
    const desired = Array.from(new Set(postIds)).filter((postId) => savedPostIds.has(postId));
    const current = new Set(playlistPostIds[playlistId] ?? []);
    const desiredSet = new Set(desired);
    const toAdd = desired.filter((postId) => !current.has(postId));
    const toRemove = Array.from(current).filter((postId) => !desiredSet.has(postId));

    if (toAdd.length > 0) {
      const insertResult = await db.from('saved_post_playlist_items').insert(
        toAdd.map((postId) => ({ playlist_id: playlistId, user_id: user.id, post_id: postId })),
      );
      if (insertResult.error) throw insertResult.error;
    }

    if (toRemove.length > 0) {
      const deleteResult = await db
        .from('saved_post_playlist_items')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('user_id', user.id)
        .in('post_id', toRemove);
      if (deleteResult.error) throw deleteResult.error;
    }

    await refresh(false);
  }, [allSavedPosts, playlistPostIds, playlists, refresh, user?.id]);

  return {
    playlists,
    defaultPlaylist,
    allSavedPosts,
    playlistPostIds,
    isLoading,
    error,
    refresh,
    createPlaylist,
    deletePlaylist,
    updatePlaylistPosts,
  };
}
