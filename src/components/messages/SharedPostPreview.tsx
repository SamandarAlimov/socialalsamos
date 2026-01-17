import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { RichTextContent } from '@/components/RichTextContent';

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
    async function fetchPost() {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id, content, media_urls, media_type, likes_count, comments_count,
          profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url)
        `)
        .eq('id', postId)
        .single();

      if (!error && data) {
        setPost(data as SharedPost);
      }
      setIsLoading(false);
    }

    fetchPost();
  }, [postId]);

  if (isLoading) {
    return (
      <div className={cn(
        "rounded-xl overflow-hidden border",
        isMine ? "bg-white/10 border-white/20" : "bg-muted/50 border-border"
      )}>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className={cn(
        "rounded-xl p-3 text-center text-sm",
        isMine ? "bg-white/10 text-white/60" : "bg-muted/50 text-muted-foreground"
      )}>
        Post not available
      </div>
    );
  }

  const hasMedia = post.media_urls && post.media_urls.length > 0;
  const isVideo = post.media_type === 'video' || post.media_type === 'reel';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isVideo) {
      navigate(`/videos?v=${post.id}`);
    } else {
      navigate(`/home?post=${post.id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "rounded-xl overflow-hidden border cursor-pointer transition-transform hover:scale-[1.02]",
        isMine ? "bg-white/10 border-white/20" : "bg-muted/50 border-border"
      )}
    >
      {/* Media Preview */}
      {hasMedia && (
        <div className="relative aspect-video bg-black/20">
          {isVideo ? (
            <>
              <video
                src={post.media_urls![0]}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/50 rounded-full p-2">
                  <Play className="h-6 w-6 text-white fill-white" />
                </div>
              </div>
            </>
          ) : (
            <img
              src={post.media_urls![0]}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}

      {/* Post Info */}
      <div className="p-3 space-y-2">
        {/* Author */}
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={post.profile?.avatar_url || ''} />
            <AvatarFallback className="text-xs">
              {post.profile?.display_name?.[0] || post.profile?.username?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          <span className={cn(
            "text-sm font-medium",
            isMine ? "text-white" : "text-foreground"
          )}>
            {post.profile?.display_name || post.profile?.username}
          </span>
        </div>

        {/* Content */}
        {post.content && (
          <div className={cn(
            "text-sm line-clamp-2",
            isMine ? "text-white/80" : "text-muted-foreground"
          )}>
            <RichTextContent content={post.content} />
          </div>
        )}

        {/* Stats */}
        <div className={cn(
          "flex items-center gap-4 text-xs",
          isMine ? "text-white/60" : "text-muted-foreground"
        )}>
          <div className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            <span>{post.likes_count || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{post.comments_count || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
