import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Archive,
  ArchiveRestore,
  Pin,
  PinOff,
  BellOff,
  Bell,
  Trash2,
  CheckCheck,
  Circle,
} from 'lucide-react';
import { Conversation } from '@/hooks/useMessages';

interface ChatListContextMenuProps {
  conversation: Conversation;
  children: React.ReactNode;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isUnread?: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
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
  isArchived = false,
  isUnread = false,
  onArchive,
  onUnarchive,
  onPin,
  onMute,
  onDelete,
  onMarkRead,
  onMarkUnread,
}: ChatListContextMenuProps) {
  const isChannel = conversation.type === 'channel';
  const isGroup = conversation.type === 'group';
  const deleteLabel = isChannel
    ? 'Kanalni chatlardan olib tashlash'
    : isGroup
      ? 'Guruhni chatlardan olib tashlash'
      : "Chatni o'chirish";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60 rounded-2xl">
        {isArchived
          ? onUnarchive && (
              <ContextMenuItem onClick={onUnarchive} className="gap-2">
                <ArchiveRestore className="h-4 w-4" />
                Arxivdan chiqarish
              </ContextMenuItem>
            )
          : onArchive && (
              <ContextMenuItem onClick={onArchive} className="gap-2">
                <Archive className="h-4 w-4" />
                Arxivlash
              </ContextMenuItem>
            )}

        {isUnread && onMarkRead && (
          <ContextMenuItem onClick={onMarkRead} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            O'qilgan deb belgilash
          </ContextMenuItem>
        )}

        {!isUnread && onMarkUnread && (
          <ContextMenuItem onClick={onMarkUnread} className="gap-2">
            <Circle className="h-4 w-4" />
            O'qilmagan deb belgilash
          </ContextMenuItem>
        )}

        {onPin && !isArchived && (
          <ContextMenuItem onClick={onPin} className="gap-2">
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {isPinned ? 'Qadashni bekor qilish' : 'Yuqoriga qadash'}
          </ContextMenuItem>
        )}

        {onMute && !isArchived && (
          <ContextMenuItem onClick={onMute} className="gap-2">
            {isMuted ? (
              <>
                <Bell className="h-4 w-4" />
                Ovozni yoqish
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4" />
                Ovozsiz qilish
              </>
            )}
          </ContextMenuItem>
        )}

        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={onDelete}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              {deleteLabel}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
