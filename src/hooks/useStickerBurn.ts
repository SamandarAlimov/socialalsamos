import { useCallback, useRef, useState } from 'react';
import {
  burnStickersIntoVideo,
  type BurnPlacement,
} from '@/lib/video/stickerCompositor';
import { isFfmpegAvailable, muxAudioFrom } from '@/lib/video/ffmpegClient';
import {
  chooseBurnRoute,
  enqueueBurnJob,
  looksLikeMobile,
  watchJob,
  type BurnRoute,
  type VideoJob,
} from '@/lib/video/videoJobs';

export type BurnPhase = 'idle' | 'composing' | 'muxing' | 'queued' | 'processing' | 'done';

export interface BurnResult {
  route: BurnRoute;
  /** Klient yo‘lida natija fayli. */
  blob?: Blob;
  /** Server yo‘lida navbatdagi vazifa. */
  job?: VideoJob;
}

/**
 * Bosqich E: stikerni videoga kuydirishning yagona kirish nuqtasi.
 *
 * Chaqiruvchi qaysi yo‘l tanlanganini bilishi shart emas — hook o‘zi
 * ADR-001 bo‘yicha qaror qiladi va holatni bir xil ko‘rinishda qaytaradi.
 */
export function useStickerBurn() {
  const [phase, setPhase] = useState<BurnPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [job, setJob] = useState<VideoJob | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const unwatchRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    unwatchRef.current?.();
    unwatchRef.current = null;
    setPhase('idle');
    setProgress(0);
  }, []);

  const burn = useCallback(
    async (params: {
      file: File | Blob;
      placements: BurnPlacement[];
      durationSeconds?: number | null;
      /** Server yo‘li uchun kerak. */
      sourceUrl?: string;
      postId?: string | null;
      mediaId?: string | null;
      keepAudio?: boolean;
    }): Promise<BurnResult> => {
      const route = chooseBurnRoute({
        durationSeconds: params.durationSeconds,
        fileSize: params.file.size,
        isMobile: looksLikeMobile(),
      });

      // ---- Server yo‘li -----------------------------------------------------
      if (route === 'server') {
        if (!params.sourceUrl) {
          throw new Error('Uzun video uchun avval fayl yuklanishi kerak');
        }

        setPhase('queued');
        setProgress(0);

        const created = await enqueueBurnJob({
          postId: params.postId ?? null,
          mediaId: params.mediaId ?? null,
          sourceUrl: params.sourceUrl,
          payload: { placements: params.placements },
        });

        setJob(created);

        unwatchRef.current = watchJob(created.id, (updated) => {
          setJob(updated);
          setProgress(updated.progress ?? 0);

          if (updated.status === 'processing') setPhase('processing');
          if (updated.status === 'done' || updated.status === 'failed') {
            setPhase('done');
            unwatchRef.current?.();
            unwatchRef.current = null;
          }
        });

        return { route, job: created };
      }

      // ---- Klient yo‘li -----------------------------------------------------
      const controller = new AbortController();
      abortRef.current = controller;

      setPhase('composing');
      setProgress(0);

      // Kompozitor kadrlarni yozadi, lekin audio yo‘qoladi — kadr bosqichi
      // umumiy jarayonning 80% i deb hisoblanadi.
      let output = await burnStickersIntoVideo(params.file, params.placements, {
        signal: controller.signal,
        onProgress: (ratio) => setProgress(ratio * 0.8),
      });

      if (params.keepAudio !== false) {
        const canMux = await isFfmpegAvailable();

        if (canMux) {
          setPhase('muxing');
          try {
            output = await muxAudioFrom(output, params.file, (ratio) =>
              setProgress(0.8 + ratio * 0.2),
            );
          } catch (error) {
            // Audio biriktirilmasa ham natija bor — jarayonni to‘xtatmaymiz.
            console.warn('Audio biriktirilmadi:', error);
          }
        }
      }

      setProgress(1);
      setPhase('done');
      return { route, blob: output };
    },
    [],
  );

  return { burn, cancel, phase, progress, job };
}
