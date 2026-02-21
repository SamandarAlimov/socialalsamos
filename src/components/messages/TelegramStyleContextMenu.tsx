import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Reply,
  Forward,
  Edit,
  Pin,
  PinOff,
  Trash2,
  CheckSquare,
  Copy,
  Download,
  CheckCheck,
  Link,
  Flag,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const QUICK_EMOJIS = ['👍', '😄', '❤️', '🥰', '👎', '🔥', '👏'];

interface TelegramStyleContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
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
  onCopyLink?: () => void;
  isPinned?: boolean;
  onAddReaction?: (emoji: string) => void;
  readInfo?: string | null;
  readAvatars?: { url: string; name: string }[];
  children?: React.ReactNode;
  anchorRect?: DOMRect | null;
}

export function TelegramStyleContextMenu({
  isOpen,
  onClose,
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
  onCopyLink,
  isPinned = false,
  onAddReaction,
  readInfo,
  readAvatars,
  children,
  anchorRect,
}: TelegramStyleContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleAction = useCallback((action?: () => void) => {
    if (action) {
      action();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const menuItems = [
    ...(readInfo ? [{
      icon: CheckCheck,
      label: readInfo,
      action: onViewInfo,
      avatars: readAvatars,
      separator: true,
    }] : []),
    ...(onReply ? [{ icon: Reply, label: 'Reply', action: onReply }] : []),
    ...(onCopy ? [{ icon: Copy, label: 'Copy', action: onCopy }] : []),
    ...(hasMedia && onDownload ? [{ icon: Download, label: 'Save', action: onDownload }] : []),
    ...(isMine && onEdit ? [{ icon: Edit, label: 'Edit', action: onEdit }] : []),
    ...(onPin ? [{ 
      icon: isPinned ? PinOff : Pin, 
      label: isPinned ? 'Unpin' : 'Pin', 
      action: onPin 
    }] : []),
    ...(onCopyLink ? [{ icon: Link, label: 'Copy Link', action: onCopyLink }] : []),
    ...(onForward ? [{ icon: Forward, label: 'Forward', action: onForward }] : []),
    ...(isMine && onDelete ? [{ 
      icon: Trash2, 
      label: 'Delete', 
      action: onDelete, 
      destructive: true,
      separator: true,
    }] : []),
    ...(onSelect ? [{ 
      icon: CheckSquare, 
      label: 'Select', 
      action: onSelect,
      separator: true,
    }] : []),
  ];

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Blurred backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-xl"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <div ref={menuRef} className="relative z-10 w-full max-w-sm px-4 flex flex-col items-center gap-2">
            {/* Quick Emoji Reaction Bar */}
            {onAddReaction && (
              <motion.div
                className="flex items-center gap-1 px-3 py-2 rounded-full bg-card/90 backdrop-blur-md border border-border/50 shadow-2xl"
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.8 }}
                transition={{ duration: 0.25, delay: 0.05 }}
              >
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className="text-2xl p-1.5 hover:scale-125 active:scale-95 transition-transform"
                    onClick={() => handleAction(() => onAddReaction(emoji))}
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}

            {/* Message Preview */}
            {children && (
              <motion.div
                className="w-full pointer-events-none"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2, delay: 0.05 }}
              >
                {children}
              </motion.div>
            )}

            {/* Action Menu Card */}
            <motion.div
              className={cn(
                "w-full rounded-2xl overflow-hidden shadow-2xl",
                "bg-card/95 backdrop-blur-xl border border-border/30"
              )}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.9 }}
              transition={{ duration: 0.25, delay: 0.1 }}
            >
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                const showTopSep = item.separator && index > 0;
                const isLast = index === menuItems.length - 1;
                const nextHasSep = !isLast && menuItems[index + 1]?.separator;

                return (
                  <div key={`${item.label}-${index}`}>
                    {showTopSep && (
                      <div className="mx-4 border-t border-border/40" />
                    )}
                    <button
                      className={cn(
                        "w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors active:bg-accent/50",
                        "hover:bg-accent/30",
                        item.destructive && "text-destructive"
                      )}
                      onClick={() => handleAction(item.action)}
                    >
                      <Icon className={cn(
                        "h-5 w-5 flex-shrink-0",
                        item.destructive ? "text-destructive" : "text-foreground/70"
                      )} />
                      <span className={cn(
                        "text-[15px] font-medium flex-1",
                        item.destructive ? "text-destructive" : "text-foreground"
                      )}>
                        {item.label}
                      </span>
                      {/* Read receipt avatars */}
                      {'avatars' in item && item.avatars && (
                        <div className="flex -space-x-2">
                          {item.avatars.slice(0, 3).map((avatar, i) => (
                            <div
                              key={i}
                              className="h-7 w-7 rounded-full bg-muted border-2 border-card overflow-hidden"
                            >
                              {avatar.url ? (
                                <img src={avatar.url} alt={avatar.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                                  {avatar.name?.[0] || '?'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                    {!showTopSep && !nextHasSep && !isLast && (
                      <div className="mx-4 border-t border-border/10" />
                    )}
                  </div>
                );
              })}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}