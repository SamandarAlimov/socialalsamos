import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Eye, Heart, Loader2, Search, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/i18n-format';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/use-mobile';

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

interface LikeRow {
  user_id: string;
  created_at: string;
  profile?: Profile;
  is_following?: boolean;
}

interface ViewRow {
  user_id: string;
  viewed_at: string;
  profile?: Profile;
  is_following?: boolean;
}

interface PostLikesViewsDialogProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  likesCount: number;
  viewsCount: number;
  defaultTab?: 'likes' | 'views';
}

async function attachProfiles<T extends { user_id: string }>(rows: T[]): Promise<Array<T & { profile?: Profile }>> {
  const ids = Array.from(new Set(rows.map((row) => row.user_id)));
  if (!ids.length) return rows;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_verified')
    .in('id', ids);

  const profileMap = new Map((profiles || []).map((profile: Profile) => [profile.id, profile]));
  return rows.map((row) => ({ ...row, profile: profileMap.get(row.user_id) }));
}

function formatCount(value: number, locale: string) {
  const count = Math.max(0, value || 0);
  if (count >= 100_000) {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: count >= 1_000_000 ? 1 : 0,
    }).format(count);
  }
  return new Intl.NumberFormat(locale).format(count);
}

export function PostLikesViewsDialog({
  postId,
  open,
  onOpenChange,
  likesCount,
  viewsCount,
  defaultTab = 'likes',
}: PostLikesViewsDialogProps) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState<'likes' | 'views'>(defaultTab);
  const [query, setQuery] = useState('');
  const [likes, setLikes] = useState<LikeRow[]>([]);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [exactLikesCount, setExactLikesCount] = useState<number | null>(null);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [loadingViews, setLoadingViews] = useState(false);
  const [followLoading, setFollowLoading] = useState<string | null>(null);
  const [activeSnapPoint, setActiveSnapPoint] = useState<number | string | null>(0.64);

  const applyFollowingState = useCallback(async <T extends { user_id: string }>(rows: T[]) => {
    if (!user || !rows.length) return rows.map((row) => ({ ...row, is_following: false }));

    const targetIds = Array.from(new Set(rows.map((row) => row.user_id))).filter((id) => id !== user.id);
    if (!targetIds.length) return rows.map((row) => ({ ...row, is_following: false }));

    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', targetIds);

    const followingIds = new Set((follows || []).map((follow) => follow.following_id));
    return rows.map((row) => ({ ...row, is_following: followingIds.has(row.user_id) }));
  }, [user]);

  const loadExactLikesCount = useCallback(async () => {
    if (!postId) return;
    const { count, error } = await supabase
      .from('post_likes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);

    if (error) {
      console.warn('Failed to load exact post like count:', error);
      return;
    }
    setExactLikesCount(Math.max(0, count ?? 0));
  }, [postId]);

  const loadLikes = useCallback(async () => {
    if (!postId) return;
    setLoadingLikes(true);
    try {
      const { data, error } = await supabase
        .from('post_likes')
        .select('user_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .limit(250);

      if (error) throw error;
      const profiled = await attachProfiles((((data as unknown) || []) as LikeRow[]));
      setLikes((await applyFollowingState(profiled)) as LikeRow[]);
    } catch (error) {
      console.error('Failed to load post likes:', error);
      setLikes([]);
    } finally {
      setLoadingLikes(false);
    }
  }, [applyFollowingState, postId]);

  const loadViews = useCallback(async () => {
    if (!postId) return;
    setLoadingViews(true);
    try {
      const { data, error } = await supabase
        .from('post_views')
        .select('user_id, viewed_at')
        .eq('post_id', postId)
        .order('viewed_at', { ascending: false })
        .limit(250);

      if (error) throw error;
      const profiled = await attachProfiles((((data as unknown) || []) as ViewRow[]));
      setViews((await applyFollowingState(profiled)) as ViewRow[]);
    } catch (error) {
      console.error('Failed to load post views:', error);
      setViews([]);
    } finally {
      setLoadingViews(false);
    }
  }, [applyFollowingState, postId]);

  useEffect(() => {
    setLikes([]);
    setViews([]);
    setExactLikesCount(null);
    setQuery('');
    setTab(defaultTab);
  }, [postId, defaultTab]);

  useEffect(() => {
    if (!open || !postId) return;
    setTab(defaultTab);
    setQuery('');
    setActiveSnapPoint(0.64);
    void loadExactLikesCount();
  }, [open, defaultTab, postId, loadExactLikesCount]);

  useEffect(() => {
    if (!open || !postId) return;
    if (tab === 'likes' && !likes.length && !loadingLikes) void loadLikes();
    if (tab === 'views' && !views.length && !loadingViews) void loadViews();
  }, [open, postId, tab, likes.length, views.length, loadingLikes, loadingViews, loadLikes, loadViews]);

  const handleFollow = useCallback(async (targetId: string, following: boolean) => {
    if (!user || targetId === user.id || followLoading) return;

    setFollowLoading(targetId);
    const setFollowingLocally = (value: boolean) => {
      setLikes((current) => current.map((row) => row.user_id === targetId ? { ...row, is_following: value } : row));
      setViews((current) => current.map((row) => row.user_id === targetId ? { ...row, is_following: value } : row));
    };

    try {
      if (following) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetId);
        if (error) throw error;
        setFollowingLocally(false);
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
        setFollowingLocally(true);
      }
    } catch (error) {
      console.error('Failed to update follow state:', error);
      toast.error(t('common.error', 'Something went wrong'));
    } finally {
      setFollowLoading(null);
    }
  }, [followLoading, t, user]);

  const filterByProfile = useCallback((profile?: Profile) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return Boolean(
      profile?.username?.toLowerCase().includes(normalizedQuery) ||
      profile?.display_name?.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const filteredLikes = useMemo(() => likes.filter((row) => filterByProfile(row.profile)), [likes, filterByProfile]);
  const filteredViews = useMemo(() => views.filter((row) => filterByProfile(row.profile)), [views, filterByProfile]);

  const openProfile = useCallback((username?: string | null, userId?: string) => {
    onOpenChange(false);
    if (username) navigate(`/user/${encodeURIComponent(username)}`);
    else if (userId) navigate(`/user/${encodeURIComponent(userId)}`);
  }, [navigate, onOpenChange]);

  const canonicalLikesCount = exactLikesCount ?? likesCount;
  const content = (
    <AudiencePanel
      tab={tab}
      setTab={setTab}
      query={query}
      setQuery={setQuery}
      likes={filteredLikes}
      views={filteredViews}
      likesCount={canonicalLikesCount}
      viewsCount={viewsCount}
      loading={tab === 'likes' ? loadingLikes : loadingViews}
      followLoading={followLoading}
      currentUserId={user?.id}
      onFollow={handleFollow}
      onProfile={openProfile}
      locale={i18n.language}
      t={t}
    />
  );

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        shouldScaleBackground={false}
        snapPoints={[0.64, 0.92]}
        activeSnapPoint={activeSnapPoint}
        setActiveSnapPoint={setActiveSnapPoint}
      >
        <DrawerContent
          className="h-[92dvh] max-h-[92dvh] overflow-hidden rounded-t-[24px] border-x-0 border-b-0 bg-background p-0 shadow-[0_-16px_52px_rgba(0,0,0,0.18)]"
          handleClassName="mt-2.5 h-1 w-12 bg-muted-foreground/20"
        >
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(820px,88vh)] w-[min(720px,calc(100vw-3rem))] max-w-[720px] gap-0 overflow-hidden rounded-[32px] border border-border/45 bg-background/95 p-0 shadow-[0_32px_110px_rgba(0,0,0,0.32)] backdrop-blur-2xl [&>button]:right-5 [&>button]:top-5 [&>button]:z-30 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-muted/70 [&>button]:opacity-100 [&>button]:transition-colors [&>button]:hover:bg-muted">
        <DialogTitle className="sr-only">{t('post.likesAndViews', 'Likes and views')}</DialogTitle>
        {content}
      </DialogContent>
    </Dialog>
  );
}

interface AudiencePanelProps {
  tab: 'likes' | 'views';
  setTab: (tab: 'likes' | 'views') => void;
  query: string;
  setQuery: (value: string) => void;
  likes: LikeRow[];
  views: ViewRow[];
  likesCount: number;
  viewsCount: number;
  loading: boolean;
  followLoading: string | null;
  currentUserId?: string;
  onFollow: (targetId: string, following: boolean) => void | Promise<void>;
  onProfile: (username?: string | null, userId?: string) => void;
  locale: string;
  t: ReturnType<typeof useTranslation>['t'];
}

function AudiencePanel({
  tab,
  setTab,
  query,
  setQuery,
  likes,
  views,
  likesCount,
  viewsCount,
  loading,
  followLoading,
  currentUserId,
  onFollow,
  onProfile,
  locale,
  t,
}: AudiencePanelProps) {
  const activeRows = tab === 'likes' ? likes : views;
  const activeCount = tab === 'likes' && !query.trim() ? likesCount : activeRows.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background md:bg-gradient-to-b md:from-background md:via-background md:to-muted/20">
      <div className="flex-none border-b border-border/50 bg-background/95 px-4 pb-0 pt-1 backdrop-blur-xl md:px-8 md:pt-6">
        <h2 className="text-center text-[17px] font-bold tracking-[-0.025em] md:text-[22px]">
          {t('post.likesAndViews', 'Likes and views')}
        </h2>
        <p className="mx-auto mt-1 hidden max-w-md text-center text-[12px] text-muted-foreground md:block">
          {tab === 'likes'
            ? t('post.likesAudienceHint', 'People who liked this video')
            : t('post.viewsAudienceHint', 'People who viewed this video')}
        </p>

        <div
          className="mt-2.5 grid grid-cols-2 md:mt-4"
          role="tablist"
          aria-label={t('post.likesAndViews', 'Likes and views')}
        >
          <CompactAudienceTab
            active={tab === 'likes'}
            icon={<Heart className={cn('h-[17px] w-[17px]', tab === 'likes' && 'fill-current')} strokeWidth={2.1} />}
            label={t('common.likes', 'Likes')}
            count={formatCount(likesCount, locale)}
            onClick={() => setTab('likes')}
          />
          <CompactAudienceTab
            active={tab === 'views'}
            icon={<Eye className="h-[17px] w-[17px]" strokeWidth={2.1} />}
            label={t('post.views', 'Views')}
            count={formatCount(viewsCount, locale)}
            onClick={() => setTab('views')}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 md:px-8">
        <div className="flex-none pb-2 pt-2.5 md:pb-3 md:pt-5">
          <div className="mb-2 flex items-center justify-between px-0.5 md:mb-3">
            <h3 className="text-[15px] font-bold tracking-[-0.02em] md:text-[18px]">
              {tab === 'likes' ? t('post.likedBy', 'Liked by') : t('post.viewedBy', 'Viewed by')}
            </h3>
            {!loading && activeCount > 0 && (
              <span className="rounded-full bg-muted/65 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground md:px-2.5 md:py-1 md:text-[11px]">
                {formatCount(activeCount, locale)}
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80 md:left-3.5 md:h-[18px] md:w-[18px]" strokeWidth={2} />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('common.search', 'Search')}
              className="h-9 rounded-[12px] border-0 bg-muted/60 pl-9 pr-3.5 text-[13px] shadow-none placeholder:text-muted-foreground/75 focus-visible:bg-muted/75 focus-visible:ring-1 focus-visible:ring-ring/40 md:h-11 md:rounded-[14px] md:pl-10 md:text-[14px]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),0.75rem)] scrollbar-hide md:pb-6">
          {loading ? (
            <SkeletonRows />
          ) : activeRows.length === 0 ? (
            <EmptyState
              icon={tab === 'likes' ? <Heart className="h-7 w-7" /> : <Users className="h-7 w-7" />}
              label={tab === 'likes' ? t('post.noLikes', 'No likes yet') : t('post.noViewers', 'No viewers yet')}
              hasQuery={Boolean(query.trim())}
            />
          ) : tab === 'likes' ? (
            <div className="space-y-0 md:space-y-0.5">
              {likes.map((row) => (
                <AudienceRow
                  key={row.user_id}
                  row={row}
                  currentUserId={currentUserId}
                  followLoading={followLoading}
                  onFollow={onFollow}
                  onProfile={onProfile}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5 md:space-y-1">
              {views.map((row) => (
                <AudienceRow
                  key={row.user_id}
                  row={row}
                  currentUserId={currentUserId}
                  followLoading={followLoading}
                  onFollow={onFollow}
                  onProfile={onProfile}
                  meta={formatRelative(row.viewed_at, locale, false)}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactAudienceTab({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative flex h-10 items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors active:scale-[0.985] md:h-11 md:text-[14px]',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className={cn('transition-colors', active && 'text-primary')}>{icon}</span>
      <span>{label}</span>
      <span
        className={cn(
          'text-[11px] font-semibold tabular-nums md:text-[12px]',
          active ? 'text-foreground/70' : 'text-muted-foreground/70',
        )}
      >
        {count}
      </span>
      <span
        className={cn(
          'absolute inset-x-5 bottom-0 h-0.5 rounded-full transition-all duration-200 md:inset-x-10',
          active ? 'scale-x-100 bg-primary opacity-100' : 'scale-x-50 bg-transparent opacity-0',
        )}
      />
    </button>
  );
}

type AudienceRowData = (LikeRow | ViewRow) & { is_following?: boolean };

function AudienceRow({
  row,
  currentUserId,
  followLoading,
  onFollow,
  onProfile,
  meta,
  t,
}: {
  row: AudienceRowData;
  currentUserId?: string;
  followLoading: string | null;
  onFollow: (targetId: string, following: boolean) => void | Promise<void>;
  onProfile: (username?: string | null, userId?: string) => void;
  meta?: string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const profile = row.profile;
  const primaryName = profile?.username || profile?.display_name || t('post.privateUser', 'User');
  const secondaryName = profile?.username && profile?.display_name ? profile.display_name : null;
  const isSelf = currentUserId === row.user_id;
  const isLoading = followLoading === row.user_id;

  return (
    <div className="group flex min-h-[58px] items-center gap-2.5 rounded-[14px] px-1 py-1.5 transition-colors hover:bg-muted/35 md:min-h-[66px] md:rounded-[16px] md:px-2 md:py-2 md:hover:bg-muted/55">
      <button
        type="button"
        onClick={() => onProfile(profile?.username, row.user_id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left md:gap-3"
      >
        <Avatar className="h-11 w-11 flex-none ring-1 ring-border/50 md:h-12 md:w-12">
          <AvatarImage src={profile?.avatar_url || ''} />
          <AvatarFallback className="bg-muted text-base font-semibold text-muted-foreground">
            {primaryName[0]?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-bold leading-5 tracking-[-0.01em] md:text-[15px]">
              {primaryName}
            </span>
            {profile?.is_verified && <VerifiedBadge size="xs" />}
          </div>
          {(secondaryName || meta) && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-muted-foreground md:text-[12.5px]">
              {secondaryName && <span className="truncate">{secondaryName}</span>}
              {secondaryName && meta && <span aria-hidden="true">·</span>}
              {meta && <span className="flex-none whitespace-nowrap text-[11px] md:text-[12px]">{meta}</span>}
            </div>
          )}
        </div>
      </button>

      {!isSelf && currentUserId && (
        <Button
          type="button"
          size="sm"
          variant={row.is_following ? 'secondary' : 'default'}
          disabled={isLoading}
          onClick={() => void onFollow(row.user_id, Boolean(row.is_following))}
          className={cn(
            'h-8 min-w-[82px] flex-none rounded-[10px] px-3.5 text-[12px] font-bold shadow-none transition-transform active:scale-[0.97] md:h-9 md:min-w-[96px] md:rounded-[11px] md:px-4 md:text-[13px]',
            !row.is_following && 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : row.is_following ? (
            t('common.following', 'Following')
          ) : (
            t('common.follow', 'Follow')
          )}
        </Button>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-0.5 py-1 md:space-y-1">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="flex min-h-[58px] items-center gap-2.5 px-1 py-1.5 md:min-h-[66px] md:px-2 md:py-2">
          <Skeleton className="h-11 w-11 flex-none rounded-full md:h-12 md:w-12" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28 rounded-full md:w-36" />
            <Skeleton className="h-3 w-20 rounded-full md:w-28" />
          </div>
          <Skeleton className="h-8 w-[82px] rounded-[10px] md:h-9 md:w-[96px] md:rounded-[11px]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, label, hasQuery }: { icon: React.ReactNode; label: string; hasQuery: boolean }) {
  return (
    <div className="flex min-h-[190px] flex-col items-center justify-center px-8 text-center md:min-h-[260px]">
      <div className="mb-2.5 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-muted-foreground md:h-14 md:w-14">
        {icon}
      </div>
      <p className="text-[15px] font-semibold md:text-[16px]">
        {hasQuery ? 'No results found' : label}
      </p>
      {hasQuery && <p className="mt-1 text-sm text-muted-foreground">Try another name or username.</p>}
    </div>
  );
}
