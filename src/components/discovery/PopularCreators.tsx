import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, BadgeCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Flutter: lib/features/discovery/presentation/widgets/popular_creators.dart

interface Creator {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number | null;
  is_verified: boolean | null;
  is_following: boolean;
}

interface PopularCreatorsProps {
  refreshKey?: number;
}

function formatCount(count: number | null) {
  const value = count ?? 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export function PopularCreators({ refreshKey = 0 }: PopularCreatorsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const fetchCreators = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    try {
      let query = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, followers_count, is_verified')
        .order('followers_count', { ascending: false })
        .limit(12);

      if (user) query = query.neq('id', user.id);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as unknown as Omit<Creator, 'is_following'>[];

      let followingIds = new Set<string>();
      if (user && rows.length > 0) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .in(
            'following_id',
            rows.map((row) => row.id),
          );
        followingIds = new Set((follows ?? []).map((row) => row.following_id as string));
      }

      setCreators(rows.map((row) => ({ ...row, is_following: followingIds.has(row.id) })));
    } catch (error) {
      console.error('Mashhur ijodkorlarni yuklashda xatolik:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCreators();
  }, [fetchCreators, refreshKey]);

  const toggleFollow = useCallback(
    async (creator: Creator) => {
      if (!user) {
        toast.error('Follow qilish uchun tizimga kiring');
        return;
      }

      triggerHaptic('medium');
      const wasFollowing = creator.is_following;

      const applyLocal = (isFollowing: boolean) => {
        setCreators((prev) =>
          prev.map((item) =>
            item.id === creator.id
              ? {
                  ...item,
                  is_following: isFollowing,
                  followers_count: Math.max(
                    0,
                    (item.followers_count ?? 0) + (isFollowing ? 1 : -1),
                  ),
                }
              : item,
          ),
        );
      };

      applyLocal(!wasFollowing);
      setPendingIds((prev) => [...prev, creator.id]);

      try {
        if (wasFollowing) {
          const { error } = await supabase
            .from('follows')
            .delete()
            .eq('follower_id', user.id)
            .eq('following_id', creator.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('follows')
            .insert({ follower_id: user.id, following_id: creator.id });
          if (error) throw error;
        }
      } catch (error) {
        console.error('Follow amali bajarilmadi:', error);
        applyLocal(wasFollowing);
        toast.error('Amal bajarilmadi, qayta urinib koring');
      } finally {
        setPendingIds((prev) => prev.filter((id) => id !== creator.id));
      }
    },
    [triggerHaptic, user],
  );

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Mashhur ijodkorlar</h2>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          triggerHaptic('light');
          fetchCreators();
        }}
        disabled={isLoading}
        aria-label="Ijodkorlar royxatini yangilash"
      >
        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
      </Button>
    </div>
  );

  if (isLoading && creators.length === 0) {
    return (
      <section aria-busy="true">
        {header}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (hasError) {
    return (
      <section>
        {header}
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Ijodkorlarni yuklab bolmadi.</p>
          <Button variant="outline" size="sm" onClick={fetchCreators}>
            Qayta urinish
          </Button>
        </div>
      </section>
    );
  }

  if (creators.length === 0) return null;

  return (
    <section>
      {header}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {creators.map((creator) => {
          const isPending = pendingIds.includes(creator.id);
          return (
            <div
              key={creator.id}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm"
            >
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  navigate(`/user/${creator.username}`);
                }}
                className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
              >
                <StoryAvatar
                  avatarUrl={creator.avatar_url}
                  username={creator.username}
                  size="md"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-sm font-medium">
                      {creator.display_name || creator.username}
                    </span>
                    {creator.is_verified && (
                      <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{creator.username} - {formatCount(creator.followers_count)} follower
                  </span>
                </span>
              </button>

              <Button
                size="sm"
                variant={creator.is_following ? 'outline' : 'default'}
                onClick={() => toggleFollow(creator)}
                disabled={isPending}
                className="shrink-0"
              >
                {creator.is_following ? 'Kuzatilmoqda' : 'Kuzatish'}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
