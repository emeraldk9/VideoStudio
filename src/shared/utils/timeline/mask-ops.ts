/**
 * Pure arithmetic and geometry engine for Video Masking, Shape Cropping & Feathering.
 *
 * Implements:
 * - Geometric and creative mask shapes: rectangle, circle/ellipse, split screen, cinematic letterbox, heart, star
 * - Soft edge feathering via Gaussian blur calculations
 * - Corner radius rounding for rectangular crops
 * - CSS clip-path expression generation (inset, ellipse, polygon)
 * - Dynamic SVG Mask definitions with feGaussianBlur for live DOM preview
 * - FFmpeg crop, letterbox, and alpha mask filter generators
 */

export type MaskShapeType =
  | 'none'
  | 'rectangle'
  | 'circle'
  | 'split'
  | 'filmstrip'
  | 'heart'
  | 'star';

export interface ClipMaskSettings {
  enabled: boolean;
  shape: MaskShapeType;
  x: number;             // 0.0 to 1.0 (Center X, default 0.5)
  y: number;             // 0.0 to 1.0 (Center Y, default 0.5)
  width: number;         // 0.05 to 1.0 (Width fraction, default 0.6)
  height: number;        // 0.05 to 1.0 (Height fraction, default 0.6)
  cornerRadius?: number; // 0 to 100px (for rectangle, default 0)
  feather: number;       // 0 to 100px (soft edge blur radius, default 0)
  rotation?: number;     // -180 to +180 deg (default 0)
  invert?: boolean;      // true = cut out interior / punch hole, default false
}

export interface MaskShapeDefinition {
  type: MaskShapeType;
  label: string;
  icon: string;
  description: string;
}

export const MASK_SHAPES: readonly MaskShapeDefinition[] = [
  {
    type: 'none',
    label: 'None',
    icon: 'block',
    description: 'No mask applied; full original frame is displayed',
  },
  {
    type: 'rectangle',
    label: 'Rectangle',
    icon: 'crop_square',
    description: 'Rectangular or square box with adjustable corner radius',
  },
  {
    type: 'circle',
    label: 'Circle',
    icon: 'radio_button_unchecked',
    description: 'Circular or oval spotlight cutout with smooth falloff',
  },
  {
    type: 'split',
    label: 'Split Screen',
    icon: 'splitscreen',
    description: 'Half-screen split line for comparisons and transitions',
  },
  {
    type: 'filmstrip',
    label: 'Cinematic',
    icon: 'movie',
    description: '2.35:1 widescreen cinematic letterbox matte (top and bottom bars)',
  },
  {
    type: 'heart',
    label: 'Heart',
    icon: 'favorite',
    description: 'Romantic heart silhouette cutout for social and portrait clips',
  },
  {
    type: 'star',
    label: 'Star',
    icon: 'grade',
    description: 'Dynamic 5-point star cutout for creative pop graphics',
  },
];

export type MaskPresetKey =
  | 'rectangle'
  | 'rounded_rect'
  | 'circle'
  | 'split_vertical'
  | 'split_horizontal'
  | 'cinematic_235'
  | 'heart'
  | 'star';

export interface MaskPreset {
  name: string;
  description: string;
  settings: Omit<ClipMaskSettings, 'enabled'>;
}

export const MASK_PRESETS: Record<MaskPresetKey, MaskPreset> = {
  rectangle: {
    name: 'Square Box',
    description: 'Centered box crop (60% x 60%)',
    settings: {
      shape: 'rectangle',
      x: 0.5,
      y: 0.5,
      width: 0.6,
      height: 0.6,
      cornerRadius: 0,
      feather: 0,
      rotation: 0,
      invert: false,
    },
  },
  rounded_rect: {
    name: 'Rounded Card',
    description: 'Modern rounded box with smooth 24px radius',
    settings: {
      shape: 'rectangle',
      x: 0.5,
      y: 0.5,
      width: 0.7,
      height: 0.7,
      cornerRadius: 24,
      feather: 0,
      rotation: 0,
      invert: false,
    },
  },
  circle: {
    name: 'Soft Circle / PiP',
    description: 'Centered circular cutout with soft feathered edges',
    settings: {
      shape: 'circle',
      x: 0.5,
      y: 0.5,
      width: 0.55,
      height: 0.55,
      cornerRadius: 0,
      feather: 10,
      rotation: 0,
      invert: false,
    },
  },
  split_vertical: {
    name: 'Vertical Split',
    description: 'Left 50% split screen',
    settings: {
      shape: 'split',
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 1.0,
      cornerRadius: 0,
      feather: 0,
      rotation: 0,
      invert: false,
    },
  },
  split_horizontal: {
    name: 'Horizontal Split',
    description: 'Top 50% split screen',
    settings: {
      shape: 'split',
      x: 0.5,
      y: 0.5,
      width: 1.0,
      height: 0.5,
      cornerRadius: 0,
      feather: 0,
      rotation: 90,
      invert: false,
    },
  },
  cinematic_235: {
    name: 'Cinematic 2.35:1',
    description: 'Widescreen letterbox matte bars on top and bottom',
    settings: {
      shape: 'filmstrip',
      x: 0.5,
      y: 0.5,
      width: 1.0,
      height: 0.75, // Crops 12.5% from top and bottom
      cornerRadius: 0,
      feather: 0,
      rotation: 0,
      invert: false,
    },
  },
  heart: {
    name: 'Sweet Heart',
    description: 'Centered heart silhouette',
    settings: {
      shape: 'heart',
      x: 0.5,
      y: 0.5,
      width: 0.65,
      height: 0.65,
      cornerRadius: 0,
      feather: 4,
      rotation: 0,
      invert: false,
    },
  },
  star: {
    name: 'Golden Star',
    description: 'Bold 5-point star crop',
    settings: {
      shape: 'star',
      x: 0.5,
      y: 0.5,
      width: 0.65,
      height: 0.65,
      cornerRadius: 0,
      feather: 2,
      rotation: 0,
      invert: false,
    },
  },
};

export const DEFAULT_MASK_SETTINGS: ClipMaskSettings = {
  enabled: false,
  ...MASK_PRESETS.rectangle.settings,
};

/**
 * Generates a standard CSS clip-path expression for high-performance preview.
 */
export function buildCssClipPath(settings: ClipMaskSettings | undefined): string {
  if (!settings || !settings.enabled || settings.shape === 'none') {
    return '';
  }

  const cx = Math.max(0, Math.min(1, settings.x));
  const cy = Math.max(0, Math.min(1, settings.y));
  const w = Math.max(0.05, Math.min(1, settings.width));
  const h = Math.max(0.05, Math.min(1, settings.height));
  const r = Math.max(0, Math.min(100, settings.cornerRadius ?? 0));

  switch (settings.shape) {
    case 'rectangle': {
      const top = Math.max(0, (cy - h / 2) * 100);
      const bottom = Math.max(0, (1 - (cy + h / 2)) * 100);
      const left = Math.max(0, (cx - w / 2) * 100);
      const right = Math.max(0, (1 - (cx + w / 2)) * 100);

      const roundStr = r > 0 ? ` round ${r}px` : '';
      return `inset(${top.toFixed(2)}% ${right.toFixed(2)}% ${bottom.toFixed(2)}% ${left.toFixed(2)}%${roundStr})`;
    }

    case 'circle': {
      const rx = (w / 2) * 100;
      const ry = (h / 2) * 100;
      const posX = cx * 100;
      const posY = cy * 100;
      return `ellipse(${rx.toFixed(2)}% ${ry.toFixed(2)}% at ${posX.toFixed(2)}% ${posY.toFixed(2)}%)`;
    }

    case 'split': {
      const splitPct = (cx * 100).toFixed(2);
      return `polygon(0% 0%, ${splitPct}% 0%, ${splitPct}% 100%, 0% 100%)`;
    }

    case 'filmstrip': {
      const barHeight = Math.max(0, ((1 - h) / 2) * 100).toFixed(2);
      return `inset(${barHeight}% 0% ${barHeight}% 0%)`;
    }

    case 'star': {
      // 5-point star polygon centered at (cx, cy) scaled by (w, h)
      const pts = [
        [0.5, 0.0],
        [0.62, 0.35],
        [0.98, 0.35],
        [0.68, 0.57],
        [0.79, 0.91],
        [0.5, 0.7],
        [0.21, 0.91],
        [0.32, 0.57],
        [0.02, 0.35],
        [0.38, 0.35],
      ];

      const poly = pts.map(([px, py]) => {
        const xCoord = ((cx + (px - 0.5) * w) * 100).toFixed(2);
        const yCoord = ((cy + (py - 0.5) * h) * 100).toFixed(2);
        return `${xCoord}% ${yCoord}%`;
      });

      return `polygon(${poly.join(', ')})`;
    }

    case 'heart': {
      // Approximated polygon silhouette for heart shape
      const pts = [
        [0.5, 0.28],
        [0.65, 0.12],
        [0.85, 0.15],
        [0.95, 0.35],
        [0.9, 0.6],
        [0.5, 0.95],
        [0.1, 0.6],
        [0.05, 0.35],
        [0.15, 0.15],
        [0.35, 0.12],
      ];

      const poly = pts.map(([px, py]) => {
        const xCoord = ((cx + (px - 0.5) * w) * 100).toFixed(2);
        const yCoord = ((cy + (py - 0.5) * h) * 100).toFixed(2);
        return `${xCoord}% ${yCoord}%`;
      });

      return `polygon(${poly.join(', ')})`;
    }

    default:
      return '';
  }
}

export interface SvgMaskData {
  maskId: string;
  hasFeather: boolean;
  blurDeviation: number;
  shapeElement: {
    tag: 'rect' | 'ellipse' | 'polygon';
    props: Record<string, string | number>;
  };
  invert: boolean;
}

/**
 * Computes SVG mask geometry and Gaussian blur parameters for feathered DOM preview.
 */
export function buildSvgMaskData(
  settings: ClipMaskSettings | undefined,
  clipId: string
): SvgMaskData | null {
  if (!settings || !settings.enabled || settings.shape === 'none') {
    return null;
  }

  const maskId = `mask-${clipId}`;
  const feather = Math.max(0, Math.min(100, settings.feather));
  const blurDeviation = feather / 2;
  const invert = Boolean(settings.invert);

  const cx = settings.x * 100;
  const cy = settings.y * 100;
  const w = settings.width * 100;
  const h = settings.height * 100;

  if (settings.shape === 'circle') {
    return {
      maskId,
      hasFeather: feather > 0,
      blurDeviation,
      invert,
      shapeElement: {
        tag: 'ellipse',
        props: {
          cx: `${cx}%`,
          cy: `${cy}%`,
          rx: `${w / 2}%`,
          ry: `${h / 2}%`,
          fill: invert ? 'black' : 'white',
        },
      },
    };
  }

  if (settings.shape === 'filmstrip') {
    const barHeight = Math.max(0, (100 - h) / 2);
    return {
      maskId,
      hasFeather: feather > 0,
      blurDeviation,
      invert,
      shapeElement: {
        tag: 'rect',
        props: {
          x: '0%',
          y: `${barHeight}%`,
          width: '100%',
          height: `${h}%`,
          fill: invert ? 'black' : 'white',
        },
      },
    };
  }

  if (settings.shape === 'split') {
    return {
      maskId,
      hasFeather: feather > 0,
      blurDeviation,
      invert,
      shapeElement: {
        tag: 'rect',
        props: {
          x: '0%',
          y: '0%',
          width: `${cx}%`,
          height: '100%',
          fill: invert ? 'black' : 'white',
        },
      },
    };
  }

  // Default / Rectangle
  return {
    maskId,
    hasFeather: feather > 0,
    blurDeviation,
    invert,
    shapeElement: {
      tag: 'rect',
      props: {
        x: `${cx - w / 2}%`,
        y: `${cy - h / 2}%`,
        width: `${w}%`,
        height: `${h}%`,
        rx: settings.cornerRadius ?? 0,
        ry: settings.cornerRadius ?? 0,
        fill: invert ? 'black' : 'white',
      },
    },
  };
}

/**
 * Builds an FFmpeg video filter segment for masking/cropping.
 */
export function buildFfmpegMaskFilter(
  settings: ClipMaskSettings | undefined,
  frameWidth: number,
  frameHeight: number
): string {
  if (!settings || !settings.enabled || settings.shape === 'none') {
    return '';
  }

  const w = Math.round(settings.width * frameWidth);
  const h = Math.round(settings.height * frameHeight);
  const x = Math.max(0, Math.round(settings.x * frameWidth - w / 2));
  const y = Math.max(0, Math.round(settings.y * frameHeight - h / 2));

  if (settings.shape === 'filmstrip') {
    const barH = Math.round(((1 - settings.height) / 2) * frameHeight);
    return `drawbox=x=0:y=0:w=${frameWidth}:h=${barH}:color=black@1:t=fill,drawbox=x=0:y=${frameHeight - barH}:w=${frameWidth}:h=${barH}:color=black@1:t=fill`;
  }

  if (settings.shape === 'split') {
    const splitW = Math.round(settings.x * frameWidth);
    return `crop=${splitW}:${frameHeight}:0:0`;
  }

  // Standard box crop
  return `crop=${w}:${h}:${x}:${y}`;
}
