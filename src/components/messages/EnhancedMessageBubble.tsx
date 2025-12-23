import { useState, useCallback, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCheck, Plus, Clock, AlertCircle, Reply as ReplyIcon, Forward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageAttachment } from '@/components/MessageAttachment';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { EmojiPicker } from '@/components/EmojiPicker';
import { MessageContextMenu } from './MessageContextMenu';
import { LocationMessage } from './LocationMessage';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

interface Message {
  id: string;
  conversation_id: string;
  content: string | null;
  sender_id: string | null;
  media_url: string | null;
  media_type: string | null;
  is_deleted: boolean | null;
  is_edited: boolean | null;
  reply_to_id: string | null;
  is_read?: boolean;
  created_at: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  tempId?: string;
  sender?: {
    id: string;
    avatar_url: string | null;
    display_name: string | null;
    username: string | null;
  };
  forwarded_from?: {
    sender_name: string;
    original_content: string;
  };
}

interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

interface EnhancedMessageBubbleProps {
  message: Message;
  isMine: boolean;
  isGroup?: boolean;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  showAvatar?: boolean;
  showSender?: boolean;
}

export function EnhancedMessageBubble({
  message,
  isMine,
  isGroup = false,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onPin,
  showAvatar = true,
  showSender = false,
}: EnhancedMessageBubbleProps) {
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
        () => fetchReactions()
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

  const copyToClipboard = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
    }
  };

  const formatTime = (date: string) => format(new Date(date), 'HH:mm');
  const formatFullTime = (date: string) => format(new Date(date), 'HH:mm · dd.MM.yyyy');

  const isVoiceMessage = message.media_type === 'audio' && message.media_url;
  
  // Check for location message - either via media_type or text format
  const isLocationFromMediaType = message.media_type === 'location' && message.media_url;
  const isLocationFromText = message.content?.startsWith('📍 LOCATION:');
  const isLocationMessage = isLocationFromMediaType || isLocationFromText;
  
  // Parse location from media_url or text content
  const parseLocation = (): { latitude: number; longitude: number; address?: string } | null => {
    // First try media_url format
    if (isLocationFromMediaType && message.media_url) {
      try {
        const [lat, lng] = message.media_url.split(',').map(Number);
        return { latitude: lat, longitude: lng, address: message.content || undefined };
      } catch {
        return null;
      }
    }
    
    // Then try text format: 📍 LOCATION:lat,lng|address
    if (isLocationFromText && message.content) {
      try {
        const locationPart = message.content.replace('📍 LOCATION:', '');
        const [coords, address] = locationPart.split('|');
        const [lat, lng] = coords.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { latitude: lat, longitude: lng, address: address || undefined };
        }
      } catch {
        return null;
      }
    }
    
    return null;
  };
  const locationData = parseLocation();
  const formatContent = (content: string) => {
    let formatted = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
      .replace(/\|\|(.*?)\|\|/g, '<span class="bg-muted-foreground text-muted-foreground hover:bg-transparent hover:text-inherit transition-colors cursor-pointer">$1</span>');
    
    return formatted;
  };

  return (
    <MessageContextMenu
      isMine={isMine}
      onReply={() => onReply?.(message)}
      onForward={() => onForward?.(message)}
      onEdit={isMine ? () => onEdit?.(message) : undefined}
      onDelete={isMine ? () => onDelete?.(message.id) : undefined}
      onPin={() => onPin?.(message.id)}
      onCopy={message.content ? copyToClipboard : undefined}
      hasMedia={!!message.media_url}
    >
      <div className={cn("flex group", isMine ? "justify-end" : "justify-start")}>
        <div className="flex items-end gap-2 max-w-[75%]">
          {!isMine && showAvatar && (
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={message.sender?.avatar_url || ''} />
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {message.sender?.display_name?.[0] || message.sender?.username?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
          )}
          {!isMine && !showAvatar && <div className="w-8 flex-shrink-0" />}
          
          <div className="flex flex-col">
            <div
              className={cn(
                "rounded-2xl px-4 py-2.5 relative",
                isMine 
                  ? "bg-primary text-primary-foreground rounded-br-md" 
                  : "bg-card text-card-foreground rounded-bl-md border border-border",
                message.status === 'failed' && "bg-destructive/20 border-destructive"
              )}
            >
              {/* Forwarded indicator */}
              {message.forwarded_from && (
                <div className="flex items-center gap-1 text-xs opacity-70 mb-1">
                  <Forward className="h-3 w-3" />
                  <span>Forwarded from {message.forwarded_from.sender_name}</span>
                </div>
              )}

              {/* Sender name for groups */}
              {(isGroup || showSender) && !isMine && message.sender && (
                <p className="text-xs font-medium text-primary mb-1">
                  {message.sender.display_name || message.sender.username}
                </p>
              )}

              {message.is_deleted ? (
                <p className="text-sm italic opacity-50">Message deleted</p>
              ) : isLocationMessage && locationData ? (
                <LocationMessage
                  latitude={locationData.latitude}
                  longitude={locationData.longitude}
                  address={locationData.address}
                  isMine={isMine}
                  senderName={message.sender?.display_name || undefined}
                />
              ) : (
                <>
                  {isVoiceMessage ? (
                    <VoiceMessagePlayer url={message.media_url!} isMine={isMine} />
                  ) : (
                    <>
                      {message.content && !message.content.startsWith('[') && (
                        <p 
                          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
                        />
                      )}
                      {message.media_url && message.media_type && (
                        <div className={cn("mt-2", !message.content && "-m-1")}>
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
              
              {/* Message meta */}
              <div className={cn(
                "flex items-center justify-end gap-1.5 mt-1",
                isMine ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                <span className="text-[10px]">{formatTime(message.created_at)}</span>
                {message.is_edited && <span className="text-[10px]">(edited)</span>}
                {isMine && (
                  message.status === 'sending' ? (
                    <Clock className="h-3 w-3 animate-pulse" />
                  ) : message.status === 'failed' ? (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  ) : message.status === 'read' || message.is_read ? (
                    <CheckCheck className="h-3 w-3 text-blue-400" />
                  ) : message.status === 'delivered' ? (
                    <CheckCheck className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )
                )}
              </div>
            </div>
            
            {/* Reactions */}
            {(reactions.length > 0 || true) && (
              <div className={cn("flex flex-wrap gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
                {reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    onClick={() => toggleReaction(reaction.emoji)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all",
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
            )}
          </div>
        </div>
      </div>
    </MessageContextMenu>
  );
}
