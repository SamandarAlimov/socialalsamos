import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { RichTextContent } from '@/components/RichTextContent';
import { MediaFrame } from '@/components/media/MediaFrame';

interface SharedPost {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface SharedPostPreviewProps {
  postId: string;
  isMine: boolean;
}

export function SharedPostPreview({ postId, isMine }: SharedPostPreviewProps) {
  const navigate = useNavigate();
  const [post, setPost] = useState<SharedPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id, content, media_urls, media_type, likes_count, comments_count,
          profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url)
        `)
        .eq('id', postId)
        .single();

      if (cancelled) return;
      if (!error && data) setPost(data as SharedPost);
      setIsLoading(false);
    }

    fetchPost();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const surface = isMine
    ? 'bg-bubble-own-foreground/10 border-bubble-own-foreground/20'
    : 'bg-muted/50 border-border';

  if (isLoading) {
    return (
      <div className={cn('overflow-hidden rounded-2xl border', surface)}>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!post) {
    return (
      <div
        className={cn(
          'rounded-2xl border p-3 text-center text-sm',
          surface,
          isMine ? 'text-bubble-own-foreground/65' : 'text-muted-foreground'
        )}
      >
        Post mavjud emas
      </div>
    );
  }

  const mediaUrl = post.media_urls?.[0];
  const hasMedia = Boolean(mediaUrl);
  const isVideo = post.media_type === 'video' || post.media_type === 'reel';
  const postPath = `/post/${encodeURIComponent(post.id)}`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(postPath);
  };

  return (
    <div
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(postPath);
        }
      }}
      className={cn(
        'cursor-pointer overflow-hidden rounded-2xl border transition-colors',
        surface,
        isMine ? 'hover:bg-bubble-own-foreground/10' : 'hover:bg-muted/70'
      )}
    >
      {/* Media ko'rinishi */}
      {hasMedia && (
        <MediaFrame variant="preview">
          {isVideo ? (
            <>
              <video
                src={mediaUrl}
                className="h-full w-full object-contain"
                muted
                playsInline
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-black/50 p-2 backdrop-blur-sm">
                  <Play className="h-6 w-6 fill-white text-white" />
                </span>
              </div>
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                Video
              </span>
            </>
          ) : (
            <img src={mediaUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
          )}
        </MediaFrame>
      )}

      {/* Post ma'lumotlari */}
      <div className="space-y-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={post.profile?.avatar_url || ''} />
            <AvatarFallback className="text-xs">
              {post.profile?.display_name?.[0] || post.profile?.username?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              'truncate text-sm font-medium',
              isMine ? 'text-bubble-own-foreground' : 'text-foreground'
            )}
          >
            {post.profile?.display_name || post.profile?.username || "Noma'lum"}
          </span>
        </div>

        {post.content && (
          <div
            className={cn(
              'line-clamp-2 break-words text-sm',
              isMine ? 'text-bubble-own-foreground/75' : 'text-muted-foreground'
            )}
            style={{ overflowWrap: 'anywhere' }}
          >
            <RichTextContent content={post.content} />
          </div>
        )}

        <div
          className={cn(
            'flex items-center gap-4 text-xs',
            isMine ? 'text-bubble-own-foreground/65' : 'text-muted-foreground'
          )}
        >
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            <span className="tabular-nums">{post.likes_count || 0}</span>
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="tabular-nums">{post.comments_count || 0}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
