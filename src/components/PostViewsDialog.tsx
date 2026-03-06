import { useState, useEffect } from 'react';
import { Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
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
      .limit(100)
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={cn("flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors touch-feedback", className)}>
          <Eye className={cn("h-4 w-4", iconClassName)} />
          <span className={cn("text-xs font-medium", textClassName)}>{formatCount(viewsCount)}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Ko'rganlar ({formatCount(viewsCount)})
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-1">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))
            ) : viewers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Hali hech kim ko'rmagan</p>
            ) : (
              viewers.map((viewer) => (
                <button
                  key={viewer.user_id}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/user/${viewer.profile?.username || viewer.user_id}`);
                  }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 w-full text-left transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={viewer.profile?.avatar_url || ''} />
                    <AvatarFallback>
                      {(viewer.profile?.display_name || viewer.profile?.username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm truncate">
                        {viewer.profile?.display_name || viewer.profile?.username || 'User'}
                      </span>
                      {viewer.profile?.is_verified && <VerifiedBadge size="xs" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(viewer.viewed_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
