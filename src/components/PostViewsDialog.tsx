import { useState, useEffect } from 'react';
import { Eye, Search, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { uz } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { VerifiedBadge } from '@/components/VerifiedBadge';

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

export function PostViewsDialog({ postId, viewsCount, className, iconClassName, textClassName }: PostViewsDialogProps) {
  const [open, setOpen] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    supabase
      .from('post_views')
      .select(`
        user_id,
        viewed_at,
        profile:profiles!post_views_user_id_fkey (
          username,
          display_name,
          avatar_url,
          is_verified
        )
      `)
      .eq('post_id', postId)
      .order('viewed_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setViewers((data as any[]) || []);
        setLoading(false);
      });
  }, [open, postId]);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

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
          <span className={cn('text-xs font-medium tabular-nums', textClassName)}>{formatCount(viewsCount)}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold">
            <div className="h-8 w-8 rounded-full bg-alsamos-orange/10 flex items-center justify-center">
              <Eye className="h-4 w-4 text-alsamos-orange" />
            </div>
            <div className="flex flex-col items-start">
              <span>Ko'rganlar</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {formatCount(viewsCount)} ta ko'rish
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
              placeholder="Qidirish..."
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
                <p className="text-sm font-medium">
                  {query ? 'Hech narsa topilmadi' : 'Hali hech kim ko\'rmagan'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {query ? 'Boshqa kalit so\'z bilan urinib ko\'ring' : 'Postni birinchi bo\'lib kuzating'}
                </p>
              </div>
            ) : (
              filtered.map((viewer) => (
                <button
                  key={viewer.user_id}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/user/${viewer.profile?.username || viewer.user_id}`);
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 active:bg-muted w-full text-left transition-colors"
                >
                  <Avatar className="h-11 w-11 ring-1 ring-border/50">
                    <AvatarImage src={viewer.profile?.avatar_url || ''} />
                    <AvatarFallback className="bg-gradient-to-br from-alsamos-orange/20 to-alsamos-orange/5 text-alsamos-orange font-medium">
                      {(viewer.profile?.display_name || viewer.profile?.username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm truncate">
                        {viewer.profile?.display_name || viewer.profile?.username || 'Foydalanuvchi'}
                      </span>
                      {viewer.profile?.is_verified && <VerifiedBadge size="xs" />}
                    </div>
                    {viewer.profile?.username && viewer.profile?.display_name && (
                      <p className="text-xs text-muted-foreground truncate">
                        @{viewer.profile.username}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                    {formatDistanceToNow(new Date(viewer.viewed_at), { addSuffix: false, locale: uz })}
                  </span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
