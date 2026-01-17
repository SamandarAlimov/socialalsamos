import { useState } from 'react';
import { 
  Heart, 
  MessageCircle, 
  MoreHorizontal, 
  Pin, 
  Trash2, 
  Play,
  Grid,
  LayoutList,
  Share2,
  Bookmark,
  BarChart3
} from 'lucide-react';
import { PostViewModal } from '@/components/PostViewModal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { PollDisplay, parsePollFromContent } from '@/components/PollDisplay';

interface Post {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  is_pinned?: boolean;
  is_liked?: boolean;
  created_at: string;
}

interface ProfilePostsGridProps {
  posts: Post[];
  isOwnProfile: boolean;
  profile: {
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
  };
  onLike: (postId: string) => void;
  onDelete: (postId: string) => void;
  onPin: (postId: string) => void;
}

export function ProfilePostsGrid({ 
  posts, 
  isOwnProfile, 
  profile,
  onLike, 
  onDelete, 
  onPin 
}: ProfilePostsGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);

  const handlePostClick = (post: Post) => {
    setSelectedPost(post);
    setShowPostModal(true);
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (posts.length === 0) {
    return null;
  }

  return (
    <div>
      {/* View mode toggle */}
      <div className="flex justify-end mb-4">
        <div className="flex bg-muted rounded-lg p-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-3",
              viewMode === 'grid' && "bg-background shadow-sm"
            )}
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-3",
              viewMode === 'list' && "bg-background shadow-sm"
            )}
            onClick={() => setViewMode('list')}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <div 
              key={post.id} 
              className="relative aspect-square bg-muted rounded-lg overflow-hidden group cursor-pointer"
              onClick={() => handlePostClick(post)}
            >
              {post.media_urls && post.media_urls.length > 0 ? (
                post.media_type === 'video' ? (
                  <>
                    <video
                      src={post.media_urls[0]}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1">
                      <Play className="h-3 w-3 text-white fill-white" />
                    </div>
                  </>
                ) : (
                  <img 
                    src={post.media_urls[0]}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder.svg';
                    }}
                  />
                )
              ) : (
                (() => {
                  const { pollData, cleanContent } = parsePollFromContent(post.content || '');
                  return pollData ? (
                    <div className="w-full h-full flex items-center justify-center p-2 bg-gradient-to-br from-primary/10 to-primary/5">
                      <div className="flex flex-col items-center gap-1">
                        <BarChart3 className="h-6 w-6 text-primary" />
                        <p className="text-xs text-muted-foreground text-center line-clamp-2">{pollData.question}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-primary/5">
                      <p className="text-sm text-foreground line-clamp-4 text-center">{cleanContent || post.content}</p>
                    </div>
                  );
                })()
              )}

              {/* Pinned indicator */}
              {post.is_pinned && (
                <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full p-1">
                  <Pin className="h-3 w-3" />
                </div>
              )}

              {/* Multiple media indicator */}
              {post.media_urls && post.media_urls.length > 1 && (
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                  1/{post.media_urls.length}
                </div>
              )}

              {/* Hover overlay with stats */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
                <div className="flex items-center gap-1 text-white">
                  <Heart className={cn("h-5 w-5", post.is_liked && "fill-red-500 text-red-500")} />
                  <span className="font-semibold">{formatCount(post.likes_count || 0)}</span>
                </div>
                <div className="flex items-center gap-1 text-white">
                  <MessageCircle className="h-5 w-5" />
                  <span className="font-semibold">{formatCount(post.comments_count || 0)}</span>
                </div>

                {/* Post actions for own profile */}
                {isOwnProfile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button 
                        className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4 text-white" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onLike(post.id)}>
                        <Heart className={cn("h-4 w-4 mr-2", post.is_liked && "fill-red-500 text-red-500")} />
                        {post.is_liked ? 'Unlike' : 'Like'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onPin(post.id)}>
                        <Pin className="h-4 w-4 mr-2" />
                        {post.is_pinned ? 'Unpin from profile' : 'Pin to profile'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onDelete(post.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete post
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div 
              key={post.id} 
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              {/* Post header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={profile.avatar_url || ''} />
                    <AvatarFallback>
                      {profile.username?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{profile.display_name || profile.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(post.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                {isOwnProfile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onPin(post.id)}>
                        <Pin className="h-4 w-4 mr-2" />
                        {post.is_pinned ? 'Unpin' : 'Pin to profile'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onDelete(post.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Pinned badge */}
              {post.is_pinned && (
                <div className="px-4 pb-2">
                  <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded-full">
                    <Pin className="h-3 w-3" />
                    Pinned
                  </span>
                </div>
              )}

              {/* Post content with Poll Support */}
              {post.content && (() => {
                const { pollData, cleanContent } = parsePollFromContent(post.content);
                return (
                  <>
                    {cleanContent && (
                      <div className="px-4 pb-3">
                        <p className="text-foreground whitespace-pre-wrap">{cleanContent}</p>
                      </div>
                    )}
                    {pollData && (
                      <div className="px-4 pb-3">
                        <PollDisplay postId={post.id} pollData={pollData} />
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Media */}
              {post.media_urls && post.media_urls.length > 0 && (
                <div className="relative">
                  {post.media_type === 'video' ? (
                    <video
                      src={post.media_urls[0]}
                      controls
                      className="w-full max-h-[500px] object-contain bg-black"
                      playsInline
                    />
                  ) : (
                    <img 
                      src={post.media_urls[0]}
                      alt=""
                      className="w-full max-h-[500px] object-contain"
                    />
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 p-4 border-t border-border">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => onLike(post.id)}
                >
                  <Heart className={cn(
                    "h-5 w-5",
                    post.is_liked && "fill-red-500 text-red-500"
                  )} />
                  <span>{formatCount(post.likes_count || 0)}</span>
                </Button>
                <Button variant="ghost" size="sm" className="gap-2">
                  <MessageCircle className="h-5 w-5" />
                  <span>{formatCount(post.comments_count || 0)}</span>
                </Button>
                <Button variant="ghost" size="sm">
                  <Share2 className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="sm" className="ml-auto">
                  <Bookmark className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post View Modal */}
      {selectedPost && (
        <PostViewModal
          post={selectedPost}
          profile={profile}
          open={showPostModal}
          onOpenChange={(open) => {
            setShowPostModal(open);
            if (!open) setSelectedPost(null);
          }}
          onLike={() => onLike(selectedPost.id)}
          isOwnProfile={isOwnProfile}
        />
      )}
    </div>
  );
}
