import { useEffect, useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Megaphone, Pin, VolumeX, Reply, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';
import { Conversation } from '@/hooks/useMessages';
import { ChatListContextMenu } from './ChatListContextMenu';
import { useSwipeToReply } from '@/hooks/useSwipeToReply';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useUserOnlineStatus } from '@/hooks/useRealtimeStatus';
import { supabase } from '@/integrations/supabase/client';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

interface ChatListItemProps {
  conversation: Conversation & { is_self_chat?: boolean };
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
  const { user } = useAuth();
  const { lightTap } = useHapticFeedback();
  const [isVerified, setIsVerified] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const prevUnreadCount = useRef(conversation.unread_count ?? 0);
  
  // Check if this is a self-chat (conversation with yourself)
  const isSelfChat = conversation.is_self_chat || 
    (conversation.type === 'private' && conversation.other_participant?.id === user?.id);
  
  // Trigger pulse animation when unread count increases
  useEffect(() => {
    const currentCount = conversation.unread_count ?? 0;
    if (currentCount > prevUnreadCount.current) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 600);
      return () => clearTimeout(timer);
    }
    prevUnreadCount.current = currentCount;
  }, [conversation.unread_count]);
  
  const otherUserId = conversation.type === 'private' ? conversation.other_participant?.id : null;
  
  // Use the realtime status hook for online status
  const { isOnline } = useUserOnlineStatus(otherUserId);
  
  // Swipe to archive functionality
  const { offset, isReadyToReply, swipeHandlers } = useSwipeToReply({
    threshold: 80,
    maxSwipe: 120,
    onReply: () => {
      if (onArchive) onArchive();
    },
  });

  // Subscribe to profile changes for verification status
  useEffect(() => {
    if (!otherUserId) return;

    // Set initial values from conversation data
    setIsVerified(conversation.other_participant?.is_verified || false);

    // Subscribe to profile changes for verification status
    const profileChannel = supabase
      .channel(`profile-verified-${otherUserId}`)
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
            setIsVerified(payload.new.is_verified || false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [otherUserId, conversation.other_participant]);

  const getName = () => {
    if (isSelfChat) {
      // Show user's own name for self-chat
      return conversation.other_participant?.display_name || 
             conversation.other_participant?.username || 
             'You';
    }
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
                  isSelfChat && 'bg-gradient-to-br from-amber-500 to-orange-500',
                  conversation.type === 'private' && !isSelfChat && 'bg-primary'
                )}
              >
                {isSelfChat ? (
                  <Bookmark className="h-6 w-6 md:h-5 md:w-5" />
                ) : conversation.type === 'group' ? (
                  <Users className="h-6 w-6 md:h-5 md:w-5" />
                ) : conversation.type === 'channel' ? (
                  <Megaphone className="h-6 w-6 md:h-5 md:w-5" />
                ) : (
                  getName()[0]?.toUpperCase()
                )}
              </AvatarFallback>
            </Avatar>
            {/* Online indicator - don't show for self-chat */}
            {conversation.type === 'private' && isOnline && !isSelfChat && (
              <span className="absolute bottom-0 right-0 h-4 w-4 md:h-3.5 md:w-3.5 bg-green-500 rounded-full border-2 border-card" />
            )}
            {/* Self-chat indicator */}
            {isSelfChat && (
              <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 md:h-4 md:w-4 bg-card rounded-full flex items-center justify-center border-2 border-amber-500">
                <Bookmark className="h-2.5 w-2.5 md:h-2 md:w-2 text-amber-500 fill-amber-500" />
              </span>
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
            
            <div className="flex items-center justify-between gap-2 min-w-0">
              <p className={cn(
                "text-sm flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
                isUnread
                  ? "text-foreground font-medium" 
                  : "text-muted-foreground"
              )}
              style={{ maxWidth: 'calc(100% - 40px)' }}
              >
                {conversation.last_message && conversation.last_message.length > 35 
                  ? `${conversation.last_message.substring(0, 35)}...` 
                  : conversation.last_message || 'No messages yet'}
              </p>
              
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <AnimatePresence>
                  {isUnread && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ 
                        scale: isPulsing ? [1, 1.3, 1] : 1, 
                        opacity: 1 
                      }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ 
                        duration: isPulsing ? 0.4 : 0.2,
                        ease: "easeOut"
                      }}
                    >
                      <Badge 
                        variant="default" 
                        className={cn(
                          "h-6 min-w-[24px] md:h-5 md:min-w-[20px] rounded-full px-2 md:px-1.5 text-sm md:text-xs",
                          isPulsing && "shadow-lg shadow-primary/40"
                        )}
                      >
                        {(conversation.unread_count ?? 0) > 99 ? '99+' : conversation.unread_count}
                      </Badge>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </button>
      </div>
    </ChatListContextMenu>
  );
}
