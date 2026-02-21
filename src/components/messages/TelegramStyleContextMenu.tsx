import { useEffect, useRef, useCallback, useState } from 'react';
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
  Heart,
  MessageSquare,
  ArrowLeft,
  BellPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
  const [showReadDetail, setShowReadDetail] = useState(false);

  const handleAction = useCallback((action?: () => void) => {
    if (action) {
      action();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      setShowReadDetail(false);
      return;
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Build menu items matching Alsamos design order
  const menuItems: {
    icon: typeof Reply;
    label: string;
    action?: () => void;
    destructive?: boolean;
    separator?: 'top' | 'bottom';
  }[] = [];

  // Read info row (top, with separator below)
  // Added separately below

  // Main actions
  if (onReply) menuItems.push({ icon: Reply, label: 'Javob yozish', action: onReply });
  if (onCopy) menuItems.push({ icon: Copy, label: 'Nusxalash', action: onCopy });
  if (hasMedia && onDownload) menuItems.push({ icon: Download, label: 'Saqlash', action: onDownload });
  if (isMine && onEdit) menuItems.push({ icon: Edit, label: 'Tahrirlash', action: onEdit });
  if (onPin) menuItems.push({ icon: isPinned ? PinOff : Pin, label: isPinned ? 'Olib tashlash' : 'Qadash', action: onPin });
  if (onCopyLink) menuItems.push({ icon: Link, label: 'Havolani nusxalash', action: onCopyLink });
  if (onForward) menuItems.push({ icon: Forward, label: 'Uzatish', action: onForward });

  // Delete (destructive, separator above)
  if (isMine && onDelete) {
    menuItems.push({ icon: Trash2, label: "O'chirish", action: onDelete, destructive: true, separator: 'top' });
  }

  // Select (separator above)
  if (onSelect) {
    menuItems.push({ icon: CheckSquare, label: 'Tanlash', action: onSelect, separator: 'top' });
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Blurred backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-2xl"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <div ref={menuRef} className="relative z-10 w-full max-w-[340px] px-3 flex flex-col items-center gap-2.5">
            {/* Quick Emoji Reaction Bar */}
            {onAddReaction && (
              <motion.div
                className="flex items-center gap-0.5 px-2.5 py-1.5 rounded-full bg-white/80 dark:bg-card/90 backdrop-blur-xl shadow-lg border border-white/30 dark:border-border/30"
                initial={{ opacity: 0, y: 16, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.85 }}
                transition={{ duration: 0.22, delay: 0.03 }}
              >
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className="text-[22px] p-1.5 hover:scale-125 active:scale-90 transition-transform"
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
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.18, delay: 0.04 }}
              >
                {children}
              </motion.div>
            )}

            {/* Action Menu Card - Alsamos Style */}
            <motion.div
              className="w-full rounded-[20px] overflow-hidden shadow-2xl bg-white/85 dark:bg-card/90 backdrop-blur-2xl border border-white/40 dark:border-border/20"
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.92 }}
              transition={{ duration: 0.22, delay: 0.08 }}
            >
              {/* Read Info Row */}
              {readInfo && (
                <>
                  <button
                    className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left hover:bg-black/5 dark:hover:bg-accent/30 active:bg-black/10 dark:active:bg-accent/50 transition-colors"
                    onClick={() => {
                      if (onViewInfo) {
                        handleAction(onViewInfo);
                      }
                    }}
                  >
                    <CheckCheck className="h-5 w-5 text-foreground/60 flex-shrink-0" />
                    <span className="text-[15px] font-medium text-foreground/90 flex-1 truncate">
                      {readInfo}
                    </span>
                    {readAvatars && readAvatars.length > 0 && (
                      <div className="flex -space-x-2">
                        {readAvatars.slice(0, 3).map((avatar, i) => (
                          <Avatar key={i} className="h-7 w-7 border-2 border-white dark:border-card">
                            <AvatarImage src={avatar.url} alt={avatar.name} />
                            <AvatarFallback className="text-[10px] font-medium bg-muted text-muted-foreground">
                              {avatar.name?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    )}
                  </button>
                  <div className="mx-5 border-t border-black/8 dark:border-border/30" />
                </>
              )}

              {/* Menu Items */}
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={`${item.label}-${index}`}>
                    {item.separator === 'top' && (
                      <div className="mx-5 border-t border-black/8 dark:border-border/30" />
                    )}
                    <button
                      className={cn(
                        "w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors",
                        "hover:bg-black/5 dark:hover:bg-accent/30 active:bg-black/10 dark:active:bg-accent/50",
                        item.destructive && "text-destructive"
                      )}
                      onClick={() => handleAction(item.action)}
                    >
                      <Icon className={cn(
                        "h-[22px] w-[22px] flex-shrink-0",
                        item.destructive ? "text-destructive" : "text-foreground/70"
                      )} strokeWidth={1.8} />
                      <span className={cn(
                        "text-[16px] font-medium flex-1",
                        item.destructive ? "text-destructive" : "text-foreground/90"
                      )}>
                        {item.label}
                      </span>
                    </button>
                    {item.separator === 'bottom' && (
                      <div className="mx-5 border-t border-black/8 dark:border-border/30" />
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
