import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Loader2, Heart, Eye, Users, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/i18n-format';
import { useTranslation } from 'react-i18next';

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
}

interface PostLikesViewsDialogProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  likesCount: number;
  viewsCount: number;
  defaultTab?: 'likes' | 'views';
}

const PAGE = 40;

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
  const [tab, setTab] = useState<'likes' | 'views'>(defaultTab);
  const [query, setQuery] = useState('');

  const [likes, setLikes] = useState<LikeRow[]>([]);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [loadingViews, setLoadingViews] = useState(false);
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  const attachProfiles = async <T extends { user_id: string }>(rows: T[]): Promise<Array<T & { profile?: Profile }>> => {
    const ids = Array.from(new Set(rows.map(r => r.user_id)));
    if (!ids.length) return rows;
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified')
      .in('id', ids);
    const map = new Map((profiles || []).map((p: any) => [p.id, p]));
    return rows.map(r => ({ ...r, profile: map.get(r.user_id) }));
  };

  const loadLikes = useCallback(async () => {
    setLoadingLikes(true);
    const { data } = await supabase
      .from('post_likes')
      .select('user_id, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .limit(200);
    const rows = ((data as any) || []) as LikeRow[];
    const withProfiles = (await attachProfiles(rows)) as LikeRow[];
    if (user && withProfiles.length) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', withProfiles.map(r => r.user_id));
      const set = new Set((follows || []).map(f => f.following_id));
      setLikes(withProfiles.map(r => ({ ...r, is_following: set.has(r.user_id) })));
    } else {
      setLikes(withProfiles);
    }
    setLoadingLikes(false);
  }, [postId, user]);

  const loadViews = useCallback(async () => {
    setLoadingViews(true);
    const { data } = await supabase
      .from('post_views')
      .select('user_id, viewed_at')
      .eq('post_id', postId)
      .order('viewed_at', { ascending: false })
      .limit(200);
    const rows = ((data as any) || []) as ViewRow[];
    const withProfiles = (await attachProfiles(rows)) as ViewRow[];
    setViews(withProfiles);
    setLoadingViews(false);
  }, [postId]);

  useEffect(() => {
    if (!open || !postId) return;
    if (tab === 'likes' && !likes.length) loadLikes();
    if (tab === 'views' && !views.length) loadViews();
  }, [open, postId, tab, loadLikes, loadViews, likes.length, views.length]);

  // reset when dialog closes or post changes
  useEffect(() => {
    if (!open) {
      setLikes([]);
      setViews([]);
      setQuery('');
    }
  }, [open, postId]);

  const handleFollow = async (targetId: string, following: boolean) => {
    if (!user) return;
    setFollowLoading(targetId);
    try {
      if (following) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
        setLikes(prev => prev.map(u => u.user_id === targetId ? { ...u, is_following: false } : u));
      } else {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
        setLikes(prev => prev.map(u => u.user_id === targetId ? { ...u, is_following: true } : u));
      }
    } catch {
      toast.error('Failed');
    } finally {
      setFollowLoading(null);
    }
  };

  const filterBy = (p?: Profile) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p?.username?.toLowerCase().includes(q) ||
      p?.display_name?.toLowerCase().includes(q)
    );
  };

  const filteredLikes = likes.filter(l => filterBy(l.profile));
  const filteredViews = views.filter(v => filterBy(v.profile));

  const rowClass = 'flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 active:bg-muted transition-colors w-full text-left';

  const openProfile = (username?: string | null, uid?: string) => {
    onOpenChange(false);
    if (username) navigate(`/user/${username}`);
    else if (uid) navigate(`/user/${uid}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <div className="px-4 pt-4 pb-2 border-b">
            <TabsList className="grid w-full grid-cols-2 h-10 p-1 bg-muted/70">
              <TabsTrigger value="likes" className="text-sm data-[state=active]:bg-background gap-1.5">
                <Heart className="h-3.5 w-3.5 text-red-500 fill-current" />
                <span className="font-semibold">{likesCount}</span>
                <span className="text-muted-foreground font-normal">{t('common.likes', 'Likes')}</span>
              </TabsTrigger>
              <TabsTrigger value="views" className="text-sm data-[state=active]:bg-background gap-1.5">
                <Eye className="h-3.5 w-3.5 text-alsamos-orange" />
                <span className="font-semibold tabular-nums">{viewsCount}</span>
                <span className="text-muted-foreground font-normal">{t('post.views', 'Views')}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-4 py-2.5 border-b bg-muted/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('common.search', 'Search')}
                className="pl-9 h-9 bg-background border-border/60 rounded-full text-sm"
              />
            </div>
          </div>

          <TabsContent value="likes" className="m-0">
            <ScrollArea className="h-[55vh]">
              <div className="p-2">
                {loadingLikes ? (
                  <SkeletonRows />
                ) : filteredLikes.length === 0 ? (
                  <EmptyState icon={<Heart className="h-6 w-6" />} label={t('post.noLikes', 'No likes yet')} />
                ) : (
                  filteredLikes.map(l => (
                    <div key={l.user_id} className={rowClass}>
                      <button
                        onClick={() => openProfile(l.profile?.username, l.user_id)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <Avatar className="h-11 w-11 ring-1 ring-border/50">
                          <AvatarImage src={l.profile?.avatar_url || ''} />
                          <AvatarFallback className="bg-gradient-to-br from-alsamos-orange/20 to-alsamos-orange/5 text-alsamos-orange font-medium">
                            {(l.profile?.display_name || l.profile?.username || 'U')[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-sm truncate">
                              {l.profile?.display_name || l.profile?.username || 'User'}
                            </span>
                            {l.profile?.is_verified && <VerifiedBadge size="xs" />}
                          </div>
                          {l.profile?.username && (
                            <p className="text-xs text-muted-foreground truncate">@{l.profile.username}</p>
                          )}
                        </div>
                      </button>
                      {user && user.id !== l.user_id && (
                        <Button
                          size="sm"
                          variant={l.is_following ? 'outline' : 'default'}
                          disabled={followLoading === l.user_id}
                          onClick={() => handleFollow(l.user_id, !!l.is_following)}
                          className="h-8 text-xs shrink-0"
                        >
                          {followLoading === l.user_id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : l.is_following ? t('common.following', 'Following') : t('common.follow', 'Follow')}
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="views" className="m-0">
            <ScrollArea className="h-[55vh]">
              <div className="p-2">
                {loadingViews ? (
                  <SkeletonRows />
                ) : filteredViews.length === 0 ? (
                  <EmptyState icon={<Users className="h-6 w-6" />} label={t('post.noViewers', 'No viewers yet')} />
                ) : (
                  filteredViews.map(v => (
                    <button
                      key={v.user_id}
                      onClick={() => openProfile(v.profile?.username, v.user_id)}
                      className={rowClass}
                    >
                      <Avatar className="h-11 w-11 ring-1 ring-border/50">
                        <AvatarImage src={v.profile?.avatar_url || ''} />
                        <AvatarFallback className="bg-gradient-to-br from-alsamos-orange/20 to-alsamos-orange/5 text-alsamos-orange font-medium">
                          {(v.profile?.display_name || v.profile?.username || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-sm truncate">
                            {v.profile?.display_name || v.profile?.username || t('post.privateUser', 'User')}
                          </span>
                          {v.profile?.is_verified && <VerifiedBadge size="xs" />}
                        </div>
                        {v.profile?.username && (
                          <p className="text-xs text-muted-foreground truncate">@{v.profile.username}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatRelative(v.viewed_at, i18n.language, false)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2.5">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
