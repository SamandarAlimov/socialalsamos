import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Loader2, Heart, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LikeUser {
  id: string;
  user_id: string;
  created_at: string;
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

interface PostLikesDialogProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  likesCount: number;
}

export function PostLikesDialog({ postId, open, onOpenChange, likesCount }: PostLikesDialogProps) {
  const [users, setUsers] = useState<LikeUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && postId) {
      fetchLikes();
    }
  }, [open, postId]);

  const fetchLikes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('post_likes')
        .select(`
          id,
          user_id,
          created_at,
          profile:profiles!post_likes_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers((data as unknown as LikeUser[]) || []);
    } catch (error) {
      console.error('Error fetching likes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500 fill-current" />
            <span>Likes</span>
            <span className="text-muted-foreground font-normal">({likesCount})</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">No likes yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((like) => (
                <Link
                  key={like.id}
                  to={`/user/${like.user_id}`}
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={like.profile?.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {(like.profile?.display_name || like.profile?.username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm truncate">
                        {like.profile?.display_name || like.profile?.username || 'User'}
                      </span>
                      {like.profile?.is_verified && <VerifiedBadge size="xs" />}
                    </div>
                    {like.profile?.username && (
                      <p className="text-xs text-muted-foreground truncate">
                        @{like.profile.username}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
