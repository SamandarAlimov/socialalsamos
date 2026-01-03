import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StoryViewer } from './StoryViewer';
import { cn } from '@/lib/utils';

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  views_count: number;
  expires_at: string;
  created_at: string;
}

interface StoryGroup {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  stories: Story[];
  all_story_ids: string[];
}

interface StoryAvatarProps {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showRing?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const sizeClasses = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
  xl: 'h-32 w-32',
};

const ringPadding = {
  xs: 'p-[1px]',
  sm: 'p-[1.5px]',
  md: 'p-[2px]',
  lg: 'p-[2px]',
  xl: 'p-[3px]',
};

export function StoryAvatar({
  userId,
  username,
  displayName,
  avatarUrl,
  isVerified = false,
  size = 'md',
  showRing = true,
  className,
  onClick,
}: StoryAvatarProps) {
  const { user } = useAuth();
  const [hasStory, setHasStory] = useState(false);
  const [hasUnviewedStory, setHasUnviewedStory] = useState(false);
  const [storyGroup, setStoryGroup] = useState<StoryGroup | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  useEffect(() => {
    checkForStories();
  }, [userId, user?.id]);

  const checkForStories = async () => {
    try {
      // Fetch stories for this user
      const { data: stories, error } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (stories && stories.length > 0) {
        setHasStory(true);

        // Check if current user has viewed all stories
        if (user && user.id !== userId) {
          const { data: views } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', user.id)
            .in('story_id', stories.map(s => s.id));

          const viewedIds = new Set((views || []).map(v => v.story_id));
          const hasUnviewed = stories.some(s => !viewedIds.has(s.id));
          setHasUnviewedStory(hasUnviewed);
        } else if (user?.id === userId) {
          // Own story - always show as viewed
          setHasUnviewedStory(false);
        }

        // Build story group
        setStoryGroup({
          user_id: userId,
          username: username || null,
          display_name: displayName || null,
          avatar_url: avatarUrl || null,
          is_verified: isVerified,
          stories: stories as Story[],
          all_story_ids: stories.map(s => s.id),
        });
      } else {
        setHasStory(false);
        setStoryGroup(null);
      }
    } catch (error) {
      console.error('Error checking for stories:', error);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (hasStory && storyGroup) {
      setShowViewer(true);
    } else if (onClick) {
      onClick(e);
    }
  };

  const handleCloseViewer = () => {
    setShowViewer(false);
    // Refresh story status after viewing
    checkForStories();
  };

  const handleMarkAsViewed = () => {
    // Update local state when story is viewed
    if (user?.id !== userId) {
      checkForStories();
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          "relative rounded-full transition-transform hover:scale-105",
          hasStory && showRing ? (
            hasUnviewedStory
              ? "bg-gradient-to-tr from-alsamos-orange-light to-alsamos-orange-dark"
              : "bg-muted"
          ) : "",
          hasStory && showRing && ringPadding[size],
          className
        )}
      >
        <div className={cn(
          hasStory && showRing && "bg-background rounded-full p-[1.5px]"
        )}>
          <Avatar className={sizeClasses[size]}>
            <AvatarImage src={avatarUrl || ''} />
            <AvatarFallback className="text-xs">
              {displayName?.[0] || username?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
      </button>

      {showViewer && storyGroup && (
        <StoryViewer
          storyGroup={storyGroup}
          allGroups={[storyGroup]}
          onClose={handleCloseViewer}
          onMarkAsViewed={handleMarkAsViewed}
        />
      )}
    </>
  );
}
