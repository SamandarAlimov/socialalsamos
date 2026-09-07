import { FILTERS, type FilterEffect } from './FilterData';

export type CameraBlendMode =
  | 'darken'
  | 'lighten'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'color-burn'
  | 'color-dodge'
  | 'exclusion'
  | 'hue';

export interface CameraGradientStop {
  offset: number;
  color: string;
}

export type CameraOverlay =
  | {
      kind: 'solid';
      color: string;
      blendMode: CameraBlendMode;
      opacity?: number;
    }
  | {
      kind: 'linear';
      direction: 'right' | 'bottom';
      stops: CameraGradientStop[];
      blendMode: CameraBlendMode;
      opacity?: number;
    }
  | {
      kind: 'radial';
      center?: [number, number];
      stops: CameraGradientStop[];
      blendMode: CameraBlendMode;
      opacity?: number;
    };

export interface CameraLens extends FilterEffect {
  source: 'cssgram' | 'alsamos';
  sourceLabel: string;
  overlays?: CameraOverlay[];
}

const solid = (
  color: string,
  blendMode: CameraBlendMode,
  opacity?: number,
): CameraOverlay => ({ kind: 'solid', color, blendMode, opacity });

const linear = (
  direction: 'right' | 'bottom',
  stops: CameraGradientStop[],
  blendMode: CameraBlendMode,
  opacity?: number,
): CameraOverlay => ({ kind: 'linear', direction, stops, blendMode, opacity });

const radial = (
  stops: CameraGradientStop[],
  blendMode: CameraBlendMode,
  opacity?: number,
  center?: [number, number],
): CameraOverlay => ({ kind: 'radial', stops, blendMode, opacity, center });

/**
 * Camera presets adapted from CSSgram (MIT, Una Kravets).
 * The exact filter/overlay recipes live locally so camera output works offline
 * and the effect is burned into photos/videos instead of being preview-only.
 */
const CSSGRAM_LENSES: CameraLens[] = [
  {
    id: 'clarendon',
    name: 'Clarendon',
    category: 'basic',
    style: 'contrast(1.2) saturate(1.35)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgba(127, 187, 227, .2)', 'overlay')],
  },
  {
    id: 'aden',
    name: 'Aden',
    category: 'mood',
    style: 'hue-rotate(-20deg) contrast(.9) saturate(.85) brightness(1.2)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [linear('right', [{ offset: 0, color: 'rgba(66, 10, 14, .2)' }, { offset: 1, color: 'rgba(66, 10, 14, 0)' }], 'darken')],
  },
  {
    id: 'inkwell',
    name: 'Inkwell',
    category: 'artistic',
    style: 'sepia(.3) contrast(1.1) brightness(1.1) grayscale(1)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
  },
  {
    id: 'perpetua',
    name: 'Perpetua',
    category: 'mood',
    style: '',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [linear('bottom', [{ offset: 0, color: '#005b9a' }, { offset: 1, color: '#e6c13d' }], 'soft-light', 0.5)],
  },
  {
    id: 'reyes',
    name: 'Reyes',
    category: 'vintage',
    style: 'sepia(.22) brightness(1.1) contrast(.85) saturate(.75)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('#efcdad', 'soft-light', 0.5)],
  },
  {
    id: 'gingham',
    name: 'Gingham',
    category: 'vintage',
    style: 'brightness(1.05) hue-rotate(-10deg)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('lavender', 'soft-light')],
  },
  {
    id: 'toaster',
    name: 'Toaster',
    category: 'vintage',
    style: 'contrast(1.5) brightness(.9)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [radial([{ offset: 0, color: '#804e0f' }, { offset: 1, color: '#3b003b' }], 'screen')],
  },
  {
    id: 'walden',
    name: 'Walden',
    category: 'vintage',
    style: 'brightness(1.1) hue-rotate(-10deg) sepia(.3) saturate(1.6)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('#0044cc', 'screen', 0.3)],
  },
  {
    id: 'hudson',
    name: 'Hudson',
    category: 'vintage',
    style: 'brightness(1.2) contrast(.9) saturate(1.1)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [radial([{ offset: 0.5, color: '#a6b1ff' }, { offset: 1, color: '#342134' }], 'multiply', 0.5)],
  },
  {
    id: 'earlybird',
    name: 'Earlybird',
    category: 'vintage',
    style: 'contrast(.9) sepia(.2)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [radial([{ offset: 0.2, color: '#d0ba8e' }, { offset: 0.85, color: '#360309' }, { offset: 1, color: '#1d0210' }], 'overlay')],
  },
  {
    id: 'mayfair',
    name: 'Mayfair',
    category: 'mood',
    style: 'contrast(1.1) saturate(1.1)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [radial([{ offset: 0, color: 'rgba(255, 255, 255, .8)' }, { offset: 0.28, color: 'rgba(255, 200, 200, .6)' }, { offset: 0.6, color: '#111111' }, { offset: 1, color: '#111111' }], 'overlay', 0.4, [0.4, 0.4])],
  },
  {
    id: 'lofi',
    name: 'Lo-Fi',
    category: 'vintage',
    style: 'saturate(1.1) contrast(1.5)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [radial([{ offset: 0.7, color: 'rgba(0, 0, 0, 0)' }, { offset: 1.5, color: '#222222' }], 'multiply')],
  },
  {
    id: '1977',
    name: '1977',
    category: 'vintage',
    style: 'contrast(1.1) brightness(1.1) saturate(1.3)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgba(243, 106, 188, .3)', 'screen')],
  },
  {
    id: 'brooklyn',
    name: 'Brooklyn',
    category: 'vintage',
    style: 'contrast(.9) brightness(1.1)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [radial([{ offset: 0.7, color: 'rgba(168, 223, 193, .4)' }, { offset: 1, color: 'rgb(196, 183, 200)' }], 'overlay')],
  },
  {
    id: 'xpro2',
    name: 'X-Pro II',
    category: 'vintage',
    style: 'sepia(.3)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [radial([{ offset: 0.4, color: 'rgb(230, 231, 224)' }, { offset: 1.1, color: 'rgba(43, 42, 161, .6)' }], 'color-burn')],
  },
  {
    id: 'nashville',
    name: 'Nashville',
    category: 'vintage',
    style: 'sepia(.2) contrast(1.2) brightness(1.05) saturate(1.2)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgba(247, 176, 153, .56)', 'darken'), solid('rgba(0, 70, 150, .4)', 'lighten')],
  },
  {
    id: 'lark',
    name: 'Lark',
    category: 'basic',
    style: 'contrast(.9)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgb(34, 37, 63)', 'color-dodge'), solid('rgba(242, 242, 242, .8)', 'darken')],
  },
  {
    id: 'rise',
    name: 'Rise',
    category: 'vintage',
    style: 'brightness(1.05) sepia(.2) contrast(.9) saturate(.9)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [
      radial([{ offset: 0, color: 'rgba(236, 205, 169, .15)' }, { offset: 0.55, color: 'rgba(236, 205, 169, .15)' }, { offset: 1, color: 'rgba(50, 30, 7, .4)' }], 'multiply'),
      radial([{ offset: 0, color: 'rgba(232, 197, 152, .8)' }, { offset: 0.9, color: 'rgba(232, 197, 152, 0)' }], 'overlay', 0.6),
    ],
  },
  {
    id: 'slumber',
    name: 'Slumber',
    category: 'mood',
    style: 'saturate(.66) brightness(1.05)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgba(69, 41, 12, .4)', 'lighten'), solid('rgba(125, 105, 24, .5)', 'soft-light')],
  },
  {
    id: 'brannan',
    name: 'Brannan',
    category: 'vintage',
    style: 'sepia(.5) contrast(1.4)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgba(161, 44, 199, .31)', 'lighten')],
  },
  {
    id: 'valencia',
    name: 'Valencia',
    category: 'vintage',
    style: 'contrast(1.08) brightness(1.08) sepia(.08)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgb(58, 3, 57)', 'exclusion', 0.5)],
  },
  {
    id: 'kelvin',
    name: 'Kelvin',
    category: 'color',
    style: '',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgb(56, 44, 52)', 'color-dodge'), solid('rgb(183, 125, 33)', 'overlay')],
  },
  {
    id: 'maven',
    name: 'Maven',
    category: 'mood',
    style: 'sepia(.25) brightness(.95) contrast(.95) saturate(1.5)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgba(3, 230, 26, .2)', 'hue')],
  },
  {
    id: 'stinson',
    name: 'Stinson',
    category: 'mood',
    style: 'contrast(.75) saturate(.85) brightness(1.15)',
    source: 'cssgram',
    sourceLabel: 'CSSgram · MIT',
    overlays: [solid('rgba(240, 149, 128, .2)', 'soft-light')],
  },
];

const normalLens: CameraLens = {
  id: 'none',
  name: 'Normal',
  category: 'basic',
  style: '',
  source: 'alsamos',
  sourceLabel: 'Alsamos',
};

const cssgramIds = new Set(CSSGRAM_LENSES.map((lens) => lens.id));

const alsamosLenses: CameraLens[] = FILTERS.filter(
  (filter) => filter.id !== 'none' && !cssgramIds.has(filter.id),
).map((filter) => ({
  ...filter,
  source: 'alsamos' as const,
  sourceLabel: 'Alsamos',
}));

export const CAMERA_LENSES: CameraLens[] = [normalLens, ...CSSGRAM_LENSES, ...alsamosLenses];

export function cameraOverlayCss(overlay: CameraOverlay): string {
  if (overlay.kind === 'solid') return overlay.color;
  const stops = overlay.stops
    .map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
    .join(', ');
  if (overlay.kind === 'linear') return `linear-gradient(to ${overlay.direction}, ${stops})`;
  const [x, y] = overlay.center ?? [0.5, 0.5];
  return `radial-gradient(circle at ${Math.round(x * 100)}% ${Math.round(y * 100)}%, ${stops})`;
}

export function drawCameraLensOverlays(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  lens: CameraLens,
) {
  if (!lens.overlays?.length) return;
  for (const overlay of lens.overlays) {
    context.save();
    context.filter = 'none';
    context.globalAlpha = overlay.opacity ?? 1;
    context.globalCompositeOperation = overlay.blendMode;
    if (overlay.kind === 'solid') {
      context.fillStyle = overlay.color;
    } else if (overlay.kind === 'linear') {
      const gradient = overlay.direction === 'right'
        ? context.createLinearGradient(0, 0, canvas.width, 0)
        : context.createLinearGradient(0, 0, 0, canvas.height);
      addCanvasGradientStops(gradient, overlay.stops);
      context.fillStyle = gradient;
    } else {
      const [cx, cy] = overlay.center ?? [0.5, 0.5];
      const maxOffset = Math.max(1, ...overlay.stops.map((stop) => stop.offset));
      const radius = Math.hypot(canvas.width, canvas.height) * 0.55 * maxOffset;
      const gradient = context.createRadialGradient(
        canvas.width * cx,
        canvas.height * cy,
        0,
        canvas.width * cx,
        canvas.height * cy,
        radius,
      );
      addCanvasGradientStops(gradient, overlay.stops.map((stop) => ({ ...stop, offset: stop.offset / maxOffset })));
      context.fillStyle = gradient;
    }
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
}

function addCanvasGradientStops(gradient: CanvasGradient, stops: CameraGradientStop[]) {
  const ordered = [...stops].sort((a, b) => a.offset - b.offset);
  for (const stop of ordered) {
    gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
  }
}
