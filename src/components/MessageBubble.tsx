import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCheck, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageAttachment } from './MessageAttachment';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { EmojiPicker } from './EmojiPicker';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Message {
  id: string;
  content: string | null;
  sender_id: string | null;
  media_url: string | null;
  media_type: string | null;
  is_deleted: boolean | null;
  is_edited: boolean | null;
  is_read?: boolean;
  created_at: string;
  sender?: {
    avatar_url: string | null;
    display_name: string | null;
    username: string | null;
  };
}

interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  formatTime: (date: string) => string;
}

export function MessageBubble({ message, isMine, formatTime }: MessageBubbleProps) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<ReactionGroup[]>([]);

  const fetchReactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('message_id', message.id);

    if (!error && data) {
      const grouped = data.reduce((groups, reaction) => {
        const existing = groups.find((g: ReactionGroup) => g.emoji === reaction.emoji);
        if (existing) {
          existing.count++;
          existing.users.push(reaction.user_id);
          if (reaction.user_id === user?.id) {
            existing.hasReacted = true;
          }
        } else {
          groups.push({
            emoji: reaction.emoji,
            count: 1,
            users: [reaction.user_id],
            hasReacted: reaction.user_id === user?.id,
          });
        }
        return groups;
      }, [] as ReactionGroup[]);
      setReactions(grouped);
    }
  }, [message.id, user?.id]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // Subscribe to real-time changes
  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${message.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=eq.${message.id}`,
        },
        () => {
          fetchReactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [message.id, fetchReactions]);

  const toggleReaction = async (emoji: string) => {
    if (!user) return;
    
    const hasReacted = reactions.some(r => r.hasReacted && r.emoji === emoji);
    
    if (hasReacted) {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', message.id)
        .eq('user_id', user.id)
        .eq('emoji', emoji);
    } else {
      await supabase
        .from('message_reactions')
        .insert({
          message_id: message.id,
          user_id: user.id,
          emoji,
        });
    }
  };

  const addReaction = async (emoji: string) => {
    if (!user) return;
    
    await supabase
      .from('message_reactions')
      .insert({
        message_id: message.id,
        user_id: user.id,
        emoji,
      });
  };

  const isVoiceMessage = message.media_type === 'audio' && message.media_url;

  return (
    <div className={cn("flex group", isMine ? "justify-end" : "justify-start")}>
      <div className="flex items-end gap-2 max-w-[70%]">
        {!isMine && (
          <Avatar className="h-8 w-8">
            <AvatarImage src={message.sender?.avatar_url || ''} />
            <AvatarFallback className="text-xs">
              {message.sender?.display_name?.[0] || message.sender?.username?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex flex-col">
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 animate-scale-in",
              isMine 
                ? "bg-primary text-primary-foreground rounded-br-md" 
                : "bg-card text-card-foreground rounded-bl-md border border-border"
            )}
          >
            {message.is_deleted ? (
              <p className="text-sm italic opacity-50">Message deleted</p>
            ) : (
              <>
                {isVoiceMessage ? (
                  <VoiceMessagePlayer url={message.media_url!} isMine={isMine} />
                ) : (
                  <>
                    {message.content && !message.content.startsWith('[') && (
                      <p className="text-sm leading-relaxed">{message.content}</p>
                    )}
                    {message.media_url && message.media_type && (
                      <div className="mt-2">
                        <MessageAttachment 
                          url={message.media_url} 
                          type={message.media_type as 'image' | 'video' | 'audio' | 'document'}
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <div className={cn(
              "flex items-center justify-end gap-1 mt-1",
              isMine ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              <span className="text-xs">{formatTime(message.created_at)}</span>
              {message.is_edited && <span className="text-xs">(edited)</span>}
              {isMine && (
                message.is_read ? (
                  <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )
              )}
            </div>
          </div>
          
          {/* Reactions */}
          <div className={cn("flex flex-wrap gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={() => toggleReaction(reaction.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors",
                  reaction.hasReacted
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-muted hover:bg-accent border border-transparent"
                )}
              >
                <span>{reaction.emoji}</span>
                <span className="font-medium">{reaction.count}</span>
              </button>
            ))}
            <EmojiPicker
              onSelect={addReaction}
              trigger={
                <button className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-6 w-6 rounded-full hover:bg-accent">
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
