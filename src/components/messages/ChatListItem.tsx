import { useEffect, useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Megaphone, Pin, VolumeX, Reply, Bookmark, Phone, Video, PhoneMissed, PhoneOff, PhoneIncoming, PhoneOutgoing, VideoOff, Mic, Image, FileText, MapPin, BarChart3, Sticker, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';
import { Conversation } from '@/hooks/useMessages';
import { ChatListContextMenu } from './ChatListContextMenu';
import { useSwipeToReply } from '@/hooks/useSwipeToReply';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useOnlinePresence } from '@/contexts/OnlinePresenceContext';
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
  compact?: boolean;
  onClick: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onPin?: () => void;
  onMute?: () => void;
  onDelete?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
}

/** Telegram uses a neutral (gray) highlight for the active chat row, never an accent color. */
const SELECTED_ROW = 'bg-muted dark:bg-muted';
const HOVER_ROW = 'hover:bg-muted/60 active:bg-muted/80';

/** Telegram renders media hints in the same muted tone as the preview text. */
const PREVIEW_ICON = 'h-3.5 w-3.5 shrink-0 text-muted-foreground';

export function ChatListItem({ 
  conversation, 
  isSelected, 
  isPinned = false,
  isMuted = false,
  isArchived = false,
  compact = false,
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
  
  // Use the global presence context for online status
  const { isUserOnline } = useOnlinePresence();
  const isOnline = otherUserId ? isUserOnline(otherUserId) : false;
  
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

  const formatCallDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Telegram-style preview for a call history payload.
   * Audio and video calls are always distinguished, and the direction
   * (incoming / outgoing) is derived from the caller id.
   */
  const formatCallPreview = (callData: {
    type: 'audio' | 'video';
    status?: string;
    duration?: number;
    caller_id?: string;
  }): { text: string; icon: React.ReactNode } => {
    const isVideo = callData.type === 'video';
    const isOutgoing = !!user?.id && callData.caller_id === user.id;
    const label = isVideo ? "Video qo'ng'iroq" : "Ovozli qo'ng'iroq";

    switch (callData.status) {
      case 'missed':
        return {
          text: isOutgoing ? `${label} · javobsiz` : `O'tkazib yuborilgan ${label.toLowerCase()}`,
          icon: isVideo
            ? <VideoOff className={cn(PREVIEW_ICON, 'text-red-500')} />
            : <PhoneMissed className={cn(PREVIEW_ICON, 'text-red-500')} />,
        };
      case 'declined':
        return {
          text: `${label} · rad etildi`,
          icon: isVideo
            ? <VideoOff className={cn(PREVIEW_ICON, 'text-red-500')} />
            : <PhoneOff className={cn(PREVIEW_ICON, 'text-red-500')} />,
        };
      case 'cancelled':
        return {
          text: `${label} · bekor qilindi`,
          icon: isVideo
            ? <VideoOff className={PREVIEW_ICON} />
            : <PhoneOff className={PREVIEW_ICON} />,
        };
      case 'ended': {
        const duration = callData.duration ? ` · ${formatCallDuration(callData.duration)}` : '';
        return {
          text: `${isOutgoing ? 'Chiquvchi' : 'Kiruvchi'} ${label.toLowerCase()}${duration}`,
          icon: isVideo
            ? <Video className={cn(PREVIEW_ICON, 'text-emerald-500')} />
            : isOutgoing
              ? <PhoneOutgoing className={cn(PREVIEW_ICON, 'text-emerald-500')} />
              : <PhoneIncoming className={cn(PREVIEW_ICON, 'text-emerald-500')} />,
        };
      }
      default:
        return {
          text: label,
          icon: isVideo ? <Video className={PREVIEW_ICON} /> : <Phone className={PREVIEW_ICON} />,
        };
    }
  };

  // Format last message for display (handle media-only messages, call history JSON, locations, etc.)
  const formatLastMessage = (message: string | null, meta?: Conversation['last_message_meta']): { text: string; icon?: React.ReactNode } => {
    const mediaType = meta?.media_type;
    const hasRealContent = message && message.trim().length > 0;
    const caption = hasRealContent && !message.startsWith('{') ? message : null;

    // Media-only or media-enriched messages: content may be empty, so describe the attachment.
    // Telegram keeps the caption visible next to the media label when there is one.
    if (!hasRealContent || mediaType) {
      switch (mediaType) {
        case 'voice':
          return { text: caption || 'Ovozli xabar', icon: <Mic className={PREVIEW_ICON} /> };
        case 'audio':
          return { text: caption || 'Ovozli xabar', icon: <Mic className={PREVIEW_ICON} /> };
        case 'image':
        case 'photo':
          return { text: caption || 'Rasm', icon: <Image className={PREVIEW_ICON} /> };
        case 'album':
          return { text: caption || 'Albom', icon: <Image className={PREVIEW_ICON} /> };
        case 'video':
          return { text: caption || 'Video', icon: <Video className={PREVIEW_ICON} /> };
        case 'file':
        case 'document':
          return { text: caption || meta?.media_file_name || 'Fayl', icon: <FileText className={PREVIEW_ICON} /> };
        case 'location':
          return { text: caption || 'Joylashuv', icon: <MapPin className={PREVIEW_ICON} /> };
        case 'poll':
          return { text: caption || "So'rov", icon: <BarChart3 className={PREVIEW_ICON} /> };
        case 'sticker':
          return { text: caption || 'Stiker', icon: <Sticker className={PREVIEW_ICON} /> };
        case 'music':
          return { text: caption || meta?.media_file_name || 'Musiqa', icon: <Music className={PREVIEW_ICON} /> };
        case 'call_history':
          // fall through to call JSON parser below
          break;
        default:
          if (!hasRealContent) return { text: 'No messages yet' };
      }
    }

    if (!message) return { text: 'No messages yet' };

    // Location payload format used elsewhere in the app
    if (message.startsWith('📍 LOCATION:')) {
      return { text: 'Joylashuv', icon: <MapPin className={PREVIEW_ICON} /> };
    }

    // Check if it's a call history JSON
    if (message.startsWith('{') && message.includes('"type"')) {
      try {
        const callData = JSON.parse(message);
        if (callData.type === 'video' || callData.type === 'audio') {
          return formatCallPreview(callData);
        }
      } catch {
        // Not valid JSON, treat as regular message
      }
    }

    // Legacy plain-text call fallback
    if (message.startsWith('📞')) {
      return { text: message.replace('📞', '').trim() || "Qo'ng'iroq", icon: <Phone className={PREVIEW_ICON} /> };
    }
    
    // Regular message - rely on CSS truncation to adapt to panel width
    return { text: message.replace(/\s+/g, ' ').trim() };
  };

  const isUnread = (conversation.unread_count ?? 0) > 0;

  const handleClick = () => {
    lightTap();
    onClick();
  };

  if (compact) {
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
        <button
          onClick={handleClick}
          title={getName()}
          className={cn(
            "w-full flex items-center justify-center py-2 transition-colors",
            HOVER_ROW,
            isSelected && SELECTED_ROW
          )}
        >
          <div className="relative">
            <Avatar className={cn("h-11 w-11 ring-2 transition-all", isSelected ? "ring-muted-foreground/30" : "ring-transparent")}>
              <AvatarImage src={getAvatar() || ''} />
              <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm">
                {isSelfChat ? <Bookmark className="h-4 w-4" /> : conversation.type === 'group' ? <Users className="h-4 w-4" /> : conversation.type === 'channel' ? <Megaphone className="h-4 w-4" /> : getName()[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {conversation.type === 'private' && isOnline && !isSelfChat && (
              <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-card" />
            )}
            {isUnread && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full px-1 text-[10px] flex items-center justify-center">
                {(conversation.unread_count ?? 0) > 99 ? '99+' : conversation.unread_count}
              </Badge>
            )}
          </div>
        </button>
      </ChatListContextMenu>
    );
  }

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
        {/* Swipe action indicator (neutral, Telegram-like) */}
        <div 
          className={cn(
            "absolute left-0 top-0 bottom-0 flex items-center justify-center bg-muted-foreground/25 transition-opacity",
            isReadyToReply ? "opacity-100" : "opacity-60"
          )}
          style={{ width: Math.max(offset, 0) }}
        >
          <Reply className="h-5 w-5 text-foreground" />
        </div>

        <button
          onClick={handleClick}
          {...swipeHandlers}
          className={cn(
            "w-full px-4 py-3 md:px-3 md:py-2.5 flex items-center gap-3 transition-colors duration-150 border-b border-border/30",
            HOVER_ROW,
            "min-h-[72px] md:min-h-0", // Larger touch target on mobile
            isSelected && SELECTED_ROW
          )}
          style={{ transform: `translateX(${offset}px)` }}
        >
          <div className="relative flex-shrink-0">
            <Avatar className="h-14 w-14 md:h-12 md:w-12">
              <AvatarImage src={getAvatar() || ''} />
              <AvatarFallback 
                className={cn(
                  "text-primary-foreground font-medium text-lg md:text-base",
                  conversation.type === 'group' && 'bg-primary',
                  conversation.type === 'channel' && 'bg-primary',
                  isSelfChat && 'bg-primary',
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
            <div className="flex items-center justify-between mb-0.5 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden flex-1">
                <span className="font-medium text-base md:text-sm truncate block">{getName()}</span>
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
                "text-sm flex-1 min-w-0 flex items-center gap-1 overflow-hidden",
                isUnread
                  ? "text-foreground font-medium" 
                  : "text-muted-foreground"
              )}
              >
                {(() => {
                  const formatted = formatLastMessage(conversation.last_message, conversation.last_message_meta);
                  return (
                    <>
                      {formatted.icon}
                      <span className="truncate min-w-0 flex-1">{formatted.text}</span>
                    </>
                  );
                })()}
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
