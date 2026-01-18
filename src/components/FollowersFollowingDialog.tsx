import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
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
  onOpenChange 
}: FollowersFollowingDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      if (type === 'followers') {
        const { data, error } = await supabase
          .from('follows')
          .select(`
            follower_id,
            profiles:profiles!follows_follower_id_fkey (
              id,
              username,
              display_name,
              avatar_url,
              is_verified
            )
          `)
          .eq('following_id', userId);

        if (error) throw error;

        const usersList = data?.map(f => f.profiles).filter(Boolean) as FollowUser[];
        
        // Check if current user is following these users
        if (user) {
          const { data: followingData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);
          
          const followingIds = new Set(followingData?.map(f => f.following_id) || []);
          
          setUsers(usersList.map(u => ({
            ...u,
            is_following: followingIds.has(u.id)
          })));
        } else {
          setUsers(usersList);
        }
      } else {
        const { data, error } = await supabase
          .from('follows')
          .select(`
            following_id,
            profiles:profiles!follows_following_id_fkey (
              id,
              username,
              display_name,
              avatar_url,
              is_verified
            )
          `)
          .eq('follower_id', userId);

        if (error) throw error;

        const usersList = data?.map(f => f.profiles).filter(Boolean) as FollowUser[];
        
        // Check if current user is following these users
        if (user) {
          const { data: followingData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);
          
          const followingIds = new Set(followingData?.map(f => f.following_id) || []);
          
          setUsers(usersList.map(u => ({
            ...u,
            is_following: followingIds.has(u.id)
          })));
        } else {
          setUsers(usersList);
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [userId, type, user]);

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open, fetchUsers]);

  const handleFollow = async (targetUserId: string, isFollowing: boolean) => {
    if (!user) return;

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

      setUsers(prev => prev.map(u => 
        u.id === targetUserId 
          ? { ...u, is_following: !isFollowing }
          : u
      ));
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Failed to update follow status');
    }
  };

  const handleUserClick = (user: FollowUser) => {
    onOpenChange(false);
    navigate(`/user/${user.username || user.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {type === 'followers' ? 'Followers' : 'Following'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div 
                  key={u.id} 
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <Avatar 
                    className="h-10 w-10 cursor-pointer"
                    onClick={() => handleUserClick(u)}
                  >
                    <AvatarImage src={u.avatar_url || undefined} />
                    <AvatarFallback>
                      {(u.display_name || u.username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleUserClick(u)}
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm truncate">
                        {u.display_name || u.username || 'User'}
                      </span>
                      {u.is_verified && (
                        <svg className="h-4 w-4 text-primary flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      @{u.username || 'user'}
                    </p>
                  </div>

                  {user && u.id !== user.id && (
                    <Button
                      variant={u.is_following ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => handleFollow(u.id, !!u.is_following)}
                    >
                      {u.is_following ? 'Following' : 'Follow'}
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
