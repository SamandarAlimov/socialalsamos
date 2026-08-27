import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, UserPlus, UserRoundX, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { OnlineIndicator } from '@/components/OnlineIndicator';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { toast } from 'sonner';

interface FollowUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  is_following?: boolean;
}

interface FollowersFollowingDialogProps {
  userId: string;
  type: 'followers' | 'following';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FollowersFollowingDialog({
  userId,
  type,
  open,
  onOpenChange,
}: FollowersFollowingDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const isFollowers = type === 'followers';
    const relationColumn = isFollowers ? 'following_id' : 'follower_id';
    const profileJoin = isFollowers
      ? 'profiles:profiles!follows_follower_id_fkey'
      : 'profiles:profiles!follows_following_id_fkey';

    try {
      const { data, error } = await supabase
        .from('follows')
        .select(
          `
            follower_id,
            following_id,
            ${profileJoin} (
              id,
              username,
              display_name,
              avatar_url,
              is_verified
            )
          `,
        )
        .eq(relationColumn, userId);

      if (error) throw error;

      const usersList = (data || [])
        .map((row: Record<string, unknown>) => row.profiles)
        .filter(Boolean) as FollowUser[];

      if (user) {
        const { data: followingData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        const followingIds = new Set(followingData?.map((f) => f.following_id) || []);

        setUsers(
          usersList.map((item) => ({
            ...item,
            is_following: followingIds.has(item.id),
          })),
        );
      } else {
        setUsers(usersList);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error(t('profile.followList.loadError', { defaultValue: "Ro'yxatni yuklab bo'lmadi" }));
    } finally {
      setLoading(false);
    }
  }, [userId, type, user, t]);

  useEffect(() => {
    if (open) {
      setQuery('');
      fetchUsers();
    }
  }, [open, fetchUsers]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;

    return users.filter((item) => {
      const name = (item.display_name || '').toLowerCase();
      const handle = (item.username || '').toLowerCase();
      return name.includes(term) || handle.includes(term);
    });
  }, [users, query]);

  const handleFollow = async (targetUserId: string, isFollowing: boolean) => {
    if (!user) return;
    setPendingId(targetUserId);

    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetUserId });
      }

      setUsers((prev) =>
        prev.map((item) =>
          item.id === targetUserId ? { ...item, is_following: !isFollowing } : item,
        ),
      );
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error(t('profile.followList.followError', { defaultValue: "Amalni bajarib bo'lmadi" }));
    } finally {
      setPendingId(null);
    }
  };

  const handleUserClick = (target: FollowUser) => {
    onOpenChange(false);
    navigate(`/user/${target.username || target.id}`);
  };

  const title =
    type === 'followers'
      ? t('profile.stats.followers', { defaultValue: 'Kuzatuvchilar' })
      : t('profile.stats.following', { defaultValue: 'Kuzatilayotganlar' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-md flex-col overflow-hidden">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2">
            {title}
            {!loading && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {users.length}
              </span>
            )}
          </DialogTitle>

          {/* Search inside the list */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('profile.followList.searchPlaceholder', {
                defaultValue: 'Ism yoki username bo\u2018yicha qidirish',
              })}
              className="h-10 rounded-full pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('common.clear', { defaultValue: 'Tozalash' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="-mx-6 flex-1 overflow-y-auto px-6">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <UserRoundX className="h-8 w-8 text-muted-foreground/70" />
              <p className="text-sm text-muted-foreground">
                {query
                  ? t('profile.followList.noResults', {
                      defaultValue: 'Hech kim topilmadi',
                    })
                  : type === 'followers'
                    ? t('profile.empty.followers', { defaultValue: "Hozircha kuzatuvchilar yo'q" })
                    : t('profile.empty.following', { defaultValue: "Hozircha hech kim kuzatilmayapti" })}
              </p>
            </div>
          ) : (
            <div className="space-y-1 pb-2">
              {filteredUsers.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-accent/50"
                >
                  <button
                    type="button"
                    onClick={() => handleUserClick(item)}
                    className="relative flex-shrink-0"
                    aria-label={item.display_name || item.username || 'user'}
                  >
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={item.avatar_url || undefined} />
                      <AvatarFallback>
                        {(item.display_name || item.username || 'U')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <OnlineIndicator userId={item.id} size="sm" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUserClick(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm font-medium">
                        {item.display_name || item.username || 'User'}
                      </span>
                      {item.is_verified && <VerifiedBadge size="sm" />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      @{item.username || 'user'}
                    </p>
                  </button>

                  {user && item.id !== user.id && (
                    <Button
                      variant={item.is_following ? 'outline' : 'default'}
                      size="sm"
                      className="gap-1 rounded-full"
                      disabled={pendingId === item.id}
                      onClick={() => handleFollow(item.id, !!item.is_following)}
                    >
                      {!item.is_following && <UserPlus className="h-3.5 w-3.5" />}
                      {item.is_following
                        ? t('profile.following', { defaultValue: 'Kuzatilmoqda' })
                        : t('profile.follow', { defaultValue: 'Kuzatish' })}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
