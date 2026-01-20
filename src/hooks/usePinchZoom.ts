import { useState, useRef, useCallback, useEffect } from 'react';

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

export function usePinchZoom(maxScale = 3, minScale = 1): UsePinchZoomReturn {
  const [state, setState] = useState<ZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const initialDistance = useRef<number>(0);
  const initialScale = useRef<number>(1);
  const lastTap = useRef<number>(0);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const isPinching = useRef<boolean>(false);
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const isZoomed = state.scale > 1;

  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getCenter = (touches: React.TouchList) => {
    if (touches.length < 2) {
      return { x: touches[0].clientX, y: touches[0].clientY };
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  const clampTranslation = useCallback((tx: number, ty: number, scale: number) => {
    if (!containerRef.current || scale <= 1) {
      return { x: 0, y: 0 };
    }

    const rect = containerRef.current.getBoundingClientRect();
    const maxX = (rect.width * (scale - 1)) / 2;
    const maxY = (rect.height * (scale - 1)) / 2;

    return {
      x: Math.max(-maxX, Math.min(maxX, tx)),
      y: Math.max(-maxY, Math.min(maxY, ty)),
    };
  }, []);

  const resetZoom = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      isPinching.current = true;
      initialDistance.current = getDistance(e.touches);
      initialScale.current = state.scale;
      lastTouchCenter.current = getCenter(e.touches);
    } else if (e.touches.length === 1 && isZoomed) {
      // Pan start when zoomed
      isDragging.current = true;
      dragStart.current = {
        x: e.touches[0].clientX - state.translateX,
        y: e.touches[0].clientY - state.translateY,
      };
    }
  }, [state.scale, state.translateX, state.translateY, isZoomed]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isPinching.current && e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches);
      const currentCenter = getCenter(e.touches);
      
      let newScale = initialScale.current * (currentDistance / initialDistance.current);
      newScale = Math.max(minScale, Math.min(maxScale, newScale));

      // Calculate translation to zoom towards pinch center
      let newTranslateX = state.translateX;
      let newTranslateY = state.translateY;

      if (lastTouchCenter.current) {
        const deltaX = currentCenter.x - lastTouchCenter.current.x;
        const deltaY = currentCenter.y - lastTouchCenter.current.y;
        newTranslateX += deltaX;
        newTranslateY += deltaY;
      }

      const clamped = clampTranslation(newTranslateX, newTranslateY, newScale);
      
      setState({
        scale: newScale,
        translateX: clamped.x,
        translateY: clamped.y,
      });

      lastTouchCenter.current = currentCenter;
    } else if (isDragging.current && e.touches.length === 1 && dragStart.current) {
      e.preventDefault();
      const newTranslateX = e.touches[0].clientX - dragStart.current.x;
      const newTranslateY = e.touches[0].clientY - dragStart.current.y;
      
      const clamped = clampTranslation(newTranslateX, newTranslateY, state.scale);
      
      setState(prev => ({
        ...prev,
        translateX: clamped.x,
        translateY: clamped.y,
      }));
    }
  }, [state.scale, state.translateX, state.translateY, clampTranslation, maxScale, minScale]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      isPinching.current = false;
      lastTouchCenter.current = null;
    }
    if (e.touches.length === 0) {
      isDragging.current = false;
      dragStart.current = null;

      // Snap back if scale is too low
      if (state.scale < 1.1) {
        resetZoom();
      }
    }

    // Double tap detection
    if (e.touches.length === 0 && e.changedTouches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        // Double tap detected
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
            setState({
              scale: newScale,
              translateX: clamped.x,
              translateY: clamped.y,
            });
          }
        }
      }
      lastTap.current = now;
    }
  }, [state.scale, isZoomed, resetZoom, clampTranslation]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (isZoomed) {
      resetZoom();
    } else {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const newScale = 2;
        const clamped = clampTranslation(-x * (newScale - 1), -y * (newScale - 1), newScale);
        setState({
          scale: newScale,
          translateX: clamped.x,
          translateY: clamped.y,
        });
      }
    }
  }, [isZoomed, resetZoom, clampTranslation]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    // Detect if this is a touchpad scroll (two-finger scroll) vs intentional pinch-to-zoom
    // Touchpad scrolls typically have small deltaY values and no ctrlKey (unless pinch gesture)
    // Real pinch-to-zoom on touchpads sets e.ctrlKey = true
    // Normal two-finger scrolling should NOT trigger zoom - let the page scroll naturally
    
    // Only zoom if:
    // 1. ctrlKey is pressed (intentional pinch gesture on touchpad, or Ctrl+scroll)
    // 2. Already zoomed in and user is scrolling to zoom out
    const isIntentionalZoom = e.ctrlKey;
    const isZoomingOut = isZoomed && e.deltaY > 0;
    
    if (!isIntentionalZoom && !isZoomingOut) {
      // Allow normal page scrolling - don't prevent default and don't zoom
      return;
    }
    
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(minScale, Math.min(maxScale, state.scale + delta));

    if (newScale === 1) {
      resetZoom();
    } else {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        
        const scaleRatio = newScale / state.scale;
        const newTranslateX = state.translateX * scaleRatio - x * (scaleRatio - 1);
        const newTranslateY = state.translateY * scaleRatio - y * (scaleRatio - 1);
        
        const clamped = clampTranslation(newTranslateX, newTranslateY, newScale);
        setState({
          scale: newScale,
          translateX: clamped.x,
          translateY: clamped.y,
        });
      }
    }
  }, [state.scale, state.translateX, state.translateY, resetZoom, clampTranslation, maxScale, minScale, isZoomed]);

  // Reset zoom when component unmounts or media changes
  useEffect(() => {
    return () => resetZoom();
  }, [resetZoom]);

  return {
    scale: state.scale,
    translateX: state.translateX,
    translateY: state.translateY,
    isZoomed,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onDoubleClick,
      onWheel,
    },
    resetZoom,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
  };
}
