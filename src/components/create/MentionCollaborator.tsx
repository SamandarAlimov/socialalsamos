import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { Search, X, AtSign, Users, UserPlus, Check } from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

interface MentionCollaboratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUsers: Profile[];
  onSelectUser: (user: Profile) => void;
  onRemoveUser: (userId: string) => void;
  mode?: 'mention' | 'collaborate';
  maxUsers?: number;
}

export function MentionCollaborator({
  open,
  onOpenChange,
  selectedUsers,
  onSelectUser,
  onRemoveUser,
  mode = 'mention',
  maxUsers = 10
}: MentionCollaboratorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    const searchUsers = async () => {
      if (!debouncedSearch.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_verified')
          .or(`username.ilike.%${debouncedSearch}%,display_name.ilike.%${debouncedSearch}%`)
          .limit(20);

        if (!error && data) {
          setSearchResults(data.filter(u => !selectedUsers.find(s => s.id === u.id)));
        }
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsSearching(false);
      }
    };

    searchUsers();
  }, [debouncedSearch, selectedUsers]);

  const handleSelectUser = (user: Profile) => {
    if (selectedUsers.length >= maxUsers) return;
    onSelectUser(user);
    setSearchQuery('');
  };

  const isCollabMode = mode === 'collaborate';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCollabMode ? (
              <>
                <Users className="h-5 w-5 text-primary" />
                Collaborate With
              </>
            ) : (
              <>
                <AtSign className="h-5 w-5 text-primary" />
                Mention People
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Selected Users */}
        {selectedUsers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {isCollabMode ? 'Collaborators' : 'Mentioned'} ({selectedUsers.length}/{maxUsers})
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map(user => (
                <Badge 
                  key={user.id} 
                  variant="secondary" 
                  className="gap-1 py-1 pl-1 pr-2"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={user.avatar_url || ''} />
                    <AvatarFallback className="text-[10px]">
                      {user.display_name?.[0] || user.username[0]}
                    </AvatarFallback>
                  </Avatar>
                  @{user.username}
                  <button 
                    onClick={() => onRemoveUser(user.id)}
                    className="ml-1 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username or name..."
            className="pl-9"
            disabled={selectedUsers.length >= maxUsers}
          />
        </div>

        {/* Search Results */}
        <ScrollArea className="h-[250px]">
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No users found' : 'Search for users to add'}
            </div>
          ) : (
            <div className="space-y-1">
              {searchResults.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  disabled={selectedUsers.length >= maxUsers}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left",
                    selectedUsers.length >= maxUsers
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-secondary/50"
                  )}
                >
                  <Avatar>
                    <AvatarImage src={user.avatar_url || ''} />
                    <AvatarFallback>
                      {user.display_name?.[0] || user.username[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate flex items-center gap-1">
                      {user.display_name}
                      {user.is_verified && (
                        <span className="text-primary text-xs">✓</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      @{user.username}
                    </p>
                  </div>
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Done Button */}
        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>
            <Check className="h-4 w-4 mr-2" />
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
