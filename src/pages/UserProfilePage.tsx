import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  MessageCircle,
  UserPlus,
  UserMinus,
  Grid3x3,
  Video,
  MapPin,
  LinkIcon,
  Calendar,
  ArrowLeft,
  Heart,
  Repeat2,
  QrCode,
  Maximize2,
  ImageIcon,
} from 'lucide-react';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { toast } from 'sonner';
import { useConversations } from '@/hooks/useMessages';
import { Skeleton } from '@/components/ui/skeleton';
import { FollowersFollowingDialog } from '@/components/FollowersFollowingDialog';
import { ProfilePostsGrid } from '@/components/profile/ProfilePostsGrid';
import { ProfileQrDialog } from '@/components/profile/ProfileQrDialog';
import { AvatarViewerDialog } from '@/components/profile/AvatarViewerDialog';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { StoryHighlights } from '@/components/stories/StoryHighlights';
import { OnlineIndicator } from '@/components/OnlineIndicator';
import { useUserPosts, UserPost } from '@/hooks/useUserPosts';
import { useUserReposts, Repost } from '@/hooks/useReposts';
import { cn } from '@/lib/utils';
import { toExternalUrl, stripProtocol } from '@/lib/urls';
import { formatLocation } from '@/lib/locations';
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
  const [selectedRepostPost, setSelectedRepostPost] = useState<Repost['post'] | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
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
    { id: 'posts' as const, icon: Grid3x3, label: t('profile.tabs.posts'), count: posts.length },
    { id: 'videos' as const, icon: Video, label: t('profile.tabs.videos'), count: videoPosts.length },
    { id: 'reposts' as const, icon: Repeat2, label: t('profile.tabs.reposts'), count: reposts.length },
  ];

  const joinedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(i18n.language || 'uz', { month: 'long', year: 'numeric' })
    : null;

  const readableLocation = formatLocation(profile.location, i18n.language);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

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
            {profile.avatar_url && (
              <button
                type="button"
                onClick={() => setShowAvatarViewer(true)}
                aria-label={t('profile.viewPhoto', { defaultValue: "Rasmni ko'rish" })}
                className="absolute -bottom-1 -left-1 rounded-full border border-border bg-background/90 p-1.5 shadow-sm backdrop-blur transition-colors hover:bg-accent"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
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

              <div className="flex gap-2">
                {!isOwnProfile && (
                  <>
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
                  </>
                )}

                {isOwnProfile && (
                  <Button variant="hero" onClick={() => navigate('/profile')}>
                    {t('profile.editProfile')}
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('profile.qr.title', { defaultValue: 'QR kod' })}
                  onClick={() => setShowQrDialog(true)}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6 max-w-2xl">
          {profile.bio && (
            <p className="text-foreground leading-relaxed">{profile.bio}</p>
          )}
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            {readableLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {readableLocation}
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
              <span className="text-xl font-bold">{formatCount(stat.value)}</span>
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

        {/* Profile QR code */}
        <ProfileQrDialog
          open={showQrDialog}
          onOpenChange={setShowQrDialog}
          username={profile.username}
          displayName={profile.display_name}
          avatarUrl={profile.avatar_url}
        />

        {/* Full size profile picture */}
        <AvatarViewerDialog
          open={showAvatarViewer}
          onOpenChange={setShowAvatarViewer}
          src={profile.avatar_url}
          name={profile.display_name || profile.username}
          downloadName={profile.username || 'profile'}
        />

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
              aria-label={tab.label}
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

        {/* Posts */}
        <div className="mt-4">
          {activeTab === 'reposts' ? (
            repostsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-2xl" />
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {reposts.map((repost) => (
                  repost.post && (
                    <button
                      key={repost.id}
                      onClick={() => setSelectedRepostPost(repost.post!)}
                      className="group relative aspect-square overflow-hidden rounded-2xl border border-border/60 bg-muted"
                    >
                      <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 backdrop-blur">
                        <Repeat2 className="h-3 w-3 text-white" />
                      </div>

                      {repost.post.profile && (
                        <div className="absolute right-2 top-2 z-10">
                          <Avatar className="h-6 w-6 border-2 border-white">
                            <AvatarImage src={repost.post.profile.avatar_url || ''} />
                            <AvatarFallback className="text-xs">
                              {repost.post.profile.display_name?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      )}

                      {repost.post.media_urls && repost.post.media_urls.length > 0 ? (
                        <>
                          <div
                            className="absolute inset-0 scale-110 bg-cover bg-center opacity-60 blur-xl"
                            style={{ backgroundImage: `url(${repost.post.media_urls[0]})` }}
                            aria-hidden="true"
                          />
                          {repost.post.media_type === 'video' ? (
                            <video
                              src={repost.post.media_urls[0]}
                              className="relative h-full w-full object-contain"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <img
                              src={repost.post.media_urls[0]}
                              alt={t('post.repost')}
                              loading="lazy"
                              className="relative h-full w-full object-contain"
                            />
                          )}
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 p-3">
                          <p className="line-clamp-5 text-center text-xs">
                            {repost.post.content || t('profile.noContent')}
                          </p>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 flex items-center gap-4 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="flex items-center gap-1">
                          <Heart className="h-4 w-4" />
                          {formatCount(repost.post.likes_count || 0)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-4 w-4" />
                          {formatCount(repost.post.comments_count || 0)}
                        </span>
                      </div>
                    </button>
                  )
                ))}
              </div>
            )
          ) : postsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : regularPosts.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                {activeTab === 'videos' ? (
                  <Video className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <p className="text-muted-foreground font-medium">
                {activeTab === 'videos' ? t('profile.empty.noVideos') : t('profile.empty.noPosts')}
              </p>
            </div>
          ) : (
            <ProfilePostsGrid
              posts={regularPosts as unknown as UserPost[]}
              isOwnProfile={isOwnProfile}
              profile={{
                username: profile.username,
                avatar_url: profile.avatar_url,
                display_name: profile.display_name,
              }}
              onLike={likePost}
              onDelete={() => {}}
              onPin={() => {}}
            />
          )}
        </div>

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
