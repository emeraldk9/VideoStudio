/**
 * Operations and mathematical models for AI Video Background Matting,
 * Smart Portrait Cutout, and Edge Refinement.
 */

export type PortraitMattingMode = 'smart_portrait' | 'silhouette' | 'color_isolate';

export type PortraitMattingViewMode = 'composite' | 'alpha_matte' | 'overlay_mask' | 'original';

export type PortraitMattingPresetKey =
  | 'crisp_portrait'
  | 'soft_hair_detail'
  | 'silhouette_choke'
  | 'dramatic_isolate';

export interface PortraitMattingSettings {
  enabled: boolean;
  mode: PortraitMattingMode;
  threshold: number; // 0.0 to 1.0 (cutoff sensitivity)
  edgeFeather: number; // 0 to 100 px (boundary softness)
  edgeChoke: number; // -50 to +50 px (negative = expand/dilate, positive = contract/erode)
  edgeBlur: number; // 0 to 50 px (Gaussian edge blur)
  spillSuppression: number; // 0.0 to 1.0 (neutralize ambient color bleed on edges)
  invertMatte: boolean; // false = keep subject, true = keep background
  viewMode: PortraitMattingViewMode;
  preset?: PortraitMattingPresetKey;
}

export const DEFAULT_PORTRAIT_MATTING_SETTINGS: PortraitMattingSettings = {
  enabled: false,
  mode: 'smart_portrait',
  threshold: 0.5,
  edgeFeather: 8,
  edgeChoke: 2,
  edgeBlur: 3,
  spillSuppression: 0.35,
  invertMatte: false,
  viewMode: 'composite',
};

export interface PortraitMattingPresetConfig {
  name: string;
  description: string;
  settings: Omit<PortraitMattingSettings, 'enabled'>;
}

export const PORTRAIT_MATTING_PRESETS: Record<PortraitMattingPresetKey, PortraitMattingPresetConfig> = {
  crisp_portrait: {
    name: 'Crisp Portrait',
    description: 'Clean, well-defined silhouette with minimal fringing for studio footage.',
    settings: {
      mode: 'smart_portrait',
      threshold: 0.52,
      edgeFeather: 4,
      edgeChoke: 5,
      edgeBlur: 2,
      spillSuppression: 0.45,
      invertMatte: false,
      viewMode: 'composite',
      preset: 'crisp_portrait',
    },
  },
  soft_hair_detail: {
    name: 'Soft Hair & Fur',
    description: 'Gentle gradient boundary retaining fine strands and wispy hair details.',
    settings: {
      mode: 'smart_portrait',
      threshold: 0.42,
      edgeFeather: 16,
      edgeChoke: 0,
      edgeBlur: 6,
      spillSuppression: 0.6,
      invertMatte: false,
      viewMode: 'composite',
      preset: 'soft_hair_detail',
    },
  },
  silhouette_choke: {
    name: 'Aggressive Choke',
    description: 'Deep inward matte contraction eliminating green/white halo artifacts.',
    settings: {
      mode: 'silhouette',
      threshold: 0.6,
      edgeFeather: 2,
      edgeChoke: 12,
      edgeBlur: 1,
      spillSuppression: 0.2,
      invertMatte: false,
      viewMode: 'composite',
      preset: 'silhouette_choke',
    },
  },
  dramatic_isolate: {
    name: 'Dramatic Isolate',
    description: 'High-contrast cutout optimized for stylized graphic overlays and titles.',
    settings: {
      mode: 'color_isolate',
      threshold: 0.48,
      edgeFeather: 6,
      edgeChoke: 3,
      edgeBlur: 3,
      spillSuppression: 0.5,
      invertMatte: false,
      viewMode: 'composite',
      preset: 'dramatic_isolate',
    },
  },
};

/**
 * Calculates a smooth alpha ramp based on prediction confidence, threshold cutoff, and feathering radius.
 * Clamped strictly to [0.0, 1.0].
 */
export function calculateAlphaRamp(confidence: number, threshold: number, feather: number): number {
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  const clampedThreshold = Math.max(0.01, Math.min(0.99, threshold));
  const featherNorm = Math.max(0.001, Math.min(1.0, feather / 100));

  const lowerBound = Math.max(0, clampedThreshold - featherNorm / 2);
  const upperBound = Math.min(1, clampedThreshold + featherNorm / 2);

  if (upperBound <= lowerBound) {
    return clampedConfidence >= clampedThreshold ? 1.0 : 0.0;
  }

  if (clampedConfidence <= lowerBound) return 0.0;
  if (clampedConfidence >= upperBound) return 1.0;

  // Smoothstep S-curve interpolation
  const t = (clampedConfidence - lowerBound) / (upperBound - lowerBound);
  return t * t * (3 - 2 * t);
}

/**
 * Calculates choked or dilated alpha value.
 * Positive choke contracts the alpha mask (erodes boundary).
 * Negative choke dilates the alpha mask (expands boundary).
 */
export function calculateChokeOffset(alpha: number, chokePx: number): number {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  if (chokePx === 0) return clampedAlpha;

  // Normalization factor: choke ranges between -50 and +50
  const factor = Math.max(-1, Math.min(1, chokePx / 50));

  if (factor > 0) {
    // Erode (contract): raises the black point
    return Math.max(0, Math.min(1, Math.pow(clampedAlpha, 1 + factor * 3)));
  } else {
    // Dilate (expand): lowers the white point
    const inv = 1 - factor; // 1 to 2
    return Math.max(0, Math.min(1, 1 - Math.pow(1 - clampedAlpha, inv)));
  }
}

/**
 * Decontaminates ambient background color bounce (spill) along subject edges.
 * Attenuates the tinted channel towards a neutral luminance equivalent.
 */
export function calculateDecontamination(
  rgb: [number, number, number],
  backgroundCast: [number, number, number] = [0, 255, 0], // Default green cast
  spillStrength: number = 0.35,
): [number, number, number] {
  const [r, g, b] = rgb;
  const clampedStrength = Math.max(0, Math.min(1, spillStrength));
  if (clampedStrength === 0) return [r, g, b];

  // Luminance estimate
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Calculate similarity to background cast
  const bgTotal = Math.max(1, backgroundCast[0] + backgroundCast[1] + backgroundCast[2]);
  const bgWeights = [backgroundCast[0] / bgTotal, backgroundCast[1] / bgTotal, backgroundCast[2] / bgTotal];

  // If primary cast is green
  if (bgWeights[1] > bgWeights[0] && bgWeights[1] > bgWeights[2]) {
    const maxNeighbor = Math.max(r, b);
    if (g > maxNeighbor) {
      const neutralizedG = g - (g - maxNeighbor) * clampedStrength;
      return [r, Math.round(Math.max(0, Math.min(255, neutralizedG))), b];
    }
  }

  // General blend towards neutral gray at edge proportional to cast
  const outR = Math.round(r * (1 - clampedStrength * bgWeights[0]) + luma * (clampedStrength * bgWeights[0]));
  const outG = Math.round(g * (1 - clampedStrength * bgWeights[1]) + luma * (clampedStrength * bgWeights[1]));
  const outB = Math.round(b * (1 - clampedStrength * bgWeights[2]) + luma * (clampedStrength * bgWeights[2]));

  return [
    Math.max(0, Math.min(255, outR)),
    Math.max(0, Math.min(255, outG)),
    Math.max(0, Math.min(255, outB)),
  ];
}

/**
 * Synthesizes an FFmpeg filter expression corresponding to the portrait matting and refinement settings.
 */
export function buildFfmpegMattingFilter(settings: PortraitMattingSettings): string {
  if (!settings.enabled) return '';

  const filters: string[] = [];

  // 1. Edge blur / feathering
  if (settings.edgeBlur > 0) {
    const sigma = (settings.edgeBlur * 0.5).toFixed(1);
    filters.push(`gblur=sigma=${sigma}`);
  }

  // 2. Choke / Erode/Dilate adjustment
  if (settings.edgeChoke > 0) {
    // Erode alpha boundary
    const steps = Math.min(10, Math.max(1, Math.round(settings.edgeChoke / 5)));
    filters.push(`erosion=threshold0=255:coordinates=${steps}`);
  } else if (settings.edgeChoke < 0) {
    // Dilate alpha boundary
    const steps = Math.min(10, Math.max(1, Math.round(Math.abs(settings.edgeChoke) / 5)));
    filters.push(`dilation=threshold0=255:coordinates=${steps}`);
  }

  // 3. Spill suppression / color decontamination
  if (settings.spillSuppression > 0) {
    const despillAmount = settings.spillSuppression.toFixed(2);
    filters.push(`despill=type=green:mix=${despillAmount}:expand=0`);
  }

  // 4. View Mode rendering overrides
  if (settings.viewMode === 'alpha_matte') {
    filters.push('format=gray');
  }

  return filters.join(',');
}
