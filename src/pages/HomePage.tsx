import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Share2, Bookmark, Plus, Loader2, Repeat2, Eye } from 'lucide-react';
import { usePosts, Post } from '@/hooks/usePosts';
import { useStories, StoryGroup } from '@/hooks/useStories';
import { useStoryViews } from '@/hooks/useRealtimeCounts';
import { useRealtimePostCounts } from '@/hooks/useRealtimePostCounts';
import { useLiveStreams } from '@/hooks/useLiveStream';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { CreatePostForm } from '@/components/CreatePostForm';
import { VideoCommentsSheet } from '@/components/VideoCommentsSheet';
import { PostActionsMenu } from '@/components/PostActionsMenu';
import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog';
import { SharePostDialog } from '@/components/SharePostDialog';
import { PostViewModal } from '@/components/PostViewModal';
import { PollDisplay, parsePollFromContent } from '@/components/PollDisplay';
import { RichText } from '@/components/RichText';
import { PostExtras } from '@/components/PostExtras';
import { PostMusicCard } from '@/components/PostMusicCard';
import { PostCollaboratorByline } from '@/components/PostCollaboratorByline';
import { PostAuthorAvatars } from '@/components/PostAuthorAvatars';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { LiveStreamCard } from '@/components/live/LiveStreamCard';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { RepostButton } from '@/components/RepostButton';
import { useActiveAds } from '@/hooks/useAds';
import { FeedAd } from '@/components/ads/FeedAd';
import { usePostViews } from '@/hooks/usePostViews';
import { useHomeRecommendations } from '@/hooks/useHomeRecommendations';
import { parseLocationFromContent, parseMusicFromContent, resolvePostMusic } from '@/lib/postMarkers';

/**
 * Yangi sxemadagi qoshimcha maydonlar. `posts` jadvalidan `*` bilan
 * oqilgani uchun ular mavjud, lekin generatsiya qilingan tiplarda hali yoq.
 */
type FeedPost = Post & {
  post_kind?: string | null;
  has_poll?: boolean | null;
};

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
  const {
    swipeOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  } = useSwipeNavigation();

  // Enable push notifications
  const { permission, requestPermission } = useNotificationPermission();

  const { 
    posts, 
    isLoading, 
    hasMore, 
    loadMore, 
    createPost, 
    likePost,
    toggleBookmark,
    hidePost,
    refresh: refreshPosts
  } = usePosts('recommended');

  const {
    rankedPosts,
    refreshProfile: refreshRecommendationProfile,
  } = useHomeRecommendations(posts);

  const { storyGroups, isLoading: storiesLoading, refresh: refreshStories } = useStories();
  const { markAsViewed, hasViewedAll, hasUnviewed } = useStoryViews();
  const { liveStreams } = useLiveStreams();
  
  // Feed ads
  const { ads: feedAds, trackImpression, trackClick } = useActiveAds('feed', 2);

  // Get post IDs for real-time counts
  const postIds = useMemo(
    () => rankedPosts.map((post) => post.id),
    [rankedPosts],
  );
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
        let { data, error } = await db
          .from('posts')
          .select(`
            id, content, formatted_content, media_urls, media_type, likes_count, comments_count, is_pinned, created_at, user_id,
            profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, is_verified)
          `)
          .eq('id', postId)
          .single();

        if (
          error &&
          (error.code === '42703' ||
            error.code === 'PGRST204' ||
            String(error.message ?? '').toLowerCase().includes('formatted_content'))
        ) {
          const fallback = await db
            .from('posts')
            .select(`
              id, content, media_urls, media_type, likes_count, comments_count, is_pinned, created_at, user_id,
              profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, is_verified)
            `)
            .eq('id', postId)
            .single();
          data = fallback.data ? { ...fallback.data, formatted_content: null } : null;
          error = fallback.error;
        }

        if (data && !error) {
          setSelectedPostForModal(data as unknown as Post);
        }
      }
      fetchPost();
    } else {
      setSelectedPostForModal(null);
    }
  }, [searchParams]);

  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : null;

  const closePostModal = () => {
    setSelectedPostForModal(null);
    if (safeReturnTo) {
      navigate(safeReturnTo);
    } else {
      setSearchParams({});
    }
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
    await Promise.all([
      refreshPosts(),
      refreshStories(),
      refreshRecommendationProfile(),
    ]);
  };

  const pageContent = (
    <div 
      className={cn(
        "w-full max-w-[640px] xl:max-w-[620px] mx-auto py-4 md:py-6 px-0 md:px-4",
        isMobile && swipeOffset !== 0 && "transition-transform duration-100"
      )}
      style={
        isMobile
          ? {
              touchAction: 'pan-y',
              ...(swipeOffset !== 0
                ? { transform: `translateX(${swipeOffset}px)` }
                : {}),
            }
          : undefined
      }
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
      onTouchCancel={isMobile ? handleTouchCancel : undefined}
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
          focusCommentId={searchParams.get('comment')}
          onBack={safeReturnTo ? closePostModal : undefined}
        />
      )}

      {/* Stories Section - Mobile optimized */}
      <div className="mb-4 px-3 md:mb-6 md:px-0">
        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-3 md:pb-4 scrollbar-hidden">
          {/* Your Story Button */}
          <button 
            onClick={() => {
              if (userStoryGroup) {
                openStory(userStoryGroup);
              } else {
                navigate('/create?mode=story');
              }
            }}
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
      <div className="mb-4 px-3 md:mb-6 md:px-0">
        <div 
          onClick={() => navigate('/compose')}
          className="cursor-pointer"
        >
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {profile?.display_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 py-2 px-3 bg-muted/50 rounded-xl text-muted-foreground text-sm">
                What's on your mind?
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-4 md:space-y-6">
        {rankedPosts.map((post, index) => (
          <div key={post.id}>
            <PostCard 
              post={post as FeedPost} 
              onLike={() => likePost(post.id)}
              formatTime={formatPostTime}
              isMobile={isMobile}
              realtimeCounts={getPostCounts(post.id)}
              onDelete={refreshPosts}
              onBookmark={() => toggleBookmark(post.id)}
              onHide={() => hidePost(post.id)}
              isOwner={post.user_id === user?.id}
            />
            
            {/* Show ad after every 5th post */}
            {(index + 1) % 5 === 0 && feedAds[Math.floor(index / 5) % feedAds.length] && (
              <div className="mt-4 md:mt-6">
                <FeedAd
                  ad={feedAds[Math.floor(index / 5) % feedAds.length]}
                  onImpression={(id) => trackImpression(id, 'feed')}
                  onClick={(id) => trackClick(id, 'feed')}
                />
              </div>
            )}
          </div>
        ))}

        {/* Load More Trigger */}
        <div ref={loadMoreRef} className="py-4">
          {isLoading && (
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 md:h-8 md:w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {!hasMore && rankedPosts.length > 0 && (
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
  views_count: number;
  is_liked?: boolean;
}

function PostCard({ 
  post, 
  onLike, 
  formatTime,
  isMobile,
  realtimeCounts,
  onDelete,
  onBookmark,
  onHide,
  isOwner
}: { 
  post: FeedPost; 
  onLike: () => void;
  formatTime: (date: string) => string;
  isMobile: boolean;
  realtimeCounts: RealtimePostCounts;
  onDelete?: () => void;
  onBookmark?: () => void | Promise<void>;
  onHide?: () => void | Promise<void>;
  isOwner?: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const articleRef = useRef<HTMLElement | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [showAudienceDialog, setShowAudienceDialog] = useState(false);
  const [audienceDefaultTab, setAudienceDefaultTab] = useState<'likes' | 'views'>('likes');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const legacyLooksLikeVideo = Boolean(
    post.media_type === 'video' ||
    post.media_type === 'reel' ||
    post.media_type === 'short' ||
    post.media_urls?.some((url) => /\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)(?:[?#].*)?$/i.test(url || '')),
  );
  const [activeVisualKind, setActiveVisualKind] = useState<'video' | 'image' | null>(
    legacyLooksLikeVideo ? 'video' : null,
  );
  const hasActiveVideo = activeVisualKind === 'video';
  const { recordView } = usePostViews();

  useEffect(() => {
    setActiveVisualKind(legacyLooksLikeVideo ? 'video' : null);
  }, [legacyLooksLikeVideo, post.id]);

  // Recommendation quality depends on true impressions. A mounted card is not
  // automatically a view: it must be at least 55% visible for 900ms.
  useEffect(() => {
    const node = articleRef.current;
    if (!node) return;

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    const clearDwell = () => {
      if (dwellTimer) clearTimeout(dwellTimer);
      dwellTimer = null;
    };

    if (typeof IntersectionObserver === 'undefined') {
      dwellTimer = setTimeout(() => void recordView(post.id), 900);
      return clearDwell;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          if (!dwellTimer) {
            dwellTimer = setTimeout(() => {
              dwellTimer = null;
              void recordView(post.id);
            }, 900);
          }
        } else {
          clearDwell();
        }
      },
      { threshold: [0, 0.55, 0.8] },
    );

    observer.observe(node);
    return () => {
      clearDwell();
      observer.disconnect();
    };
  }, [post.id, recordView]);

  // Use real-time counts
  const likesCount = realtimeCounts.likes_count;
  const commentsCount = realtimeCounts.comments_count;
  const isLiked = realtimeCounts.is_liked ?? post.is_liked;

  // Yangi sorovnoma tizimi: `has_poll` bolmasa `post_kind` ga qaraymiz.
  const hasStructuredPoll = Boolean(post.has_poll) || post.post_kind === 'poll';

  /*
    Matn ichidagi barcha markerlar bir joyda ajratiladi:
    sorovnoma -> joylashuv -> musiqa. Shu tartib buzilmasa xom JSON yoki
    emoji qatori foydalanuvchiga hech qachon korinmaydi.

    Musiqa uchta manbadan izlanadi: `content` markeri, `formatted_content`
    ichida qolgan marker va `media_urls` dagi audio fayl.
  */
  const markers = useMemo(() => {
    const poll = parsePollFromContent(post.content || '');
    const location = parseLocationFromContent(poll.cleanContent);
    const music = parseMusicFromContent(location.cleanContent);

    return {
      pollData: poll.pollData,
      legacyLocation: location.location,
      legacyLocationLabel: location.labelOnly,
      legacyMusic: resolvePostMusic({
        contentMusic: music.music,
        formattedContent: post.formatted_content,
        mediaUrls: post.media_urls,
        mediaType: post.media_type,
      }),
      textContent: music.cleanContent,
    };
  }, [post.content, post.formatted_content, post.media_urls, post.media_type]);

  // Only media-first posts use Instagram-style author chrome on top of video.
  // If a post starts with text/music/poll, the author row must stay above that
  // leading content; moving it into the later video breaks the post hierarchy.
  const hasLeadingContent = Boolean(
    markers.textContent?.trim() ||
    markers.legacyMusic ||
    markers.pollData ||
    hasStructuredPoll
  );
  const shouldOverlayVideoAuthor = hasActiveVideo && !hasLeadingContent;

  useEffect(() => {
    if (!shouldOverlayVideoAuthor || !user?.id || user.id === post.user_id) {
      setIsFollowingAuthor(false);
      return;
    }

    let cancelled = false;
    void supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .eq('following_id', post.user_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Home follow holatini yuklab bo‘lmadi:', error);
          return;
        }
        setIsFollowingAuthor(Boolean(data));
      });

    return () => {
      cancelled = true;
    };
  }, [post.user_id, shouldOverlayVideoAuthor, user?.id]);

  const toggleAuthorFollow = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user?.id || user.id === post.user_id || followLoading) return;

    const next = !isFollowingAuthor;
    setIsFollowingAuthor(next);
    setFollowLoading(true);
    try {
      const result = next
        ? await supabase.from('follows').insert({
            follower_id: user.id,
            following_id: post.user_id,
          })
        : await supabase
            .from('follows')
            .delete()
            .eq('follower_id', user.id)
            .eq('following_id', post.user_id);

      if (result.error) throw result.error;
    } catch (error) {
      setIsFollowingAuthor(!next);
      console.error('Home follow holatini o‘zgartirib bo‘lmadi:', error);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUserClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.profile?.username) {
      navigate(`/user/${post.profile.username}`);
    } else if (post.user_id) {
      navigate(`/user/${post.user_id}`);
    }
  };

  return (
    <article
      ref={articleRef}
      className="overflow-hidden border-y border-border/70 bg-card/95 shadow-none transition-[box-shadow,border-color] duration-200 md:rounded-3xl md:border md:shadow-sm md:hover:border-border md:hover:shadow-md animate-fade-in"
    >
      {/* Image/text posts keep the classic card header. Video posts move it on-media like Instagram. */}
      {!shouldOverlayVideoAuthor && (
        <div className="flex items-center justify-between p-4 md:p-5">
          <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
            <PostAuthorAvatars
              postId={post.id}
              userId={post.user_id}
              username={post.profile?.username}
              displayName={post.profile?.display_name}
              avatarUrl={post.profile?.avatar_url}
              isVerified={!!post.profile?.is_verified}
              onOwnerClick={handleUserClick}
            />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <span
                  className="cursor-pointer text-sm font-semibold hover:underline"
                  onClick={handleUserClick}
                >
                  {post.profile?.display_name || post.profile?.username || 'Anonymous'}
                </span>
                {post.profile?.is_verified && <VerifiedBadge size="xs" />}
                <PostCollaboratorByline postId={post.id} isOwner={isOwner} />
              </div>
              <p className="text-[11px] text-muted-foreground md:text-xs">
                <span className="cursor-pointer hover:underline" onClick={handleUserClick}>
                  @{post.profile?.username || 'user'}
                </span>
                {' '}· {formatTime(post.created_at)}
              </p>
            </div>
          </div>
          <PostActionsMenu
            postId={post.id}
            postUserId={post.user_id}
            postContent={post.content ?? undefined}
            isPinned={post.is_pinned}
            isBookmarked={Boolean(post.is_bookmarked)}
            onToggleBookmark={onBookmark}
            onHide={onHide}
            onDelete={onDelete}
          />
        </div>
      )}

      {/* Post matni: formatlash bilan (qalin, qiya, chizilgan, rangli, sarlavha) */}
      {markers.textContent && (
        <div className="px-4 pb-3 md:px-5 md:pb-4">
          <RichText
            content={markers.textContent}
            formattedContent={post.formatted_content}
            className="text-sm leading-relaxed"
          />
        </div>
      )}

      {/*
        Musiqa profil sahifasidagi kabi togridan-togri chiziladi.
        Ilgari u faqat PostExtras ichidan otardi va strukturali jadval
        sorovlariga boglib qolardi.
      */}
      {markers.legacyMusic && (
        <div className="px-4 pb-3 md:px-5 md:pb-4">
          <PostMusicCard music={markers.legacyMusic} />
        </div>
      )}

      {/* Eski markerli sorovnomalar (migratsiyagacha) */}
      {markers.pollData && !hasStructuredPoll && (
        <div className="px-4 pb-3 md:px-5 md:pb-4">
          <PollDisplay postId={post.id} pollData={markers.pollData} />
        </div>
      )}

      {/*
        Fayllar (har qanday tur), sorovnoma va joylashuv.
        Yangi `post_media` bosh bolsa eski `media_urls` karuseli korsatiladi.
        Musiqa yuqorida chizilgani uchun bu yerga uzatilmaydi.
      */}
      <PostExtras
        postId={post.id}
        hasPoll={hasStructuredPoll}
        isOwner={isOwner}
        legacyMediaUrls={post.media_urls}
        legacyMediaType={post.media_type}
        legacyLocation={markers.legacyLocation}
        legacyLocationLabel={markers.legacyLocationLabel}
        likesCount={likesCount}
        commentsCount={commentsCount}
        viewsCount={realtimeCounts.views_count || post.views_count || 0}
        authorId={post.user_id}
        onSocialCommentsClick={() => setShowComments(true)}
        onSocialLikesClick={() => {
          setAudienceDefaultTab('likes');
          setShowAudienceDialog(true);
        }}
        onSocialProfileClick={() => {
          if (post.profile?.username) navigate(`/user/${post.profile.username}`);
          else navigate(`/user/${post.user_id}`);
        }}
        onActiveVisualKindChange={setActiveVisualKind}
        videoOverlay={shouldOverlayVideoAuthor ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[8] bg-gradient-to-b from-black/70 via-black/28 to-transparent px-3 pb-10 pt-3 text-white md:px-4 md:pt-4">
            <div className="pointer-events-auto flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="[&_.bg-card]:!bg-black/25 [&_.border-background]:!border-white/70">
                  <PostAuthorAvatars
                    postId={post.id}
                    userId={post.user_id}
                    username={post.profile?.username}
                    displayName={post.profile?.display_name}
                    avatarUrl={post.profile?.avatar_url}
                    isVerified={!!post.profile?.is_verified}
                    onOwnerClick={handleUserClick}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={handleUserClick}
                      className="max-w-[52vw] truncate text-sm font-semibold text-white drop-shadow-sm hover:underline md:max-w-sm"
                    >
                      {post.profile?.username || post.profile?.display_name || 'user'}
                    </button>
                    {post.profile?.is_verified && <VerifiedBadge size="xs" />}
                    <PostCollaboratorByline
                      postId={post.id}
                      isOwner={isOwner}
                      className="[&_button]:!text-white [&_span]:!text-white"
                    />
                  </div>
                  <div className="truncate text-[11px] font-medium text-white/88 drop-shadow-sm md:text-xs">
                    {formatTime(post.created_at)}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {user?.id && user.id !== post.user_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={followLoading}
                    onClick={toggleAuthorFollow}
                    className="h-7 rounded-full border-white/55 bg-black/20 px-3 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/10 hover:text-white disabled:opacity-60"
                  >
                    {followLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isFollowingAuthor ? (
                      'Following'
                    ) : (
                      'Follow'
                    )}
                  </Button>
                )}
                <div className="rounded-full bg-black/20 backdrop-blur-sm [&_button]:!text-white [&_button:hover]:!bg-white/10">
                <PostActionsMenu
                  postId={post.id}
                  postUserId={post.user_id}
                  postContent={post.content ?? undefined}
                  isPinned={post.is_pinned}
                  isBookmarked={Boolean(post.is_bookmarked)}
                  onToggleBookmark={onBookmark}
                  onHide={onHide}
                  onDelete={onDelete}
                />
                </div>
              </div>
            </div>
          </div>
        ) : undefined}
        className="px-4 md:px-5"
      />

      {/* Post Actions - Mobile optimized */}
      <div className="flex items-center justify-between border-t border-border/70 p-4 md:px-5">
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
              onClick={() => {
                setAudienceDefaultTab('likes');
                setShowAudienceDialog(true);
              }}
              className={cn(
                "text-xs md:text-sm font-medium hover:underline",
                isLiked ? 'text-red-500' : 'text-muted-foreground'
              )}
            >
              {likesCount}
            </button>
          </div>
          <button
            onClick={() => setShowComments(true)}
            className={cn(
              "flex items-center gap-1.5 md:gap-2 transition-colors touch-feedback",
              showComments ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <MessageCircle className={cn("h-5 w-5 md:h-5 md:w-5", showComments && 'fill-current')} />
            <span className="text-xs md:text-sm font-medium">{commentsCount}</span>
          </button>
          <button 
            onClick={() => setShowShareDialog(true)}
            className="flex items-center gap-1.5 md:gap-2 text-muted-foreground hover:text-foreground transition-colors touch-feedback"
          >
            <Share2 className="h-5 w-5 md:h-5 md:w-5" />
            <span className="text-xs md:text-sm font-medium">{post.shares_count}</span>
          </button>
          <RepostButton
            postId={post.id}
            postUserId={post.user_id}
            initialCount={0}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setAudienceDefaultTab('views');
              setShowAudienceDialog(true);
            }}
            className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground touch-feedback"
            aria-label="Ko‘rishlar va yoqtirishlarni ochish"
          >
            <Eye className="h-5 w-5" />
            <span className="text-xs font-medium tabular-nums md:text-sm">
              {realtimeCounts.views_count || post.views_count || 0}
            </span>
          </button>
          <button
            onClick={() => void onBookmark?.()}
            aria-pressed={Boolean(post.is_bookmarked)}
            aria-label={post.is_bookmarked ? 'Saqlanganlardan olib tashlash' : 'Postni saqlash'}
            className={cn(
              "transition-colors touch-feedback",
              post.is_bookmarked ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Bookmark className={cn("h-5 w-5 md:h-5 md:w-5", post.is_bookmarked && 'fill-current')} />
          </button>
        </div>
      </div>

      {/* Home and Videos share the same premium comments experience. */}
      <VideoCommentsSheet
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        postId={post.id}
        commentsCount={commentsCount}
        previewVideo={false}
      />

      {/* Likes + views are one premium audience sheet, matching Videos/Reels. */}
      <PostLikesViewsDialog
        postId={post.id}
        open={showAudienceDialog}
        onOpenChange={setShowAudienceDialog}
        likesCount={likesCount}
        viewsCount={realtimeCounts.views_count || post.views_count || 0}
        defaultTab={audienceDefaultTab}
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
