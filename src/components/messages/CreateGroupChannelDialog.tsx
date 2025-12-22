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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { 
  Search, 
  Users, 
  Megaphone, 
  Lock, 
  ArrowRight, 
  ArrowLeft, 
  Camera, 
  X, 
  Globe,
  Shield,
  Crown,
  UserPlus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ChatType = 'group' | 'channel';
type Step = 'select-type' | 'select-users' | 'details' | 'admin-settings';

interface User {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
}

interface CreateGroupChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (conversationId: string) => void;
  defaultType?: ChatType;
}

export function CreateGroupChannelDialog({
  open,
  onOpenChange,
  onCreated,
  defaultType,
}: CreateGroupChannelDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [chatType, setChatType] = useState<ChatType>(defaultType || 'group');
  const [step, setStep] = useState<Step>(defaultType ? 'select-users' : 'select-type');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [adminUsers, setAdminUsers] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(defaultType ? 'select-users' : 'select-type');
      setChatType(defaultType || 'group');
      setSelectedUsers([]);
      setAdminUsers([]);
      setName('');
      setDescription('');
      setIsPublic(false);
      setSearchQuery('');
      setAvatarUrl(null);
    }
  }, [open, defaultType]);

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

  const handleUserSelect = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAdminToggle = (userId: string) => {
    setAdminUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleNext = () => {
    if (step === 'select-users') {
      setStep('details');
    } else if (step === 'details') {
      setStep('admin-settings');
    }
  };

  const handleBack = () => {
    if (step === 'admin-settings') {
      setStep('details');
    } else if (step === 'details') {
      setStep('select-users');
    } else if (step === 'select-users') {
      setStep('select-type');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('message-attachments')
      .upload(fileName, file);

    if (uploadError) {
      toast({ title: 'Error', description: 'Failed to upload image', variant: 'destructive' });
      return;
    }

    const { data: urlData } = supabase.storage
      .from('message-attachments')
      .getPublicUrl(fileName);

    setAvatarUrl(urlData.publicUrl);
  };

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    
    setCreating(true);
    try {
      // Create conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: chatType,
          name,
          description: description || null,
          avatar_url: avatarUrl,
          owner_id: user.id,
          is_public: isPublic,
          subscribers_count: selectedUsers.length + 1,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add participants with roles
      const participants = [
        { conversation_id: newConv.id, user_id: user.id, role: 'owner' },
        ...selectedUsers.map(id => ({
          conversation_id: newConv.id,
          user_id: id,
          role: adminUsers.includes(id) ? 'admin' : 'member',
        })),
      ];

      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(participants);

      if (partError) throw partError;

      toast({
        title: 'Success',
        description: `${chatType === 'group' ? 'Group' : 'Channel'} created successfully`,
      });

      onCreated?.(newConv.id);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating:', error);
      toast({
        title: 'Error',
        description: `Failed to create ${chatType}`,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const chatTypes = [
    { 
      id: 'group' as ChatType, 
      icon: Users, 
      label: 'New Group', 
      description: 'Up to 200,000 members, admins with roles',
      color: 'bg-blue-500'
    },
    { 
      id: 'channel' as ChatType, 
      icon: Megaphone, 
      label: 'New Channel', 
      description: 'Broadcast to unlimited subscribers',
      color: 'bg-violet-500'
    },
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
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {step === 'select-type' && 'Create New'}
            {step === 'select-users' && 'Add Members'}
            {step === 'details' && `${chatType === 'group' ? 'Group' : 'Channel'} Details`}
            {step === 'admin-settings' && 'Admin Settings'}
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
                <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", type.color)}>
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

            {selectedUsers.length > 0 && (
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
                        className="h-4 w-4 rounded-full hover:bg-primary/20 flex items-center justify-center"
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
                      <Checkbox checked={selectedUsers.includes(u.id)} />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            {selectedUsers.length > 0 && (
              <Button onClick={handleNext} className="w-full">
                Next ({selectedUsers.length} selected)
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-6">
            {/* Avatar Upload */}
            <div className="flex justify-center">
              <label className="relative group cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground group-hover:text-foreground transition-colors" />
                  )}
                </div>
                <span className="absolute bottom-0 right-0 h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                  <Camera className="h-4 w-4" />
                </span>
              </label>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">{chatType === 'group' ? 'Group' : 'Channel'} Name</Label>
                <Input
                  id="name"
                  placeholder={chatType === 'group' ? 'My Awesome Group' : 'My Channel'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="What's this about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1.5 resize-none"
                  rows={3}
                />
              </div>

              {/* Public/Private toggle */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  {isPublic ? (
                    <Globe className="h-5 w-5 text-primary" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium text-sm">
                      {isPublic ? 'Public' : 'Private'} {chatType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isPublic 
                        ? 'Anyone can find and join'
                        : 'Only invited members can join'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
              </div>

              <p className="text-sm text-muted-foreground">
                {selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} will be added
              </p>
            </div>

            <Button 
              onClick={handleNext}
              disabled={!name.trim()}
              className="w-full"
            >
              Set Admin Roles
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 'admin-settings' && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-primary" />
                <p className="font-medium text-sm">Admin Permissions</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Admins can add/remove members, pin messages, and manage settings.
              </p>
            </div>

            <ScrollArea className="h-[250px]">
              <div className="space-y-2">
                {/* Owner (current user) */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>You</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">You</p>
                      <p className="text-xs text-muted-foreground">Owner</p>
                    </div>
                  </div>
                  <Crown className="h-5 w-5 text-primary" />
                </div>

                {selectedUsers.map(userId => {
                  const selectedUser = users.find(u => u.id === userId);
                  const isAdmin = adminUsers.includes(userId);
                  return (
                    <div
                      key={userId}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg transition-colors",
                        isAdmin ? "bg-blue-500/10 border border-blue-500/20" : "bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={selectedUser?.avatar_url || ''} />
                          <AvatarFallback>
                            {(selectedUser?.display_name || selectedUser?.username || 'U')[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">
                            {selectedUser?.display_name || selectedUser?.username}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isAdmin ? 'Admin' : 'Member'}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant={isAdmin ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => handleAdminToggle(userId)}
                      >
                        {isAdmin ? (
                          <>
                            <Shield className="h-4 w-4 mr-1" />
                            Admin
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-1" />
                            Make Admin
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <Button 
              onClick={handleCreate} 
              disabled={creating}
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
