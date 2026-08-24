import { useState, useEffect } from 'react';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Send, Users, Megaphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Message } from '@/hooks/useMessages';

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

interface ForwardMessageDialogProps {
  message: Message | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ForwardMessageDialog({ message, open, onOpenChange }: ForwardMessageDialogProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchConversations();
    }
  }, [open, user]);

  const fetchConversations = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

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
    if (!message || !user || selectedIds.length === 0) return;
    setForwarding(true);

    try {
      const forwardContent = message.media_url 
        ? `Forwarded: ${message.content || '[Media]'}`
        : `Forwarded: ${message.content}`;

      for (const conversationId of selectedIds) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: forwardContent,
          media_url: message.media_url,
          media_type: message.media_type,
        });

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId);
      }

      toast.success(`Message forwarded to ${selectedIds.length} conversation(s)`);
      setSelectedIds([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error forwarding message:', error);
      toast.error('Failed to forward message');
    } finally {
      setForwarding(false);
    }
  };

  const filteredConversations = conversations.filter(conv => {
    const name = getConversationName(conv);
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Forward Message</DialogTitle>
        </DialogHeader>

        <div className="relative mb-4">
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="h-4 w-4" />}
          />
        </div>

        {/* Message Preview */}
        {message && (
          <div className="p-3 bg-muted rounded-lg mb-4">
            <p className="text-xs text-muted-foreground mb-1">Forwarding:</p>
            <p className="text-sm line-clamp-2">{message.content || '[Media]'}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No conversations found
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <label
                key={conv.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <Checkbox
                  checked={selectedIds.includes(conv.id)}
                  onCheckedChange={() => toggleSelect(conv.id)}
                />
                <Avatar className="h-10 w-10">
                  <AvatarImage src={getConversationAvatar(conv) || ''} />
                  <AvatarFallback className={
                    conv.type === 'group' ? 'bg-blue-500' : 
                    conv.type === 'channel' ? 'bg-violet-500' : 'bg-primary'
                  }>
                    {conv.type === 'group' ? <Users className="h-5 w-5 text-primary-foreground" /> : 
                     conv.type === 'channel' ? <Megaphone className="h-5 w-5 text-primary-foreground" /> :
                     getConversationName(conv)[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 font-medium text-sm truncate">
                  {getConversationName(conv)}
                </span>
              </label>
            ))
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleForward} 
            disabled={selectedIds.length === 0 || forwarding}
          >
            {forwarding ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Forward {selectedIds.length > 0 && `(${selectedIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
