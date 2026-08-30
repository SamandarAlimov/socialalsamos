/**
 * Telegram video-note UI hech qachon viewport overlay bo'lmasligi kerak.
 * Panel MessageInput'ning positioned konteyneriga absolute ankarlanadi.
 */
export const VIDEO_NOTE_MAX_SECONDS = 60;

export const VIDEO_NOTE_PANEL_CLASS =
  'pointer-events-auto absolute bottom-[calc(100%+0.5rem)] right-1 z-20 flex origin-bottom-right flex-col items-center gap-2 rounded-[24px] border border-border/80 bg-card/95 p-2.5 shadow-2xl backdrop-blur-xl sm:right-2';

export const VIDEO_NOTE_PANEL_STYLE = {
  width: 'min(256px, calc(100% - 0.75rem))',
  maxWidth: 'calc(100% - 0.75rem)',
} as const;

export const VIDEO_NOTE_CIRCLE_CLASS = 'relative shrink-0';

export const VIDEO_NOTE_CIRCLE_STYLE = {
  width: 'min(100%, clamp(144px, min(44vw, 30dvh), 220px))',
  aspectRatio: '1 / 1',
} as const;

export function getVideoNoteProgress(
  elapsedMs: number,
  maxSeconds: number = VIDEO_NOTE_MAX_SECONDS
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const maxMs = Math.max(1, maxSeconds * 1000);
  return Math.min(elapsedMs / maxMs, 1);
}
