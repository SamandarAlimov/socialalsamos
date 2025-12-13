import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  ChevronRight
} from 'lucide-react';
import { usePosts, Post } from '@/hooks/usePosts';
import { useStories, StoryGroup } from '@/hooks/useStories';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { CreatePostForm } from '@/components/CreatePostForm';

export default function HomePage() {
  const { user, profile } = useAuth();
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryGroup | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { 
    posts, 
    isLoading, 
    hasMore, 
    loadMore, 
    createPost, 
    likePost 
  } = usePosts('global');

  const { storyGroups, isLoading: storiesLoading } = useStories();

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
    setActiveStoryIndex(0);
  };

  const closeStory = () => {
    setActiveStoryGroup(null);
    setActiveStoryIndex(0);
  };

  const nextStory = () => {
    if (!activeStoryGroup) return;
    
    if (activeStoryIndex < activeStoryGroup.stories.length - 1) {
      setActiveStoryIndex(prev => prev + 1);
    } else {
      // Move to next group
      const currentGroupIndex = storyGroups.findIndex(g => g.user_id === activeStoryGroup.user_id);
      if (currentGroupIndex < storyGroups.length - 1) {
        setActiveStoryGroup(storyGroups[currentGroupIndex + 1]);
        setActiveStoryIndex(0);
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

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {/* Story Viewer Modal */}
      {activeStoryGroup && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <button 
            onClick={closeStory}
            className="absolute top-4 right-4 z-10 text-white hover:text-gray-300"
          >
            <X className="h-8 w-8" />
          </button>
          
          {/* Story Progress Bars */}
          <div className="absolute top-4 left-4 right-16 flex gap-1">
            {activeStoryGroup.stories.map((_, idx) => (
              <div key={idx} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full bg-white transition-all duration-300",
                    idx < activeStoryIndex ? "w-full" : idx === activeStoryIndex ? "w-full animate-story-progress" : "w-0"
                  )}
                />
              </div>
            ))}
          </div>

          {/* Story Header */}
          <div className="absolute top-10 left-4 flex items-center gap-3">
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

          {/* Story Content */}
          <div className="relative w-full max-w-md aspect-[9/16] bg-muted rounded-xl overflow-hidden">
            {activeStoryGroup.stories[activeStoryIndex] && (
              activeStoryGroup.stories[activeStoryIndex].media_type === 'video' ? (
                <video 
                  src={activeStoryGroup.stories[activeStoryIndex].media_url}
                  className="w-full h-full object-cover"
                  autoPlay
                  onEnded={nextStory}
                />
              ) : (
                <img 
                  src={activeStoryGroup.stories[activeStoryIndex].media_url}
                  alt="Story"
                  className="w-full h-full object-cover"
                />
              )
            )}
            
            {/* Caption */}
            {activeStoryGroup.stories[activeStoryIndex]?.caption && (
              <div className="absolute bottom-4 left-4 right-4 text-white text-center">
                <p className="bg-black/50 rounded-lg px-4 py-2 text-sm">
                  {activeStoryGroup.stories[activeStoryIndex].caption}
                </p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <button 
            onClick={prevStory}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 p-2"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <button 
            onClick={nextStory}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 p-2"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        </div>
      )}

      {/* Stories Section */}
      <div className="mb-6">
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hidden">
          {/* Add Story Button */}
          <button className="flex flex-col items-center gap-2 flex-shrink-0">
            <div className="relative">
              <div className="bg-background p-0.5 rounded-full">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="bg-muted">
                    {profile?.display_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="absolute bottom-0 right-0 bg-primary rounded-full p-1 border-2 border-background">
                <Plus className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[64px]">
              Your Story
            </span>
          </button>

          {/* Story Groups */}
          {storiesLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
                <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
                <div className="h-3 w-12 rounded bg-muted animate-pulse" />
              </div>
            ))
          ) : (
            storyGroups.filter(g => g.user_id !== user?.id).map((group) => (
              <button 
                key={group.user_id}
                onClick={() => openStory(group)}
                className="flex flex-col items-center gap-2 flex-shrink-0"
              >
                <div className={cn(
                  "relative p-0.5 rounded-full",
                  group.has_unviewed 
                    ? "bg-gradient-to-tr from-alsamos-orange-light to-alsamos-orange-dark" 
                    : "bg-muted"
                )}>
                  <div className="bg-background p-0.5 rounded-full">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={group.avatar_url || ''} />
                      <AvatarFallback>{group.display_name?.[0] || group.username?.[0] || 'U'}</AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground truncate max-w-[64px]">
                  {group.display_name || group.username}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Create Post */}
      <CreatePostForm onPost={createPost} />

      {/* Feed */}
      <div className="space-y-6">
        {posts.map((post) => (
          <PostCard 
            key={post.id} 
            post={post} 
            onLike={() => likePost(post.id)}
            formatTime={formatPostTime}
          />
        ))}

        {/* Load More Trigger */}
        <div ref={loadMoreRef} className="py-4">
          {isLoading && (
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {!hasMore && posts.length > 0 && (
            <p className="text-center text-muted-foreground text-sm">
              You've reached the end of the feed
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({ 
  post, 
  onLike, 
  formatTime 
}: { 
  post: Post; 
  onLike: () => void;
  formatTime: (date: string) => string;
}) {
  const navigate = useNavigate();
  const [isBookmarked, setIsBookmarked] = useState(false);

  const handleUserClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.user_id) {
      navigate(`/user/${post.user_id}`);
    }
  };

  return (
    <article className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in">
      {/* Post Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Avatar 
            className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleUserClick}
          >
            <AvatarImage src={post.profile?.avatar_url || ''} />
            <AvatarFallback>
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
                <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
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
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </div>

      {/* Post Content */}
      {post.content && (
        <div className="px-4 pb-3">
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
              className="w-full aspect-video object-cover"
            />
          ) : (
            <img 
              src={post.media_urls[0]} 
              alt="Post content" 
              className="w-full aspect-video object-cover"
            />
          )}
        </div>
      )}

      {/* Post Actions */}
      <div className="flex items-center justify-between p-4 border-t border-border">
        <div className="flex items-center gap-4">
          <button 
            onClick={onLike}
            className={cn(
              "flex items-center gap-2 transition-colors",
              post.is_liked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
            )}
          >
            <Heart className={cn("h-5 w-5", post.is_liked && 'fill-current')} />
            <span className="text-sm">{post.likes_count}</span>
          </button>
          <button className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm">{post.comments_count}</span>
          </button>
          <button className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <Share2 className="h-5 w-5" />
            <span className="text-sm">{post.shares_count}</span>
          </button>
        </div>
        <button 
          onClick={() => setIsBookmarked(!isBookmarked)}
          className={cn(
            "transition-colors",
            isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary'
          )}
        >
          <Bookmark className={cn("h-5 w-5", isBookmarked && 'fill-current')} />
        </button>
      </div>
    </article>
  );
}
