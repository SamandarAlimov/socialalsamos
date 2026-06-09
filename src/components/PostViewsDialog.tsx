import { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, Search, Users, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { formatRelative, formatCompact } from '@/lib/i18n-format';
import { cn } from '@/lib/utils';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useRealtimePostViews } from '@/hooks/useRealtimePostViews';
import { useTranslation } from 'react-i18next';

interface Viewer {
  user_id: string;
  viewed_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
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
  const [open, setOpen] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const liveCount = useRealtimePostViews(postId, viewsCount);

  const loadPage = useCallback(
    async (cursor: string | null) => {
      let q = supabase
        .from('post_views')
        .select('user_id, viewed_at')
        .eq('post_id', postId)
        .order('viewed_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) q = q.lt('viewed_at', cursor);

      const { data, error } = await q;
      if (error || !data) return [] as Viewer[];

      const ids = Array.from(new Set(data.map((r: any) => r.user_id)));
      if (ids.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .in('id', ids);

      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((r: any) => ({
        user_id: r.user_id,
        viewed_at: r.viewed_at,
        profile: map.get(r.user_id) || undefined,
      })) as Viewer[];
    },
    [postId]
  );

  // Initial load
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setViewers([]);
    setHasMore(true);
    loadPage(null).then((batch) => {
      setViewers(batch);
      setHasMore(batch.length === PAGE_SIZE);
      setLoading(false);
    });
  }, [open, postId, loadPage]);

  // Realtime append while dialog is open
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
          setViewers((prev) => {
            if (prev.some((v) => v.user_id === row.user_id)) return prev;
            return [
              { user_id: row.user_id, viewed_at: row.viewed_at, profile: profile || undefined },
              ...prev,
            ];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, postId]);

  // Infinite scroll
  useEffect(() => {
    if (!open || loading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loadingMore) return;
        setLoadingMore(true);
        const cursor = viewers[viewers.length - 1]?.viewed_at;
        const batch = await loadPage(cursor || null);
        setViewers((prev) => {
          const ids = new Set(prev.map((v) => v.user_id));
          return [...prev, ...batch.filter((v) => !ids.has(v.user_id))];
        });
        setHasMore(batch.length === PAGE_SIZE);
        setLoadingMore(false);
      },
      { rootMargin: '120px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [open, loading, hasMore, loadingMore, viewers, loadPage]);

  const filtered = viewers.filter((v) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      v.profile?.username?.toLowerCase().includes(q) ||
      v.profile?.display_name?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors touch-feedback',
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
      </DialogTrigger>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold">
            <div className="h-8 w-8 rounded-full bg-alsamos-orange/10 flex items-center justify-center">
              <Eye className="h-4 w-4 text-alsamos-orange" />
            </div>
            <div className="flex flex-col items-start">
              <span>{t('post.viewers')}</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {t('post.viewersCount', { count: liveCount })}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              className="pl-9 h-9 bg-background border-border/60 rounded-full text-sm"
            />
          </div>
        </div>

        <ScrollArea className="max-h-[55vh]">
          <div className="px-2 py-2">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">{t('post.noViewers')}</p>
              </div>
            ) : (
              <>
                <AnimatePresence initial={false}>
                  {filtered.map((viewer) => {
                    const displayName =
                      viewer.profile?.display_name || viewer.profile?.username || t('post.privateUser');
                    return (
                      <motion.button
                        key={viewer.user_id}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={() => {
                          setOpen(false);
                          if (viewer.profile?.username) {
                            navigate(`/user/${viewer.profile.username}`);
                          }
                        }}
                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 active:bg-muted w-full text-left transition-colors"
                      >
                        <Avatar className="h-11 w-11 ring-1 ring-border/50">
                          <AvatarImage src={viewer.profile?.avatar_url || ''} />
                          <AvatarFallback className="bg-gradient-to-br from-alsamos-orange/20 to-alsamos-orange/5 text-alsamos-orange font-medium">
                            {displayName[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-sm truncate">{displayName}</span>
                            {viewer.profile?.is_verified && <VerifiedBadge size="xs" />}
                          </div>
                          {viewer.profile?.username && (
                            <p className="text-xs text-muted-foreground truncate">@{viewer.profile.username}</p>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                          {formatRelative(viewer.viewed_at, i18n.language, false)}
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
                {hasMore && (
                  <div ref={sentinelRef} className="flex items-center justify-center py-4">
                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
