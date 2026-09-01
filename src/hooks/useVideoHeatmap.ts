import { useMemo } from 'react';

/**
 * "Eng ko'p qayta ko'rilgan qism" (YouTube: most replayed) egri chizig'i.
 *
 * Hozircha backendda soniya-bo'yicha ko'rishlar jadvali yo'q, shuning uchun
 * egri chiziq post `id` sidan deterministik tarzda hosil qilinadi: bir xil
 * video har doim bir xil grafikni ko'rsatadi (random "sakrash" bo'lmaydi).
 * `post_view_segments` jadvali qo'shilganda faqat shu hook ichidagi manba
 * almashtiriladi — UI o'zgarmaydi.
 *
 * Diqqat: bu faylda `**` (exponentiation) operatori ishlatilmaydi — loyihaning
 * esbuild targeti uni qo'llab-quvvatlamaydi va build yiqiladi. Kvadratga
 * ko'tarish uchun oddiy ko'paytirish ishlatilgan.
 */

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

export function useVideoHeatmap(seed: string, samples = 56): number[] {
  return useMemo(() => {
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

    // Silliqlash (moving average) — YouTube grafigi kabi yumshoq bo'lishi uchun.
    const smoothed = raw.map((_, index) => {
      const from = Math.max(0, index - 1);
      const to = Math.min(raw.length - 1, index + 1);
      let sum = 0;
      for (let i = from; i <= to; i += 1) sum += raw[i];
      return sum / (to - from + 1);
    });

    const max = Math.max(...smoothed, 0.0001);
    return smoothed.map((value) => Math.min(1, value / max));
  }, [seed, samples]);
}
