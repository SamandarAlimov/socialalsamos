import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Volume2, VolumeX } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CommentsSection } from '@/components/CommentsSection';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  VIDEO_COMMENTS_GEOMETRY,
  VIDEO_COMMENTS_REFERENCE_ASPECT,
  fitVideoCommentsPreview,
  scaleVideoCommentsReference,
} from '@/lib/videoCommentsGeometry';
import {
  isVideoCommentsListAtPullDismissEdge,
  resolveVideoCommentsSheetDrag,
  settleVideoCommentsSheetDetent,
  shouldDismissVideoCommentsSheet,
  type VideoCommentsSheetDetent,
} from '@/lib/videoCommentsSheetGesture';
import './video-comments-sheet.css';

interface VideoCommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  commentsCount: number;
}

type MobileDragSource = 'handle' | 'comments';

type MobileDragState = {
  pointerId: number;
  source: MobileDragSource;
  startY: number;
  startTop: number;
  startDismissOffset: number;
  currentTop: number;
  currentDismissOffset: number;
  lastY: number;
  lastAt: number;
  velocityY: number;
};

type CommentTouchState = {
  identifier: number;
  startX: number;
  startY: number;
  lastY: number;
  startedAtDismissEdge: boolean;
  transferredToSheet: boolean;
};

type PreviewSurface = {
  frame: HTMLElement;
  video: HTMLVideoElement;
};

type ScrollLockSnapshot = {
  element: HTMLElement;
  overflowY: string;
  overscrollBehaviorY: string;
};

const PREVIEW_TRANSITION_MS = 240;
const COMMENT_SCROLL_EPSILON = 1;
const COMMENT_PULL_ACTIVATION_PX = 2;

function getViewportHeight() {
  if (typeof window === 'undefined') return 844;
  return Math.max(
    1,
    window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      844,
  );
}

function getViewportWidth() {
  if (typeof window === 'undefined') return 390;
  return Math.max(
    1,
    window.visualViewport?.width ||
      window.innerWidth ||
      document.documentElement.clientWidth ||
      390,
  );
}

function currentMeasuredGeometry() {
  return scaleVideoCommentsReference(getViewportWidth(), getViewportHeight());
}

function mobileSheetBounds() {
  const height = getViewportHeight();
  return {
    height,
    minTop: height * VIDEO_COMMENTS_GEOMETRY.expandedSheetTopRatio,
    initialTop: height * VIDEO_COMMENTS_GEOMETRY.initialSheetTopRatio,
  };
}

function visibleViewportArea(element: Element) {
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const right = Math.min(getViewportWidth(), rect.right);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(getViewportHeight(), rect.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function directVideoChild(element: HTMLElement) {
  return Array.from(element.children).find(
    (child): child is HTMLVideoElement =>
      child instanceof HTMLVideoElement &&
      child.isConnected &&
      !child.closest('[data-video-comments-sheet="true"]'),
  ) ?? null;
}

function surfaceFromStackElement(element: Element): PreviewSurface | null {
  let node = element instanceof HTMLElement ? element : element.parentElement;

  while (node && node !== document.body) {
    const video = directVideoChild(node);
    if (video) return { frame: node, video };
    node = node.parentElement;
  }

  return null;
}

/**
 * Prefer the top-most video surface at the visible Reel area. This matters when
 * VideoWatchPanel is portaled above the feed: both videos may have the same
 * viewport area, but only the top-most one is the surface the user is seeing.
 */
function findActiveVideoSurface(): PreviewSurface | null {
  if (typeof document === 'undefined') return null;

  const width = getViewportWidth();
  const height = getViewportHeight();
  const samplePoints = [
    [width / 2, Math.max(1, height * 0.14)],
    [width / 2, Math.max(1, height * 0.24)],
    [width / 2, Math.max(1, height * 0.34)],
  ] as const;

  for (const [x, y] of samplePoints) {
    for (const element of document.elementsFromPoint(x, Math.min(height - 1, y))) {
      const surface = surfaceFromStackElement(element);
      if (surface) return surface;
    }
  }

  let bestSurface: PreviewSurface | null = null;
  let bestArea = 0;

  document.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
    if (!video.isConnected || video.closest('[data-video-comments-sheet="true"]')) return;
    const frame = video.parentElement;
    if (!frame) return;
    const area = visibleViewportArea(video);
    // Use >= so later portal content wins ties over the underlying feed.
    if (area < bestArea) return;
    bestArea = area;
    bestSurface = { frame, video };
  });

  return bestSurface;
}

function videoAspect(video: HTMLVideoElement) {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return video.videoWidth / video.videoHeight;
  }

  const rect = video.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return rect.width / rect.height;
  return VIDEO_COMMENTS_REFERENCE_ASPECT;
}

function applyPreviewGeometry(
  frame: HTMLElement,
  video: HTMLVideoElement,
  sheetTop: number,
) {
  const fit = fitVideoCommentsPreview(
    getViewportWidth(),
    getViewportHeight(),
    videoAspect(video),
    sheetTop,
  );

  frame.style.setProperty('--video-comments-preview-stage-top', `${fit.stageTop}px`);
  frame.style.setProperty('--video-comments-preview-stage-height', `${fit.stageHeight}px`);
  frame.style.setProperty('--video-comments-preview-media-top', `${fit.mediaTop - fit.stageTop}px`);
  frame.style.setProperty('--video-comments-preview-media-width', `${fit.mediaWidth}px`);
  frame.style.setProperty('--video-comments-preview-media-height', `${fit.mediaHeight}px`);

  return fit;
}

function clearPreviewGeometry(frame: HTMLElement) {
  frame.classList.remove('video-comments-preview-frame', 'video-comments-preview-no-transition');
  frame.style.removeProperty('--video-comments-preview-stage-top');
  frame.style.removeProperty('--video-comments-preview-stage-height');
  frame.style.removeProperty('--video-comments-preview-media-top');
  frame.style.removeProperty('--video-comments-preview-media-width');
  frame.style.removeProperty('--video-comments-preview-media-height');
}

function findScrollableAncestor(frame: HTMLElement) {
  let node = frame.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
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
 * Mobile behavior mirrors Instagram Reels:
 * - the same playing <video> remains mounted (no clone, reload or time reset),
 * - only the video is kept in the compact preview stage; Reel chrome disappears,
 * - the intrinsic media aspect ratio is preserved,
 * - comments scroll normally until their scrollTop reaches zero, then a further
 *   downward pull is handed to the sheet,
 * - expanded -> compact resizes the sheet, while compact -> dismiss translates
 *   the whole sheet so the composer exits with it instead of leaving a tiny
 *   compressed panel,
 * - dragging the sheet continuously changes the available preview stage,
 * - the underlying Reel feed is locked while comments are open,
 * - mute/unmute remains available beside the compact preview.
 */
export function VideoCommentsSheet({
  isOpen,
  onClose,
  postId,
  commentsCount,
}: VideoCommentsSheetProps) {
  const isMobile = useIsMobile();
  const dragRef = useRef<MobileDragState | null>(null);
  const commentTouchRef = useRef<CommentTouchState | null>(null);
  const mobileTopRef = useRef(mobileSheetBounds().initialTop);
  const dismissOffsetRef = useRef(0);
  const detentRef = useRef<VideoCommentsSheetDetent>('initial');
  const previewFrameRef = useRef<HTMLElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const sheetContentRef = useRef<HTMLDivElement | null>(null);
  const scrollLockRef = useRef<ScrollLockSnapshot | null>(null);
  const previewListenerCleanupRef = useRef<(() => void) | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const previewCloseTimerRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  const [mobileTop, setMobileTop] = useState(() => mobileSheetBounds().initialTop);
  const [dismissOffset, setDismissOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [composerFocused, setComposerFocused] = useState(false);
  const [keyboardViewport, setKeyboardViewport] = useState(() => ({
    offsetTop: typeof window !== 'undefined' ? Math.max(0, window.visualViewport?.offsetTop ?? 0) : 0,
    height: getViewportHeight(),
  }));

  const unlockFeed = useCallback(() => {
    const snapshot = scrollLockRef.current;
    if (!snapshot) return;
    snapshot.element.style.overflowY = snapshot.overflowY;
    snapshot.element.style.overscrollBehaviorY = snapshot.overscrollBehaviorY;
    scrollLockRef.current = null;
  }, []);

  const lockFeed = useCallback((frame: HTMLElement) => {
    unlockFeed();
    const scrollable = findScrollableAncestor(frame);
    if (!scrollable) return;
    scrollLockRef.current = {
      element: scrollable,
      overflowY: scrollable.style.overflowY,
      overscrollBehaviorY: scrollable.style.overscrollBehaviorY,
    };
    scrollable.style.overflowY = 'hidden';
    scrollable.style.overscrollBehaviorY = 'none';
  }, [unlockFeed]);

  const detachPreviewListeners = useCallback(() => {
    previewListenerCleanupRef.current?.();
    previewListenerCleanupRef.current = null;
  }, []);

  const cancelDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const cancelPreviewTimers = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    if (previewCloseTimerRef.current !== null) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
  }, []);

  const cleanupPreviewNow = useCallback(() => {
    cancelPreviewTimers();
    detachPreviewListeners();
    const frame = previewFrameRef.current;
    if (frame) clearPreviewGeometry(frame);
    previewFrameRef.current = null;
    previewVideoRef.current = null;
    unlockFeed();
    setHasPreview(false);
  }, [cancelPreviewTimers, detachPreviewListeners, unlockFeed]);

  const setSheetTopImmediately = useCallback((nextTop: number) => {
    mobileTopRef.current = nextTop;
    const frame = previewFrameRef.current;
    const video = previewVideoRef.current;
    if (frame && video) applyPreviewGeometry(frame, video, nextTop);
    setMobileTop(nextTop);
  }, []);

  const setSheetDismissOffset = useCallback((nextOffset: number) => {
    const safeOffset = Math.max(0, nextOffset);
    dismissOffsetRef.current = safeOffset;
    setDismissOffset(safeOffset);
  }, []);

  const beginMobileDrag = useCallback((
    clientY: number,
    pointerId: number,
    source: MobileDragSource,
  ) => {
    cancelDismissTimer();
    const now = performance.now();
    dragRef.current = {
      pointerId,
      source,
      startY: clientY,
      startTop: mobileTopRef.current,
      startDismissOffset: dismissOffsetRef.current,
      currentTop: mobileTopRef.current,
      currentDismissOffset: dismissOffsetRef.current,
      lastY: clientY,
      lastAt: now,
      velocityY: 0,
    };
    setIsDragging(true);
  }, [cancelDismissTimer]);

  const updateMobileDrag = useCallback((clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;

    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastAt);
    drag.velocityY = (clientY - drag.lastY) / elapsed;
    drag.lastY = clientY;
    drag.lastAt = now;

    const bounds = mobileSheetBounds();
    const next = resolveVideoCommentsSheetDrag(
      drag.startTop,
      drag.startDismissOffset,
      clientY - drag.startY,
      bounds,
    );

    drag.currentTop = next.top;
    drag.currentDismissOffset = next.dismissOffset;
    setSheetTopImmediately(next.top);
    setSheetDismissOffset(next.dismissOffset);
  }, [setSheetDismissOffset, setSheetTopImmediately]);

  const animateDismissAndClose = useCallback((fromOffset: number) => {
    const bounds = mobileSheetBounds();
    detentRef.current = 'initial';
    setSheetTopImmediately(bounds.initialTop);
    const offscreenOffset = Math.max(
      fromOffset,
      bounds.height - bounds.initialTop + 48,
    );
    setSheetDismissOffset(offscreenOffset);
    cancelDismissTimer();
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      onClose();
    }, PREVIEW_TRANSITION_MS);
  }, [cancelDismissTimer, onClose, setSheetDismissOffset, setSheetTopImmediately]);

  const settleMobileDrag = useCallback((cancelled = false) => {
    const drag = dragRef.current;
    if (!drag) return;

    dragRef.current = null;
    setIsDragging(false);
    const bounds = mobileSheetBounds();

    if (cancelled) {
      setSheetDismissOffset(0);
      const fallback = detentRef.current === 'expanded' ? bounds.minTop : bounds.initialTop;
      setSheetTopImmediately(fallback);
      return;
    }

    if (shouldDismissVideoCommentsSheet(
      drag.currentDismissOffset,
      drag.velocityY,
      bounds.height,
    )) {
      animateDismissAndClose(drag.currentDismissOffset);
      return;
    }

    // Once the compact Instagram detent is reached, a short downward pull must
    // spring back to that detent; it must never settle as a tiny compressed sheet.
    if (drag.currentDismissOffset > 0) {
      detentRef.current = 'initial';
      setSheetTopImmediately(bounds.initialTop);
      setSheetDismissOffset(0);
      return;
    }

    const nextDetent = settleVideoCommentsSheetDetent(
      drag.currentTop,
      drag.velocityY,
      bounds,
    );
    detentRef.current = nextDetent;
    setSheetDismissOffset(0);
    setSheetTopImmediately(nextDetent === 'expanded' ? bounds.minTop : bounds.initialTop);
  }, [animateDismissAndClose, setSheetDismissOffset, setSheetTopImmediately]);

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
    cancelDismissTimer();
    dragRef.current = null;
    commentTouchRef.current = null;
    detentRef.current = 'initial';
    setIsDragging(false);
    const nextTop = mobileSheetBounds().initialTop;
    mobileTopRef.current = nextTop;
    dismissOffsetRef.current = 0;
    setMobileTop(nextTop);
    setDismissOffset(0);
  }, [cancelDismissTimer, isMobile, isOpen, postId]);

  useEffect(() => {
    if (!isMobile || typeof document === 'undefined') return;

    if (!isOpen) {
      const frame = previewFrameRef.current;
      const video = previewVideoRef.current;
      detachPreviewListeners();

      if (!frame || !video) {
        unlockFeed();
        setHasPreview(false);
        return;
      }

      cancelPreviewTimers();
      const geometry = currentMeasuredGeometry();
      applyPreviewGeometry(frame, video, getViewportHeight() + geometry.previewGap);
      previewCloseTimerRef.current = window.setTimeout(() => {
        clearPreviewGeometry(frame);
        if (previewFrameRef.current === frame) previewFrameRef.current = null;
        if (previewVideoRef.current === video) previewVideoRef.current = null;
        previewCloseTimerRef.current = null;
        unlockFeed();
        setHasPreview(false);
      }, PREVIEW_TRANSITION_MS);
      return;
    }

    cancelPreviewTimers();
    detachPreviewListeners();

    const surface = findActiveVideoSurface();
    if (!surface) {
      cleanupPreviewNow();
      return;
    }

    if (previewFrameRef.current && previewFrameRef.current !== surface.frame) {
      clearPreviewGeometry(previewFrameRef.current);
    }

    previewFrameRef.current = surface.frame;
    previewVideoRef.current = surface.video;
    setPreviewMuted(surface.video.muted);
    setHasPreview(true);
    lockFeed(surface.frame);

    const geometry = currentMeasuredGeometry();
    surface.frame.classList.add('video-comments-preview-frame', 'video-comments-preview-no-transition');
    applyPreviewGeometry(surface.frame, surface.video, getViewportHeight() + geometry.previewGap);
    // Force the full-size starting geometry to paint before animating to the
    // compact Instagram detent.
    void surface.frame.offsetHeight;
    surface.frame.classList.remove('video-comments-preview-no-transition');
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null;
      if (previewFrameRef.current !== surface.frame) return;
      applyPreviewGeometry(surface.frame, surface.video, mobileTopRef.current);
    });

    const syncMuted = () => setPreviewMuted(surface.video.muted);
    const syncMetadata = () => {
      if (previewFrameRef.current === surface.frame) {
        applyPreviewGeometry(surface.frame, surface.video, mobileTopRef.current);
      }
    };
    surface.video.addEventListener('volumechange', syncMuted);
    surface.video.addEventListener('loadedmetadata', syncMetadata);
    previewListenerCleanupRef.current = () => {
      surface.video.removeEventListener('volumechange', syncMuted);
      surface.video.removeEventListener('loadedmetadata', syncMetadata);
    };
  }, [
    cancelPreviewTimers,
    cleanupPreviewNow,
    detachPreviewListeners,
    isMobile,
    isOpen,
    lockFeed,
    postId,
    unlockFeed,
  ]);

  useEffect(() => {
    mobileTopRef.current = mobileTop;
    if (!isOpen || !isMobile) return;
    const frame = previewFrameRef.current;
    const video = previewVideoRef.current;
    if (frame && video) applyPreviewGeometry(frame, video, mobileTop);
  }, [isMobile, isOpen, mobileTop]);

  useEffect(() => {
    if (!isOpen || !isMobile || typeof document === 'undefined') return;

    const syncKeyboardViewport = () => {
      const viewport = window.visualViewport;
      setKeyboardViewport({
        offsetTop: Math.max(0, viewport?.offsetTop ?? 0),
        height: Math.max(1, viewport?.height ?? window.innerHeight),
      });
    };

    const isComposerTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest('[data-video-comments-sheet="true"] [data-comment-composer="true"]'));

    const handleFocusIn = (event: FocusEvent) => {
      if (!isComposerTarget(event.target)) return;

      detentRef.current = 'expanded';
      setSheetDismissOffset(0);
      setComposerFocused(true);
      syncKeyboardViewport();
    };

    const handleFocusOut = () => {
      requestAnimationFrame(() => {
        if (isComposerTarget(document.activeElement)) return;
        setComposerFocused(false);
      });
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    window.visualViewport?.addEventListener('resize', syncKeyboardViewport);
    window.visualViewport?.addEventListener('scroll', syncKeyboardViewport);

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      window.visualViewport?.removeEventListener('resize', syncKeyboardViewport);
      window.visualViewport?.removeEventListener('scroll', syncKeyboardViewport);
      setComposerFocused(false);
    };
  }, [isMobile, isOpen, setSheetDismissOffset]);

  useEffect(() => {
    if (!isOpen || !isMobile) return;

    const handleResize = () => {
      const activeElement = document.activeElement;
      const keyboardLikelyOpen =
        composerFocused ||
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;
      if (keyboardLikelyOpen) return;

      const bounds = mobileSheetBounds();
      const nextTop = detentRef.current === 'expanded' ? bounds.minTop : bounds.initialTop;
      dismissOffsetRef.current = 0;
      setDismissOffset(0);
      setSheetTopImmediately(nextTop);
    };

    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [composerFocused, isMobile, isOpen, setSheetTopImmediately]);

  /**
   * Nested Instagram-style scroll handoff:
   * - the comments list owns ordinary vertical scrolling;
   * - once a downward pull reaches the list's dismiss edge (or the list is too
   *   short to scroll), the same gesture is transferred to the sheet;
   * - delegated document capture keeps this reliable through Radix portals,
   *   comment rerenders and touchend events that finish outside the list;
   * - after handoff, the sheet stays attached to the finger until release and
   *   can cross compact -> dismiss in one continuous gesture.
   */
  useEffect(() => {
    if (!isOpen || !isMobile || typeof document === 'undefined') return;

    const findTouch = (touches: TouchList, identifier: number) => {
      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index);
        if (touch?.identifier === identifier) return touch;
      }
      return null;
    };

    const commentListFromTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const list = target.closest<HTMLElement>('[data-comment-list="true"]');
      const sheet = sheetContentRef.current;
      if (!list || !sheet || !sheet.contains(list)) return null;
      return list;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        commentTouchRef.current = null;
        return;
      }

      const commentList = commentListFromTarget(event.target);
      const touch = event.touches.item(0);
      if (!commentList || !touch) {
        commentTouchRef.current = null;
        return;
      }

      commentTouchRef.current = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastY: touch.clientY,
        startedAtDismissEdge: isVideoCommentsListAtPullDismissEdge(
          commentList.scrollTop,
          commentList.scrollHeight,
          commentList.clientHeight,
          COMMENT_SCROLL_EPSILON,
        ),
        transferredToSheet: false,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const state = commentTouchRef.current;
      if (!state) return;

      const commentList = commentListFromTarget(event.target)
        ?? sheetContentRef.current?.querySelector<HTMLElement>('[data-comment-list="true"]')
        ?? null;
      if (!commentList) return;

      const touch = findTouch(event.touches, state.identifier);
      if (!touch) return;

      const deltaSinceLast = touch.clientY - state.lastY;
      state.lastY = touch.clientY;

      if (!state.transferredToSheet) {
        const totalY = touch.clientY - state.startY;
        const totalX = touch.clientX - state.startX;
        const verticalIntent = Math.abs(totalY) >= Math.abs(totalX);
        const pullingDown = deltaSinceLast > 0 && totalY > COMMENT_PULL_ACTIVATION_PX;
        const atDismissEdge = isVideoCommentsListAtPullDismissEdge(
          commentList.scrollTop,
          commentList.scrollHeight,
          commentList.clientHeight,
          COMMENT_SCROLL_EPSILON,
        );

        if (!verticalIntent || !pullingDown || !atDismissEdge) {
          if (!atDismissEdge) state.startedAtDismissEdge = false;
          return;
        }

        // If the gesture began at the edge, retain the whole pull distance.
        // If native scrolling reached the edge mid-gesture, hand off at the
        // current finger position to avoid a visual jump.
        const activationY = state.startedAtDismissEdge ? state.startY : touch.clientY;
        beginMobileDrag(activationY, -1, 'comments');
        state.transferredToSheet = true;
      }

      if (event.cancelable) event.preventDefault();
      commentList.scrollTop = 0;
      updateMobileDrag(touch.clientY);
    };

    const finishTouch = (event: TouchEvent, cancelled: boolean) => {
      const state = commentTouchRef.current;
      if (!state) return;

      if (state.transferredToSheet) {
        if (event.cancelable) event.preventDefault();
        settleMobileDrag(cancelled);
      }
      commentTouchRef.current = null;
    };

    const handleTouchEnd = (event: TouchEvent) => finishTouch(event, false);
    const handleTouchCancel = (event: TouchEvent) => finishTouch(event, true);

    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', handleTouchEnd, { capture: true, passive: false });
    document.addEventListener('touchcancel', handleTouchCancel, { capture: true, passive: false });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('touchcancel', handleTouchCancel, true);
      commentTouchRef.current = null;
    };
  }, [beginMobileDrag, isMobile, isOpen, settleMobileDrag, updateMobileDrag]);

  useEffect(() => () => {
    cancelDismissTimer();
    cancelPreviewTimers();
    detachPreviewListeners();
    const frame = previewFrameRef.current;
    if (frame) clearPreviewGeometry(frame);
    previewFrameRef.current = null;
    previewVideoRef.current = null;
    unlockFeed();
  }, [cancelDismissTimer, cancelPreviewTimers, detachPreviewListeners, unlockFeed]);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    beginMobileDrag(event.clientY, event.pointerId, 'handle');
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, [beginMobileDrag]);

  const handleDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.source !== 'handle' || drag.pointerId !== event.pointerId) return;
    updateMobileDrag(event.clientY);
    event.preventDefault();
  }, [updateMobileDrag]);

  const finishDrag = useCallback((event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.source !== 'handle' || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    settleMobileDrag(cancelled);
  }, [settleMobileDrag]);

  const togglePreviewMute = useCallback(() => {
    const video = previewVideoRef.current;
    const frame = previewFrameRef.current;
    if (!video || !frame) return;

    const nativeMuteButton = Array.from(frame.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
      const label = (button.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('ovozni') || label.includes('mute') || label.includes('unmute');
    });

    if (nativeMuteButton) {
      nativeMuteButton.click();
      requestAnimationFrame(() => setPreviewMuted(video.muted));
      return;
    }

    video.muted = !video.muted;
    video.dispatchEvent(new Event('volumechange'));
    setPreviewMuted(video.muted);
  }, []);

  if (isMobile) {
    const geometry = currentMeasuredGeometry();
    const previewFit = fitVideoCommentsPreview(
      getViewportWidth(),
      getViewportHeight(),
      previewVideoRef.current ? videoAspect(previewVideoRef.current) : VIDEO_COMMENTS_REFERENCE_ASPECT,
      mobileTop,
    );
    const showPreviewMute =
      hasPreview &&
      isOpen &&
      !composerFocused &&
      previewFit.stageHeight >= 72 &&
      previewFit.mediaHeight >= 72;
    const mobileStyle = {
      top: composerFocused
        ? `calc(${Math.round(keyboardViewport.offsetTop)}px + env(safe-area-inset-top, 0px))`
        : `${Math.round(mobileTop)}px`,
      bottom: composerFocused ? 'auto' : 0,
      height: composerFocused
        ? `calc(${Math.round(keyboardViewport.height)}px - env(safe-area-inset-top, 0px))`
        : undefined,
      maxHeight: composerFocused
        ? `calc(${Math.round(keyboardViewport.height)}px - env(safe-area-inset-top, 0px))`
        : undefined,
      transform: dismissOffset > 0 ? `translate3d(0, ${Math.round(dismissOffset)}px, 0)` : undefined,
      borderTopLeftRadius: `${geometry.sheetCornerRadius}px`,
      borderTopRightRadius: `${geometry.sheetCornerRadius}px`,
      transition: isDragging
        ? 'none'
        : `top ${PREVIEW_TRANSITION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), transform ${PREVIEW_TRANSITION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
      willChange: 'top, transform',
      '--video-comments-footer-height': `${geometry.footerHeight}px`,
      '--video-comments-handle-top': `${geometry.handleTopWithinSheet}px`,
      '--video-comments-handle-width': `${geometry.handleWidth}px`,
      '--video-comments-handle-height': `${geometry.handleHeight}px`,
    } as React.CSSProperties;

    return (
      <>
        {showPreviewMute && typeof document !== 'undefined' && createPortal(
          <button
            type="button"
            onClick={togglePreviewMute}
            aria-label={previewMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}
            className="fixed z-[6005] flex h-11 w-11 items-center justify-center rounded-full bg-[#23282d]/95 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-xl transition active:scale-90"
            style={{
              right: 'max(14px, env(safe-area-inset-right))',
              top: `${Math.max(12, previewFit.stageTop + previewFit.stageHeight - 54)}px`,
            }}
          >
            {previewMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>,
          document.body,
        )}

        <Sheet modal={false} open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <SheetContent
            ref={sheetContentRef}
            side="bottom"
            hideDefaultClose
            data-video-comments-sheet="true"
            data-video-comments-dragging={isDragging ? 'true' : 'false'}
            data-video-comments-dismiss-phase={dismissOffset > 0 ? 'true' : 'false'}
            data-video-comments-keyboard-active={composerFocused ? 'true' : 'false'}
            overlayClassName="pointer-events-none bg-transparent"
            aria-describedby="video-comments-mobile-description"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            style={mobileStyle}
            className="video-comments-premium dark inset-x-0 flex h-auto min-h-0 max-h-none flex-col gap-0 overflow-hidden border-x-0 border-b-0 border-t border-white/[0.08] bg-[#181c1f] p-0 text-white shadow-none data-[state=open]:duration-200 data-[state=closed]:duration-200"
          >
            <div
              data-video-comments-drag-handle="true"
              className="relative h-[4.3dvh] shrink-0 cursor-grab select-none touch-none active:cursor-grabbing"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={(event) => finishDrag(event)}
              onPointerCancel={(event) => finishDrag(event, true)}
            >
              <div className="video-comments-measured-handle absolute left-1/2 -translate-x-1/2 rounded-full bg-[#a0a9b5]" />
              <SheetHeader className="sr-only">
                <SheetTitle>{commentsCount > 0 ? `Izohlar · ${commentsCount}` : 'Izohlar'}</SheetTitle>
                <SheetDescription id="video-comments-mobile-description">
                  Video izohlari. Panelni tutqichdan yoki izohlar ro‘yxati yuqorisiga yetgach pastga tortish mumkin.
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
      </>
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
