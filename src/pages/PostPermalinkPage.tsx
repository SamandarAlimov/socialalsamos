import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PostViewModal } from '@/components/PostViewModal';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';

type PermalinkPost = {
  id: string;
  user_id: string;
  content: string | null;
  formatted_content?: unknown;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  is_pinned?: boolean;
  is_liked?: boolean;
  created_at: string;
  profile: {
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
    is_verified?: boolean | null;
  } | null;
};

function isFormattedContentCompatibilityError(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  const text = String(value?.message ?? '').toLowerCase();
  return (
    value?.code === '42703' ||
    value?.code === 'PGRST204' ||
    text.includes('formatted_content')
  );
}

export default function PostPermalinkPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<PermalinkPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPost() {
      if (!postId) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setNotFound(false);

      // Keep the permalink independent from a named PostgREST relationship.
      // Some older deployments did not expose posts_user_id_fkey in schema
      // cache, so loading the post and author separately is more resilient.
      let result = await db
        .from('posts')
        .select(`
          id, user_id, content, formatted_content, media_urls, media_type,
          likes_count, comments_count, is_pinned, created_at
        `)
        .eq('id', postId)
        .maybeSingle();

      if (result.error && isFormattedContentCompatibilityError(result.error)) {
        const fallback = await db
          .from('posts')
          .select(`
            id, user_id, content, media_urls, media_type,
            likes_count, comments_count, is_pinned, created_at
          `)
          .eq('id', postId)
          .maybeSingle();

        result = {
          ...fallback,
          data: fallback.data ? { ...fallback.data, formatted_content: null } : null,
        };
      }

      if (cancelled) return;

      if (result.error || !result.data) {
        setPost(null);
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      const postRow = result.data as Omit<PermalinkPost, 'profile' | 'is_liked'>;

      const [{ data: profile }, likeResult] = await Promise.all([
        db
          .from('profiles')
          .select('username, display_name, avatar_url, is_verified')
          .eq('id', postRow.user_id)
          .maybeSingle(),
        user?.id
          ? db
              .from('post_likes')
              .select('post_id')
              .eq('post_id', postId)
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;

      if (!profile) {
        setPost(null);
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setPost({
        ...postRow,
        profile,
        is_liked: Boolean(likeResult.data),
      });
      setIsLoading(false);
    }

    void loadPost();
    return () => {
      cancelled = true;
    };
  }, [postId, user?.id]);

  const close = useCallback(() => {
    navigate('/home');
  }, [navigate]);

  const toggleLike = useCallback(async () => {
    if (!user?.id || !post) return;

    const wasLiked = Boolean(post.is_liked);
    setPost((current) =>
      current
        ? {
            ...current,
            is_liked: !wasLiked,
            likes_count: Math.max(0, current.likes_count + (wasLiked ? -1 : 1)),
          }
        : current,
    );

    const result = wasLiked
      ? await db
          .from('post_likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id)
      : await db.from('post_likes').insert({
          post_id: post.id,
          user_id: user.id,
        });

    if (result.error) {
      setPost((current) =>
        current
          ? {
              ...current,
              is_liked: wasLiked,
              likes_count: Math.max(0, current.likes_count + (wasLiked ? 1 : -1)),
            }
          : current,
      );
    }
  }, [post, user?.id]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !post || !post.profile) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Post topilmadi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Post o‘chirilgan, maxfiy yoki siz uchun mavjud bo‘lmasligi mumkin.
          </p>
        </div>
        <Button onClick={close}>Home’ga qaytish</Button>
      </div>
    );
  }

  return (
    <PostViewModal
      post={post}
      profile={post.profile}
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      onLike={toggleLike}
      onBack={close}
    />
  );
}
