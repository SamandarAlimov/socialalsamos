/**
 * Video sahifasi uchun umumiy formatlash yordamchilari.
 *
 * Flutter (`alsamos-superapp`) tarafdagi `videos` feature bilan bir xil
 * qoidalar: raqamlar K/M/B ko'rinishida, vaqt `m:ss` yoki `h:mm:ss`.
 */

export function formatCompactNumber(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return '0';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(num));
}

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export type MediaAspectKind = 'portrait' | 'landscape' | 'square';

/**
 * 9:16 / 1:1 / 16:9 ni aniqlaydi. Instagram Reels va YouTube kabi
 * har bir nisbat o'ziga mos konteynerda ko'rsatiladi.
 */
export function resolveAspectKind(ratio?: number | null): MediaAspectKind {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return 'portrait';
  if (ratio > 1.15) return 'landscape';
  if (ratio >= 0.9) return 'square';
  return 'portrait';
}

/** Video sarlavhasi: post matnining birinchi qatori. */
export function deriveVideoTitle(content?: string | null, fallback?: string | null): string {
  const firstLine = content?.split('\n').map((line) => line.trim()).find(Boolean);
  if (firstLine) return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
  return fallback ? `@${fallback}` : 'Video';
}
