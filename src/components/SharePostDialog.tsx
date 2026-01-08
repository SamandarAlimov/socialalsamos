import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Copy, 
  Check, 
  Search,
  Send,
  Users,
  Loader2,
  Twitter,
  Facebook,
  MessageCircle as WhatsApp,
  Mail,
  Link2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Conversation {
  id: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  participant?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface SharePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  postContent?: string;
}

export function SharePostDialog({ 
  open, 
  onOpenChange, 
  postId,
  postContent
}: SharePostDialogProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  
  const shareUrl = `${window.location.origin}/post/${postId}`;
  const shareText = postContent ? postContent.substring(0, 100) : 'Check out this post!';

  useEffect(() => {
    if (open && user) {
      fetchConversations();
    }
  }, [open, user]);

  const fetchConversations = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Get user's conversations
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (!participations) {
        setConversations([]);
        setIsLoading(false);
        return;
      }

      const conversationIds = participations.map(p => p.conversation_id);

      const { data: convos } = await supabase
        .from('conversations')
        .select('id, type, name, avatar_url')
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false });

      if (!convos) {
        setConversations([]);
        setIsLoading(false);
        return;
      }

      // For private conversations, get the other participant
      const processedConvos: Conversation[] = [];
      
      for (const convo of convos) {
        if (convo.type === 'private') {
          // Get other participant
          const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', convo.id)
            .neq('user_id', user.id)
            .limit(1);

          if (participants && participants.length > 0) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .eq('id', participants[0].user_id)
              .single();

            if (profile) {
              processedConvos.push({
                ...convo,
                participant: profile
              });
            }
          }
        } else {
          processedConvos.push(convo);
        }
      }

      setConversations(processedConvos);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const handleSend = async () => {
    if (selectedIds.length === 0 || !user) return;
    
    setIsSending(true);
    
    try {
      // Send message to each selected conversation
      for (const conversationId of selectedIds) {
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: postContent ? `Shared a post: "${postContent.substring(0, 50)}..."` : 'Shared a post',
            shared_post_id: postId,
          });

        // Update conversation last_message_at
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId);
      }

      toast.success(`Shared to ${selectedIds.length} chat${selectedIds.length > 1 ? 's' : ''}`);
      setSelectedIds([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error sharing post:', error);
      toast.error('Failed to share post');
    } finally {
      setIsSending(false);
    }
  };

  const filteredConversations = conversations.filter(c => {
    const searchLower = search.toLowerCase();
    if (c.type === 'private' && c.participant) {
      return (
        c.participant.username?.toLowerCase().includes(searchLower) ||
        c.participant.display_name?.toLowerCase().includes(searchLower)
      );
    }
    return c.name?.toLowerCase().includes(searchLower);
  });

  const externalShareOptions = [
    {
      name: 'Twitter',
      icon: Twitter,
      color: 'hover:bg-[#1DA1F2]/10 hover:text-[#1DA1F2]',
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: 'Facebook',
      icon: Facebook,
      color: 'hover:bg-[#4267B2]/10 hover:text-[#4267B2]',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: 'WhatsApp',
      icon: WhatsApp,
      color: 'hover:bg-[#25D366]/10 hover:text-[#25D366]',
      url: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
    },
    {
      name: 'Email',
      icon: Mail,
      color: 'hover:bg-muted',
      url: `mailto:?subject=${encodeURIComponent('Check out this post')}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
    },
  ];

  const content = (
    <div className="space-y-4">
      <Tabs defaultValue="internal" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="internal">Send to Chat</TabsTrigger>
          <TabsTrigger value="external">Share Externally</TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="space-y-4 mt-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Conversations List */}
          <ScrollArea className="h-64">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {search ? 'No conversations found' : 'No conversations yet'}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredConversations.map((convo) => {
                  const isSelected = selectedIds.includes(convo.id);
                  const displayName = convo.type === 'private' && convo.participant
                    ? convo.participant.display_name || convo.participant.username
                    : convo.name;
                  const avatarUrl = convo.type === 'private' && convo.participant
                    ? convo.participant.avatar_url
                    : convo.avatar_url;
                  const isGroup = convo.type === 'group' || convo.type === 'channel';

                  return (
                    <div
                      key={convo.id}
                      onClick={() => toggleSelection(convo.id)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                        isSelected 
                          ? "bg-primary/10 border border-primary/30" 
                          : "hover:bg-muted/50"
                      )}
                    >
                      <Checkbox 
                        checked={isSelected}
                        className="pointer-events-none"
                      />
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={avatarUrl || ''} />
                        <AvatarFallback>
                          {isGroup ? (
                            <Users className="h-5 w-5" />
                          ) : (
                            displayName?.[0]?.toUpperCase() || 'U'
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{displayName || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground capitalize">{convo.type}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={selectedIds.length === 0 || isSending}
            className="w-full"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send to {selectedIds.length || ''} chat{selectedIds.length !== 1 ? 's' : ''}
          </Button>
        </TabsContent>

        <TabsContent value="external" className="space-y-4 mt-4">
          {/* Link Copy */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={shareUrl}
                readOnly
                className="pl-10 pr-4 bg-muted/50"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* External Share Buttons */}
          <div className="grid grid-cols-4 gap-2">
            {externalShareOptions.map((option) => (
              <Button
                key={option.name}
                variant="ghost"
                className={`flex flex-col items-center gap-1 h-auto py-3 ${option.color}`}
                onClick={() => window.open(option.url, '_blank', 'width=600,height=400')}
              >
                <option.icon className="h-5 w-5" />
                <span className="text-xs">{option.name}</span>
              </Button>
            ))}
          </div>

          {/* Native Share */}
          {navigator.share && (
            <Button 
              variant="default" 
              className="w-full"
              onClick={async () => {
                try {
                  await navigator.share({
                    title: 'Check out this post',
                    text: shareText,
                    url: shareUrl,
                  });
                } catch (err) {
                  if ((err as Error).name !== 'AbortError') {
                    toast.error('Failed to share');
                  }
                }
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              Share via...
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Share Post</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Post</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
