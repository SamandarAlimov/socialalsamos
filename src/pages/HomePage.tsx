import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  MoreHorizontal,
  Plus,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Send,
  Smile
} from 'lucide-react';
import { usePosts, Post } from '@/hooks/usePosts';
import { useStories, StoryGroup } from '@/hooks/useStories';
import { useStoryViews } from '@/hooks/useRealtimeCounts';
import { useRealtimePostCounts } from '@/hooks/useRealtimePostCounts';
import { useLiveStreams } from '@/hooks/useLiveStream';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { CreatePostForm } from '@/components/CreatePostForm';
import { CreateStoryDialog } from '@/components/CreateStoryDialog';
import { CommentsSection } from '@/components/CommentsSection';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { GoLiveButton } from '@/components/live/GoLiveButton';
import { LiveStreamCard } from '@/components/live/LiveStreamCard';

export default function HomePage() {
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryGroup | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [storyReply, setStoryReply] = useState('');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const storyTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Swipe navigation
  const { swipeOffset, handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeNavigation();

  // Enable push notifications
  const { permission, requestPermission } = useNotificationPermission();

  const { 
    posts, 
    isLoading, 
    hasMore, 
    loadMore, 
    createPost, 
    likePost,
    refresh: refreshPosts
  } = usePosts('global');

  const { storyGroups, isLoading: storiesLoading, refresh: refreshStories } = useStories();
  const { markAsViewed, hasViewedAll } = useStoryViews(user?.id || null);
  const { liveStreams } = useLiveStreams();

  // Get post IDs for real-time counts
  const postIds = useMemo(() => posts.map(p => p.id), [posts]);
  const { getPostCounts } = useRealtimePostCounts(postIds, user?.id || null);

  // Request notification permission on first load
  useEffect(() => {
    if (permission === 'default') {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Infinite scroll
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoading, loadMore]);

  // Auto-advance story timer
  useEffect(() => {
    if (activeStoryGroup && activeStoryGroup.stories[activeStoryIndex]?.media_type !== 'video') {
      storyTimerRef.current = setTimeout(() => {
        nextStory();
      }, 5000);
    }

    return () => {
      if (storyTimerRef.current) {
        clearTimeout(storyTimerRef.current);
      }
    };
  }, [activeStoryGroup, activeStoryIndex]);

  const formatPostTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return formatDistanceToNow(date, { addSuffix: false }) + ' ago';
    }
    return format(date, 'MMM d');
  };

  const openStory = (group: StoryGroup) => {
    setActiveStoryGroup(group);
    setActiveStoryIndex(0);
    // Mark the first story as viewed
    if (group.stories[0]) {
      markAsViewed(group.stories[0].id);
    }
  };

  const closeStory = () => {
    setActiveStoryGroup(null);
    setActiveStoryIndex(0);
    setStoryReply('');
  };

  const nextStory = () => {
    if (!activeStoryGroup) return;
    
    if (activeStoryIndex < activeStoryGroup.stories.length - 1) {
      const nextIndex = activeStoryIndex + 1;
      setActiveStoryIndex(nextIndex);
      // Mark next story as viewed
      markAsViewed(activeStoryGroup.stories[nextIndex].id);
    } else {
      // Move to next group
      const currentGroupIndex = storyGroups.findIndex(g => g.user_id === activeStoryGroup.user_id);
      if (currentGroupIndex < storyGroups.length - 1) {
        const nextGroup = storyGroups[currentGroupIndex + 1];
        setActiveStoryGroup(nextGroup);
        setActiveStoryIndex(0);
        if (nextGroup.stories[0]) markAsViewed(nextGroup.stories[0].id);
      } else {
        closeStory();
      }
    }
  };

  const prevStory = () => {
    if (!activeStoryGroup) return;
    
    if (activeStoryIndex > 0) {
      setActiveStoryIndex(prev => prev - 1);
    } else {
      // Move to previous group
      const currentGroupIndex = storyGroups.findIndex(g => g.user_id === activeStoryGroup.user_id);
      if (currentGroupIndex > 0) {
        const prevGroup = storyGroups[currentGroupIndex - 1];
        setActiveStoryGroup(prevGroup);
        setActiveStoryIndex(prevGroup.stories.length - 1);
      }
    }
  };

  const handleStoryReply = () => {
    if (!storyReply.trim() || !activeStoryGroup) return;
    // TODO: Send story reply via messages
    console.log('Reply to story:', storyReply);
    setStoryReply('');
  };

  const handleRefresh = async () => {
    await Promise.all([refreshPosts(), refreshStories()]);
  };

  const pageContent = (
    <div 
      className={cn(
        "max-w-2xl mx-auto py-4 md:py-6 px-3 md:px-4",
        isMobile && "transition-transform duration-100"
      )}
      style={isMobile ? { transform: `translateX(${swipeOffset}px)` } : undefined}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      {/* Story Viewer Modal */}
      {activeStoryGroup && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <button 
            onClick={closeStory}
            className="absolute top-4 right-4 z-10 text-white hover:text-muted-foreground safe-area-top"
          >
            <X className="h-8 w-8" />
          </button>
          
          {/* Story Progress Bars */}
          <div className="absolute top-4 left-4 right-16 flex gap-1 safe-area-top">
            {activeStoryGroup.stories.map((_, idx) => (
              <div key={idx} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full bg-white transition-all",
                    idx < activeStoryIndex ? "w-full" : idx === activeStoryIndex ? "w-full animate-story-progress" : "w-0"
                  )}
                  style={idx === activeStoryIndex ? { animationDuration: '5s' } : undefined}
                />
              </div>
            ))}
          </div>

          {/* Story Header */}
          <div className="absolute top-10 left-4 flex items-center gap-3 safe-area-top z-10">
            <Avatar className="h-10 w-10 border-2 border-white">
              <AvatarImage src={activeStoryGroup.avatar_url || ''} />
              <AvatarFallback>{activeStoryGroup.display_name?.[0] || activeStoryGroup.username?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white font-semibold text-sm">
                {activeStoryGroup.display_name || activeStoryGroup.username}
              </p>
              <p className="text-white/60 text-xs">
                {activeStoryGroup.stories[activeStoryIndex] && 
                  formatDistanceToNow(new Date(activeStoryGroup.stories[activeStoryIndex].created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Story Content - Fixed sizing for mobile */}
          <div className={cn(
            "relative bg-black overflow-hidden flex items-center justify-center",
            isMobile ? "w-full h-full" : "w-full max-w-md aspect-[9/16] rounded-xl"
          )}>
            {activeStoryGroup.stories[activeStoryIndex] && (
              activeStoryGroup.stories[activeStoryIndex].media_type === 'video' ? (
                <video 
                  src={activeStoryGroup.stories[activeStoryIndex].media_url}
                  className="max-w-full max-h-full object-contain"
                  autoPlay
                  playsInline
                  onEnded={nextStory}
                />
              ) : (
                <img 
                  src={activeStoryGroup.stories[activeStoryIndex].media_url}
                  alt="Story"
                  className="max-w-full max-h-full object-contain"
                />
              )
            )}
            
            {/* Caption */}
            {activeStoryGroup.stories[activeStoryIndex]?.caption && (
              <div className="absolute bottom-20 left-4 right-4 text-white text-center">
                <p className="bg-black/50 rounded-lg px-4 py-2 text-sm">
                  {activeStoryGroup.stories[activeStoryIndex].caption}
                </p>
              </div>
            )}
          </div>

          {/* Story Reply Input */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 safe-area-bottom z-10">
            <div className="flex-1 relative">
              <Input
                value={storyReply}
                onChange={(e) => setStoryReply(e.target.value)}
                placeholder="Send message..."
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 pr-10"
                onKeyDown={(e) => e.key === 'Enter' && handleStoryReply()}
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">
                <Smile className="h-5 w-5" />
              </button>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={handleStoryReply}
              disabled={!storyReply.trim()}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation - Touch areas */}
          <div 
            onClick={prevStory}
            className="absolute left-0 top-20 bottom-20 w-1/3 md:w-auto md:left-4 md:top-1/2 md:-translate-y-1/2 flex items-center justify-start md:justify-center cursor-pointer"
          >
            <ChevronLeft className="h-8 w-8 text-white hidden md:block" />
          </div>
          <div 
            onClick={nextStory}
            className="absolute right-0 top-20 bottom-20 w-1/3 md:w-auto md:right-4 md:top-1/2 md:-translate-y-1/2 flex items-center justify-end md:justify-center cursor-pointer"
          >
            <ChevronRight className="h-8 w-8 text-white hidden md:block" />
          </div>
        </div>
      )}

      {/* Story Creation Dialog */}
      <CreateStoryDialog 
        open={showCreateStory} 
        onOpenChange={setShowCreateStory}
        onSuccess={refreshStories}
      />

      {/* Stories Section - Mobile optimized */}
      <div className="mb-4 md:mb-6 -mx-3 md:mx-0 px-3 md:px-0">
        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-3 md:pb-4 scrollbar-hidden">
          {/* Add Story Button */}
          <button 
            onClick={() => setShowCreateStory(true)}
            className="flex flex-col items-center gap-1.5 md:gap-2 flex-shrink-0 touch-feedback"
          >
            <div className="relative">
              <div className="bg-background p-0.5 rounded-full">
                <Avatar className="h-14 w-14 md:h-16 md:w-16">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="bg-muted text-sm">
                    {profile?.display_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="absolute bottom-0 right-0 bg-primary rounded-full p-0.5 md:p-1 border-2 border-background">
                <Plus className="h-2.5 w-2.5 md:h-3 md:w-3 text-primary-foreground" />
              </div>
            </div>
            <span className="text-[10px] md:text-xs text-muted-foreground truncate max-w-[56px] md:max-w-[64px]">
              Your Story
            </span>
          </button>

          {/* Go Live Button */}
          <GoLiveButton variant="story" />

          {/* Live Streams */}
          {liveStreams.map((stream) => (
            <LiveStreamCard key={stream.id} stream={stream} variant="story" />
          ))}

          {/* Story Groups */}
          {storiesLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 md:gap-2 flex-shrink-0">
                <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-muted animate-pulse" />
                <div className="h-2.5 md:h-3 w-10 md:w-12 rounded bg-muted animate-pulse" />
              </div>
            ))
          ) : (
            storyGroups.filter(g => g.user_id !== user?.id).map((group) => (
              <button 
                key={group.user_id}
                onClick={() => openStory(group)}
                className="flex flex-col items-center gap-1.5 md:gap-2 flex-shrink-0 touch-feedback"
              >
                <div className={cn(
                  "relative p-0.5 rounded-full",
                  !hasViewedAll(group.all_story_ids)
                    ? "bg-gradient-to-tr from-alsamos-orange-light to-alsamos-orange-dark" 
                    : "bg-muted"
                )}>
                  <div className="bg-background p-0.5 rounded-full">
                    <Avatar className="h-14 w-14 md:h-16 md:w-16">
                      <AvatarImage src={group.avatar_url || ''} />
                      <AvatarFallback className="text-sm">{group.display_name?.[0] || group.username?.[0] || 'U'}</AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                <span className="text-[10px] md:text-xs text-muted-foreground truncate max-w-[56px] md:max-w-[64px]">
                  {group.display_name || group.username}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Create Post - Mobile optimized */}
      <div className="mb-4 md:mb-6">
        <CreatePostForm onPost={createPost} />
      </div>

      {/* Feed */}
      <div className="space-y-4 md:space-y-6">
        {posts.map((post) => (
          <PostCard 
            key={post.id} 
            post={post} 
            onLike={() => likePost(post.id)}
            formatTime={formatPostTime}
            isMobile={isMobile}
            realtimeCounts={getPostCounts(post.id)}
          />
        ))}

        {/* Load More Trigger */}
        <div ref={loadMoreRef} className="py-4">
          {isLoading && (
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 md:h-8 md:w-8 animate-spin text-primary" />
            </div>
          )}
          {!hasMore && posts.length > 0 && (
            <p className="text-center text-muted-foreground text-xs md:text-sm">
              You've reached the end of the feed
            </p>
          )}
        </div>
      </div>
    </div>
  );

  // Wrap with pull-to-refresh on mobile
  if (isMobile) {
    return (
      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        {pageContent}
      </PullToRefresh>
    );
  }

  return pageContent;
}

interface RealtimePostCounts {
  id: string;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
}

function PostCard({ 
  post, 
  onLike, 
  formatTime,
  isMobile,
  realtimeCounts
}: { 
  post: Post; 
  onLike: () => void;
  formatTime: (date: string) => string;
  isMobile: boolean;
  realtimeCounts: RealtimePostCounts;
}) {
  const navigate = useNavigate();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showComments, setShowComments] = useState(false);

  // Use real-time counts
  const likesCount = realtimeCounts.likes_count;
  const commentsCount = realtimeCounts.comments_count;
  const isLiked = realtimeCounts.is_liked ?? post.is_liked;

  const handleUserClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.user_id) {
      navigate(`/user/${post.user_id}`);
    }
  };

  return (
    <article className="bg-card rounded-xl md:rounded-2xl border border-border overflow-hidden animate-fade-in">
      {/* Post Header */}
      <div className="flex items-center justify-between p-3 md:p-4">
        <div className="flex items-center gap-2.5 md:gap-3">
          <Avatar 
            className="h-9 w-9 md:h-10 md:w-10 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleUserClick}
          >
            <AvatarImage src={post.profile?.avatar_url || ''} />
            <AvatarFallback className="text-xs md:text-sm">
              {post.profile?.display_name?.[0] || post.profile?.username?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-1">
              <span 
                className="font-semibold text-sm cursor-pointer hover:underline"
                onClick={handleUserClick}
              >
                {post.profile?.display_name || post.profile?.username || 'Anonymous'}
              </span>
              {post.profile?.is_verified && (
                <svg className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
            </div>
            <p className="text-[11px] md:text-xs text-muted-foreground">
              <span 
                className="cursor-pointer hover:underline"
                onClick={handleUserClick}
              >
                @{post.profile?.username || 'user'}
              </span>
              {' '}· {formatTime(post.created_at)}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9 text-muted-foreground">
          <MoreHorizontal className="h-4 w-4 md:h-5 md:w-5" />
        </Button>
      </div>

      {/* Post Content */}
      {post.content && (
        <div className="px-3 md:px-4 pb-2 md:pb-3">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
        </div>
      )}

      {/* Post Media */}
      {post.media_urls && post.media_urls.length > 0 && (
        <div className="relative">
          {post.media_type === 'video' ? (
            <video 
              src={post.media_urls[0]} 
              controls
              playsInline
              className="w-full aspect-video object-cover"
            />
          ) : (
            <img 
              src={post.media_urls[0]} 
              alt="Post content" 
              className="w-full aspect-[4/3] md:aspect-video object-cover"
              loading="lazy"
            />
          )}
        </div>
      )}

      {/* Post Actions - Mobile optimized */}
      <div className="flex items-center justify-between p-3 md:p-4 border-t border-border">
        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={onLike}
            className={cn(
              "flex items-center gap-1.5 md:gap-2 transition-colors touch-feedback",
              isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
            )}
          >
            <Heart className={cn("h-5 w-5 md:h-5 md:w-5", isLiked && 'fill-current')} />
            <span className="text-xs md:text-sm font-medium">{likesCount}</span>
          </button>
          <button 
            onClick={() => setShowComments(!showComments)}
            className={cn(
              "flex items-center gap-1.5 md:gap-2 transition-colors touch-feedback",
              showComments ? 'text-primary' : 'text-muted-foreground hover:text-primary'
            )}
          >
            <MessageCircle className={cn("h-5 w-5 md:h-5 md:w-5", showComments && 'fill-current')} />
            <span className="text-xs md:text-sm font-medium">{commentsCount}</span>
          </button>
          <button className="flex items-center gap-1.5 md:gap-2 text-muted-foreground hover:text-primary transition-colors touch-feedback">
            <Share2 className="h-5 w-5 md:h-5 md:w-5" />
            <span className="text-xs md:text-sm font-medium">{post.shares_count}</span>
          </button>
        </div>
        <button 
          onClick={() => setIsBookmarked(!isBookmarked)}
          className={cn(
            "transition-colors touch-feedback",
            isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary'
          )}
        >
          <Bookmark className={cn("h-5 w-5 md:h-5 md:w-5", isBookmarked && 'fill-current')} />
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <CommentsSection postId={post.id} />
      )}
    </article>
  );
}
