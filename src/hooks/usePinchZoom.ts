import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

interface UsePinchZoomReturn {
  scale: number;
  translateX: number;
  translateY: number;
  isZoomed: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  };
  resetZoom: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function usePinchZoom(
  maxScale = 3,
  minScale = 1,
  targetRef?: React.RefObject<HTMLDivElement>,
): UsePinchZoomReturn {
  const [state, setState] = useState<ZoomState>({ scale: 1, translateX: 0, translateY: 0 });
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = targetRef ?? internalContainerRef;
  const initialDistance = useRef(0);
  const initialScale = useRef(1);
  const lastTap = useRef(0);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const isPinching = useRef(false);
  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const isZoomed = state.scale > 1;

  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getCenter = (touches: React.TouchList) => {
    if (touches.length < 2) return { x: touches[0].clientX, y: touches[0].clientY };
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  const clampTranslation = useCallback((tx: number, ty: number, scale: number) => {
    if (!containerRef.current || scale <= 1) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const maxX = (rect.width * (scale - 1)) / 2;
    const maxY = (rect.height * (scale - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, tx)),
      y: Math.max(-maxY, Math.min(maxY, ty)),
    };
  }, [containerRef]);

  const resetZoom = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isPinching.current = true;
      initialDistance.current = getDistance(e.touches);
      initialScale.current = state.scale;
      lastTouchCenter.current = getCenter(e.touches);
    } else if (e.touches.length === 1 && isZoomed) {
      isDragging.current = true;
      dragStart.current = {
        x: e.touches[0].clientX - state.translateX,
        y: e.touches[0].clientY - state.translateY,
      };
    }
  }, [isZoomed, state.scale, state.translateX, state.translateY]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isPinching.current && e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches);
      const currentCenter = getCenter(e.touches);
      let newScale = initialScale.current * (currentDistance / initialDistance.current);
      newScale = Math.max(minScale, Math.min(maxScale, newScale));
      let newTranslateX = state.translateX;
      let newTranslateY = state.translateY;
      if (lastTouchCenter.current) {
        newTranslateX += currentCenter.x - lastTouchCenter.current.x;
        newTranslateY += currentCenter.y - lastTouchCenter.current.y;
      }
      const clamped = clampTranslation(newTranslateX, newTranslateY, newScale);
      setState({ scale: newScale, translateX: clamped.x, translateY: clamped.y });
      lastTouchCenter.current = currentCenter;
    } else if (isDragging.current && e.touches.length === 1 && dragStart.current) {
      e.preventDefault();
      const clamped = clampTranslation(
        e.touches[0].clientX - dragStart.current.x,
        e.touches[0].clientY - dragStart.current.y,
        state.scale,
      );
      setState((previous) => ({ ...previous, translateX: clamped.x, translateY: clamped.y }));
    }
  }, [clampTranslation, maxScale, minScale, state.scale, state.translateX, state.translateY]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      isPinching.current = false;
      lastTouchCenter.current = null;
    }
    if (e.touches.length === 0) {
      isDragging.current = false;
      dragStart.current = null;
      if (state.scale < 1.1) resetZoom();
    }

    if (e.touches.length === 0 && e.changedTouches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        if (isZoomed) {
          resetZoom();
        } else {
          const touch = e.changedTouches[0];
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const x = touch.clientX - rect.left - rect.width / 2;
            const y = touch.clientY - rect.top - rect.height / 2;
            const newScale = 2;
            const clamped = clampTranslation(-x * (newScale - 1), -y * (newScale - 1), newScale);
            setState({ scale: newScale, translateX: clamped.x, translateY: clamped.y });
          }
        }
      }
      lastTap.current = now;
    }
  }, [clampTranslation, containerRef, isZoomed, resetZoom, state.scale]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (isZoomed) {
      resetZoom();
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const newScale = 2;
    const clamped = clampTranslation(-x * (newScale - 1), -y * (newScale - 1), newScale);
    setState({ scale: newScale, translateX: clamped.x, translateY: clamped.y });
  }, [clampTranslation, containerRef, isZoomed, resetZoom]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const intentionalZoom = e.ctrlKey;
    const zoomingOut = isZoomed && e.deltaY > 0;
    if (!intentionalZoom && !zoomingOut) return;
    e.preventDefault();
    const nextScale = Math.max(minScale, Math.min(maxScale, state.scale + (e.deltaY > 0 ? -0.1 : 0.1)));
    if (nextScale === 1) {
      resetZoom();
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const ratio = nextScale / state.scale;
    const clamped = clampTranslation(
      state.translateX * ratio - x * (ratio - 1),
      state.translateY * ratio - y * (ratio - 1),
      nextScale,
    );
    setState({ scale: nextScale, translateX: clamped.x, translateY: clamped.y });
  }, [clampTranslation, containerRef, isZoomed, maxScale, minScale, resetZoom, state.scale, state.translateX, state.translateY]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const preventWheelZoom = (event: WheelEvent) => { if (event.ctrlKey) event.preventDefault(); };
    const preventTouchZoom = (event: TouchEvent) => {
      if (event.touches.length >= 2 || isPinching.current || isDragging.current) event.preventDefault();
    };
    const preventSafariGesture = (event: Event) => event.preventDefault();
    node.addEventListener('wheel', preventWheelZoom, { passive: false });
    node.addEventListener('touchmove', preventTouchZoom, { passive: false });
    node.addEventListener('gesturestart', preventSafariGesture as EventListener, { passive: false });
    node.addEventListener('gesturechange', preventSafariGesture as EventListener, { passive: false });
    return () => {
      node.removeEventListener('wheel', preventWheelZoom);
      node.removeEventListener('touchmove', preventTouchZoom);
      node.removeEventListener('gesturestart', preventSafariGesture as EventListener);
      node.removeEventListener('gesturechange', preventSafariGesture as EventListener);
    };
  }, [containerRef]);

  useEffect(() => () => resetZoom(), [resetZoom]);

  return useMemo(() => ({
    scale: state.scale,
    translateX: state.translateX,
    translateY: state.translateY,
    isZoomed,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onDoubleClick, onWheel },
    resetZoom,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
  }), [
    containerRef,
    isZoomed,
    onDoubleClick,
    onTouchEnd,
    onTouchMove,
    onTouchStart,
    onWheel,
    resetZoom,
    state.scale,
    state.translateX,
    state.translateY,
  ]);
}
