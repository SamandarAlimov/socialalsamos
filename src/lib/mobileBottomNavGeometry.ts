/**
 * Shared mobile bottom-navigation geometry.
 *
 * Audit note (2026-09-22):
 * - Before viewport-fit=cover, BottomNavbar used fixed bottom-0 + mb-2 (8px).
 * - After safe-area became visible, several follow-up commits started deriving
 *   the whole dock position from env(safe-area-inset-bottom), which first lifted
 *   the dock and then over-corrected it with a negative bottom offset.
 * - The stable visual contract is viewport-anchored: the dock itself stays 8px
 *   from the rendered viewport bottom on every device. Safe-area handling is
 *   reserved for content that actually needs it, not for moving the whole dock.
 *
 * Video overlays reuse the same geometry so timeline/time/fullscreen controls
 * remain directly above the navbar without independently re-applying safe-area.
 */
export const MOBILE_BOTTOM_NAV_HEIGHT_PX = 62;

/** Mirrors the restored pre-regression BottomNavbar bottom margin. */
export const MOBILE_BOTTOM_NAV_BOTTOM_CSS =
  'max(8px, env(safe-area-inset-bottom, 0px))';

export const MOBILE_BOTTOM_NAV_OVERLAY_GAP_PX = 4;

export const MOBILE_OVER_BOTTOM_NAV_CSS =
  `calc(${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + ${MOBILE_BOTTOM_NAV_BOTTOM_CSS} + ${MOBILE_BOTTOM_NAV_OVERLAY_GAP_PX}px)`;
