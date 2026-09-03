/**
 * Global UI stacking policy.
 *
 * Keep these values sparse on purpose so local component z-index values can
 * live inside their own stacking context without competing with app-level
 * overlays.
 *
 * page content        0..1199
 * shell floating UI   1300
 * immersive/fullscreen 2000
 * modal backdrop      6000
 * modal content       6010
 * modal popover       6020
 * media viewer        7000
 */
export const UI_LAYER = {
  shellFloating: 'z-[1300]',
  immersive: 'z-[2000]',
  modalOverlay: 'z-[6000]',
  modalContent: 'z-[6010]',
  modalPopover: 'z-[6020]',
  mediaViewer: 'z-[7000]',
} as const;
