import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Loader2, Search, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { formatRelative, formatCompact } from '@/lib/i18n-format';
import { cn } from '@/lib/utils';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useRealtimePostViews } from '@/hooks/useRealtimePostViews';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface ViewerProfile {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

interface Viewer {
  user_id: string;
  viewed_at: string;
  profile?: ViewerProfile;
  is_following?: boolean;
}

interface PostViewsDialogProps {
  postId: string;
  viewsCount: number;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

const PAGE_SIZE = 30;

export function PostViewsDialog({ postId, viewsCount, className, iconClassName, textClassName }: PostViewsDialogProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const liveCount = useRealtimePostViews(postId, viewsCount);

  const [open, setOpen] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState('');
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  const applyFollowingState = useCallback(async (rows: Viewer[]) => {
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

  const loadPage = useCallback(async (cursor: string | null) => {
    let request = supabase
      .from('post_views')
      .select('user_id, viewed_at')
      .eq('post_id', postId)
      .order('viewed_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) request = request.lt('viewed_at', cursor);

    const { data, error } = await request;
    if (error || !data) return [] as Viewer[];

    const ids = Array.from(new Set(data.map((row: any) => row.user_id)));
    if (!ids.length) return [] as Viewer[];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified')
      .in('id', ids);

    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile as ViewerProfile]));
    const rows = data.map((row: any) => ({
      user_id: row.user_id,
      viewed_at: row.viewed_at,
      profile: profileMap.get(row.user_id),
    })) as Viewer[];

    return applyFollowingState(rows);
  }, [applyFollowingState, postId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setViewers([]);
    setHasMore(true);

    void loadPage(null).then((batch) => {
      if (!active) return;
      setViewers(batch);
      setHasMore(batch.length === PAGE_SIZE);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open, postId, loadPage]);

  useEffect(() => {
    if (!open) return;

    const channel = supabase
      .channel(`post-views-dialog:${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_views',
          filter: `post_id=eq.${postId}`,
        },
        async (payload) => {
          const row = payload.new as { user_id: string; viewed_at: string };
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url, is_verified')
            .eq('id', row.user_id)
            .maybeSingle();

          let isFollowing = false;
          if (user && user.id !== row.user_id) {
            const { data: follow } = await supabase
              .from('follows')
              .select('following_id')
              .eq('follower_id', user.id)
              .eq('following_id', row.user_id)
              .maybeSingle();
            isFollowing = Boolean(follow);
          }

          setViewers((current) => {
            if (current.some((viewer) => viewer.user_id === row.user_id)) return current;
            return [
              {
                user_id: row.user_id,
                viewed_at: row.viewed_at,
                profile: (profile as ViewerProfile | null) || undefined,
                is_following: isFollowing,
              },
              ...current,
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, postId, user]);

  useEffect(() => {
    if (!open || loading || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loadingMore) return;
        const cursor = viewers[viewers.length - 1]?.viewed_at;
        if (!cursor) return;

        setLoadingMore(true);
        const batch = await loadPage(cursor);
        setViewers((current) => {
          const existing = new Set(current.map((viewer) => viewer.user_id));
          return [...current, ...batch.filter((viewer) => !existing.has(viewer.user_id))];
        });
        setHasMore(batch.length === PAGE_SIZE);
        setLoadingMore(false);
      },
      { rootMargin: '160px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadPage, loading, loadingMore, open, viewers]);

  const handleFollow = useCallback(async (targetId: string, following: boolean) => {
    if (!user || targetId === user.id || followLoading) return;
    setFollowLoading(targetId);

    try {
      if (following) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
      }

      setViewers((current) => current.map((viewer) => (
        viewer.user_id === targetId ? { ...viewer, is_following: !following } : viewer
      )));
    } catch (error) {
      console.error('Failed to update viewer follow state:', error);
      toast.error(t('common.error', 'Something went wrong'));
    } finally {
      setFollowLoading(null);
    }
  }, [followLoading, t, user]);

  const filteredViewers = viewers.filter((viewer) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return Boolean(
      viewer.profile?.username?.toLowerCase().includes(normalized) ||
      viewer.profile?.display_name?.toLowerCase().includes(normalized),
    );
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setQuery('');
  };

  const openProfile = (viewer: Viewer) => {
    const username = viewer.profile?.username;
    if (!username) return;
    setOpen(false);
    navigate(`/user/${encodeURIComponent(username)}`);
  };

  const content = (
    <div className="flex min-h-0 flex-1 flex-col bg-background md:bg-gradient-to-b md:from-background md:via-background md:to-muted/20">
      <div className="flex-none px-5 pb-4 pt-2 md:px-8 md:pb-5 md:pt-7">
        <h2 className="text-center text-[20px] font-bold tracking-[-0.02em] md:text-[24px]">
          {t('post.viewers', 'Viewers')}
        </h2>
        <p className="mx-auto mt-1 hidden max-w-md text-center text-[13px] text-muted-foreground md:block">
          {t('post.viewsAudienceHint', 'People who viewed this post')}
        </p>
      </div>

      <div className="flex-none border-y border-border/60 bg-background px-5 py-4 md:px-8 md:py-5">
        <div className="flex min-h-[76px] items-center justify-center gap-3 rounded-[20px] border border-primary/15 bg-primary/[0.07] px-5 text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.05)] md:min-h-[92px] md:rounded-[24px] md:shadow-[0_14px_34px_rgba(0,0,0,0.07)]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary md:h-11 md:w-11">
            <Eye className="h-5 w-5 md:h-[22px] md:w-[22px]" strokeWidth={2.1} />
          </span>
          <span className="text-[22px] font-bold tabular-nums tracking-[-0.02em] md:text-[25px]">
            {formatCompact(liveCount, i18n.language)}
          </span>
          <span className="text-[14px] font-semibold text-muted-foreground md:text-[15px]">
            {t('post.views', 'Views')}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 md:px-8">
        <div className="flex-none pb-3 pt-5 md:pb-4 md:pt-6">
          <div className="mb-3 flex items-center justify-between px-1 md:mb-4">
            <h3 className="text-[18px] font-bold tracking-[-0.02em] md:text-[20px]">
              {t('post.viewedBy', 'Viewed by')}
            </h3>
            {!loading && viewers.length > 0 && (
              <span className="rounded-full bg-muted/70 px-2.5 py-1 text-xs font-semibold text-muted-foreground md:px-3">
                {formatCompact(viewers.length, i18n.language)}
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground md:left-4 md:h-5 md:w-5" strokeWidth={2} />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('common.search', 'Search')}
              className="h-11 rounded-[14px] border-0 bg-muted/70 pl-10 pr-4 text-[15px] shadow-none placeholder:text-muted-foreground/85 focus-visible:ring-1 focus-visible:ring-ring/50 md:h-12 md:rounded-[16px] md:pl-12"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),0.75rem)] scrollbar-hide md:pb-6">
          {loading ? (
            <ViewerSkeletonRows />
          ) : filteredViewers.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center px-8 text-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-border/70 bg-muted/45 text-muted-foreground">
                <Users className="h-7 w-7" />
              </div>
              <p className="text-[15px] font-semibold">
                {query.trim() ? t('common.noResults', 'No results found') : t('post.noViewers', 'No viewers yet')}
              </p>
              {query.trim() && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('common.tryAnotherSearch', 'Try another name or username.')}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-0.5 md:space-y-1">
                <AnimatePresence initial={false}>
                  {filteredViewers.map((viewer) => {
                    const primaryName = viewer.profile?.username || viewer.profile?.display_name || t('post.privateUser', 'User');
                    const secondaryName = viewer.profile?.username && viewer.profile?.display_name
                      ? viewer.profile.display_name
                      : null;
                    const isSelf = user?.id === viewer.user_id;
                    const isFollowLoading = followLoading === viewer.user_id;

                    return (
                      <motion.div
                        key={viewer.user_id}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="group flex min-h-[68px] items-center gap-3 rounded-[16px] px-1.5 py-2 transition-colors hover:bg-muted/35 md:min-h-[76px] md:rounded-[18px] md:px-2.5 md:py-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => openProfile(viewer)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left md:gap-3.5"
                        >
                          <Avatar className="h-[52px] w-[52px] flex-none ring-1 ring-border/50 md:h-14 md:w-14">
                            <AvatarImage src={viewer.profile?.avatar_url || ''} />
                            <AvatarFallback className="bg-muted text-base font-semibold text-muted-foreground">
                              {primaryName[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>

                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[15px] font-bold leading-5 tracking-[-0.01em] md:text-[16px]">
                                {primaryName}
                              </span>
                              {viewer.profile?.is_verified && <VerifiedBadge size="xs" />}
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-4 text-muted-foreground">
                              {secondaryName && <span className="truncate">{secondaryName}</span>}
                              {secondaryName && <span aria-hidden="true">·</span>}
                              <span className="flex-none whitespace-nowrap text-[12px]">
                                {formatRelative(viewer.viewed_at, i18n.language, false)}
                              </span>
                            </div>
                          </div>
                        </button>

                        {!isSelf && user && (
                          <Button
                            type="button"
                            size="sm"
                            variant={viewer.is_following ? 'secondary' : 'default'}
                            disabled={isFollowLoading}
                            onClick={() => void handleFollow(viewer.user_id, Boolean(viewer.is_following))}
                            className={cn(
                              'h-9 min-w-[88px] flex-none rounded-[11px] px-3 text-[13px] font-bold shadow-none transition-transform active:scale-[0.97] md:h-10 md:min-w-[104px] md:rounded-[12px] md:px-4 md:text-sm',
                              !viewer.is_following && 'bg-primary text-primary-foreground hover:bg-primary/90',
                            )}
                          >
                            {isFollowLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : viewer.is_following ? (
                              t('common.following', 'Following')
                            ) : (
                              t('common.follow', 'Follow')
                            )}
                          </Button>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {hasMore && !query.trim() && (
                <div ref={sentinelRef} className="flex items-center justify-center py-4">
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground touch-feedback',
          className,
        )}
      >
        <Eye className={cn('h-4 w-4', iconClassName)} />
        <AnimatePresence mode="popLayout">
          <motion.span
            key={liveCount}
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 6, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={cn('text-xs font-medium tabular-nums', textClassName)}
          >
            {formatCompact(liveCount, i18n.language)}
          </motion.span>
        </AnimatePresence>
      </button>

      {isMobile ? (
        <Drawer open={open} onOpenChange={handleOpenChange} shouldScaleBackground={false}>
          <DrawerContent className="h-[82dvh] max-h-[88dvh] overflow-hidden rounded-t-[30px] border-x-0 border-b-0 p-0 shadow-[0_-20px_60px_rgba(0,0,0,0.22)]">
            <DrawerTitle className="sr-only">{t('post.viewers', 'Viewers')}</DrawerTitle>
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="h-[min(820px,88vh)] w-[min(700px,calc(100vw-3rem))] max-w-[700px] gap-0 overflow-hidden rounded-[32px] border border-border/45 bg-background/95 p-0 shadow-[0_32px_110px_rgba(0,0,0,0.32)] backdrop-blur-2xl [&>button]:right-5 [&>button]:top-5 [&>button]:z-30 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-muted/70 [&>button]:opacity-100 [&>button]:transition-colors [&>button]:hover:bg-muted">
            <DialogTitle className="sr-only">{t('post.viewers', 'Viewers')}</DialogTitle>
            {content}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function ViewerSkeletonRows() {
  return (
    <div className="space-y-1 py-1">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="flex min-h-[68px] items-center gap-3 px-1.5 py-2 md:min-h-[76px] md:px-2.5 md:py-2.5">
          <Skeleton className="h-[52px] w-[52px] flex-none rounded-full md:h-14 md:w-14" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28 rounded-full md:w-36" />
            <Skeleton className="h-3.5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-9 w-[88px] rounded-[11px] md:h-10 md:w-[104px]" />
        </div>
      ))}
    </div>
  );
}
