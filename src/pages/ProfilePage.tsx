import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useStories } from '@/hooks/useStories';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FollowersFollowingDialog } from '@/components/FollowersFollowingDialog';
import { ProfilePostsGrid } from '@/components/profile/ProfilePostsGrid';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { 
  Settings, 
  Edit3, 
  Grid, 
  Video, 
  Bookmark,
  MapPin,
  Link as LinkIcon,
  Calendar,
  ImageIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function ProfilePage() {
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
  } = useUserProfile();
  const { storyGroups } = useStories();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'posts' | 'videos' | 'saved'>('posts');
  const [followDialog, setFollowDialog] = useState<{ open: boolean; type: 'followers' | 'following' }>({
    open: false,
    type: 'followers',
  });

  const tabs = [
    { id: 'posts', icon: Grid, label: 'Posts' },
    { id: 'videos', icon: Video, label: 'Videos' },
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

  // Get user's stories
  const userStories = storyGroups.find(g => g.user_id === user?.id);

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

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Cover Photo */}
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/40 mb-16 overflow-hidden">
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
      <div className="relative -mt-24 px-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          {/* Avatar with story ring */}
          <div className={`relative ${userStories?.stories.length ? 'p-1 rounded-full bg-gradient-to-r from-primary to-orange-500' : ''}`}>
            <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
              <AvatarImage src={profile.avatar_url || ''} />
              <AvatarFallback className="text-4xl bg-primary text-primary-foreground">
                {profile.display_name?.[0]?.toUpperCase() || profile.username?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            {profile.is_online && (
              <span className="absolute bottom-2 right-2 h-5 w-5 bg-green-500 rounded-full border-4 border-background" />
            )}
          </div>

          <div className="flex-1 pb-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">
                    {profile.display_name || profile.username || 'User'}
                  </h1>
                  {profile.is_verified && (
                    <VerifiedBadge size="md" />
                  )}
                </div>
                <p className="text-muted-foreground">@{profile.username || 'username'}</p>
              </div>
              {isOwnProfile && (
                <div className="flex gap-2">
                  <Button variant="default" onClick={() => navigate('/settings')}>
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => navigate('/settings')}>
                    <Settings className="h-5 w-5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6 max-w-2xl">
          <p className="text-foreground leading-relaxed">
            {profile.bio || 'No bio yet.'}
          </p>
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
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
        <div className="flex gap-8 mt-6 py-4 border-y border-border">
          <button 
            className="text-center hover:opacity-80 transition-opacity"
            onClick={() => {}}
          >
            <span className="text-xl font-bold">{formatCount(postsCount)}</span>
            <span className="text-muted-foreground text-sm ml-1">Posts</span>
          </button>
          <button 
            className="text-center hover:opacity-80 transition-opacity"
            onClick={() => setFollowDialog({ open: true, type: 'followers' })}
          >
            <span className="text-xl font-bold">{formatCount(followersCount)}</span>
            <span className="text-muted-foreground text-sm ml-1">Followers</span>
          </button>
          <button 
            className="text-center hover:opacity-80 transition-opacity"
            onClick={() => setFollowDialog({ open: true, type: 'following' })}
          >
            <span className="text-xl font-bold">{formatCount(followingCount)}</span>
            <span className="text-muted-foreground text-sm ml-1">Following</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex mt-6 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Posts Grid */}
        {filteredPosts.length === 0 ? (
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
    </div>
  );
}
