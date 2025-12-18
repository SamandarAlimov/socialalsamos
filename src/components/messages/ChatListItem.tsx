import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Megaphone, Pin, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';
import { Conversation } from '@/hooks/useMessages';
import { ChatListContextMenu } from './ChatListContextMenu';
import { formatLastSeen } from '@/utils/formatLastSeen';

interface ChatListItemProps {
  conversation: Conversation;
  isSelected: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  onClick: () => void;
  onArchive?: () => void;
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
  onClick,
  onArchive,
  onPin,
  onMute,
  onDelete,
  onMarkRead,
  onMarkUnread,
}: ChatListItemProps) {
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

  const isOnline = conversation.type === 'private' && conversation.other_participant?.is_online;

  const isUnread = (conversation.unread_count ?? 0) > 0;

  return (
    <ChatListContextMenu
      conversation={conversation}
      isPinned={isPinned}
      isMuted={isMuted}
      isUnread={isUnread}
      onArchive={onArchive}
      onPin={onPin}
      onMute={onMute}
      onDelete={onDelete}
      onMarkRead={onMarkRead}
      onMarkUnread={onMarkUnread}
    >
      <button
        onClick={onClick}
        className={cn(
          "w-full px-3 py-2.5 flex items-center gap-3 transition-all duration-200 border-b border-border/30",
          "hover:bg-accent/50",
          isSelected && "bg-accent"
        )}
      >
        <div className="relative flex-shrink-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={getAvatar() || ''} />
            <AvatarFallback 
              className={cn(
                "text-primary-foreground font-medium",
                conversation.type === 'group' && 'bg-blue-500',
                conversation.type === 'channel' && 'bg-violet-500',
                conversation.type === 'private' && 'bg-primary'
              )}
            >
              {conversation.type === 'group' ? (
                <Users className="h-5 w-5" />
              ) : conversation.type === 'channel' ? (
                <Megaphone className="h-5 w-5" />
              ) : (
                getName()[0]?.toUpperCase()
              )}
            </AvatarFallback>
          </Avatar>
          {isOnline && (
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-card" />
          )}
        </div>
        
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium text-sm truncate">{getName()}</span>
              {conversation.type === 'channel' && (
                <Megaphone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              {isPinned && (
                <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
              {isMuted && (
                <VolumeX className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <span className="text-xs text-muted-foreground">
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
                <Badge variant="default" className="h-5 min-w-[20px] rounded-full px-1.5 text-xs">
                  {(conversation.unread_count ?? 0) > 99 ? '99+' : conversation.unread_count}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </button>
    </ChatListContextMenu>
  );
}
