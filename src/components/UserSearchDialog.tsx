import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, UserMinus, BadgeCheck, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserSearch, UserProfile } from '@/hooks/useUserSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from 'sonner';

interface UserCardProps {
  user: UserProfile;
  onFollow: (userId: string) => Promise<boolean>;
  onUnfollow: (userId: string) => Promise<boolean>;
  onNavigate: (user: UserProfile) => void;
}

function UserCard({ user, onFollow, onUnfollow, onNavigate }: UserCardProps) {
  const [loading, setLoading] = useState(false);

  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    if (user.is_following) {
      const success = await onUnfollow(user.id);
      if (success) toast.success(`Unfollowed ${user.display_name || user.username}`);
    } else {
      const success = await onFollow(user.id);
      if (success) toast.success(`Following ${user.display_name || user.username}`);
    }
    setLoading(false);
  };

  return (
    <div 
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={() => onNavigate(user)}
    >
      <Avatar className="h-12 w-12">
        <AvatarImage src={user.avatar_url || undefined} />
        <AvatarFallback>
          {(user.display_name || user.username || 'U')[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium truncate">
            {user.display_name || user.username}
          </span>
          {user.is_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
        </div>
        {user.username && (
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        )}
        {user.bio && (
          <p className="text-sm text-muted-foreground truncate">{user.bio}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {user.followers_count || 0} followers
        </p>
      </div>
      <Button
        variant={user.is_following ? 'outline' : 'default'}
        size="sm"
        onClick={handleFollowToggle}
        disabled={loading}
      >
        {user.is_following ? (
          <>
            <UserMinus className="h-4 w-4 mr-1" />
            Unfollow
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4 mr-1" />
            Follow
          </>
        )}
      </Button>
    </div>
  );
}

interface UserSearchDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UserSearchDialog({ children, open: controlledOpen, onOpenChange }: UserSearchDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const navigate = useNavigate();
  
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (onOpenChange || (() => {})) : setUncontrolledOpen;
  
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const { results, loading, suggestedUsers, searchUsers, fetchSuggestedUsers, followUser, unfollowUser } = useUserSearch();

  useEffect(() => {
    if (open) {
      fetchSuggestedUsers();
    }
  }, [open, fetchSuggestedUsers]);

  useEffect(() => {
    searchUsers(debouncedQuery);
  }, [debouncedQuery, searchUsers]);

  const displayUsers = query.trim() ? results : suggestedUsers;

  const handleNavigateToProfile = (user: UserProfile) => {
    setOpen(false);
    navigate(`/user/${user.username || user.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Find People</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or username..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px] -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : displayUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {query ? 'No users found' : 'No suggestions available'}
            </div>
          ) : (
            <div className="space-y-1">
              {!query && (
                <p className="text-sm font-medium text-muted-foreground px-3 py-2">
                  Suggested for you
                </p>
              )}
              {displayUsers.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  onFollow={followUser}
                  onUnfollow={unfollowUser}
                  onNavigate={handleNavigateToProfile}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
