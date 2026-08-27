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
      <ContextMenuContent className="w-64 rounded-2xl">
        {/* Telegramdek yuborilgan / o'qilgan vaqti */}
        {isMine && sentAt && (
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Yuborilgan: {format(new Date(sentAt), 'HH:mm, dd.MM.yyyy')}</span>
            </div>
            {readAt && (
              <div className="mt-1 flex items-center gap-2 text-xs text-blue-500">
                <CheckCheck className="h-3.5 w-3.5" />
                <span>O'qilgan: {format(new Date(readAt), 'HH:mm, dd.MM.yyyy')}</span>
              </div>
            )}
          </div>
        )}

        {onViewInfo && (
          <ContextMenuItem onClick={onViewInfo} className="gap-3">
            <Eye className="h-4 w-4" />
            <span>Ma'lumot</span>
          </ContextMenuItem>
        )}
        {onReply && (
          <ContextMenuItem onClick={onReply} className="gap-3">
            <Reply className="h-4 w-4" />
            <span>Javob berish</span>
          </ContextMenuItem>
        )}
        {onForward && (
          <ContextMenuItem onClick={onForward} className="gap-3">
            <Forward className="h-4 w-4" />
            <span>Yo'naltirish</span>
          </ContextMenuItem>
        )}
        {onCopy && (
          <ContextMenuItem onClick={onCopy} className="gap-3">
            <Copy className="h-4 w-4" />
            <span>Matnni nusxalash</span>
          </ContextMenuItem>
        )}
        {isMine && onEdit && (
          <ContextMenuItem onClick={onEdit} className="gap-3">
            <Edit className="h-4 w-4" />
            <span>Tahrirlash</span>
          </ContextMenuItem>
        )}
        {onPin && (
          <ContextMenuItem onClick={onPin} className="gap-3">
            {isPinned ? (
              <>
                <PinOff className="h-4 w-4" />
                <span>Qadashni bekor qilish</span>
              </>
            ) : (
              <>
                <Pin className="h-4 w-4" />
                <span>Qadab qo'yish</span>
              </>
            )}
          </ContextMenuItem>
        )}
        {hasMedia && onDownload && (
          <ContextMenuItem onClick={onDownload} className="gap-3">
            <Download className="h-4 w-4" />
            <span>Yuklab olish</span>
          </ContextMenuItem>
        )}
        {onSelect && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onSelect} className="gap-3">
              <CheckSquare className="h-4 w-4" />
              <span>Tanlash</span>
            </ContextMenuItem>
          </>
        )}
        {isMine && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDelete} className="gap-3 text-destructive">
              <Trash2 className="h-4 w-4" />
              <span>O'chirish</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
