import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { enUS as enDateLocale, ru as ruDateLocale, uz as uzDateLocale } from 'date-fns/locale';
import {
  ArrowLeft,
  Copy,
  Grid3x3,
  Images,
  MessageCircle,
  MoreHorizontal,
  QrCode,
  Repeat2,
  UserMinus,
  UserPlus,
  Video,
  WalletCards,
} from 'lucide-react';

import { FollowersFollowingDialog } from '@/components/FollowersFollowingDialog';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfilePhotosDialog } from '@/components/profile/ProfilePhotosDialog';
import { ProfilePostsGrid } from '@/components/profile/ProfilePostsGrid';
import { ProfileQrDialog } from '@/components/profile/ProfileQrDialog';
import { StoryHighlights } from '@/components/stories/StoryHighlights';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { WalletTransferDialog } from '@/components/payment/WalletTransferDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations } from '@/hooks/useMessages';
import { useUserPosts, type UserPost } from '@/hooks/useUserPosts';
import { useUserReposts } from '@/hooks/useReposts';
import { supabase } from '@/integrations/supabase/client';
import { formatLocation } from '@/lib/locations';
import { PROFILE_PUBLIC_COLUMNS } from '@/lib/profileFields';
import { toast } from 'sonner';

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

const DATE_LOCALES = {
  uz: uzDateLocale,
  ru: ruDateLocale,
  en: enDateLocale,
} as const;

type PublicProfileTab = 'posts' | 'videos' | 'reposts';

export default function UserProfilePage() {
  const { t, i18n } = useTranslation();
  const { username: usernameParam } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createPrivateConversation } = useConversations();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentConversationId, setPaymentConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PublicProfileTab>('posts');
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [followDialog, setFollowDialog] = useState<{ open: boolean; type: 'followers' | 'following' }>({
    open: false,
    type: 'followers',
  });

  const userId = profile?.id;
  const { posts, isLoading: postsLoading, likePost } = useUserPosts(userId);
  const { reposts, isLoading: repostsLoading } = useUserReposts(userId);
  const isOwnProfile = Boolean(user?.id && userId === user.id);

  const fetchProfile = useCallback(async () => {
    if (!usernameParam) return;
    setLoading(true);

    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usernameParam);
      let query = supabase.from('profiles').select(PROFILE_PUBLIC_COLUMNS);
      query = isUUID ? query.eq('id', usernameParam) : query.eq('username', usernameParam);

      const { data, error } = await query.single();
      if (error) throw error;

      if (isUUID && data?.username) {
        navigate(`/user/${data.username}`, { replace: true });
        return;
      }

      if (user?.id && data.id === user.id) {
        navigate('/profile', { replace: true });
        return;
      }

      setProfile(data as UserProfile);

      if (user?.id) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', data.id)
          .maybeSingle();
        setIsFollowing(Boolean(followData));
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error(t('profile.userNotFound'));
      navigate('/home', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [navigate, t, user?.id, usernameParam]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    setPaymentConversationId(null);
    setPaymentOpen(false);
  }, [userId]);

  const handleFollow = async () => {
    if (!user?.id || !userId || followLoading) return;
    setFollowLoading(true);

    const previous = isFollowing;
    const next = !previous;
    setIsFollowing(next);
    setProfile((current) => current
      ? {
          ...current,
          followers_count: Math.max(0, (current.followers_count || 0) + (next ? 1 : -1)),
        }
      : current);

    try {
      const result = previous
        ? await supabase
            .from('follows')
            .delete()
            .eq('follower_id', user.id)
            .eq('following_id', userId)
        : await supabase
            .from('follows')
            .insert({ follower_id: user.id, following_id: userId });
      if (result.error) throw result.error;
    } catch (error) {
      setIsFollowing(previous);
      setProfile((current) => current
        ? {
            ...current,
            followers_count: Math.max(0, (current.followers_count || 0) + (next ? -1 : 1)),
          }
        : current);
      console.error('Error toggling follow:', error);
      toast.error(t('profile.followFailed'));
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!userId || messageLoading) return;
    setMessageLoading(true);
    try {
      const conversation = await createPrivateConversation(userId);
      if (conversation) navigate(`/messages?conversation=${conversation.id}`);
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error(t('profile.messageFailed'));
    } finally {
      setMessageLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!userId || paymentLoading) return;
    setPaymentLoading(true);
    try {
      let conversationId = paymentConversationId;
      if (!conversationId) {
        const conversation = await createPrivateConversation(userId);
        if (!conversation) throw new Error('Private conversation could not be created');
        conversationId = conversation.id;
        setPaymentConversationId(conversation.id);
      }
      setPaymentOpen(true);
    } catch (error) {
      console.error('Error preparing wallet transfer:', error);
      toast.error('Pul o‘tkazmasini ochib bo‘lmadi');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCopyProfile = async () => {
    if (!profile) return;
    const slug = profile.username || profile.id;
    const url = `${window.location.origin}/user/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Profil havolasi nusxalandi');
    } catch {
      toast.error('Profil havolasini nusxalab bo‘lmadi');
    }
  };

  if (loading || isOwnProfile) {
    return (
      <div className="mx-auto max-w-4xl px-3 py-4 md:px-4 md:py-8">
        <Skeleton className="mb-12 h-36 rounded-xl sm:mb-16 sm:h-48 md:h-64 md:rounded-2xl" />
        <div className="-mt-12 flex items-center gap-3 px-2 sm:-mt-16 md:-mt-24 md:px-4">
          <Skeleton className="h-20 w-20 rounded-full sm:h-24 sm:w-24 md:h-28 md:w-28" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-48 max-w-[70%]" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">{t('profile.userNotFound')}</p>
      </div>
    );
  }

  const langKey = (i18n.language?.split('-')[0] ?? 'uz') as keyof typeof DATE_LOCALES;
  const dateLocale = DATE_LOCALES[langKey] ?? uzDateLocale;
  const joinedLabel = profile.created_at
    ? t('profile.joined', {
        date: format(new Date(profile.created_at), 'LLLL yyyy', { locale: dateLocale }),
      })
    : null;
  const readableLocation = formatLocation(profile.location, i18n.language);
  const videoPosts = posts.filter((post) => post.media_type === 'video');
  const regularPosts = activeTab === 'videos' ? videoPosts : posts;
  const repostPosts = reposts.flatMap((repost) => (repost.post ? [repost.post] : []));
  const tabs = [
    { id: 'posts' as const, icon: Grid3x3, label: t('profile.tabs.posts') },
    { id: 'videos' as const, icon: Video, label: t('profile.tabs.videos') },
    { id: 'reposts' as const, icon: Repeat2, label: t('profile.tabs.reposts') },
  ];

  const identityMore = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-xl md:h-10 md:w-10"
          aria-label={t('common.more', { defaultValue: "Ko'proq" })}
        >
          <MoreHorizontal className="h-4 w-4 md:h-5 md:w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl">
        {profile.avatar_url ? (
          <DropdownMenuItem onClick={() => setShowPhotos(true)}>
            <Images className="mr-2 h-4 w-4" />
            {t('profile.photos.title', { defaultValue: 'Profil rasmlari' })}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => setShowQrDialog(true)}>
          <QrCode className="mr-2 h-4 w-4" />
          {t('profile.qr.title', { defaultValue: 'QR kod' })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleCopyProfile()}>
          <Copy className="mr-2 h-4 w-4" />
          Profil havolasini nusxalash
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handlePayment()} disabled={paymentLoading}>
          <WalletCards className="mr-2 h-4 w-4" />
          Pul yuborish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="mx-auto max-w-4xl px-3 pb-8 pt-4 md:px-4 md:pt-8">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="mb-4 hidden rounded-xl md:inline-flex"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('common.back')}
      </Button>

      <ProfileHeader
        profile={profile}
        identityTrailing={identityMore}
        actions={
          <>
            <Button
              type="button"
              variant={isFollowing ? 'outline' : 'default'}
              onClick={() => void handleFollow()}
              disabled={followLoading}
              className="h-9 min-w-[122px] flex-1 rounded-xl px-4 sm:flex-none md:h-10"
            >
              {isFollowing ? <UserMinus className="mr-1.5 h-4 w-4" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
              {isFollowing ? t('profile.unfollow') : t('profile.follow')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleMessage()}
              disabled={messageLoading}
              className="h-9 min-w-[122px] flex-1 rounded-xl px-4 sm:flex-none md:h-10"
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              {t('profile.message')}
            </Button>
          </>
        }
        locationLabel={readableLocation}
        joinedLabel={joinedLabel}
        noBioLabel={t('profile.noBio')}
        postsLabel={t('profile.stats.posts')}
        followersLabel={t('profile.stats.followers')}
        followingLabel={t('profile.stats.following')}
        postsCount={profile.posts_count || posts.length || 0}
        followersCount={profile.followers_count || 0}
        followingCount={profile.following_count || 0}
        onPhotos={profile.avatar_url ? () => setShowPhotos(true) : undefined}
        onFollowersClick={() => setFollowDialog({ open: true, type: 'followers' })}
        onFollowingClick={() => setFollowDialog({ open: true, type: 'following' })}
      />

      <div className="relative px-2 md:px-4">
        <div className="mt-6">
          <StoryHighlights userId={profile.id} />
        </div>

        <div className="-mx-2 mt-4 flex border-b border-border md:mx-0 md:mt-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors sm:flex-none sm:justify-start md:gap-2 md:px-6 md:py-3 md:text-sm ${
                activeTab === tab.id
                  ? 'border-b-2 border-foreground text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          {activeTab === 'reposts' ? (
            repostsLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((item) => <Skeleton key={item} className="h-40 rounded-2xl" />)}
              </div>
            ) : repostPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground">
                <Repeat2 className="mb-3 h-12 w-12 opacity-45" />
                <p className="font-medium">{t('profile.empty.noReposts')}</p>
              </div>
            ) : (
              <ProfilePostsGrid
                posts={repostPosts}
                isOwnProfile={false}
                profile={{
                  id: profile.id,
                  username: profile.username,
                  avatar_url: profile.avatar_url,
                  display_name: profile.display_name,
                  is_verified: profile.is_verified,
                }}
                layout="feed"
              />
            )
          ) : postsLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-40 rounded-2xl" />)}
            </div>
          ) : regularPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground">
              {activeTab === 'videos' ? <Video className="mb-3 h-12 w-12 opacity-45" /> : <Grid3x3 className="mb-3 h-12 w-12 opacity-45" />}
              <p className="font-medium">
                {activeTab === 'videos' ? t('profile.empty.noVideos') : t('profile.empty.noPosts')}
              </p>
            </div>
          ) : (
            <ProfilePostsGrid
              posts={regularPosts as unknown as UserPost[]}
              isOwnProfile={false}
              profile={{
                id: profile.id,
                username: profile.username,
                avatar_url: profile.avatar_url,
                display_name: profile.display_name,
                is_verified: profile.is_verified,
              }}
              onLike={likePost}
              layout={activeTab === 'videos' ? 'reels-grid' : 'feed'}
            />
          )}
        </div>
      </div>

      <FollowersFollowingDialog
        userId={profile.id}
        type={followDialog.type}
        open={followDialog.open}
        onOpenChange={(open) => setFollowDialog((current) => ({ ...current, open }))}
      />

      <ProfileQrDialog
        open={showQrDialog}
        onOpenChange={setShowQrDialog}
        username={profile.username}
        displayName={profile.display_name}
        avatarUrl={profile.avatar_url}
      />

      <ProfilePhotosDialog
        open={showPhotos}
        onOpenChange={setShowPhotos}
        userId={profile.id}
        isOwnProfile={false}
        fallbackUrl={profile.avatar_url}
        name={profile.display_name}
        username={profile.username}
        onChanged={fetchProfile}
      />

      {paymentConversationId ? (
        <WalletTransferDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          conversationId={paymentConversationId}
        />
      ) : null}
    </div>
  );
}
