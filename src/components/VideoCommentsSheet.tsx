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

/**
 * Instagram reference captured by the product team on a 945 x 2048 viewport.
 * These are measured pixels from that screenshot, not guessed percentages:
 * - compact video frame: x=215..730, y=111..798 => 516 x 688
 * - compact sheet top: y=819
 * - expanded sheet top: y=111
 *
 * Ratios keep the same geometry on other mobile viewport sizes while preserving
 * the exact reference proportions on 945 x 2048.
 */
const MOBILE_REFERENCE_WIDTH = 945;
const MOBILE_REFERENCE_HEIGHT = 2048;
const MOBILE_PREVIEW_WIDTH_RATIO = 516 / MOBILE_REFERENCE_WIDTH;
const MOBILE_PREVIEW_HEIGHT_RATIO = 688 / MOBILE_REFERENCE_HEIGHT;
const MOBILE_PREVIEW_TOP_RATIO = 111 / MOBILE_REFERENCE_HEIGHT;
const MOBILE_INITIAL_TOP_RATIO = 819 / MOBILE_REFERENCE_HEIGHT;
const MOBILE_MIN_TOP_RATIO = 111 / MOBILE_REFERENCE_HEIGHT;
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

function visibleViewportArea(element: Element) {
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const right = Math.min(window.innerWidth, rect.right);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function findActiveVideoFrame() {
  if (typeof document === 'undefined') return null;

  let bestVideo: HTMLVideoElement | null = null;
  let bestArea = 0;

  document.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
    if (!video.isConnected || video.closest('[data-video-comments-sheet="true"]')) return;
    const area = visibleViewportArea(video);
    if (area <= bestArea) return;
    bestArea = area;
    bestVideo = video;
  });

  return bestVideo?.parentElement ?? null;
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
 * Video comments use a measured Instagram-style mobile surface.
 *
 * The sheet has real `top` + `bottom: 0` geometry, so the composer remains a
 * viewport-stable flex footer while the handle changes the sheet height. The
 * active video frame is temporarily constrained to the measured Instagram
 * preview rectangle and restored automatically when comments close.
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
    if (!isOpen || !isMobile || typeof document === 'undefined') return;

    const frame = findActiveVideoFrame();
    if (!frame) return;

    frame.classList.add('video-comments-preview-frame');
    frame.style.setProperty('--video-comments-preview-width', `${MOBILE_PREVIEW_WIDTH_RATIO * 100}vw`);
    frame.style.setProperty('--video-comments-preview-height', `${MOBILE_PREVIEW_HEIGHT_RATIO * 100}dvh`);
    frame.style.setProperty('--video-comments-preview-top', `${MOBILE_PREVIEW_TOP_RATIO * 100}dvh`);

    return () => {
      frame.classList.remove('video-comments-preview-frame');
      frame.style.removeProperty('--video-comments-preview-width');
      frame.style.removeProperty('--video-comments-preview-height');
      frame.style.removeProperty('--video-comments-preview-top');
    };
  }, [isMobile, isOpen, postId]);

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
          overlayClassName="bg-transparent"
          aria-describedby="video-comments-mobile-description"
          onOpenAutoFocus={(event) => event.preventDefault()}
          style={{
            top: `max(env(safe-area-inset-top, 0px), ${Math.round(mobileTop)}px)`,
            bottom: 0,
            transition: isDragging ? 'none' : 'top 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          className="video-comments-premium dark inset-x-0 flex h-auto min-h-0 max-h-none flex-col gap-0 overflow-hidden rounded-t-[26px] border-x-0 border-b-0 border-t border-white/[0.08] bg-[#181c1f] p-0 text-white shadow-[0_-10px_30px_rgba(0,0,0,.22)] data-[state=open]:duration-200 data-[state=closed]:duration-200"
        >
          <div
            data-video-comments-drag-handle="true"
            className="relative h-[4.3dvh] shrink-0 cursor-grab select-none touch-none active:cursor-grabbing"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={(event) => finishDrag(event)}
            onPointerCancel={(event) => finishDrag(event, true)}
          >
            <div className="absolute left-1/2 top-[1.8dvh] h-[3px] w-[8.89vw] max-w-[42px] -translate-x-1/2 rounded-full bg-[#a0a9b5]" />
            <SheetHeader className="sr-only">
              <SheetTitle>{commentsCount > 0 ? `Izohlar · ${commentsCount}` : 'Izohlar'}</SheetTitle>
              <SheetDescription id="video-comments-mobile-description">
                Video izohlari. Yuqoridagi tutqich orqali panel balandligini o‘zgartirish mumkin.
              </SheetDescription>
            </SheetHeader>
          </div>

          <div className="dark min-h-0 flex-1 overflow-hidden bg-[#181c1f] text-white [color-scheme:dark]">
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
