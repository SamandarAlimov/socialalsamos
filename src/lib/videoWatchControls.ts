export const WATCH_CONTROLS_HIDE_MS = 3000;

export type WatchSurfaceTapAction = 'show-controls' | 'hide-controls';

/** Mobile/tablet Watch taps mirror YouTube: the surface controls chrome, not playback. */
export function resolveWatchSurfaceTapAction(controlsVisible: boolean): WatchSurfaceTapAction {
  return controlsVisible ? 'hide-controls' : 'show-controls';
}

/** Hover/move should reveal controls only for a mouse, never from touch jitter. */
export function shouldRevealWatchControlsOnPointerMove(pointerType: string): boolean {
  return pointerType === 'mouse';
}

/** YouTube-style double-click fullscreen is a desktop mouse gesture only. */
export function shouldHandleWatchDesktopDoubleClick(pointerType: string): boolean {
  return pointerType === 'mouse';
}
