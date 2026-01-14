import { useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Eye,
  Reply,
  Forward,
  Edit,
  Pin,
  PinOff,
  Trash2,
  CheckSquare,
  Copy,
  Download,
  Clock,
  CheckCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface MessageContextMenuProps {
  children: React.ReactNode;
  isMine: boolean;
  onReply?: () => void;
  onForward?: () => void;
  onEdit?: () => void;
  onPin?: () => void;
  onDelete?: () => void;
  onSelect?: () => void;
  onCopy?: () => void;
  onViewInfo?: () => void;
  hasMedia?: boolean;
  onDownload?: () => void;
  readAt?: string | null;
  sentAt?: string;
  isPinned?: boolean;
}

export function MessageContextMenu({
  children,
  isMine,
  onReply,
  onForward,
  onEdit,
  onPin,
  onDelete,
  onSelect,
  onCopy,
  onViewInfo,
  hasMedia,
  onDownload,
  readAt,
  sentAt,
  isPinned = false,
}: MessageContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64 rounded-xl">
        {/* Read receipt timestamp at top for 1:1 chats */}
        {isMine && sentAt && (
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Sent: {format(new Date(sentAt), 'HH:mm dd/MM/yyyy')}</span>
            </div>
            {readAt && (
              <div className="flex items-center gap-2 text-xs text-blue-500 mt-1">
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Read: {format(new Date(readAt), 'HH:mm dd/MM/yyyy')}</span>
              </div>
            )}
          </div>
        )}
        
        {onViewInfo && (
          <ContextMenuItem onClick={onViewInfo} className="gap-3">
            <Eye className="h-4 w-4" />
            <span>View Info</span>
          </ContextMenuItem>
        )}
        {onReply && (
          <ContextMenuItem onClick={onReply} className="gap-3">
            <Reply className="h-4 w-4" />
            <span>Reply</span>
          </ContextMenuItem>
        )}
        {onForward && (
          <ContextMenuItem onClick={onForward} className="gap-3">
            <Forward className="h-4 w-4" />
            <span>Forward</span>
          </ContextMenuItem>
        )}
        {onCopy && (
          <ContextMenuItem onClick={onCopy} className="gap-3">
            <Copy className="h-4 w-4" />
            <span>Copy Text</span>
          </ContextMenuItem>
        )}
        {isMine && onEdit && (
          <ContextMenuItem onClick={onEdit} className="gap-3">
            <Edit className="h-4 w-4" />
            <span>Edit</span>
          </ContextMenuItem>
        )}
        {onPin && (
          <ContextMenuItem onClick={onPin} className="gap-3">
            {isPinned ? (
              <>
                <PinOff className="h-4 w-4" />
                <span>Unpin</span>
              </>
            ) : (
              <>
                <Pin className="h-4 w-4" />
                <span>Pin</span>
              </>
            )}
          </ContextMenuItem>
        )}
        {hasMedia && onDownload && (
          <ContextMenuItem onClick={onDownload} className="gap-3">
            <Download className="h-4 w-4" />
            <span>Download</span>
          </ContextMenuItem>
        )}
        {onSelect && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onSelect} className="gap-3">
              <CheckSquare className="h-4 w-4" />
              <span>Select</span>
            </ContextMenuItem>
          </>
        )}
        {isMine && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDelete} className="gap-3 text-destructive">
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
