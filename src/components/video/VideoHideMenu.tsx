import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { PostActionsMenu } from '@/components/PostActionsMenu';
import { useAuth } from '@/contexts/AuthContext';
import db from '@/lib/supabaseAny';

interface ActiveVideoPost {
  user_id: string;
  content: string | null;
  is_pinned: boolean;
}

/**
 * Videos/Reels mirrors the active canonical post id into `?v=`. Resolve the
 * lightweight post metadata here and reuse the exact same More Actions surface
 * as Home/Profile so mobile and tablet never fall back to a one-off dropdown.
 */
export function VideoHideMenu() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [post, setPost] = useState<ActiveVideoPost | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const postId =
    searchParams.get('v') ||
    searchParams.get('post') ||
    searchParams.get('id');

  useEffect(() => {
    if (location.pathname !== '/videos' || !postId || !user?.id) {
      setPost(null);
      setIsBookmarked(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const [postResult, bookmarkResult] = await Promise.all([
        db
          .from('posts')
          .select('user_id, content, is_pinned')
          .eq('id', postId)
          .maybeSingle(),
        db
          .from('bookmarks')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (postResult.error || !postResult.data) {
        console.error('Video actions metadata failed:', postResult.error);
        setPost(null);
        setIsBookmarked(false);
        return;
      }

      setPost({
        user_id: String((postResult.data as any).user_id ?? ''),
        content: (postResult.data as any).content ?? null,
        is_pinned: Boolean((postResult.data as any).is_pinned),
      });
      setIsBookmarked(Boolean(bookmarkResult.data));
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, postId, user?.id]);

  if (location.pathname !== '/videos' || !postId || !user?.id || !post?.user_id) return null;

  return (
    <div className="pointer-events-auto fixed right-3 top-[calc(env(safe-area-inset-top,0px)+64px)] z-[46] md:right-5 md:top-5">
      <PostActionsMenu
        key={postId}
        postId={postId}
        postUserId={post.user_id}
        postContent={post.content ?? undefined}
        isPinned={post.is_pinned}
        isBookmarked={isBookmarked}
        triggerLabel="Video amallari"
        triggerClassName="h-10 w-10 rounded-full bg-black/45 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-xl hover:bg-black/60 hover:text-white"
        triggerIconClassName="h-5 w-5"
      />
    </div>
  );
}
