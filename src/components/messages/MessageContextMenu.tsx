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
  Trash2,
  CheckSquare,
  Copy,
  Download,
} from 'lucide-react';
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
}: MessageContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56 rounded-xl">
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
            <Pin className="h-4 w-4" />
            <span>Pin</span>
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
