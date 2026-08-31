import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * YouTube uslubidagi timeline preview.
 *
 * Timeline bo'ylab surilganda o'sha soniyadagi kadr ko'rsatilishi kerak.
 * Buning uchun ekranda ko'rinmaydigan ikkinchi <video> elementi yaratamiz,
 * uni kerakli soniyaga "seek" qilamiz va `seeked` hodisasida kadrni
 * canvasga chizamiz. Asosiy pleyer to'xtatilmaydi.
 *
 * Eslatma: canvas faqat chiziladi (getImageData ishlatilmaydi), shuning uchun
 * CORS talab qilinmaydi va tashqi CDN videolar ham ishlaydi.
 */

export const SCRUB_PREVIEW_WIDTH = 168;
export const SCRUB_PREVIEW_HEIGHT = 94;

export function useVideoScrubPreview(src?: string, enabled = true) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingTimeRef = useRef<number | null>(null);
  const seekingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!enabled || !src || typeof document === 'undefined') {
      setIsReady(false);
      return;
    }

    const el = document.createElement('video');
    el.src = src;
    el.muted = true;
    el.defaultMuted = true;
    el.preload = 'metadata';
    el.playsInline = true;
    videoRef.current = el;
    setIsReady(false);

    const drawCurrentFrame = () => {
      seekingRef.current = false;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        try {
          ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        } catch {
          /* ba'zi brauzerlarda kadr hali tayyor emas — e'tiborsiz qoldiramiz */
        }
      }

      const pending = pendingTimeRef.current;
      if (pending !== null) {
        pendingTimeRef.current = null;
        seekingRef.current = true;
        try {
          el.currentTime = pending;
        } catch {
          seekingRef.current = false;
        }
      }
    };

    const handleLoaded = () => setIsReady(true);

    el.addEventListener('loadeddata', handleLoaded);
    el.addEventListener('seeked', drawCurrentFrame);
    el.load();

    return () => {
      el.removeEventListener('loadeddata', handleLoaded);
      el.removeEventListener('seeked', drawCurrentFrame);
      el.removeAttribute('src');
      try {
        el.load();
      } catch {
        /* noop */
      }
      videoRef.current = null;
      pendingTimeRef.current = null;
      seekingRef.current = false;
    };
  }, [src, enabled]);

  /** Kerakli soniyadagi kadrni so'raydi (ortiqcha seeklar navbatga qo'yiladi). */
  const requestFrame = useCallback((time: number) => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(time)) return;

    const safeTime = Math.max(0.05, time);

    if (seekingRef.current) {
      pendingTimeRef.current = safeTime;
      return;
    }

    seekingRef.current = true;
    try {
      el.currentTime = safeTime;
    } catch {
      seekingRef.current = false;
    }
  }, []);

  return {
    canvasRef,
    requestFrame,
    isReady,
    previewWidth: SCRUB_PREVIEW_WIDTH,
    previewHeight: SCRUB_PREVIEW_HEIGHT,
  };
}
