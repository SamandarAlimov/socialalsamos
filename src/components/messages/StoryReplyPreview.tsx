import { useState, useEffect } from 'react';
import { Play, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface Story {
  id: string;
  media_url: string;
  media_type: string | null;
  caption: string | null;
  profile?: {
    username: string | null;
    display_name: string | null;
  };
}

interface StoryReplyPreviewProps {
  storyId: string;
  isMine: boolean;
}

export function StoryReplyPreview({ storyId, isMine }: StoryReplyPreviewProps) {
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStory() {
      const { data, error } = await supabase
        .from('stories')
        .select(`
          id, media_url, media_type, caption,
          profile:profiles!stories_user_id_fkey (username, display_name)
        `)
        .eq('id', storyId)
        .single();

      if (!error && data) {
        setStory(data as Story);
      }
      setIsLoading(false);
    }

    fetchStory();
  }, [storyId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className={cn(
        "text-xs mb-2 flex items-center gap-2",
        isMine ? "text-white/50" : "text-muted-foreground"
      )}>
        <div className={cn(
          "h-12 w-12 rounded-lg flex items-center justify-center",
          isMine ? "bg-white/10" : "bg-muted"
        )}>
          <ImageIcon className="h-5 w-5 opacity-50" />
        </div>
        <span>Story no longer available</span>
      </div>
    );
  }

  const isVideo = story.media_type === 'video';

  return (
    <div className={cn(
      "flex items-center gap-2 mb-2 p-2 rounded-lg",
      isMine ? "bg-white/10" : "bg-muted/50"
    )}>
      {/* Story Thumbnail */}
      <div className="relative h-12 w-12 rounded-lg overflow-hidden flex-shrink-0 bg-black/20">
        {isVideo ? (
          <>
            <video
              src={story.media_url}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Play className="h-4 w-4 text-white fill-white" />
            </div>
          </>
        ) : (
          <img
            src={story.media_url}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Story Info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-xs font-medium",
          isMine ? "text-white/80" : "text-foreground"
        )}>
          Replied to story
        </p>
        {story.caption && (
          <p className={cn(
            "text-xs truncate",
            isMine ? "text-white/50" : "text-muted-foreground"
          )}>
            {story.caption}
          </p>
        )}
      </div>
    </div>
  );
}
