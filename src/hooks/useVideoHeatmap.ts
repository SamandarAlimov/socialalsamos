import { useEffect, useMemo, useState } from 'react';
import db from '@/lib/supabaseAny';

/**
 * "Eng ko'p qayta ko'rilgan qism" (YouTube: most replayed) egri chizig'i.
 *
 * Manba: `video_watch_segments` jadvali - har video 100 ta bo'lakka bo'linadi
 * va har bo'lak necha marta ko'rilgani jamlanadi (`useVideoWatchTracker`
 * yozadi). Video yangi bo'lsa yoki jadval hali deploy qilinmagan bo'lsa,
 * eski deterministik (post id dan hosil qilinadigan) egri chiziq ko'rsatiladi -
 * shunday qilib UI hech qachon bo'sh qolmaydi.
 *
 * Diqqat: bu faylda `**` (exponentiation) operatori ishlatilmaydi - loyihaning
 * esbuild targeti uni qo'llab-quvvatlamaydi va build yiqiladi. Kvadratga
 * ko'tarish uchun oddiy ko'paytirish ishlatilgan.
 */

const BUCKET_COUNT = 100;

/** Haqiqiy grafik ko'rsatish uchun minimal ma'lumot (aks holda shovqin). */
const MIN_FILLED_BUCKETS = 8;
const MIN_TOTAL_VIEWS = 20;

type SegmentRow = { bucket: number; views: number };

const segmentCache = new Map<string, number[] | null>();
const inFlight = new Map<string, Promise<number[] | null>>();
let capability: 'unknown' | 'available' | 'missing' = 'unknown';

function errorText(error: unknown): string {
  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;

  return [value?.code, value?.message, value?.details, value?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isUnavailableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const text = errorText(error);

  return (
    code === 'PGRST205' ||
    code === 'PGRST301' ||
    code === '42P01' ||
    code === '42501' ||
    text.includes('schema cache') ||
    text.includes('permission denied') ||
    text.includes('row-level security')
  );
}

async function loadSegments(postId: string): Promise<number[] | null> {
  if (capability === 'missing') return null;
  if (segmentCache.has(postId)) return segmentCache.get(postId) ?? null;

  const pending = inFlight.get(postId);
  if (pending) return pending;

  const request = (async (): Promise<number[] | null> => {
    try {
      const { data, error } = await db
        .from('video_watch_segments')
        .select('bucket, views')
        .eq('post_id', postId);

      if (error) {
        if (isUnavailableError(error)) capability = 'missing';
        segmentCache.set(postId, null);
        return null;
      }

      capability = 'available';

      const rows = (data ?? []) as SegmentRow[];
      const total = rows.reduce((sum, row) => sum + (Number(row.views) || 0), 0);

      if (rows.length < MIN_FILLED_BUCKETS || total < MIN_TOTAL_VIEWS) {
        segmentCache.set(postId, null);
        return null;
      }

      const buckets = new Array<number>(BUCKET_COUNT).fill(0);
      rows.forEach((row) => {
        const index = Number(row.bucket);
        if (index >= 0 && index < BUCKET_COUNT) {
          buckets[index] = Number(row.views) || 0;
        }
      });

      segmentCache.set(postId, buckets);
      return buckets;
    } catch {
      segmentCache.set(postId, null);
      return null;
    } finally {
      inFlight.delete(postId);
    }
  })();

  inFlight.set(postId, request);
  return request;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gauss cho'qqisi: exp(-(offset)^2), `**` ishlatmasdan. */
function gaussian(offset: number): number {
  return Math.exp(-(offset * offset));
}

/** Silliqlash (moving average) - YouTube grafigi kabi yumshoq bo'lishi uchun. */
function smooth(values: number[], radius = 1): number[] {
  return values.map((_, index) => {
    const from = Math.max(0, index - radius);
    const to = Math.min(values.length - 1, index + radius);
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += values[i];
    return sum / (to - from + 1);
  });
}

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 0.0001);
  return values.map((value) => Math.min(1, Math.max(0.04, value / max)));
}

/** 100 ta bo'lakni kerakli sample soniga o'tkazadi (o'rtacha bilan). */
function resample(buckets: number[], samples: number): number[] {
  if (samples >= BUCKET_COUNT) {
    return Array.from({ length: samples }, (_, index) => {
      const source = Math.min(
        BUCKET_COUNT - 1,
        Math.floor((index / Math.max(1, samples - 1)) * (BUCKET_COUNT - 1)),
      );
      return buckets[source];
    });
  }

  const size = BUCKET_COUNT / samples;

  return Array.from({ length: samples }, (_, index) => {
    const from = Math.floor(index * size);
    const to = Math.min(BUCKET_COUNT, Math.floor((index + 1) * size));
    let sum = 0;
    let count = 0;
    for (let i = from; i < to; i += 1) {
      sum += buckets[i];
      count += 1;
    }
    return count > 0 ? sum / count : 0;
  });
}

function buildSyntheticCurve(seed: string, samples: number): number[] {
  const rand = mulberry32(hashString(seed || 'alsamos-video'));
  const peaks = 2 + Math.floor(rand() * 3);

  const centers = Array.from({ length: peaks }, () => ({
    center: 0.08 + rand() * 0.84,
    width: 0.05 + rand() * 0.13,
    weight: 0.45 + rand() * 0.55,
  }));

  const raw = Array.from({ length: samples }, (_, index) => {
    const x = index / (samples - 1 || 1);
    // Intro har doim ko'proq ko'riladi, oxiri esa kamayadi.
    let value = 0.32 + 0.3 * gaussian(x / 0.09) - 0.12 * x;
    centers.forEach(({ center, width, weight }) => {
      value += weight * gaussian((x - center) / width);
    });
    return Math.max(0.05, value + (rand() - 0.5) * 0.05);
  });

  return normalize(smooth(raw));
}

export type VideoHeatmapResult = {
  /** 0..1 oralig'idagi qiymatlar (grafik balandligi). */
  values: number[];
  /** true bo'lsa - haqiqiy ko'rishlar statistikasi, false - taxminiy egri. */
  isReal: boolean;
};

export function useVideoHeatmapDetails(
  seed: string,
  samples = 56,
  options?: { enabled?: boolean },
): VideoHeatmapResult {
  const enabled = options?.enabled !== false;

  const synthetic = useMemo(() => buildSyntheticCurve(seed, samples), [seed, samples]);

  const [buckets, setBuckets] = useState<number[] | null>(() =>
    seed ? segmentCache.get(seed) ?? null : null,
  );

  useEffect(() => {
    if (!enabled || !seed) return;

    let alive = true;
    void loadSegments(seed).then((result) => {
      if (alive) setBuckets(result);
    });

    return () => {
      alive = false;
    };
  }, [seed, enabled]);

  return useMemo(() => {
    if (!buckets) return { values: synthetic, isReal: false };
    return { values: normalize(smooth(resample(buckets, samples))), isReal: true };
  }, [buckets, samples, synthetic]);
}

/** Oddiy variant: faqat qiymatlar massivi. */
export function useVideoHeatmap(
  seed: string,
  samples = 56,
  options?: { enabled?: boolean },
): number[] {
  return useVideoHeatmapDetails(seed, samples, options).values;
}
