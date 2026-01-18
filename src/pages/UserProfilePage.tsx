import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  MessageCircle, 
  UserPlus, 
  UserMinus,
  Grid, 
  Video, 
  MapPin,
  Link as LinkIcon,
  Calendar,
  ArrowLeft,
  Heart,
  Play
} from 'lucide-react';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { toast } from 'sonner';
import { useConversations } from '@/hooks/useMessages';
import { Skeleton } from '@/components/ui/skeleton';
import { FollowersFollowingDialog } from '@/components/FollowersFollowingDialog';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { StoryHighlights } from '@/components/stories/StoryHighlights';
import { useUserPosts, UserPost } from '@/hooks/useUserPosts';
import { cn } from '@/lib/utils';
import { PostViewModal } from '@/components/PostViewModal';

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  is_verified: boolean | null;
  followers_count: number | null;
  following_count: number | null;
  posts_count: number | null;
  created_at: string | null;
}

export default function UserProfilePage() {
  const { username: usernameParam } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'videos'>('posts');
  const [selectedPost, setSelectedPost] = useState<UserPost | null>(null);
  const [followDialog, setFollowDialog] = useState<{ open: boolean; type: 'followers' | 'following' }>({ 
    open: false, 
    type: 'followers' 
  });
  const { createPrivateConversation } = useConversations();
  
  // Get userId from profile after fetching by username
  const userId = profile?.id;
  const { posts, isLoading: postsLoading, likePost } = useUserPosts(userId);

  const isOwnProfile = user?.id === userId;

  const fetchProfile = useCallback(async () => {
    if (!usernameParam) return;
    setLoading(true);

    try {
      // Check if it's a UUID (for backwards compatibility) or username
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usernameParam);
      
      let query = supabase.from('profiles').select('*');
      
      if (isUUID) {
        query = query.eq('id', usernameParam);
      } else {
        query = query.eq('username', usernameParam);
      }
      
      const { data, error } = await query.single();

      if (error) throw error;
      
      // If accessed by UUID, redirect to username URL
      if (isUUID && data?.username) {
        navigate(`/user/${data.username}`, { replace: true });
        return;
      }
      
      setProfile(data);

      // Check if following
      if (user && data && user.id !== data.id) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', data.id)
          .single();
        
        setIsFollowing(!!followData);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('User not found');
      navigate('/home');
    } finally {
      setLoading(false);
    }
  }, [usernameParam, user, navigate]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleFollow = async () => {
    if (!user || !userId) return;
    setFollowLoading(true);

    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
        setIsFollowing(false);
        toast.success(`Unfollowed ${profile?.display_name || profile?.username}`);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: userId });
        setIsFollowing(true);
        toast.success(`Following ${profile?.display_name || profile?.username}`);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Failed to update follow status');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!userId) return;
    setMessageLoading(true);

    try {
      const conversation = await createPrivateConversation(userId);
      if (conversation) {
        navigate(`/messages?conversation=${conversation.id}`);
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error('Failed to start conversation');
    } finally {
      setMessageLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Skeleton className="h-48 md:h-64 rounded-2xl mb-16" />
        <div className="relative -mt-24 px-4">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="flex-1 pb-2 space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  const stats = [
    { label: 'Posts', value: posts.length || profile.posts_count || 0 },
    { label: 'Followers', value: profile.followers_count || 0 },
    { label: 'Following', value: profile.following_count || 0 },
  ];

  const videoPosts = posts.filter(p => p.media_type === 'video');
  const regularPosts = activeTab === 'videos' ? videoPosts : posts;

  const tabs = [
    { id: 'posts' as const, icon: Grid, label: 'Posts', count: posts.length },
    { id: 'videos' as const, icon: Video, label: 'Videos', count: videoPosts.length },
  ];

  const joinedDate = profile.created_at 
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Back button */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {/* Cover Photo */}
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/40 mb-16 overflow-hidden">
        {profile.cover_url && (
          <img 
            src={profile.cover_url} 
            alt="Cover" 
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
      </div>

      {/* Profile Info */}
      <div className="relative -mt-24 px-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <StoryAvatar
            userId={profile.id}
            username={profile.username}
            displayName={profile.display_name}
            avatarUrl={profile.avatar_url}
            isVerified={!!profile.is_verified}
            size="xl"
            showRing
          />

          <div className="flex-1 pb-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">
                    {profile.display_name || profile.username || 'User'}
                  </h1>
                  {profile.is_verified && (
                    <VerifiedBadge size="lg" />
                  )}
                </div>
                <p className="text-muted-foreground">
                  @{profile.username || 'username'}
                </p>
              </div>
              
              {!isOwnProfile && (
                <div className="flex gap-2">
                  <Button
                    variant={isFollowing ? 'outline' : 'default'}
                    onClick={handleFollow}
                    disabled={followLoading}
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="h-4 w-4 mr-2" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Follow
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleMessage}
                    disabled={messageLoading}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Message
                  </Button>
                </div>
              )}

              {isOwnProfile && (
                <Button variant="hero" onClick={() => navigate('/profile')}>
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6 max-w-2xl">
          {profile.bio && (
            <p className="text-foreground leading-relaxed">{profile.bio}</p>
          )}
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
                  {profile.website}
                </a>
              </span>
            )}
            {joinedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Joined {joinedDate}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-8 mt-6 py-4 border-y border-border">
          {stats.map((stat) => (
            <button
              key={stat.label}
              onClick={() => {
                if (stat.label === 'Followers') {
                  setFollowDialog({ open: true, type: 'followers' });
                } else if (stat.label === 'Following') {
                  setFollowDialog({ open: true, type: 'following' });
                }
              }}
              className={stat.label !== 'Posts' ? 'text-center hover:opacity-70 transition-opacity' : 'text-center cursor-default'}
            >
              <span className="text-xl font-bold">{stat.value}</span>
              <span className="text-muted-foreground text-sm ml-1">{stat.label}</span>
            </button>
          ))}
        </div>

        {/* Followers/Following Dialog */}
        {userId && (
          <FollowersFollowingDialog
            userId={userId}
            type={followDialog.type}
            open={followDialog.open}
            onOpenChange={(open) => setFollowDialog(prev => ({ ...prev, open }))}
          />
        )}

        {/* Story Highlights */}
        {userId && (
          <div className="mt-6">
            <StoryHighlights userId={userId} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex mt-6 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id 
                  ? 'text-primary border-b-2 border-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Posts Grid */}
        <div className="mt-4">
          {postsLoading ? (
            <div className="grid grid-cols-3 gap-1">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : regularPosts.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                {activeTab === 'videos' ? (
                  <Video className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <Grid className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <p className="text-muted-foreground font-medium">
                {activeTab === 'videos' ? 'No videos yet' : 'No posts yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {regularPosts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className="relative aspect-square bg-muted rounded-lg overflow-hidden group"
                >
                  {post.media_urls && post.media_urls.length > 0 ? (
                    <>
                      {post.media_type === 'video' ? (
                        <>
                          <video
                            src={post.media_urls[0]}
                            className="w-full h-full object-cover"
                            muted
                          />
                          <div className="absolute top-2 right-2">
                            <Play className="h-4 w-4 text-white drop-shadow-lg" fill="white" />
                          </div>
                        </>
                      ) : (
                        <img
                          src={post.media_urls[0]}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                      {post.media_urls.length > 1 && (
                        <div className="absolute top-2 right-2">
                          <div className="bg-black/50 rounded px-1.5 py-0.5 text-white text-xs">
                            +{post.media_urls.length - 1}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2">
                      <p className="text-xs text-muted-foreground line-clamp-4 text-center">
                        {post.content}
                      </p>
                    </div>
                  )}
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <div className="flex items-center gap-1 text-white">
                      <Heart className="h-5 w-5" fill="white" />
                      <span className="font-semibold">{post.likes_count}</span>
                    </div>
                    <div className="flex items-center gap-1 text-white">
                      <MessageCircle className="h-5 w-5" fill="white" />
                      <span className="font-semibold">{post.comments_count}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Post View Modal */}
        {selectedPost && profile && (
          <PostViewModal
            post={{
              id: selectedPost.id,
              content: selectedPost.content,
              media_urls: selectedPost.media_urls,
              media_type: selectedPost.media_type,
              likes_count: selectedPost.likes_count,
              comments_count: selectedPost.comments_count,
              is_pinned: selectedPost.is_pinned,
              is_liked: selectedPost.is_liked,
              created_at: selectedPost.created_at,
            }}
            profile={{
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
            }}
            open={!!selectedPost}
            onOpenChange={(open) => !open && setSelectedPost(null)}
            onLike={() => likePost(selectedPost.id)}
          />
        )}
      </div>
    </div>
  );
}
