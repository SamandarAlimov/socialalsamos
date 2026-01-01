import { useState, useEffect } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  UserPlus, 
  Crown, 
  Shield, 
  MoreVertical,
  UserMinus,
  Check,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

interface GroupMemberManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationName?: string;
  isAdmin: boolean;
}

export function GroupMemberManagement({
  open,
  onOpenChange,
  conversationId,
  conversationName,
  isAdmin,
}: GroupMemberManagementProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  useEffect(() => {
    if (open && conversationId) {
      fetchMembers();
    }
  }, [open, conversationId]);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversation_participants')
        .select(`
          id,
          user_id,
          role,
          joined_at,
          profile:profiles!user_id (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('conversation_id', conversationId);

      if (error) throw error;
      
      // Sort: admins first, then by name
      const sortedMembers = (data || []).sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        const nameA = a.profile?.display_name || a.profile?.username || '';
        const nameB = b.profile?.display_name || b.profile?.username || '';
        return nameA.localeCompare(nameB);
      });
      
      setMembers(sortedMembers as Member[]);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast({
        title: 'Error',
        description: 'Failed to load members',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;
      
      // Filter out existing members
      const existingIds = members.map(m => m.user_id);
      const filtered = (data || []).filter(u => !existingIds.includes(u.id));
      setSearchResults(filtered);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearchingUsers(false);
    }
  };

  const addMembers = async () => {
    if (selectedUsers.length === 0) return;

    try {
      const inserts = selectedUsers.map(userId => ({
        conversation_id: conversationId,
        user_id: userId,
        role: 'member',
      }));

      const { error } = await supabase
        .from('conversation_participants')
        .insert(inserts);

      if (error) throw error;

      toast({
        title: 'Members added',
        description: `Added ${selectedUsers.length} member(s) to the group`,
      });

      setSelectedUsers([]);
      setSearchResults([]);
      setSearchQuery('');
      setShowAddMembers(false);
      fetchMembers();
    } catch (error: any) {
      console.error('Error adding members:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add members',
        variant: 'destructive',
      });
    }
  };

  const removeMember = async (memberId: string, userId: string) => {
    if (userId === user?.id) {
      toast({
        title: 'Error',
        description: 'You cannot remove yourself',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('conversation_participants')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      toast({
        title: 'Member removed',
        description: 'The member has been removed from the group',
      });

      fetchMembers();
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove member',
        variant: 'destructive',
      });
    }
  };

  const updateRole = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      toast({
        title: 'Role updated',
        description: `Member is now ${newRole === 'admin' ? 'an admin' : 'a member'}`,
      });

      fetchMembers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update role',
        variant: 'destructive',
      });
    }
  };

  const filteredMembers = members.filter(member => {
    const name = member.profile?.display_name || member.profile?.username || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const currentUserMember = members.find(m => m.user_id === user?.id);
  const canManage = isAdmin || currentUserMember?.role === 'admin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {showAddMembers ? 'Add Members' : `${conversationName || 'Group'} Members`}
          </DialogTitle>
        </DialogHeader>

        {showAddMembers ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users to add..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchUsers(e.target.value);
                }}
                className="pl-10"
                autoFocus
              />
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              {searchingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? 'No users found' : 'Search for users to add'}
                </div>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((userResult) => (
                    <button
                      key={userResult.id}
                      onClick={() => {
                        setSelectedUsers(prev =>
                          prev.includes(userResult.id)
                            ? prev.filter(id => id !== userResult.id)
                            : [...prev, userResult.id]
                        );
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors",
                        selectedUsers.includes(userResult.id)
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-accent"
                      )}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={userResult.avatar_url || ''} />
                        <AvatarFallback>
                          {(userResult.display_name || userResult.username)?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">
                            {userResult.display_name || userResult.username}
                          </span>
                          {userResult.is_verified && <VerifiedBadge size="xs" />}
                        </div>
                        {userResult.username && userResult.display_name && (
                          <p className="text-sm text-muted-foreground">@{userResult.username}</p>
                        )}
                      </div>
                      {selectedUsers.includes(userResult.id) && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="flex gap-2 pt-4 border-t mt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowAddMembers(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setSelectedUsers([]);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={addMembers}
                disabled={selectedUsers.length === 0}
              >
                Add {selectedUsers.length > 0 && `(${selectedUsers.length})`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              {canManage && (
                <Button size="icon" onClick={() => setShowAddMembers(true)}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="text-sm text-muted-foreground mb-2">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.profile?.avatar_url || ''} />
                        <AvatarFallback>
                          {(member.profile?.display_name || member.profile?.username)?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium truncate">
                            {member.profile?.display_name || member.profile?.username}
                          </span>
                          {member.profile?.is_verified && <VerifiedBadge size="xs" />}
                          {member.user_id === user?.id && (
                            <Badge variant="outline" className="ml-1 text-xs">You</Badge>
                          )}
                        </div>
                        {member.profile?.username && member.profile?.display_name && (
                          <p className="text-sm text-muted-foreground truncate">
                            @{member.profile.username}
                          </p>
                        )}
                      </div>

                      {member.role === 'admin' && (
                        <Badge variant="secondary" className="gap-1">
                          <Crown className="h-3 w-3" />
                          Admin
                        </Badge>
                      )}

                      {canManage && member.user_id !== user?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {member.role === 'admin' ? (
                              <DropdownMenuItem onClick={() => updateRole(member.id, 'member')}>
                                <Shield className="h-4 w-4 mr-2" />
                                Remove Admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => updateRole(member.id, 'admin')}>
                                <Crown className="h-4 w-4 mr-2" />
                                Make Admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => removeMember(member.id, member.user_id)}
                              className="text-destructive"
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove from Group
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}