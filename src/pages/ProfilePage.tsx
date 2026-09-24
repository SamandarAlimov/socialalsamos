import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useUserReposts } from '@/hooks/useReposts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FollowersFollowingDialog } from '@/components/FollowersFollowingDialog';
import { ProfilePostsGrid } from '@/components/profile/ProfilePostsGrid';
import { ProfileQrDialog } from '@/components/profile/ProfileQrDialog';
import { ProfilePhotosDialog } from '@/components/profile/ProfilePhotosDialog';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { StoryHighlights } from '@/components/stories/StoryHighlights';
import { PullToRefresh } from '@/components/PullToRefresh';
import { RichTextContent } from '@/components/RichTextContent';
import { EmojiText } from '@/components/emoji/EmojiText';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/mediaUpload';
import { toExternalUrl, stripProtocol } from '@/lib/urls';
import { formatLocation } from '@/lib/locations';
import {
  Edit3,
  Grid3x3,
  Video,
  Bookmark,
  Repeat2,
  MapPin,
  LinkIcon,
  Calendar,
  ImageIcon,
  Archive,
  Megaphone,
  Camera,
  Loader2,
  QrCode,
  MoreHorizontal,
  Settings,
  Images,
} from 'lucide-react';
import { format } from 'date-fns';
import { uz as uzDateLocale, ru as ruDateLocale, enUS as enDateLocale } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const DATE_LOCALES = {
  uz: uzDateLocale,
  ru: ruDateLocale,
  en: enDateLocale,
} as const;

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
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

  const langKey = (i18n.language?.split('-')[0] ?? 'uz') as keyof typeof DATE_LOCALES;
  const dateLocale = DATE_LOCALES[langKey] ?? uzDateLocale;

  const [activeTab, setActiveTab] = useState<'posts' | 'videos' | 'reposts' | 'saved'>('posts');
  const [followDialog, setFollowDialog] = useState<{ open: boolean; type: 'followers' | 'following' }>({
    open: false,
    type: 'followers',
  });
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

  const tabs = [
    { id: 'posts', icon: Grid3x3, label: t('profile.tabs.posts') },
    { id: 'videos', icon: Video, label: t('profile.tabs.videos') },
    { id: 'reposts', icon: Repeat2, label: t('profile.tabs.reposts') },
    { id: 'saved', icon: Bookmark, label: t('profile.tabs.saved') },
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

  const repostPosts = reposts.flatMap((repost) => (repost.post ? [repost.post] : []));

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingCover(true);
    try {
      const uploaded = await uploadMedia(file, { type: 'avatar', visibility: 'public' });

      await supabase
        .from('profiles')
        .update({ cover_url: uploaded.url })
        .eq('id', user.id);

      toast({ title: t('common.success'), description: t('profile.coverUpdated') });
      refresh?.();
    } catch (err: any) {
      toast({
        title: t('common.error'),
        description: err?.message || t('profile.coverUploadFailed'),
        variant: 'destructive',
      });
    } finally {
      setUploadingCover(false);
    }
  };

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
        <p className="text-muted-foreground">{t('profile.notFound')}</p>
      </div>
    );
  }

  const readableLocation = formatLocation(profile.location, i18n.language);

  const pageContent = (
    <div className="max-w-4xl mx-auto py-4 md:py-8 px-3 md:px-4 pb-24 md:pb-8">
      {/* Cover Photo */}
      <div className="relative h-36 sm:h-48 md:h-64 rounded-xl md:rounded-2xl bg-gradient-to-r from-muted to-muted/60 mb-12 md:mb-16 overflow-hidden group">
        {profile.cover_url ? (
          <img
            src={profile.cover_url}
            alt={t('settings.cover')}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-card to-muted/80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />

        {isOwnProfile && (
          <>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverUpload}
              className="hidden"
            />
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium backdrop-blur-sm opacity-80 hover:opacity-100 transition-opacity"
            >
              {uploadingCover ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              {uploadingCover ? t('common.uploading') : t('profile.changeCover')}
            </button>
          </>
        )}
      </div>

      {/* Profile Info */}
      <div className="relative -mt-12 sm:-mt-16 md:-mt-24 px-2 md:px-4">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            {/* Avatar with story ring */}
            <div className="relative shrink-0">
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
              {(profile.avatar_url || isOwnProfile) && (
                <button
                  type="button"
                  onClick={() => setShowPhotos(true)}
                  aria-label={t('profile.photos.title', { defaultValue: 'Profil rasmlari' })}
                  className="absolute -bottom-1 -right-1 rounded-full border border-border bg-background/90 p-1.5 shadow-sm backdrop-blur transition-colors hover:bg-accent"
                >
                  <Images className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
                <h1 className="min-w-0 flex-1 truncate text-xl font-bold md:text-2xl">
                  <span className="block truncate">
                    <EmojiText
                      text={profile.display_name || profile.username || t('profile.user')}
                      size={22}
                    />
                  </span>
                </h1>
                {profile.is_verified && (
                  <VerifiedBadge size="sm" className="shrink-0 md:hidden" />
                )}
                {profile.is_verified && (
                  <VerifiedBadge size="md" className="hidden shrink-0 md:block" />
                )}
              </div>
              <p className="mt-0.5 block max-w-full truncate text-sm text-muted-foreground md:text-base">
                @{profile.username || t('profile.usernameFallback')}
              </p>
            </div>
          </div>

          {isOwnProfile && (
            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="sm" className="md:h-10 md:px-4" onClick={() => navigate('/settings')}>
                <Edit3 className="h-4 w-4 mr-1.5 md:mr-2" />
                <span className="text-sm">{t('profile.editProfile')}</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 md:h-10 md:w-10"
                aria-label={t('profile.qr.title', { defaultValue: 'QR kod' })}
                onClick={() => setShowQrDialog(true)}
              >
                <QrCode className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 md:h-10 md:w-10"
                    aria-label={t('common.more', { defaultValue: "Ko'proq" })}
                  >
                    <MoreHorizontal className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
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
            </div>
          )}
        </div>

        {/* Bio */}
        <div className="mt-4 md:mt-6 max-w-2xl">
          {profile.bio ? (
            <RichTextContent
              content={profile.bio}
              className="text-sm md:text-base text-foreground leading-relaxed"
              emojiSize={20}
            />
          ) : (
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              {t('profile.noBio')}
            </p>
          )}
          <div className="flex flex-wrap gap-3 md:gap-4 mt-3 md:mt-4 text-xs md:text-sm text-muted-foreground">
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
                  className="text-link hover:text-link-hover hover:underline"
                >
                  {stripProtocol(profile.website)}
                </a>
              </span>
            )}
            {profile.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {t('profile.joined', {
                  date: format(new Date(profile.created_at), 'LLLL yyyy', { locale: dateLocale }),
                })}
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
            <span className="text-muted-foreground text-xs md:text-sm sm:ml-1">{t('profile.stats.posts')}</span>
          </button>
          <button
            className="text-center hover:opacity-80 transition-opacity flex flex-col sm:flex-row sm:items-baseline"
            onClick={() => setFollowDialog({ open: true, type: 'followers' })}
          >
            <span className="text-lg md:text-xl font-bold">{formatCount(followersCount)}</span>
            <span className="text-muted-foreground text-xs md:text-sm sm:ml-1">{t('profile.stats.followers')}</span>
          </button>
          <button
            className="text-center hover:opacity-80 transition-opacity flex flex-col sm:flex-row sm:items-baseline"
            onClick={() => setFollowDialog({ open: true, type: 'following' })}
          >
            <span className="text-lg md:text-xl font-bold">{formatCount(followingCount)}</span>
            <span className="text-muted-foreground text-xs md:text-sm sm:ml-1">{t('profile.stats.following')}</span>
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
              aria-label={tab.label}
              className={`flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 md:gap-2 px-3 md:px-6 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-foreground border-b-2 border-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Posts */}
        {activeTab === 'reposts' ? (
          repostsLoading ? (
            <div className="mt-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : repostPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Repeat2 className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">{t('profile.empty.noReposts')}</p>
              <p className="text-sm">
                {isOwnProfile ? t('profile.empty.repostPrompt') : t('profile.empty.userNoReposts')}
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <ProfilePostsGrid
                posts={repostPosts}
                isOwnProfile={isOwnProfile}
                profile={{
                  username: profile.username,
                  avatar_url: profile.avatar_url,
                  display_name: profile.display_name,
                  is_verified: profile.is_verified,
                }}
                layout="feed"
              />
            </div>
          )
        ) : filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ImageIcon className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">
              {activeTab === 'videos' ? t('profile.empty.noVideos') : t('profile.empty.noPosts')}
            </p>
            <p className="text-sm">
              {isOwnProfile ? t('profile.empty.shareFirst') : t('profile.empty.userNoPosts')}
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
                is_verified: profile.is_verified,
              }}
              onLike={likePost}
              onDelete={deletePost}
              onPin={pinPost}
              layout={activeTab === 'videos' ? 'reels-grid' : 'feed'}
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

      {/* Profile QR code */}
      <ProfileQrDialog
        open={showQrDialog}
        onOpenChange={setShowQrDialog}
        username={profile.username}
        displayName={profile.display_name}
        avatarUrl={profile.avatar_url}
      />

      {/* Telegram uslubidagi ko'p profil rasmlari */}
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
