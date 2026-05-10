import { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react';
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

const MENU_WIDTH = 240;
const MENU_GAP = 8;
const VIEWPORT_PADDING = 12;

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
  anchorRect,
}: TelegramStyleContextMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const handleAction = useCallback((action?: () => void) => {
    if (action) action();
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

  // Anchored positioning (Android / Telegram Desktop style)
  useLayoutEffect(() => {
    if (!isOpen) return;
    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const node = containerRef.current;
      const measuredHeight = node?.offsetHeight || 320;
      const measuredWidth = node?.offsetWidth || MENU_WIDTH;

      if (!anchorRect) {
        setPosition({
          top: Math.max(VIEWPORT_PADDING, (vh - measuredHeight) / 2),
          left: Math.max(VIEWPORT_PADDING, (vw - measuredWidth) / 2),
        });
        return;
      }

      // Horizontal: align to bubble side, clamp to viewport
      let left = isMine
        ? anchorRect.right - measuredWidth
        : anchorRect.left;
      left = Math.min(Math.max(left, VIEWPORT_PADDING), vw - measuredWidth - VIEWPORT_PADDING);

      // Vertical: prefer below bubble, otherwise above, otherwise clamp
      const spaceBelow = vh - anchorRect.bottom - VIEWPORT_PADDING;
      const spaceAbove = anchorRect.top - VIEWPORT_PADDING;
      let top: number;
      if (spaceBelow >= measuredHeight + MENU_GAP) {
        top = anchorRect.bottom + MENU_GAP;
      } else if (spaceAbove >= measuredHeight + MENU_GAP) {
        top = anchorRect.top - measuredHeight - MENU_GAP;
      } else {
        top = Math.max(VIEWPORT_PADDING, vh - measuredHeight - VIEWPORT_PADDING);
      }
      setPosition({ top, left });
    };
    compute();
    // Re-measure after content paints
    const id = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [isOpen, anchorRect, isMine]);

  const menuItems: {
    icon: typeof Reply;
    label: string;
    action?: () => void;
    destructive?: boolean;
    separator?: 'top' | 'bottom';
  }[] = [];

  if (onReply) menuItems.push({ icon: Reply, label: 'Javob yozish', action: onReply });
  if (onCopy) menuItems.push({ icon: Copy, label: 'Nusxalash', action: onCopy });
  if (hasMedia && onDownload) menuItems.push({ icon: Download, label: 'Saqlash', action: onDownload });
  if (isMine && onEdit) menuItems.push({ icon: Edit, label: 'Tahrirlash', action: onEdit });
  if (onPin) menuItems.push({ icon: isPinned ? PinOff : Pin, label: isPinned ? 'Olib tashlash' : 'Qadash', action: onPin });
  if (onCopyLink) menuItems.push({ icon: Link, label: 'Havolani nusxalash', action: onCopyLink });
  if (onForward) menuItems.push({ icon: Forward, label: 'Uzatish', action: onForward });
  if (isMine && onDelete) menuItems.push({ icon: Trash2, label: "O'chirish", action: onDelete, destructive: true, separator: 'top' });
  if (onSelect) menuItems.push({ icon: CheckSquare, label: 'Tanlash', action: onSelect, separator: 'top' });

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Transparent click-catcher — no blur, no darken (Android style) */}
          <motion.div
            className="fixed inset-0 z-[100]"
            onClick={onClose}
            onContextMenu={(e) => { e.preventDefault(); onClose(); }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          />

          <motion.div
            ref={containerRef}
            className="fixed z-[101] flex flex-col gap-2"
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              width: MENU_WIDTH,
              transformOrigin: isMine ? 'top right' : 'top left',
              visibility: position ? 'visible' : 'hidden',
            }}
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -6 }}
            transition={{ type: 'spring', stiffness: 480, damping: 32, mass: 0.6 }}
          >
            {/* Quick reactions bar */}
            {onAddReaction && (
              <motion.div
                className="flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-popover border border-border shadow-lg"
                initial={{ opacity: 0, scale: 0.7, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -6 }}
                transition={{ type: 'spring', stiffness: 520, damping: 26, mass: 0.5 }}
              >
                {QUICK_EMOJIS.map((emoji, i) => (
                  <motion.button
                    key={emoji}
                    className="text-[20px] p-1 rounded-full hover:scale-125 active:scale-90 transition-transform"
                    onClick={() => handleAction(() => onAddReaction(emoji))}
                    initial={{ opacity: 0, scale: 0.5, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      delay: 0.04 + i * 0.025,
                      type: 'spring',
                      stiffness: 600,
                      damping: 20,
                    }}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </motion.div>
            )}

            {/* Action menu — solid surface, no blur */}
            <motion.div
              className="rounded-2xl overflow-hidden bg-popover border border-border shadow-xl"
              initial={{ opacity: 0, scale: 0.94, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ delay: 0.05, type: 'spring', stiffness: 460, damping: 30, mass: 0.6 }}
            >
              {readInfo && (
                <>
                  <motion.button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent active:bg-accent/80 transition-colors"
                    onClick={() => { if (onViewInfo) handleAction(onViewInfo); }}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08, duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    <CheckCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-[14px] font-medium text-foreground/90 flex-1 truncate">
                      {readInfo}
                    </span>
                    {readAvatars && readAvatars.length > 0 && (
                      <div className="flex -space-x-2">
                        {readAvatars.slice(0, 3).map((avatar, i) => (
                          <Avatar key={i} className="h-5 w-5 border-2 border-popover">
                            <AvatarImage src={avatar.url} alt={avatar.name} />
                            <AvatarFallback className="text-[9px] font-medium bg-muted text-muted-foreground">
                              {avatar.name?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    )}
                  </motion.button>
                  <div className="border-t border-border" />
                </>
              )}

              {menuItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={`${item.label}-${index}`}>
                    {item.separator === 'top' && <div className="border-t border-border" />}
                    <motion.button
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        "hover:bg-accent active:bg-accent/80",
                        item.destructive && "text-destructive"
                      )}
                      onClick={() => handleAction(item.action)}
                      initial={{ opacity: 0, x: isMine ? 8 : -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.09 + index * 0.022,
                        duration: 0.22,
                        ease: [0.2, 0.8, 0.2, 1],
                      }}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] flex-shrink-0",
                          item.destructive ? "text-destructive" : "text-foreground/70"
                        )}
                        strokeWidth={2}
                      />
                      <span
                        className={cn(
                          "text-[14px] font-medium flex-1",
                          item.destructive ? "text-destructive" : "text-foreground/90"
                        )}
                      >
                        {item.label}
                      </span>
                    </motion.button>
                  </div>
                );
              })}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
