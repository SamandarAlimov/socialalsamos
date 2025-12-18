import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Archive,
  Pin,
  BellOff,
  Bell,
  Trash2,
  CheckCheck,
  Circle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Conversation } from '@/hooks/useMessages';

interface ChatListContextMenuProps {
  conversation: Conversation;
  children: React.ReactNode;
  isPinned?: boolean;
  isMuted?: boolean;
  isUnread?: boolean;
  onArchive?: () => void;
  onPin?: () => void;
  onMute?: () => void;
  onDelete?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
}

export function ChatListContextMenu({
  conversation,
  children,
  isPinned = false,
  isMuted = false,
  isUnread = false,
  onArchive,
  onPin,
  onMute,
  onDelete,
  onMarkRead,
  onMarkUnread,
}: ChatListContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {onArchive && (
          <ContextMenuItem onClick={onArchive} className="gap-2">
            <Archive className="h-4 w-4" />
            Archive
          </ContextMenuItem>
        )}
        
        {isUnread && onMarkRead && (
          <ContextMenuItem onClick={onMarkRead} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            Mark as read
          </ContextMenuItem>
        )}
        
        {!isUnread && onMarkUnread && (
          <ContextMenuItem onClick={onMarkUnread} className="gap-2">
            <Circle className="h-4 w-4" />
            Mark as unread
          </ContextMenuItem>
        )}
        
        {onPin && (
          <ContextMenuItem onClick={onPin} className="gap-2">
            <Pin className="h-4 w-4" />
            {isPinned ? 'Unpin' : 'Pin'}
          </ContextMenuItem>
        )}
        
        {onMute && (
          <ContextMenuItem onClick={onMute} className="gap-2">
            {isMuted ? (
              <>
                <Bell className="h-4 w-4" />
                Unmute
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4" />
                Mute
              </>
            )}
          </ContextMenuItem>
        )}
        
        <ContextMenuSeparator />
        
        {onDelete && (
          <ContextMenuItem 
            onClick={onDelete} 
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete chat
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
