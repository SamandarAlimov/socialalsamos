import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CommentsSection } from '@/components/CommentsSection';
import { useIsMobile } from '@/hooks/use-mobile';
import './video-comments-sheet.css';

interface VideoCommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  commentsCount: number;
}

type MobileDragState = {
  pointerId: number;
  startY: number;
  startTop: number;
  currentTop: number;
  lastY: number;
  lastAt: number;
  velocityY: number;
};

const MOBILE_INITIAL_TOP_RATIO = 0.4;
const MOBILE_MIN_TOP_RATIO = 0.055;
const MOBILE_MAX_TOP_RATIO = 0.78;
const MOBILE_DISMISS_TOP_RATIO = 0.72;
const MOBILE_DISMISS_VELOCITY = 0.85;

function getViewportHeight() {
  if (typeof window === 'undefined') return 844;
  return Math.max(1, window.innerHeight || document.documentElement.clientHeight || 844);
}

function mobileSheetBounds() {
  const height = getViewportHeight();
  return {
    height,
    minTop: height * MOBILE_MIN_TOP_RATIO,
    maxTop: height * MOBILE_MAX_TOP_RATIO,
    initialTop: height * MOBILE_INITIAL_TOP_RATIO,
  };
}

function clampMobileTop(value: number) {
  const { minTop, maxTop } = mobileSheetBounds();
  return Math.min(maxTop, Math.max(minTop, value));
}

function DesktopHeader({ commentsCount }: { commentsCount: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MessageCircle className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <SheetTitle className="truncate text-base font-semibold">Izohlar</SheetTitle>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {commentsCount > 0 ? `${commentsCount} ta izoh` : 'Fikr va javoblar'}
        </p>
      </div>
    </div>
  );
}

/**
 * Video comments use a dedicated Instagram-style mobile surface.
 *
 * Mobile intentionally does not use Vaul's translated full-height drawer. A
 * translated ancestor also translates a fixed composer, which is why the input
 * used to disappear when the sheet was dragged down. Instead the Radix sheet is
 * physically bounded by `top` and `bottom: 0`: dragging changes only its top
 * edge, the conversation gets a real visible height, and the composer remains
 * the flex footer at the viewport bottom.
 *
 * The initial position leaves the active video visible above the comments. The
 * handle can be released at any intermediate height; dragging far enough down
 * dismisses the sheet. There is deliberately no close icon on mobile.
 */
export function VideoCommentsSheet({
  isOpen,
  onClose,
  postId,
  commentsCount,
}: VideoCommentsSheetProps) {
  const isMobile = useIsMobile();
  const dragRef = useRef<MobileDragState | null>(null);
  const [mobileTop, setMobileTop] = useState(() => mobileSheetBounds().initialTop);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = themeMeta?.getAttribute('content') ?? null;
    const previousBodyBackground = document.body.style.backgroundColor;
    const previousHtmlBackground = document.documentElement.style.backgroundColor;

    themeMeta?.setAttribute('content', '#000000');
    document.body.style.backgroundColor = '#000000';
    document.documentElement.style.backgroundColor = '#000000';

    return () => {
      if (themeMeta) {
        if (previousThemeColor === null) themeMeta.removeAttribute('content');
        else themeMeta.setAttribute('content', previousThemeColor);
      }
      document.body.style.backgroundColor = previousBodyBackground;
      document.documentElement.style.backgroundColor = previousHtmlBackground;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isMobile) return;
    dragRef.current = null;
    setIsDragging(false);
    setMobileTop(mobileSheetBounds().initialTop);
  }, [isMobile, isOpen, postId]);

  useEffect(() => {
    if (!isOpen || !isMobile) return;

    const handleResize = () => {
      const activeElement = document.activeElement;
      const keyboardLikelyOpen = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
      if (keyboardLikelyOpen) return;
      setMobileTop((current) => clampMobileTop(current));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile, isOpen]);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    const now = performance.now();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: mobileTop,
      currentTop: mobileTop,
      lastY: event.clientY,
      lastAt: now,
      velocityY: 0,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, [mobileTop]);

  const handleDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastAt);
    drag.velocityY = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastAt = now;

    const nextTop = clampMobileTop(drag.startTop + event.clientY - drag.startY);
    drag.currentTop = nextTop;
    setMobileTop(nextTop);
    event.preventDefault();
  }, []);

  const finishDrag = useCallback((event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (cancelled) return;

    const { height } = mobileSheetBounds();
    const shouldDismiss =
      drag.currentTop >= height * MOBILE_DISMISS_TOP_RATIO ||
      (drag.velocityY >= MOBILE_DISMISS_VELOCITY && drag.currentTop >= height * 0.54);

    if (shouldDismiss) onClose();
  }, [onClose]);

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          hideDefaultClose
          data-video-comments-sheet="true"
          overlayClassName="bg-black/10"
          aria-describedby="video-comments-mobile-description"
          onOpenAutoFocus={(event) => event.preventDefault()}
          style={{
            top: `max(env(safe-area-inset-top, 0px), ${Math.round(mobileTop)}px)`,
            bottom: 0,
            transition: isDragging ? 'none' : 'top 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          className="video-comments-premium dark inset-x-0 flex h-auto min-h-0 max-h-none flex-col gap-0 overflow-hidden rounded-t-[26px] border-x-0 border-b-0 border-t border-white/[0.09] bg-[#0a0a0b] p-0 text-white shadow-[0_-16px_52px_rgba(0,0,0,.34)] data-[state=open]:duration-200 data-[state=closed]:duration-200"
        >
          <div
            data-video-comments-drag-handle="true"
            className="shrink-0 cursor-grab select-none touch-none active:cursor-grabbing"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={(event) => finishDrag(event)}
            onPointerCancel={(event) => finishDrag(event, true)}
          >
            <div className="mx-auto mt-2.5 h-[3px] w-10 rounded-full bg-white/40" />
            <SheetHeader className="border-b border-white/[0.07] px-4 pb-2.5 pt-1 text-center">
              <SheetTitle className="text-[15px] font-semibold leading-6 tracking-[-0.01em] text-white">
                {commentsCount > 0 ? `Izohlar · ${commentsCount}` : 'Izohlar'}
              </SheetTitle>
              <SheetDescription id="video-comments-mobile-description" className="sr-only">
                Video izohlari. Yuqoridagi tutqich orqali panel balandligini o‘zgartirish mumkin.
              </SheetDescription>
            </SheetHeader>
          </div>

          <div className="dark min-h-0 flex-1 overflow-hidden bg-[#0a0a0b] text-white [color-scheme:dark]">
            <CommentsSection
              postId={postId}
              layout="panel"
              appearance="immersive"
              quickReactions
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="video-comments-premium flex w-[min(440px,40vw)] min-w-[380px] flex-col overflow-hidden border-l border-border/70 bg-background p-0 text-foreground shadow-[-24px_0_70px_rgba(0,0,0,0.18)] dark:bg-neutral-950 sm:max-w-none"
        overlayClassName="bg-black/10 backdrop-blur-[0.5px] dark:bg-black/45"
        hideDefaultClose
        aria-describedby="video-comments-desktop-description"
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
          <DesktopHeader commentsCount={commentsCount} />
          <SheetDescription id="video-comments-desktop-description" className="sr-only">
            Video izohlari paneli.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CommentsSection postId={postId} layout="panel" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
