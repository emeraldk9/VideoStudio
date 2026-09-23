/**
 * S46 — Cinematic Lens Distortion, Radial Chromatic Aberration & Optical Vignette Falloff Engine.
 *
 * Implements radial polynomial lens distortion (barrel/pincushion),
 * anamorphic aspect desqueeze, RGB chromatic aberration split,
 * and optical vignette falloff for live preview and FFmpeg rendering.
 */

export interface ClipLensOpticsSettings {
  enabled: boolean;
  /** Primary radial distortion factor (-1.0 to 1.0, default 0; negative = barrel/flatten, positive = pincushion). */
  distortionK1: number;
  /** Higher-order radial distortion factor (-1.0 to 1.0, default 0). */
  distortionK2: number;
  /** Anamorphic horizontal desqueeze ratio (1.0 to 2.0, e.g. 1.33x, 1.5x, 1.8x, 2.0x, default 1.0). */
  anamorphicRatio: number;
  /** Lateral chromatic aberration displacement in pixels (0 to 20, default 0). */
  chromaticAberrationPx: number;
  /** Angle in degrees of the chromatic dispersion (0 to 360, default 0). */
  chromaticAberrationAngleDeg: number;
  /** Optical vignette toggle. */
  vignetteEnabled: boolean;
  /** Vignette opacity/depth (0.0 to 1.0, default 0.4). */
  vignetteStrength: number;
  /** Vignette outer coverage radius (0.1 to 1.5, default 0.8). */
  vignetteRadius: number;
  /** Vignette edge feather softness (0.1 to 1.0, default 0.5). */
  vignetteFeather: number;
  /** Vignette circular vs elliptical roundness (0.1 to 1.5, default 1.0). */
  vignetteRoundness: number;
  /** Optical center X normalized (0.0 to 1.0, default 0.5). */
  centerX: number;
  /** Optical center Y normalized (0.0 to 1.0, default 0.5). */
  centerY: number;
}

export const DEFAULT_LENS_OPTICS_SETTINGS: ClipLensOpticsSettings = {
  enabled: false,
  distortionK1: 0,
  distortionK2: 0,
  anamorphicRatio: 1.0,
  chromaticAberrationPx: 0,
  chromaticAberrationAngleDeg: 0,
  vignetteEnabled: false,
  vignetteStrength: 0.4,
  vignetteRadius: 0.8,
  vignetteFeather: 0.5,
  vignetteRoundness: 1.0,
  centerX: 0.5,
  centerY: 0.5,
};

export type LensOpticsPresetKey =
  | 'action_cam_flatten'
  | 'vintage_anamorphic'
  | 'retro_super16'
  | 'extreme_fisheye'
  | 'clean_subtle_vignette';

export interface LensOpticsPresetDefinition {
  label: string;
  description: string;
  settings: Partial<ClipLensOpticsSettings>;
}

export const LENS_OPTICS_PRESETS: Record<LensOpticsPresetKey, LensOpticsPresetDefinition> = {
  action_cam_flatten: {
    label: 'Action Cam / Drone Flatten',
    description: 'Straightens wide-angle barrel distortion from GoPro, Insta360, and DJI drones.',
    settings: {
      distortionK1: -0.18,
      distortionK2: -0.04,
      anamorphicRatio: 1.0,
      chromaticAberrationPx: 0,
      vignetteEnabled: false,
    },
  },
  vintage_anamorphic: {
    label: 'Vintage Anamorphic',
    description: '1.33x anamorphic aspect stretch with subtle chromatic fringing and warm vignette.',
    settings: {
      distortionK1: 0.04,
      distortionK2: 0.01,
      anamorphicRatio: 1.33,
      chromaticAberrationPx: 4,
      chromaticAberrationAngleDeg: 45,
      vignetteEnabled: true,
      vignetteStrength: 0.35,
      vignetteRadius: 0.85,
      vignetteFeather: 0.55,
    },
  },
  retro_super16: {
    label: 'Retro Super 16mm',
    description: 'Vintage analog 16mm glass with corner chromatic aberration and filmic vignette.',
    settings: {
      distortionK1: 0.08,
      distortionK2: 0.02,
      anamorphicRatio: 1.0,
      chromaticAberrationPx: 6,
      chromaticAberrationAngleDeg: 0,
      vignetteEnabled: true,
      vignetteStrength: 0.55,
      vignetteRadius: 0.75,
      vignetteFeather: 0.45,
    },
  },
  extreme_fisheye: {
    label: 'Extreme Fisheye',
    description: 'Dramatic circular barrel bulge characteristic of skate videos and 90s music videos.',
    settings: {
      distortionK1: 0.45,
      distortionK2: 0.18,
      anamorphicRatio: 1.0,
      chromaticAberrationPx: 8,
      vignetteEnabled: true,
      vignetteStrength: 0.7,
      vignetteRadius: 0.65,
      vignetteFeather: 0.35,
    },
  },
  clean_subtle_vignette: {
    label: 'Theatrical Vignette',
    description: 'Soft cinematic luminance falloff drawing viewer focus naturally toward the center.',
    settings: {
      distortionK1: 0,
      distortionK2: 0,
      anamorphicRatio: 1.0,
      chromaticAberrationPx: 0,
      vignetteEnabled: true,
      vignetteStrength: 0.4,
      vignetteRadius: 0.9,
      vignetteFeather: 0.6,
    },
  },
};

/**
 * Calculates radial coordinate displacement under polynomial lens distortion and anamorphic ratio.
 *
 * @param normX Normalized X in [0..1]
 * @param normY Normalized Y in [0..1]
 * @param settings Lens optics settings
 * @returns Transformed normalized coordinate { x, y }
 */
export function calculateDistortedCoordinate(
  normX: number,
  normY: number,
  settings: ClipLensOpticsSettings,
): { x: number; y: number } {
  const { distortionK1, distortionK2, anamorphicRatio, centerX, centerY } = settings;

  // Normalized offset from optical center
  const dx = (normX - centerX) * anamorphicRatio;
  const dy = normY - centerY;

  const r2 = dx * dx + dy * dy;
  const r4 = r2 * r2;

  // Radial distortion factor: 1 + k1*r^2 + k2*r^4
  const factor = 1 + distortionK1 * r2 + distortionK2 * r4;

  const distortedX = centerX + (dx * factor) / (anamorphicRatio || 1);
  const distortedY = centerY + dy * factor;

  return {
    x: Number(distortedX.toFixed(4)),
    y: Number(distortedY.toFixed(4)),
  };
}

/**
 * Generates hardware-accelerated CSS styling for real-time live preview rendering.
 */
export function buildCssLensStyle(
  settings: ClipLensOpticsSettings | undefined,
): {
  transform: string;
  filter: string;
  vignetteGradient: string | null;
} {
  if (!settings || !settings.enabled) {
    return { transform: '', filter: '', vignetteGradient: null };
  }

  const transforms: string[] = [];
  const filters: string[] = [];

  // 1. Anamorphic stretch & distortion compensation
  if (settings.anamorphicRatio !== 1.0) {
    transforms.push(`scaleX(${settings.anamorphicRatio})`);
  }
  if (settings.distortionK1 !== 0) {
    // Zoom slightly to compensate for corner clipping on barrel/pincushion
    const zoomCompensation = 1 + Math.abs(settings.distortionK1) * 0.12;
    transforms.push(`scale(${zoomCompensation.toFixed(3)})`);
  }

  // 2. Chromatic Aberration
  if (settings.chromaticAberrationPx > 0) {
    const px = settings.chromaticAberrationPx;
    const rad = (settings.chromaticAberrationAngleDeg * Math.PI) / 180;
    const dx = Number((Math.cos(rad) * px).toFixed(1));
    const dy = Number((Math.sin(rad) * px).toFixed(1));
    // Simulated chromatic fringe via dual drop-shadows (cyan/red split)
    filters.push(`drop-shadow(${dx}px ${dy}px 0 rgba(239,68,68,0.45))`);
    filters.push(`drop-shadow(${-dx}px ${-dy}px 0 rgba(6,182,212,0.45))`);
  }

  // 3. Optical Vignette Radial Gradient
  let vignetteGradient: string | null = null;
  if (settings.vignetteEnabled && settings.vignetteStrength > 0) {
    const cx = Math.round(settings.centerX * 100);
    const cy = Math.round(settings.centerY * 100);
    const radiusPct = Math.round(settings.vignetteRadius * 100);
    const innerPct = Math.max(0, Math.round((1 - settings.vignetteFeather) * radiusPct));
    const opacity = Math.max(0, Math.min(1, settings.vignetteStrength));

    vignetteGradient = `radial-gradient(ellipse at ${cx}% ${cy}%, transparent ${innerPct}%, rgba(0, 0, 0, ${opacity}) ${radiusPct}%)`;
  }

  return {
    transform: transforms.join(' '),
    filter: filters.join(' '),
    vignetteGradient,
  };
}

/**
 * Synthesizes FFmpeg complex filter expressions for high-fidelity master export.
 */
export function buildFfmpegLensFilter(
  settings: ClipLensOpticsSettings | undefined,
): string | null {
  if (!settings || !settings.enabled) {
    return null;
  }

  const filters: string[] = [];

  // 1. Lens Distortion Correction
  if (settings.distortionK1 !== 0 || settings.distortionK2 !== 0) {
    const cx = settings.centerX.toFixed(2);
    const cy = settings.centerY.toFixed(2);
    const k1 = settings.distortionK1.toFixed(3);
    const k2 = settings.distortionK2.toFixed(3);
    filters.push(`lenscorrection=cx=${cx}:cy=${cy}:k1=${k1}:k2=${k2}`);
  }

  // 2. Anamorphic Desqueeze
  if (settings.anamorphicRatio !== 1.0) {
    filters.push(`scale=iw*${settings.anamorphicRatio}:ih`);
  }

  // 3. Chromatic Aberration (lateral channel shift)
  if (settings.chromaticAberrationPx > 0) {
    const px = Math.round(settings.chromaticAberrationPx);
    filters.push(`chromashift=cbh=${px}:crh=-${px}:cbv=0:crv=0`);
  }

  // 4. Optical Vignette
  if (settings.vignetteEnabled && settings.vignetteStrength > 0) {
    const angle = (settings.vignetteStrength * (Math.PI / 2)).toFixed(3);
    const aspect = settings.vignetteRoundness.toFixed(2);
    filters.push(`vignette=angle=${angle}:aspect=${aspect}`);
  }

  return filters.length > 0 ? filters.join(',') : null;
}
