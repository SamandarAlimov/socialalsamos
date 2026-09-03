import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UI_LAYER } from '@/lib/uiLayers';

interface TelegramImageViewerProps {
  open: boolean;
  url: string;
  name?: string;
  caption?: string;
  onClose: () => void;
}

/**
 * Telegram-style fullscreen media viewer:
 * dark backdrop, zoom / rotate / download controls, ESC + backdrop close.
 */
export function TelegramImageViewer({ open, url, name, caption, onClose }: TelegramImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (open) {
      setScale(1);
      setRotation(0);
    }
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(s + 0.25, 4));
      if (e.key === '-') setScale((s) => Math.max(s - 0.25, 0.5));
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = name || url.split('/').pop() || 'image';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [url, name]);

  if (typeof document === 'undefined') return null;

  const button =
    'flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={cn('fixed inset-0 flex flex-col bg-black/95 backdrop-blur-sm', UI_LAYER.immersive)}
          onClick={onClose}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="min-w-0 truncate text-sm text-white/80">{name || 'Rasm'}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={button}
                aria-label="Kichiklashtirish"
                onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={button}
                aria-label="Kattalashtirish"
                onClick={() => setScale((s) => Math.min(s + 0.25, 4))}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={button}
                aria-label="Burish"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <button type="button" className={button} aria-label="Yuklab olish" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </button>
              <button type="button" className={button} aria-label="Yopish" onClick={onClose}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="flex flex-1 items-center justify-center overflow-hidden px-3 pb-4">
            <motion.img
              key={url}
              src={url}
              alt={name || 'Rasm'}
              draggable={false}
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
              className={cn(
                'max-h-full max-w-full select-none object-contain transition-transform duration-200',
                scale > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'
              )}
              onClick={(e) => {
                e.stopPropagation();
                setScale((s) => (s > 1 ? 1 : 2));
              }}
            />
          </div>

          {caption && (
            <div className="px-4 pb-6 text-center" onClick={(e) => e.stopPropagation()}>
              <p className="mx-auto max-w-2xl whitespace-pre-wrap break-words text-sm text-white/85">
                {caption}
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
