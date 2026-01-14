import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Check, Search, Send, Users, Megaphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Message } from '@/hooks/useMessages';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  other_participant?: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

interface TelegramForwardDialogProps {
  messages: Message[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TelegramForwardDialog({ messages: forwardMessages, open, onOpenChange }: TelegramForwardDialogProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchConversations();
      setSelectedIds([]);
      setSearchQuery('');
    }
  }, [open, user]);

  const fetchConversations = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id)
        .eq('is_archived', false);

      if (!participations || participations.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const conversationIds = participations.map(p => p.conversation_id);

      const { data: convos } = await supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false });

      const conversationsWithDetails = await Promise.all(
        (convos || []).map(async (conv) => {
          let otherParticipant = null;

          if (conv.type === 'private') {
            const { data: participants } = await supabase
              .from('conversation_participants')
              .select('user_id')
              .eq('conversation_id', conv.id)
              .neq('user_id', user.id)
              .limit(1);

            if (participants && participants.length > 0) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('display_name, username, avatar_url')
                .eq('id', participants[0].user_id)
                .single();

              otherParticipant = profile;
            }
          }

          return {
            ...conv,
            other_participant: otherParticipant,
          };
        })
      );

      setConversations(conversationsWithDetails);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConversationName = (conv: Conversation) => {
    if (conv.type === 'private') {
      return conv.other_participant?.display_name || conv.other_participant?.username || 'Unknown';
    }
    return conv.name || 'Unnamed';
  };

  const getConversationAvatar = (conv: Conversation) => {
    if (conv.type === 'private') {
      return conv.other_participant?.avatar_url;
    }
    return conv.avatar_url;
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const handleForward = async () => {
    if (forwardMessages.length === 0 || !user || selectedIds.length === 0) return;
    setForwarding(true);

    try {
      for (const conversationId of selectedIds) {
        // Forward all messages in order
        for (const msg of forwardMessages) {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: msg.content,
            media_url: msg.media_url,
            media_type: msg.media_type,
          });
        }

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId);
      }

      const msgCount = forwardMessages.length;
      const chatCount = selectedIds.length;
      toast.success(
        `${msgCount} message${msgCount > 1 ? 's' : ''} forwarded to ${chatCount} chat${chatCount > 1 ? 's' : ''}`
      );
      setSelectedIds([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error forwarding messages:', error);
      toast.error('Failed to forward messages');
    } finally {
      setForwarding(false);
    }
  };

  const filteredConversations = conversations.filter(conv => {
    const name = getConversationName(conv);
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Group conversations by type
  const privateChats = filteredConversations.filter(c => c.type === 'private');
  const groupChats = filteredConversations.filter(c => c.type === 'group');
  const channels = filteredConversations.filter(c => c.type === 'channel');

  const ConversationItem = ({ conv }: { conv: Conversation }) => {
    const isSelected = selectedIds.includes(conv.id);
    
    return (
      <button
        onClick={() => toggleSelect(conv.id)}
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-lg transition-all",
          "hover:bg-accent/50 active:bg-accent",
          isSelected && "bg-primary/10"
        )}
      >
        <div className="relative">
          <Avatar className="h-12 w-12">
            <AvatarImage src={getConversationAvatar(conv) || ''} />
            <AvatarFallback className={
              conv.type === 'group' ? 'bg-blue-500 text-white' : 
              conv.type === 'channel' ? 'bg-violet-500 text-white' : 'bg-primary text-primary-foreground'
            }>
              {conv.type === 'group' ? <Users className="h-5 w-5" /> : 
               conv.type === 'channel' ? <Megaphone className="h-5 w-5" /> :
               getConversationName(conv)[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isSelected && (
            <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="font-medium truncate">{getConversationName(conv)}</p>
          {conv.type !== 'private' && (
            <p className="text-xs text-muted-foreground capitalize">{conv.type}</p>
          )}
        </div>
      </button>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2 border-b border-border flex-shrink-0">
          <SheetTitle className="text-center">Forward to...</SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/50"
            />
          </div>
        </div>

        {/* Selected count bar */}
        {selectedIds.length > 0 && (
          <div className="px-4 py-2 bg-primary/5 border-b border-border flex-shrink-0">
            <p className="text-sm text-primary font-medium">
              {selectedIds.length} chat{selectedIds.length > 1 ? 's' : ''} selected
            </p>
          </div>
        )}

        {/* Message preview */}
        {forwardMessages.length > 0 && (
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
            <p className="text-xs text-muted-foreground mb-1">
              {forwardMessages.length === 1 ? 'Message:' : `${forwardMessages.length} messages:`}
            </p>
            {forwardMessages.length === 1 ? (
              <p className="text-sm line-clamp-2">{forwardMessages[0].content || '[Media]'}</p>
            ) : (
              <div className="space-y-1">
                {forwardMessages.slice(0, 3).map((msg, i) => (
                  <p key={msg.id} className="text-sm truncate text-muted-foreground">
                    {i + 1}. {msg.content || '[Media]'}
                  </p>
                ))}
                {forwardMessages.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    ... and {forwardMessages.length - 3} more
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No chats found</p>
            </div>
          ) : (
            <div className="p-2">
              {/* Recent / Private chats */}
              {privateChats.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
                    Private Chats
                  </p>
                  {privateChats.map((conv) => (
                    <ConversationItem key={conv.id} conv={conv} />
                  ))}
                </div>
              )}

              {/* Groups */}
              {groupChats.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
                    Groups
                  </p>
                  {groupChats.map((conv) => (
                    <ConversationItem key={conv.id} conv={conv} />
                  ))}
                </div>
              )}

              {/* Channels */}
              {channels.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
                    Channels
                  </p>
                  {channels.map((conv) => (
                    <ConversationItem key={conv.id} conv={conv} />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Forward button */}
        {selectedIds.length > 0 && (
          <div className="p-4 border-t border-border flex-shrink-0 bg-card">
            <Button
              className="w-full h-12 text-base"
              onClick={handleForward}
              disabled={forwarding}
            >
              {forwarding ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Send className="h-5 w-5 mr-2" />
              )}
              Forward{selectedIds.length > 1 ? ` to ${selectedIds.length} chats` : ''}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
