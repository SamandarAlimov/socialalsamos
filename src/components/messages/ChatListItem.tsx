import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Megaphone, Pin, VolumeX, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';
import { Conversation } from '@/hooks/useMessages';
import { ChatListContextMenu } from './ChatListContextMenu';
import { useSwipeToReply } from '@/hooks/useSwipeToReply';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { supabase } from '@/integrations/supabase/client';
import { VerifiedBadge } from '@/components/VerifiedBadge';
interface ChatListItemProps {
  conversation: Conversation;
  isSelected: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  onClick: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onPin?: () => void;
  onMute?: () => void;
  onDelete?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
}

export function ChatListItem({ 
  conversation, 
  isSelected, 
  isPinned = false,
  isMuted = false,
  isArchived = false,
  onClick,
  onArchive,
  onUnarchive,
  onPin,
  onMute,
  onDelete,
  onMarkRead,
  onMarkUnread,
}: ChatListItemProps) {
  const { lightTap } = useHapticFeedback();
  const [isOnline, setIsOnline] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  
  // Swipe to archive functionality
  const { offset, isReadyToReply, swipeHandlers } = useSwipeToReply({
    threshold: 80,
    maxSwipe: 120,
    onReply: () => {
      if (onArchive) onArchive();
    },
  });

  const otherUserId = conversation.type === 'private' ? conversation.other_participant?.id : null;

  // Real-time presence subscription for online status
  useEffect(() => {
    if (!otherUserId) return;

    // Set initial values from conversation data
    setIsOnline(conversation.other_participant?.is_online || false);
    setIsVerified(conversation.other_participant?.is_verified || false);

    // Subscribe to presence channel for real-time updates
    const presenceChannel = supabase.channel(`presence-status-${otherUserId}`);
    
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const isUserOnline = Object.keys(state).length > 0;
        setIsOnline(isUserOnline);
      })
      .subscribe();

    // Also subscribe to profile changes for verification status
    const profileChannel = supabase
      .channel(`profile-${otherUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${otherUserId}`,
        },
        (payload) => {
          if (payload.new) {
            setIsOnline(payload.new.is_online || false);
            setIsVerified(payload.new.is_verified || false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [otherUserId, conversation.other_participant]);

  const getName = () => {
    if (conversation.type === 'private') {
      return conversation.other_participant?.display_name || 
             conversation.other_participant?.username || 
             'Unknown';
    }
    return conversation.name || 'Unnamed';
  };

  const getAvatar = () => {
    if (conversation.type === 'private') {
      return conversation.other_participant?.avatar_url;
    }
    return conversation.avatar_url;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    }
    if (isYesterday(date)) {
      return 'Yesterday';
    }
    if (isThisWeek(date)) {
      return format(date, 'EEE');
    }
    return format(date, 'dd.MM.yyyy');
  };

  const isUnread = (conversation.unread_count ?? 0) > 0;

  const handleClick = () => {
    lightTap();
    onClick();
  };

  return (
    <ChatListContextMenu
      conversation={conversation}
      isPinned={isPinned}
      isMuted={isMuted}
      isArchived={isArchived}
      isUnread={isUnread}
      onArchive={onArchive}
      onUnarchive={onUnarchive}
      onPin={onPin}
      onMute={onMute}
      onDelete={onDelete}
      onMarkRead={onMarkRead}
      onMarkUnread={onMarkUnread}
    >
      <div className="relative overflow-hidden">
        {/* Swipe action indicator */}
        <div 
          className={cn(
            "absolute left-0 top-0 bottom-0 flex items-center justify-center bg-orange-500 transition-opacity",
            isReadyToReply ? "opacity-100" : "opacity-70"
          )}
          style={{ width: Math.max(offset, 0) }}
        >
          <Reply className="h-5 w-5 text-white" />
        </div>

        <button
          onClick={handleClick}
          {...swipeHandlers}
          className={cn(
            "w-full px-4 py-3 md:px-3 md:py-2.5 flex items-center gap-3 transition-all duration-200 border-b border-border/30",
            "hover:bg-accent/50 active:bg-accent/70",
            "min-h-[72px] md:min-h-0", // Larger touch target on mobile
            isSelected && "bg-accent"
          )}
          style={{ transform: `translateX(${offset}px)` }}
        >
          <div className="relative flex-shrink-0">
            <Avatar className="h-14 w-14 md:h-12 md:w-12">
              <AvatarImage src={getAvatar() || ''} />
              <AvatarFallback 
                className={cn(
                  "text-primary-foreground font-medium text-lg md:text-base",
                  conversation.type === 'group' && 'bg-blue-500',
                  conversation.type === 'channel' && 'bg-violet-500',
                  conversation.type === 'private' && 'bg-primary'
                )}
              >
                {conversation.type === 'group' ? (
                  <Users className="h-6 w-6 md:h-5 md:w-5" />
                ) : conversation.type === 'channel' ? (
                  <Megaphone className="h-6 w-6 md:h-5 md:w-5" />
                ) : (
                  getName()[0]?.toUpperCase()
                )}
              </AvatarFallback>
            </Avatar>
            {/* Online indicator */}
            {conversation.type === 'private' && isOnline && (
              <span className="absolute bottom-0 right-0 h-4 w-4 md:h-3.5 md:w-3.5 bg-green-500 rounded-full border-2 border-card" />
            )}
          </div>
          
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium text-base md:text-sm truncate">{getName()}</span>
                {/* Instagram-style verification badge */}
                {conversation.type === 'private' && isVerified && (
                  <VerifiedBadge size="xs" className="md:h-3.5 md:w-3.5" />
                )}
                {conversation.type === 'channel' && (
                  <Megaphone className="h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                {isPinned && (
                  <Pin className="h-3.5 w-3.5 md:h-3 md:w-3 text-muted-foreground flex-shrink-0" />
                )}
                {isMuted && (
                  <VolumeX className="h-3.5 w-3.5 md:h-3 md:w-3 text-muted-foreground flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <span className="text-sm md:text-xs text-muted-foreground">
                  {conversation.last_message_at && formatTime(conversation.last_message_at)}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-2">
              <p className={cn(
                "text-sm truncate",
                isUnread
                  ? "text-foreground font-medium" 
                  : "text-muted-foreground"
              )}>
                {conversation.last_message || 'No messages yet'}
              </p>
              
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {isUnread && (
                  <Badge variant="default" className="h-6 min-w-[24px] md:h-5 md:min-w-[20px] rounded-full px-2 md:px-1.5 text-sm md:text-xs">
                    {(conversation.unread_count ?? 0) > 99 ? '99+' : conversation.unread_count}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </button>
      </div>
    </ChatListContextMenu>
  );
}
