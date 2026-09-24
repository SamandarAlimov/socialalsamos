import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { enUS as enDateLocale, ru as ruDateLocale, uz as uzDateLocale } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Bookmark,
  Camera,
  Edit3,
  Grid3x3,
  ImageIcon,
  Images,
  Loader2,
  Megaphone,
  MoreHorizontal,
  QrCode,
  Repeat2,
  Settings,
  Video,
} from 'lucide-react';

import { FollowersFollowingDialog } from '@/components/FollowersFollowingDialog';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfilePhotosDialog } from '@/components/profile/ProfilePhotosDialog';
import { ProfilePostsGrid } from '@/components/profile/ProfilePostsGrid';
import { ProfileQrDialog } from '@/components/profile/ProfileQrDialog';
import { SavedPostsPanel } from '@/components/profile/SavedPostsPanel';
import { StoryHighlights } from '@/components/stories/StoryHighlights';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserReposts } from '@/hooks/useReposts';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatLocation } from '@/lib/locations';
import { uploadMedia } from '@/lib/mediaUpload';

const DATE_LOCALES = {
  uz: uzDateLocale,
  ru: ruDateLocale,
  en: enDateLocale,
} as const;

type ProfileTab = 'posts' | 'videos' | 'reposts' | 'saved';

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [followDialog, setFollowDialog] = useState<{ open: boolean; type: 'followers' | 'following' }>({
    open: false,
    type: 'followers',
  });
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

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
  const { reposts, isLoading: repostsLoading, refresh: refreshReposts } = useUserReposts(user?.id);

  const langKey = (i18n.language?.split('-')[0] ?? 'uz') as keyof typeof DATE_LOCALES;
  const dateLocale = DATE_LOCALES[langKey] ?? uzDateLocale;

  const tabs = [
    { id: 'posts' as const, icon: Grid3x3, label: t('profile.tabs.posts') },
    { id: 'videos' as const, icon: Video, label: t('profile.tabs.videos') },
    { id: 'reposts' as const, icon: Repeat2, label: t('profile.tabs.reposts') },
    { id: 'saved' as const, icon: Bookmark, label: t('profile.tabs.saved') },
  ];

  const filteredPosts = posts.filter((post) => {
    if (activeTab === 'videos') {
      return post.media_type === 'video' || post.media_urls?.some((url) => url.includes('video'));
    }
    return true;
  });
  const repostPosts = reposts.flatMap((repost) => (repost.post ? [repost.post] : []));

  const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploadingCover(true);
    try {
      const uploaded = await uploadMedia(file, { type: 'avatar', visibility: 'public' });
      const { error } = await supabase
        .from('profiles')
        .update({ cover_url: uploaded.url })
        .eq('id', user.id);
      if (error) throw error;

      toast({ title: t('common.success'), description: t('profile.coverUpdated') });
      refresh?.();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error?.message || t('profile.coverUploadFailed'),
        variant: 'destructive',
      });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleRefresh = useCallback(async () => {
    refresh?.();
    refreshReposts();
    await new Promise((resolve) => setTimeout(resolve, 450));
  }, [refresh, refreshReposts]);

  if (isLoading) {
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
      <div className="mx-auto max-w-4xl px-4 py-8 text-center">
        <p className="text-muted-foreground">{t('profile.notFound')}</p>
      </div>
    );
  }

  const readableLocation = formatLocation(profile.location, i18n.language);
  const joinedLabel = profile.created_at
    ? t('profile.joined', {
        date: format(new Date(profile.created_at), 'LLLL yyyy', { locale: dateLocale }),
      })
    : null;

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
      <DropdownMenuContent align="end" className="w-52 rounded-2xl">
        <DropdownMenuItem onClick={() => setShowPhotos(true)}>
          <Images className="mr-2 h-4 w-4" />
          {t('profile.photos.title', { defaultValue: 'Profil rasmlari' })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/story-archive')}>
          <Archive className="mr-2 h-4 w-4" />
          {t('nav.storyArchive')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/ads')}>
          <Megaphone className="mr-2 h-4 w-4" />
          {t('nav.ads')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          {t('nav.settings', { defaultValue: 'Sozlamalar' })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const profileIdentity = {
    id: profile.id,
    username: profile.username,
    avatar_url: profile.avatar_url,
    display_name: profile.display_name,
    is_verified: profile.is_verified,
  };

  const pageContent = (
    <div className="mx-auto max-w-4xl px-3 pb-24 pt-4 md:px-4 md:pb-8 md:pt-8">
      <ProfileHeader
        profile={profile}
        coverAction={
          <>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm transition-opacity hover:bg-black/70 disabled:opacity-60"
            >
              {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {uploadingCover ? t('common.uploading') : t('profile.changeCover')}
            </button>
          </>
        }
        identityTrailing={identityMore}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-border bg-muted/60 px-4 text-foreground shadow-none hover:bg-muted md:h-10"
              onClick={() => navigate('/settings')}
            >
              <Edit3 className="mr-1.5 h-4 w-4" />
              <span className="text-sm">{t('profile.editProfile')}</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl md:h-10 md:w-10"
              aria-label={t('profile.qr.title', { defaultValue: 'QR kod' })}
              onClick={() => setShowQrDialog(true)}
            >
              <QrCode className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </>
        }
        locationLabel={readableLocation}
        joinedLabel={joinedLabel}
        noBioLabel={t('profile.noBio')}
        postsLabel={t('profile.stats.posts')}
        followersLabel={t('profile.stats.followers')}
        followingLabel={t('profile.stats.following')}
        postsCount={postsCount}
        followersCount={followersCount}
        followingCount={followingCount}
        onPhotos={() => setShowPhotos(true)}
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

        {activeTab === 'saved' ? (
          <SavedPostsPanel isOwnProfile={isOwnProfile} profile={profileIdentity} />
        ) : activeTab === 'reposts' ? (
          repostsLoading ? (
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-40 rounded-2xl" />)}
            </div>
          ) : repostPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Repeat2 className="mb-4 h-16 w-16 opacity-50" />
              <p className="text-lg font-medium">{t('profile.empty.noReposts')}</p>
              <p className="text-sm">{t('profile.empty.repostPrompt')}</p>
            </div>
          ) : (
            <div className="mt-4">
              <ProfilePostsGrid
                posts={repostPosts}
                isOwnProfile={isOwnProfile}
                profile={profileIdentity}
                layout="feed"
              />
            </div>
          )
        ) : filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ImageIcon className="mb-4 h-16 w-16 opacity-50" />
            <p className="text-lg font-medium">
              {activeTab === 'videos' ? t('profile.empty.noVideos') : t('profile.empty.noPosts')}
            </p>
            <p className="text-sm">{t('profile.empty.shareFirst')}</p>
          </div>
        ) : (
          <div className="mt-4">
            <ProfilePostsGrid
              posts={filteredPosts}
              isOwnProfile={isOwnProfile}
              profile={profileIdentity}
              onLike={likePost}
              onDelete={deletePost}
              onPin={pinPost}
              layout={activeTab === 'videos' ? 'reels-grid' : 'feed'}
            />
          </div>
        )}
      </div>

      <FollowersFollowingDialog
        userId={user?.id || ''}
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
        isOwnProfile={isOwnProfile}
        fallbackUrl={profile.avatar_url}
        name={profile.display_name}
        username={profile.username}
        onChanged={() => refresh?.()}
      />
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
