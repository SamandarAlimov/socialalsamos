import { useState, useEffect } from 'react';
import { Play, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { StoryViewer } from '@/components/stories/StoryViewer';

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string | null;
  caption: string | null;
  views_count: number;
  expires_at: string;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

interface StoryReplyPreviewProps {
  storyId: string;
  isMine: boolean;
}

export function StoryReplyPreview({ storyId, isMine }: StoryReplyPreviewProps) {
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showViewer, setShowViewer] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStory() {
      const { data, error } = await supabase
        .from('stories')
        .select(`
          id, user_id, media_url, media_type, caption, views_count, expires_at, created_at,
          profile:profiles!stories_user_id_fkey (
            id, username, display_name, avatar_url, is_verified
          )
        `)
        .eq('id', storyId)
        .single();

      if (cancelled) return;
      if (!error && data) setStory(data as Story);
      setIsLoading(false);
    }

    fetchStory();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (story) setShowViewer(true);
  };

  if (isLoading) {
    return (
      <div className="mb-2 flex items-center gap-2">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  if (!story) {
    return (
      <div
        className={cn(
          'mb-2 flex items-center gap-2 rounded-xl p-2 text-xs',
          isMine
            ? 'bg-primary-foreground/10 text-primary-foreground/70'
            : 'bg-muted/50 text-muted-foreground'
        )}
      >
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl',
            isMine ? 'bg-primary-foreground/15' : 'bg-muted'
          )}
        >
          <ImageIcon className="h-5 w-5 opacity-60" />
        </div>
        <span>Stori endi mavjud emas</span>
      </div>
    );
  }

  const isVideo = story.media_type === 'video';

  const storyGroup = {
    user_id: story.user_id,
    username: story.profile?.username || null,
    display_name: story.profile?.display_name || null,
    avatar_url: story.profile?.avatar_url || null,
    is_verified: story.profile?.is_verified || false,
    stories: [
      {
        id: story.id,
        user_id: story.user_id,
        media_url: story.media_url,
        media_type: story.media_type || 'image',
        caption: story.caption,
        views_count: story.views_count,
        expires_at: story.expires_at,
        created_at: story.created_at,
      },
    ],
    all_story_ids: [story.id],
  };

  const authorName =
    story.profile?.display_name || story.profile?.username || "Noma'lum foydalanuvchi";

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          'mb-2 flex w-full items-center gap-2 rounded-xl border-l-2 p-2 text-left transition-colors',
          isMine
            ? 'border-primary-foreground/50 bg-primary-foreground/10 hover:bg-primary-foreground/15'
            : 'border-primary bg-muted/50 hover:bg-muted/70'
        )}
      >
        {/* Stori rasmchasi */}
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-black/20">
          {isVideo ? (
            <>
              <video
                src={story.media_url}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-4 w-4 fill-white text-white" />
              </span>
            </>
          ) : (
            <img src={story.media_url} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        {/* Ma'lumot */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-xs font-medium',
              isMine ? 'text-primary-foreground' : 'text-primary'
            )}
          >
            {authorName} storisiga javob
          </p>
          <p
            className={cn(
              'truncate text-xs',
              isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {story.caption || (isVideo ? 'Video stori' : 'Rasmli stori')}
          </p>
        </div>
      </button>

      {showViewer && (
        <StoryViewer
          storyGroup={storyGroup}
          allGroups={[storyGroup]}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  );
}
