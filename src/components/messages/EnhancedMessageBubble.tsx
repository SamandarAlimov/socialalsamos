import { useState, useCallback, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCheck, Plus, Clock, AlertCircle, Reply as ReplyIcon, Forward, Pin, Square, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageAttachment } from '@/components/MessageAttachment';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { EmojiPicker } from '@/components/EmojiPicker';
import { MessageContextMenu } from './MessageContextMenu';
import { LocationMessage } from './LocationMessage';
import { GroupReadReceipts } from './GroupReadReceipts';
import { MessageContent } from './MessageContent';
import { SharedPostPreview } from './SharedPostPreview';
import { StoryReplyPreview } from './StoryReplyPreview';
import { CallHistoryMessage, CallHistoryData } from './CallHistoryMessage';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useUserSettings } from '@/hooks/useUserSettings';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  story_id?: string | null;
  shared_post_id?: string | null;
  is_read?: boolean;
  created_at: string;
  updated_at?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  delivered_at?: string;
  read_at?: string;
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
  onSelect?: (messageId: string) => void;
  onLongPress?: (messageId: string) => void;
  isPinned?: boolean;
  isSelected?: boolean;
  isSelectionMode?: boolean;
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
  onSelect,
  onLongPress,
  isPinned = false,
  isSelected = false,
  isSelectionMode = false,
  showAvatar = true,
  showSender = false,
}: EnhancedMessageBubbleProps) {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [reactions, setReactions] = useState<ReactionGroup[]>([]);
  const { lightTap, mediumTap, successFeedback } = useHapticFeedback();
  
  // Swipe to reply state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const hasTriggeredHaptic = useRef(false);
  const swipeThreshold = 60;
  const maxSwipe = 80;
  
  // Double tap for quick reaction
  const lastTapRef = useRef<number>(0);
  const doubleTapTimeout = 300;

  const handleDoubleTap = useCallback(() => {
    if (!user) return;
    const now = Date.now();
    if (now - lastTapRef.current < doubleTapTimeout) {
      // Double tap detected - add ❤️ reaction
      addReaction('❤️');
      successFeedback();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [user, successFeedback]);

  // Long press for selection mode
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);
  
  const handleLongPressStart = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      mediumTap();
      onLongPress?.(message.id);
    }, 500);
  }, [message.id, onLongPress, mediumTap]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (isSelectionMode && onSelect) {
      onSelect(message.id);
      lightTap();
    } else if (!longPressTriggered.current) {
      handleDoubleTap();
    }
  }, [isSelectionMode, onSelect, message.id, handleDoubleTap, lightTap]);

  const isInteractiveTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    return !!el?.closest('a,button,iframe,[role="button"]');
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isInteractiveTarget(e.target)) return;
    startX.current = e.touches[0].clientX;
    hasTriggeredHaptic.current = false;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    if (isInteractiveTarget(e.target)) return;
    
    const currentX = e.touches[0].clientX;
    const diff = isMine ? startX.current - currentX : currentX - startX.current;
    
    if (diff > 0) {
      const newOffset = Math.min(diff, maxSwipe);
      setSwipeOffset(newOffset);
      
      if (newOffset >= swipeThreshold && !hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = true;
        mediumTap();
      } else if (newOffset < swipeThreshold && hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = false;
      }
    }
  }, [isDragging, isMine, mediumTap]);

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset >= swipeThreshold && onReply) {
      successFeedback();
      onReply(message);
    }
    setSwipeOffset(0);
    setIsDragging(false);
  }, [swipeOffset, onReply, message, successFeedback]);

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
    lightTap();
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
    lightTap();
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
      successFeedback();
    }
  };

  const formatTime = (date: string) => format(new Date(date), 'HH:mm');

  const isVoiceMessage = message.media_type === 'audio' && message.media_url;
  
  // Check for call history message
  const isCallHistoryMessage = message.media_type === 'call_history';
  const parseCallHistory = (): CallHistoryData | null => {
    if (!isCallHistoryMessage || !message.content) return null;
    
    // Try to parse as JSON first (new format)
    try {
      const parsed = JSON.parse(message.content);
      if (parsed.type && parsed.status) {
        return parsed as CallHistoryData;
      }
    } catch {
      // Not JSON, try to parse legacy emoji format
    }
    
    // Parse legacy emoji format: "📞 Video call — 0:18" or "📞 Voice call ended"
    const content = message.content;
    if (content.startsWith('📞')) {
      const isVideo = content.toLowerCase().includes('video');
      const durationMatch = content.match(/(\d+):(\d+)(?::(\d+))?/);
      let duration: number | undefined;
      
      if (durationMatch) {
        if (durationMatch[3]) {
          // Format: H:MM:SS
          duration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
        } else {
          // Format: M:SS
          duration = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
        }
      }
      
      return {
        type: isVideo ? 'video' : 'audio',
        status: 'ended',
        duration,
        timestamp: message.created_at,
        caller_id: message.sender_id || '',
        callee_id: '',
      };
    }
    
    return null;
  };
  const callHistoryData = parseCallHistory();
  
  // Check for location message - either via media_type or text format
  const isLocationFromMediaType = message.media_type === 'location' && message.media_url;
  const isLocationFromText = message.content?.startsWith('📍 LOCATION:');
  const isLocationMessage = isLocationFromMediaType || isLocationFromText;
  
  // Parse location from media_url or text content
  const parseLocation = (): { latitude: number; longitude: number; address?: string } | null => {
    if (isLocationFromMediaType && message.media_url) {
      try {
        const [lat, lng] = message.media_url.split(',').map(Number);
        return { latitude: lat, longitude: lng, address: message.content || undefined };
      } catch {
        return null;
      }
    }
    
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

  const isReadyToReply = swipeOffset >= swipeThreshold;

  // Render call history message as a centered system message
  if (isCallHistoryMessage && callHistoryData) {
    return (
      <CallHistoryMessage 
        callData={callHistoryData} 
        isMine={callHistoryData.caller_id === user?.id} 
      />
    );
  }

  return (
    <MessageContextMenu
      isMine={isMine}
      onReply={() => onReply?.(message)}
      onForward={() => onForward?.(message)}
      onEdit={isMine ? () => onEdit?.(message) : undefined}
      onDelete={isMine ? () => onDelete?.(message.id) : undefined}
      onPin={() => onPin?.(message.id)}
      onSelect={onLongPress ? () => onLongPress(message.id) : undefined}
      isPinned={isPinned}
      onCopy={message.content ? copyToClipboard : undefined}
      hasMedia={!!message.media_url}
      onDownload={message.media_url ? () => {
        const link = document.createElement('a');
        link.href = message.media_url!;
        link.download = message.media_url!.split('/').pop() || 'download';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        successFeedback();
      } : undefined}
      sentAt={message.created_at}
      readAt={message.read_at}
    >
      <div 
        className={cn(
          "flex group relative transition-colors",
          isMine ? "justify-end" : "justify-start",
          isSelected && "bg-primary/10 -mx-2 px-2 rounded-lg"
        )}
        onTouchStart={(e) => {
          if (!isSelectionMode) {
            handleTouchStart(e);
            handleLongPressStart();
          }
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={(e) => {
          handleTouchEnd();
          handleLongPressEnd();
        }}
        onClick={handleClick}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
      >
        {/* Selection checkbox */}
        {isSelectionMode && (
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 z-10",
            isMine ? "right-full mr-2" : "left-0 -ml-6"
          )}>
            {isSelected ? (
              <CheckSquare className="h-5 w-5 text-primary" />
            ) : (
              <Square className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )}
        {/* Pinned indicator */}
        {isPinned && (
          <div className={cn(
            "absolute -top-1 z-10",
            isMine ? "right-0" : "left-8"
          )}>
            <div className="h-5 w-5 rounded-full bg-primary/90 flex items-center justify-center shadow-sm">
              <Pin className="h-3 w-3 text-primary-foreground" />
            </div>
          </div>
        )}
        {/* Reply indicator for non-mine messages */}
        {!isMine && (
          <div 
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center transition-opacity",
              isReadyToReply ? "opacity-100" : "opacity-50"
            )}
            style={{ 
              width: swipeOffset,
              opacity: swipeOffset > 10 ? Math.min(swipeOffset / swipeThreshold, 1) : 0 
            }}
          >
            <div className={cn(
              "h-8 w-8 rounded-full bg-primary flex items-center justify-center transition-transform",
              isReadyToReply && "scale-110"
            )}>
              <ReplyIcon className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
        )}

        {/* Reply indicator for mine messages */}
        {isMine && (
          <div 
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center transition-opacity",
              isReadyToReply ? "opacity-100" : "opacity-50"
            )}
            style={{ 
              width: swipeOffset,
              opacity: swipeOffset > 10 ? Math.min(swipeOffset / swipeThreshold, 1) : 0 
            }}
          >
            <div className={cn(
              "h-8 w-8 rounded-full bg-primary flex items-center justify-center transition-transform",
              isReadyToReply && "scale-110"
            )}>
              <ReplyIcon className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
        )}

        <div 
          className="flex items-end gap-2 max-w-[85%] md:max-w-[75%] transition-transform"
          style={{ 
            transform: isMine 
              ? `translateX(-${swipeOffset}px)` 
              : `translateX(${swipeOffset}px)` 
          }}
        >
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
                  {/* Story Reply Preview */}
                  {message.story_id && (
                    <StoryReplyPreview storyId={message.story_id} isMine={isMine} />
                  )}

                  {/* Shared Post Preview */}
                  {message.shared_post_id && (
                    <SharedPostPreview postId={message.shared_post_id} isMine={isMine} />
                  )}

                  {isVoiceMessage ? (
                    <VoiceMessagePlayer 
                      url={message.media_url!} 
                      isMine={isMine} 
                      autoPlay={settings?.autoplay_voice_messages ?? true}
                    />
                  ) : (
                    <>
                      {message.content && !message.content.startsWith('[') && !message.shared_post_id && (
                        <MessageContent content={message.content} isMine={isMine} />
                      )}
                      {message.media_url && message.media_type && (
                        <div className={cn("mt-2", !message.content && "-m-1")}>
                          <MessageAttachment 
                            url={message.media_url} 
                            type={message.media_type as 'image' | 'video' | 'audio' | 'document'}
                            isMine={isMine}
                            autoPlay={
                              message.media_type === 'video' 
                                ? (settings?.autoplay_video_messages ?? true)
                                : message.media_type === 'audio'
                                ? (settings?.autoplay_voice_messages ?? true)
                                : false
                            }
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              
              {/* Message meta with delivery status */}
              <div className={cn(
                "flex items-center justify-end gap-1.5 mt-1",
                isMine ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                <span className="text-[10px]">{formatTime(message.created_at)}</span>
                {message.is_edited && <span className="text-[10px]">(edited)</span>}
                {isMine && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center">
                        {message.status === 'sending' ? (
                          <Clock className="h-3 w-3 animate-pulse" />
                        ) : message.status === 'failed' ? (
                          <AlertCircle className="h-3 w-3 text-destructive" />
                        ) : message.status === 'read' || message.is_read ? (
                          <CheckCheck className="h-3.5 w-3.5 text-[#0095F6]" />
                        ) : message.status === 'delivered' ? (
                          <CheckCheck className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                      {message.status === 'sending' && 'Sending...'}
                      {message.status === 'failed' && 'Failed to send'}
                      {message.status === 'sent' && `Sent ${formatTime(message.created_at)}`}
                      {message.status === 'delivered' && (
                        <div>
                          <div>Delivered</div>
                          {message.delivered_at && (
                            <div className="text-muted-foreground">{format(new Date(message.delivered_at), 'HH:mm dd/MM/yyyy')}</div>
                          )}
                        </div>
                      )}
                      {(message.status === 'read' || message.is_read) && (
                        <div>
                          <div>Read</div>
                          {message.read_at && (
                            <div className="text-muted-foreground">{format(new Date(message.read_at), 'HH:mm dd/MM/yyyy')}</div>
                          )}
                        </div>
                      )}
                      {!message.status && !message.is_read && `Sent ${formatTime(message.created_at)}`}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            
            {/* Group Read Receipts */}
            {isGroup && isMine && (
              <GroupReadReceipts
                messageId={message.id}
                senderId={message.sender_id}
                isMine={isMine}
              />
            )}
            
            {/* Reactions */}
            {(reactions.length > 0 || true) && (
              <div className={cn("flex flex-wrap gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
                {reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    onClick={() => toggleReaction(reaction.emoji)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all active:scale-95",
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
                    <button className="opacity-0 group-hover:opacity-100 md:transition-opacity inline-flex items-center justify-center h-6 w-6 rounded-full hover:bg-accent active:scale-95">
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
