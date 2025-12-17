import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Users, Megaphone, Lock, ArrowRight, ArrowLeft, Camera, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type ChatType = 'private' | 'group' | 'channel' | 'secret';
type Step = 'select-type' | 'select-users' | 'group-details';

interface User {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
}

interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreatePrivate: (userId: string) => Promise<any>;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<any>;
  onCreateChannel?: (name: string, description: string) => Promise<any>;
}

export function CreateChatDialog({
  open,
  onOpenChange,
  onCreatePrivate,
  onCreateGroup,
  onCreateChannel,
}: CreateChatDialogProps) {
  const { user } = useAuth();
  const [chatType, setChatType] = useState<ChatType>('private');
  const [step, setStep] = useState<Step>('select-type');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('select-type');
      setSelectedUsers([]);
      setGroupName('');
      setGroupDescription('');
      setSearchQuery('');
    }
  }, [open]);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user || step !== 'select-users') return;
      setLoading(true);

      let query = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online')
        .neq('id', user.id)
        .limit(50);

      if (searchQuery) {
        query = query.or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (!error && data) {
        setUsers(data);
      }
      setLoading(false);
    };

    fetchUsers();
  }, [user, step, searchQuery]);

  const handleTypeSelect = (type: ChatType) => {
    setChatType(type);
    setStep('select-users');
  };

  const handleUserSelect = async (userId: string) => {
    if (chatType === 'private') {
      setCreating(true);
      try {
        await onCreatePrivate(userId);
        onOpenChange(false);
      } finally {
        setCreating(false);
      }
    } else {
      setSelectedUsers(prev =>
        prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
      );
    }
  };

  const handleNext = () => {
    if (chatType === 'group' || chatType === 'channel') {
      setStep('group-details');
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    
    setCreating(true);
    try {
      if (chatType === 'group') {
        await onCreateGroup(groupName, selectedUsers);
      } else if (chatType === 'channel' && onCreateChannel) {
        await onCreateChannel(groupName, groupDescription);
      }
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  const chatTypes = [
    { id: 'private' as ChatType, icon: Users, label: 'New Private Chat', description: 'Start a one-on-one conversation' },
    { id: 'group' as ChatType, icon: Users, label: 'New Group', description: 'Create a group for friends or colleagues' },
    { id: 'channel' as ChatType, icon: Megaphone, label: 'New Channel', description: 'Broadcast messages to subscribers' },
    { id: 'secret' as ChatType, icon: Lock, label: 'New Secret Chat', description: 'End-to-end encrypted messages' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== 'select-type' && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 -ml-2"
                onClick={() => setStep(step === 'group-details' ? 'select-users' : 'select-type')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {step === 'select-type' && 'New Chat'}
            {step === 'select-users' && (chatType === 'private' ? 'Select User' : 'Add Members')}
            {step === 'group-details' && (chatType === 'group' ? 'Group Details' : 'Channel Details')}
          </DialogTitle>
        </DialogHeader>

        {step === 'select-type' && (
          <div className="space-y-2">
            {chatTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => handleTypeSelect(type.id)}
                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-accent transition-colors text-left"
              >
                <div className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center",
                  type.id === 'private' && 'bg-primary',
                  type.id === 'group' && 'bg-blue-500',
                  type.id === 'channel' && 'bg-violet-500',
                  type.id === 'secret' && 'bg-green-500'
                )}>
                  <type.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-medium">{type.label}</p>
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 'select-users' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {(chatType === 'group' || chatType === 'channel') && selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map(userId => {
                  const selectedUser = users.find(u => u.id === userId);
                  return (
                    <div
                      key={userId}
                      className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-full text-sm"
                    >
                      <span>{selectedUser?.display_name || selectedUser?.username}</span>
                      <button
                        onClick={() => handleUserSelect(userId)}
                        className="h-4 w-4 rounded-full hover:bg-primary/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <ScrollArea className="h-[300px]">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No users found
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleUserSelect(u.id)}
                      disabled={creating}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.avatar_url || ''} />
                          <AvatarFallback>
                            {(u.display_name || u.username || 'U')[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {u.is_online && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-card" />
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-sm">{u.display_name || u.username}</p>
                        {u.username && u.display_name && (
                          <p className="text-xs text-muted-foreground">@{u.username}</p>
                        )}
                      </div>
                      {(chatType === 'group' || chatType === 'channel') && (
                        <Checkbox checked={selectedUsers.includes(u.id)} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            {(chatType === 'group' || chatType === 'channel') && selectedUsers.length > 0 && (
              <Button onClick={handleNext} className="w-full">
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        )}

        {step === 'group-details' && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <button className="relative group">
                <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                  <Camera className="h-8 w-8 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <span className="absolute bottom-0 right-0 h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                  <Camera className="h-4 w-4" />
                </span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Input
                  placeholder={chatType === 'group' ? 'Group Name' : 'Channel Name'}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
              
              {chatType === 'channel' && (
                <div>
                  <Input
                    placeholder="Description (optional)"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                  />
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                {selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} selected
              </p>
            </div>

            <Button 
              onClick={handleCreate} 
              disabled={!groupName.trim() || creating}
              className="w-full"
            >
              {creating ? 'Creating...' : `Create ${chatType === 'group' ? 'Group' : 'Channel'}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
