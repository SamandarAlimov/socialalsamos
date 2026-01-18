import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  Plus,
  Loader2,
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
import { PostMediaCarousel } from '@/components/PostMediaCarousel';
import { PostActionsMenu } from '@/components/PostActionsMenu';
import { PostLikesDialog } from '@/components/PostLikesDialog';
import { SharePostDialog } from '@/components/SharePostDialog';
import { PostViewModal } from '@/components/PostViewModal';
import { PollDisplay, parsePollFromContent } from '@/components/PollDisplay';
import { RichTextContent } from '@/components/RichTextContent';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { LiveStreamCard } from '@/components/live/LiveStreamCard';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { supabase } from '@/integrations/supabase/client';

export default function HomePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryGroup | null>(null);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [selectedPostForModal, setSelectedPostForModal] = useState<Post | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

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

  // Handle ?post= query param to open post modal
  useEffect(() => {
    const postId = searchParams.get('post');
    if (postId) {
      async function fetchPost() {
        const { data } = await supabase
          .from('posts')
          .select(`
            id, content, media_urls, media_type, likes_count, comments_count, is_pinned, created_at, user_id,
            profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, is_verified)
          `)
          .eq('id', postId)
          .single();

        if (data) {
          setSelectedPostForModal(data as Post);
        }
      }
      fetchPost();
    } else {
      setSelectedPostForModal(null);
    }
  }, [searchParams]);

  const closePostModal = () => {
    setSelectedPostForModal(null);
    setSearchParams({});
  };

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
    markAsViewed(group.stories[0]?.id);
  };

  const closeStory = () => {
    setActiveStoryGroup(null);
    refreshStories();
  };

  // Get current user's story group
  const userStoryGroup = useMemo(() => {
    return storyGroups.find(g => g.user_id === user?.id);
  }, [storyGroups, user?.id]);

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
        <StoryViewer
          storyGroup={activeStoryGroup}
          allGroups={storyGroups}
          onClose={closeStory}
          onMarkAsViewed={markAsViewed}
        />
      )}

      {/* Story Creation Dialog */}
      <CreateStoryDialog 
        open={showCreateStory} 
        onOpenChange={setShowCreateStory}
        onSuccess={refreshStories}
      />

      {/* Post View Modal from URL */}
      {selectedPostForModal && selectedPostForModal.profile && (
        <PostViewModal
          post={{
            ...selectedPostForModal,
            is_liked: selectedPostForModal.is_liked || false,
          }}
          profile={selectedPostForModal.profile}
          open={!!selectedPostForModal}
          onOpenChange={(open) => !open && closePostModal()}
          onLike={() => likePost(selectedPostForModal.id)}
        />
      )}

      {/* Stories Section - Mobile optimized */}
      <div className="mb-4 md:mb-6 -mx-3 md:mx-0 px-3 md:px-0">
        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-3 md:pb-4 scrollbar-hidden">
          {/* Your Story Button */}
          <button 
            onClick={() => userStoryGroup ? openStory(userStoryGroup) : setShowCreateStory(true)}
            className="flex flex-col items-center gap-1.5 md:gap-2 flex-shrink-0 touch-feedback"
          >
            <div className="relative">
              <div className={cn(
                "p-0.5 rounded-full",
                userStoryGroup ? "bg-gradient-to-tr from-alsamos-orange-light to-alsamos-orange-dark" : "bg-background"
              )}>
                <div className="bg-background p-0.5 rounded-full">
                  <Avatar className="h-14 w-14 md:h-16 md:w-16">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="bg-muted text-sm">
                      {profile?.display_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              {!userStoryGroup && (
                <div className="absolute bottom-0 right-0 bg-primary rounded-full p-0.5 md:p-1 border-2 border-background">
                  <Plus className="h-2.5 w-2.5 md:h-3 md:w-3 text-primary-foreground" />
                </div>
              )}
            </div>
            <span className="text-[10px] md:text-xs text-muted-foreground truncate max-w-[56px] md:max-w-[64px]">
              {userStoryGroup ? 'Your Story' : 'Add Story'}
            </span>
          </button>

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
            onDelete={refreshPosts}
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
  realtimeCounts,
  onDelete
}: { 
  post: Post; 
  onLike: () => void;
  formatTime: (date: string) => string;
  isMobile: boolean;
  realtimeCounts: RealtimePostCounts;
  onDelete?: () => void;
}) {
  const navigate = useNavigate();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showLikesDialog, setShowLikesDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  // Use real-time counts
  const likesCount = realtimeCounts.likes_count;
  const commentsCount = realtimeCounts.comments_count;
  const isLiked = realtimeCounts.is_liked ?? post.is_liked;

  const handleUserClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.profile?.username) {
      navigate(`/user/${post.profile.username}`);
    } else if (post.user_id) {
      navigate(`/user/${post.user_id}`);
    }
  };

  return (
    <article className="bg-card rounded-xl md:rounded-2xl border border-border overflow-hidden animate-fade-in">
      {/* Post Header */}
      <div className="flex items-center justify-between p-3 md:p-4">
        <div className="flex items-center gap-2.5 md:gap-3">
          <StoryAvatar
            userId={post.user_id}
            username={post.profile?.username}
            displayName={post.profile?.display_name}
            avatarUrl={post.profile?.avatar_url}
            isVerified={!!post.profile?.is_verified}
            size="md"
            showRing
            onClick={handleUserClick}
          />
          <div>
            <div className="flex items-center gap-1">
              <span 
                className="font-semibold text-sm cursor-pointer hover:underline"
                onClick={handleUserClick}
              >
                {post.profile?.display_name || post.profile?.username || 'Anonymous'}
              </span>
              {post.profile?.is_verified && (
                <VerifiedBadge size="xs" />
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
        <PostActionsMenu
          postId={post.id}
          postUserId={post.user_id}
          isPinned={post.is_pinned}
          onDelete={onDelete}
        />
      </div>

      {/* Post Content with Poll Support */}
      {post.content && (() => {
        const { pollData, cleanContent } = parsePollFromContent(post.content);
        return (
          <>
            {cleanContent && (
              <div className="px-3 md:px-4 pb-2 md:pb-3">
                <RichTextContent content={cleanContent} className="text-sm leading-relaxed" />
              </div>
            )}
            {pollData && (
              <div className="px-3 md:px-4 pb-2 md:pb-3">
                <PollDisplay postId={post.id} pollData={pollData} />
              </div>
            )}
          </>
        );
      })()}

      {/* Post Media Carousel */}
      {post.media_urls && post.media_urls.length > 0 && (
        <PostMediaCarousel mediaUrls={post.media_urls} mediaType={post.media_type || 'image'} />
      )}

      {/* Post Actions - Mobile optimized */}
      <div className="flex items-center justify-between p-3 md:p-4 border-t border-border">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex items-center gap-1.5 md:gap-2">
            <button 
              onClick={onLike}
              className={cn(
                "transition-colors touch-feedback",
                isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
              )}
            >
              <Heart className={cn("h-5 w-5 md:h-5 md:w-5", isLiked && 'fill-current')} />
            </button>
            <button
              onClick={() => setShowLikesDialog(true)}
              className={cn(
                "text-xs md:text-sm font-medium hover:underline",
                isLiked ? 'text-red-500' : 'text-muted-foreground'
              )}
            >
              {likesCount}
            </button>
          </div>
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
          <button 
            onClick={() => setShowShareDialog(true)}
            className="flex items-center gap-1.5 md:gap-2 text-muted-foreground hover:text-primary transition-colors touch-feedback"
          >
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

      {/* Likes Dialog */}
      <PostLikesDialog
        postId={post.id}
        open={showLikesDialog}
        onOpenChange={setShowLikesDialog}
        likesCount={likesCount}
      />

      {/* Share Dialog */}
      <SharePostDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        postId={post.id}
        postContent={post.content || undefined}
      />
    </article>
  );
}
