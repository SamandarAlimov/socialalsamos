/**
 * Shared mobile bottom-navigation geometry.
 *
 * Keep feed overlays and the floating navigation in one coordinate system so
 * safe-area insets never get counted twice on iOS, Android gesture navigation,
 * Samsung Internet, tablets, PWAs or regular mobile browsers.
 */
export const MOBILE_BOTTOM_NAV_HEIGHT_PX = 56;

export const MOBILE_BOTTOM_NAV_BOTTOM_CSS =
  'clamp(4px, calc(env(safe-area-inset-bottom, 0px) - 28px), 8px)';

export const MOBILE_BOTTOM_NAV_OVERLAY_GAP_PX = 4;

export const MOBILE_OVER_BOTTOM_NAV_CSS =
  `calc(${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + ${MOBILE_BOTTOM_NAV_BOTTOM_CSS} + ${MOBILE_BOTTOM_NAV_OVERLAY_GAP_PX}px)`;
