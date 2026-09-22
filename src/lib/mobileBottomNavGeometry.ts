/**
 * Shared mobile bottom-navigation geometry.
 *
 * Keep feed overlays and the floating navigation in one coordinate system so
 * safe-area insets never get counted twice across gesture-navigation devices,
 * tablets, PWAs and regular mobile browsers.
 *
 * Some mobile browsers expose the system gesture/home-indicator area below the
 * CSS visual viewport even with viewport-fit=cover. Counter-shifting by the
 * reported safe-area inset lets the translucent dock visually continue into
 * that system area while the icons remain above it. On devices without such an
 * inset env(...) resolves to 0 and the dock simply sits 4px from the bottom.
 */
export const MOBILE_BOTTOM_NAV_HEIGHT_PX = 56;

export const MOBILE_BOTTOM_NAV_BOTTOM_CSS =
  'clamp(-40px, calc(4px - env(safe-area-inset-bottom, 0px)), 4px)';

export const MOBILE_BOTTOM_NAV_OVERLAY_GAP_PX = 4;

export const MOBILE_OVER_BOTTOM_NAV_CSS =
  `calc(${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + ${MOBILE_BOTTOM_NAV_BOTTOM_CSS} + ${MOBILE_BOTTOM_NAV_OVERLAY_GAP_PX}px)`;
