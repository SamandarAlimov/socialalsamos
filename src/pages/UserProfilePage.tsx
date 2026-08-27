import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { MessageCircle, UserPlus, UserMinus, Grid, Video, MapPin, LinkIcon, Calendar, ArrowLeft, Heart, Play, Repeat2 } from 'lucide-react';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { toast } from 'sonner';
import { useConversations } from '@/hooks/useMessages';
import { Skeleton } from '@/components/ui/skeleton';
import { FollowersFollowingDialog } from '@/components/FollowersFollowingDialog';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { StoryHighlights } from '@/components/stories/StoryHighlights';
import { OnlineIndicator } from '@/components/OnlineIndicator';
import { useUserPosts, UserPost } from '@/hooks/useUserPosts';
import { useUserReposts, Repost } from '@/hooks/useReposts';
import { cn } from '@/lib/utils';
import { toExternalUrl, stripProtocol } from '@/lib/urls';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PostViewModal } from '@/components/PostViewModal';
import { PROFILE_PUBLIC_COLUMNS } from '@/lib/profileFields';

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

type StatId = 'posts' | 'followers' | 'following';

export default function UserProfilePage() {
  const { t, i18n } = useTranslation();
  const { username: usernameParam } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'videos' | 'reposts'>('posts');
  const [selectedPost, setSelectedPost] = useState<UserPost | null>(null);
  const [selectedRepostPost, setSelectedRepostPost] = useState<Repost['post'] | null>(null);
  const [followDialog, setFollowDialog] = useState<{ open: boolean; type: 'followers' | 'following' }>({
    open: false,
    type: 'followers'
  });
  const { createPrivateConversation } = useConversations();

  const userId = profile?.id;
  const { posts, isLoading: postsLoading, likePost } = useUserPosts(userId);
  const { reposts, isLoading: repostsLoading } = useUserReposts(userId);

  const isOwnProfile = user?.id === userId;

  const fetchProfile = useCallback(async () => {
    if (!usernameParam) return;
    setLoading(true);

    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usernameParam);

      let query = supabase.from('profiles').select(PROFILE_PUBLIC_COLUMNS);

      if (isUUID) {
        query = query.eq('id', usernameParam);
      } else {
        query = query.eq('username', usernameParam);
      }

      const { data, error } = await query.single();

      if (error) throw error;

      if (isUUID && data?.username) {
        navigate(`/user/${data.username}`, { replace: true });
        return;
      }

      setProfile(data);

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
      toast.error(t('profile.userNotFound'));
      navigate('/home');
    } finally {
      setLoading(false);
    }
  }, [usernameParam, user, navigate, t]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleFollow = async () => {
    if (!user || !userId) return;
    setFollowLoading(true);

    const name = profile?.display_name || profile?.username || t('profile.user');

    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
        setIsFollowing(false);
        toast.success(t('profile.unfollowedUser', { name }));
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: userId });
        setIsFollowing(true);
        toast.success(t('profile.followedUser', { name }));
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error(t('profile.followFailed'));
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
      toast.error(t('profile.messageFailed'));
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
        <p className="text-muted-foreground">{t('profile.userNotFound')}</p>
      </div>
    );
  }

  const stats: Array<{ id: StatId; label: string; value: number }> = [
    { id: 'posts', label: t('profile.stats.posts'), value: posts.length || profile.posts_count || 0 },
    { id: 'followers', label: t('profile.stats.followers'), value: profile.followers_count || 0 },
    { id: 'following', label: t('profile.stats.following'), value: profile.following_count || 0 },
  ];

  const videoPosts = posts.filter(p => p.media_type === 'video');
  const regularPosts = activeTab === 'videos' ? videoPosts : posts;

  const tabs = [
    { id: 'posts' as const, icon: Grid, label: t('profile.tabs.posts'), count: posts.length },
    { id: 'videos' as const, icon: Video, label: t('profile.tabs.videos'), count: videoPosts.length },
    { id: 'reposts' as const, icon: Repeat2, label: t('profile.tabs.reposts'), count: reposts.length },
  ];

  const joinedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(i18n.language || 'uz', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t('common.back')}
      </Button>

      {/* Cover Photo */}
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/40 mb-16 overflow-hidden">
        {profile.cover_url && (
          <img
            src={profile.cover_url}
            alt={t('settings.cover')}
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
      </div>

      {/* Profile Info */}
      <div className="relative -mt-24 px-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="relative">
            <StoryAvatar
              userId={profile.id}
              username={profile.username}
              displayName={profile.display_name}
              avatarUrl={profile.avatar_url}
              isVerified={!!profile.is_verified}
              size="xl"
              showRing
            />
            <OnlineIndicator userId={profile.id} size="lg" className="border-background" />
          </div>

          <div className="flex-1 pb-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">
                    {profile.display_name || profile.username || t('profile.user')}
                  </h1>
                  {profile.is_verified && (
                    <VerifiedBadge size="lg" />
                  )}
                </div>
                <p className="text-muted-foreground">
                  @{profile.username || t('profile.usernameFallback')}
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
                        {t('profile.unfollow')}
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        {t('profile.follow')}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleMessage}
                    disabled={messageLoading}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {t('profile.message')}
                  </Button>
                </div>
              )}

              {isOwnProfile && (
                <Button variant="hero" onClick={() => navigate('/profile')}>
                  {t('profile.editProfile')}
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
                  href={toExternalUrl(profile.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {stripProtocol(profile.website)}
                </a>
              </span>
            )}
            {joinedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {t('profile.joined', { date: joinedDate })}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-8 mt-6 py-4 border-y border-border">
          {stats.map((stat) => (
            <button
              key={stat.id}
              onClick={() => {
                if (stat.id === 'followers') {
                  setFollowDialog({ open: true, type: 'followers' });
                } else if (stat.id === 'following') {
                  setFollowDialog({ open: true, type: 'following' });
                }
              }}
              className={stat.id !== 'posts' ? 'text-center hover:opacity-70 transition-opacity' : 'text-center cursor-default'}
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
          {activeTab === 'reposts' ? (
            repostsLoading ? (
              <div className="grid grid-cols-3 gap-1">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            ) : reposts.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Repeat2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">{t('profile.empty.noReposts')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {reposts.map((repost) => (
                  repost.post && (
                    <button
                      key={repost.id}
                      onClick={() => setSelectedRepostPost(repost.post!)}
                      className="aspect-square relative group overflow-hidden bg-muted rounded-lg"
                    >
                      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1">
                        <Repeat2 className="h-3 w-3 text-white" />
                      </div>

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
                            alt={t('post.repost')}
                            className="w-full h-full object-cover"
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-3 bg-gradient-to-br from-muted to-muted/50">
                          <p className="text-xs text-center line-clamp-4">
                            {repost.post.content || t('profile.noContent')}
                          </p>
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <div className="flex items-center gap-1 text-white">
                          <Heart className="h-5 w-5" fill="white" />
                          <span className="font-semibold">{repost.post.likes_count || 0}</span>
                        </div>
                        <div className="flex items-center gap-1 text-white">
                          <MessageCircle className="h-5 w-5" fill="white" />
                          <span className="font-semibold">{repost.post.comments_count || 0}</span>
                        </div>
                      </div>
                    </button>
                  )
                ))}
              </div>
            )
          ) : postsLoading ? (
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
                {activeTab === 'videos' ? t('profile.empty.noVideos') : t('profile.empty.noPosts')}
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
    </div>
  );
}
