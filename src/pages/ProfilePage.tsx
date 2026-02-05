import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useUserReposts, Repost } from '@/hooks/useReposts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FollowersFollowingDialog } from '@/components/FollowersFollowingDialog';
import { ProfilePostsGrid } from '@/components/profile/ProfilePostsGrid';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { StoryHighlights } from '@/components/stories/StoryHighlights';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Edit3, 
  Grid, 
  Video, 
  Bookmark,
  Repeat2,
  MapPin,
  Link as LinkIcon,
  Calendar,
  ImageIcon,
  Archive
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PostViewModal } from '@/components/PostViewModal';

export default function ProfilePage() {
  const isMobile = useIsMobile();
  const { user, profile: authProfile, updateProfile } = useAuth();
  const { 
    profile, 
    posts, 
    isLoading, 
    followersCount, 
    followingCount, 
    postsCount,
    likePost,
    deletePost,
    pinPost,
    isOwnProfile,
    refresh,
  } = useUserProfile();
  const navigate = useNavigate();
  const { reposts, isLoading: repostsLoading, refresh: refreshReposts } = useUserReposts(user?.id);
  
  const [activeTab, setActiveTab] = useState<'posts' | 'videos' | 'reposts' | 'saved'>('posts');
  const [followDialog, setFollowDialog] = useState<{ open: boolean; type: 'followers' | 'following' }>({
    open: false,
    type: 'followers',
  });
  const [selectedRepostPost, setSelectedRepostPost] = useState<Repost['post'] | null>(null);

  const tabs = [
    { id: 'posts', icon: Grid, label: 'Posts' },
    { id: 'videos', icon: Video, label: 'Videos' },
    { id: 'reposts', icon: Repeat2, label: 'Reposts' },
    { id: 'saved', icon: Bookmark, label: 'Saved' },
  ];

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const filteredPosts = posts.filter(post => {
    if (activeTab === 'videos') {
      return post.media_type === 'video' || post.media_urls?.some(url => url.includes('video'));
    }
    return true;
  });

  const handleRefresh = useCallback(async () => {
    if (refresh) {
      refresh();
      refreshReposts();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }, [refresh, refreshReposts]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Skeleton className="h-48 md:h-64 rounded-2xl mb-16" />
        <div className="flex gap-4 -mt-24 px-4">
          <Skeleton className="h-32 w-32 rounded-full" />
          <div className="flex-1 space-y-2 pt-16">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 text-center">
        <p className="text-muted-foreground">Profile not found</p>
      </div>
    );
  }

  const pageContent = (
    <div className="max-w-4xl mx-auto py-4 md:py-8 px-3 md:px-4 pb-24 md:pb-8">
      {/* Cover Photo */}
      <div className="relative h-36 sm:h-48 md:h-64 rounded-xl md:rounded-2xl bg-gradient-to-r from-primary/20 to-primary/40 mb-12 md:mb-16 overflow-hidden">
        {profile.cover_url ? (
          <img 
            src={profile.cover_url} 
            alt="Cover" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
      </div>

      {/* Profile Info */}
      <div className="relative -mt-16 md:-mt-24 px-2 md:px-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 md:gap-4">
          {/* Avatar with story ring */}
          <div className="relative self-start sm:self-auto">
            <StoryAvatar
              userId={profile.id}
              username={profile.username}
              displayName={profile.display_name}
              avatarUrl={profile.avatar_url}
              isVerified={!!profile.is_verified}
              size="xl"
              showRing
              className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28"
            />
            {profile.is_online && (
              <span className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 h-4 w-4 sm:h-5 sm:w-5 bg-green-500 rounded-full border-3 sm:border-4 border-background" />
            )}
          </div>

          <div className="flex-1 pb-1 md:pb-2 pt-2 sm:pt-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
              <div>
                <div className="flex items-center gap-1.5 md:gap-2">
                  <h1 className="text-xl md:text-2xl font-bold">
                    {profile.display_name || profile.username || 'User'}
                  </h1>
                  {profile.is_verified && (
                    <VerifiedBadge size="sm" className="md:hidden" />
                  )}
                  {profile.is_verified && (
                    <VerifiedBadge size="md" className="hidden md:block" />
                  )}
                </div>
                <p className="text-sm md:text-base text-muted-foreground">@{profile.username || 'username'}</p>
              </div>
              {isOwnProfile && (
                <div className="flex gap-2">
                  <Button variant="default" size="sm" className="md:h-10 md:px-4" onClick={() => navigate('/settings')}>
                    <Edit3 className="h-4 w-4 mr-1.5 md:mr-2" />
                    <span className="text-sm">Edit Profile</span>
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9 md:h-10 md:w-10" onClick={() => navigate('/story-archive')}>
                    <Archive className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-4 md:mt-6 max-w-2xl">
          <p className="text-sm md:text-base text-foreground leading-relaxed">
            {profile.bio || 'No bio yet.'}
          </p>
          <div className="flex flex-wrap gap-3 md:gap-4 mt-3 md:mt-4 text-xs md:text-sm text-muted-foreground">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {profile.location}
              </span>
            )}
            {profile.website && (
              <span className="flex items-center gap-1">
                <LinkIcon className="h-4 w-4" />
                <a 
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {profile.website.replace(/^https?:\/\//, '')}
                </a>
              </span>
            )}
            {profile.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Joined {format(new Date(profile.created_at), 'MMMM yyyy')}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-around sm:justify-start sm:gap-6 md:gap-8 mt-4 md:mt-6 py-3 md:py-4 border-y border-border">
          <button 
            className="text-center hover:opacity-80 transition-opacity flex flex-col sm:flex-row sm:items-baseline"
            onClick={() => {}}
          >
            <span className="text-lg md:text-xl font-bold">{formatCount(postsCount)}</span>
            <span className="text-muted-foreground text-xs md:text-sm sm:ml-1">Posts</span>
          </button>
          <button 
            className="text-center hover:opacity-80 transition-opacity flex flex-col sm:flex-row sm:items-baseline"
            onClick={() => setFollowDialog({ open: true, type: 'followers' })}
          >
            <span className="text-lg md:text-xl font-bold">{formatCount(followersCount)}</span>
            <span className="text-muted-foreground text-xs md:text-sm sm:ml-1">Followers</span>
          </button>
          <button 
            className="text-center hover:opacity-80 transition-opacity flex flex-col sm:flex-row sm:items-baseline"
            onClick={() => setFollowDialog({ open: true, type: 'following' })}
          >
            <span className="text-lg md:text-xl font-bold">{formatCount(followingCount)}</span>
            <span className="text-muted-foreground text-xs md:text-sm sm:ml-1">Following</span>
          </button>
        </div>

        {/* Story Highlights */}
        <div className="mt-6">
          <StoryHighlights userId={profile.id} />
        </div>

        {/* Tabs */}
        <div className="flex mt-4 md:mt-6 border-b border-border -mx-2 md:mx-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 md:gap-2 px-3 md:px-6 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Posts Grid */}
        {activeTab === 'reposts' ? (
          repostsLoading ? (
            <div className="grid grid-cols-3 gap-1 mt-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : reposts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Repeat2 className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No reposts yet</p>
              <p className="text-sm">
                {isOwnProfile ? 'Repost content you like!' : 'This user hasn\'t reposted anything yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 mt-4">
              {reposts.map((repost) => (
                repost.post && (
                  <button
                    key={repost.id}
                    onClick={() => setSelectedRepostPost(repost.post!)}
                    className="aspect-square relative group overflow-hidden bg-muted"
                  >
                    {/* Repost indicator */}
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1">
                      <Repeat2 className="h-3 w-3 text-white" />
                    </div>
                    
                    {/* Original author avatar */}
                    {repost.post.profile && (
                      <div className="absolute top-2 right-2 z-10">
                        <Avatar className="h-6 w-6 border-2 border-white">
                          <AvatarImage src={repost.post.profile.avatar_url || ''} />
                          <AvatarFallback className="text-xs">
                            {repost.post.profile.display_name?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    )}
                    
                    {repost.post.media_urls && repost.post.media_urls.length > 0 ? (
                      repost.post.media_type === 'video' ? (
                        <video
                          src={repost.post.media_urls[0]}
                          className="w-full h-full object-cover"
                          muted
                        />
                      ) : (
                        <img
                          src={repost.post.media_urls[0]}
                          alt="Repost"
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3 bg-gradient-to-br from-muted to-muted/50">
                        <p className="text-xs text-center line-clamp-4">
                          {repost.post.content || 'No content'}
                        </p>
                      </div>
                    )}
                    
                    {/* Hover overlay with stats */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <span className="text-white text-sm font-medium">
                        ❤️ {repost.post.likes_count || 0}
                      </span>
                      <span className="text-white text-sm font-medium">
                        💬 {repost.post.comments_count || 0}
                      </span>
                    </div>
                  </button>
                )
              ))}
            </div>
          )
        ) : filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ImageIcon className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No posts yet</p>
            <p className="text-sm">
              {isOwnProfile ? 'Share your first post!' : 'This user hasn\'t posted anything yet.'}
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <ProfilePostsGrid
              posts={filteredPosts}
              isOwnProfile={isOwnProfile}
              profile={{
                username: profile.username,
                avatar_url: profile.avatar_url,
                display_name: profile.display_name,
              }}
              onLike={likePost}
              onDelete={deletePost}
              onPin={pinPost}
            />
          </div>
        )}
      </div>

      {/* Followers/Following Dialog */}
      <FollowersFollowingDialog
        userId={user?.id || ''}
        type={followDialog.type}
        open={followDialog.open}
        onOpenChange={(open) => setFollowDialog(prev => ({ ...prev, open }))}
      />

      {/* Repost Post View Modal */}
      {selectedRepostPost && selectedRepostPost.profile && (
        <PostViewModal
          post={{
            id: selectedRepostPost.id,
            content: selectedRepostPost.content,
            media_urls: selectedRepostPost.media_urls || [],
            media_type: selectedRepostPost.media_type || 'image',
            likes_count: selectedRepostPost.likes_count,
            comments_count: selectedRepostPost.comments_count,
            created_at: selectedRepostPost.created_at,
          }}
          profile={{
            username: selectedRepostPost.profile.username,
            avatar_url: selectedRepostPost.profile.avatar_url,
            display_name: selectedRepostPost.profile.display_name,
          }}
          open={!!selectedRepostPost}
          onOpenChange={(open) => !open && setSelectedRepostPost(null)}
          onLike={() => {}}
        />
      )}
    </div>
  );

  if (isMobile) {
    return (
      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        {pageContent}
      </PullToRefresh>
    );
  }

  return pageContent;
}
