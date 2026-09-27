/**
 * Charcoal & Conte Crayon Powder Smearing with Tortillon Stump Blending Operations.
 *
 * Implements physical mechanics of dry carbonaceous media and paper stump burnishing:
 * 1. Friable particulate powder deposition preferentially gripping paper tooth ridges.
 * 2. Tortillon blending stump pickup, reservoir accumulation, and downstream redistribution.
 * 3. Micro-tooth valley burnishing compressing tone contrast into smooth chiaroscuro.
 * 4. Directional sfumato smudging with pressure-responsive blending radius.
 */

export type CharcoalMediaType = 'vine_charcoal' | 'compressed_charcoal' | 'conte_crayon';

export interface CharcoalTortillonConfig {
  enabled: boolean;
  mediaType: CharcoalMediaType;     // 'vine_charcoal', 'compressed_charcoal', 'conte_crayon'
  powderFriability: number;         // 0.1 - 1.0 looseness of deposited particles (default: 0.75)
  stumpHardness: number;            // 0.1 - 0.9 rolled paper stump rigidity (default: 0.5)
  blendRadiusPx: number;            // 2.0 - 25.0 px blending footprint (default: 12.0)
  burnishDepth: number;             // 0.1 - 1.0 valley penetration ratio (default: 0.65)
  charcoalColorHex: string;         // Hex color of charcoal (default: #191919)
}

export type CharcoalTortillonSettings = Partial<CharcoalTortillonConfig>;

export const DEFAULT_CHARCOAL_TORTILLON_CONFIG: CharcoalTortillonConfig = {
  enabled: false,
  mediaType: 'vine_charcoal',
  powderFriability: 0.75,
  stumpHardness: 0.5,
  blendRadiusPx: 12.0,
  burnishDepth: 0.65,
  charcoalColorHex: '#191919',
};

/**
 * Validates and clamps charcoal and tortillon stump configuration parameters.
 */
export function validateCharcoalTortillonConfig(
  config?: Partial<CharcoalTortillonConfig>
): CharcoalTortillonConfig {
  if (!config) {
    return { ...DEFAULT_CHARCOAL_TORTILLON_CONFIG };
  }

  const validMedia: CharcoalMediaType[] = ['vine_charcoal', 'compressed_charcoal', 'conte_crayon'];
  const mediaType: CharcoalMediaType = validMedia.includes(config.mediaType as CharcoalMediaType)
    ? (config.mediaType as CharcoalMediaType)
    : DEFAULT_CHARCOAL_TORTILLON_CONFIG.mediaType;

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_CHARCOAL_TORTILLON_CONFIG.enabled),
    mediaType,
    powderFriability: Math.max(0.1, Math.min(1.0, Number(config.powderFriability ?? DEFAULT_CHARCOAL_TORTILLON_CONFIG.powderFriability))),
    stumpHardness: Math.max(0.1, Math.min(0.9, Number(config.stumpHardness ?? DEFAULT_CHARCOAL_TORTILLON_CONFIG.stumpHardness))),
    blendRadiusPx: Math.max(2.0, Math.min(25.0, Number(config.blendRadiusPx ?? DEFAULT_CHARCOAL_TORTILLON_CONFIG.blendRadiusPx))),
    burnishDepth: Math.max(0.1, Math.min(1.0, Number(config.burnishDepth ?? DEFAULT_CHARCOAL_TORTILLON_CONFIG.burnishDepth))),
    charcoalColorHex: typeof config.charcoalColorHex === 'string' && config.charcoalColorHex.length > 0
      ? config.charcoalColorHex
      : DEFAULT_CHARCOAL_TORTILLON_CONFIG.charcoalColorHex,
  };
}

/**
 * Computes powder particle deposition onto paper grain.
 * Higher tooth ridges (peaks) catch significantly more friable powder than valleys.
 */
export function computeToothDeposition(
  pressure: number,
  toothHeight: number,
  friability: number = 0.75
): number {
  const safePress = Math.max(0.0, Math.min(1.0, pressure));
  const safeTooth = Math.max(0.0, Math.min(1.0, toothHeight));
  const safeFriability = Math.max(0.1, Math.min(1.0, friability));

  // Base grip on ridge peaks (toothHeight > 0.5)
  const ridgeGrip = 0.3 + 0.7 * safeTooth;
  return Math.min(1.0, safePress * ridgeGrip * safeFriability);
}

/**
 * Computes tortillon blending stump spatial influence falloff.
 */
export function computeStumpSmearFalloff(
  distance: number,
  blendRadius: number,
  pressure: number = 0.7
): number {
  const safeRadius = Math.max(1.0, blendRadius);
  const safeDist = Math.max(0.0, distance);
  const safePress = Math.max(0.0, Math.min(1.0, pressure));

  if (safeDist >= safeRadius) {
    return 0.0;
  }
  const normDist = safeDist / safeRadius;
  // Quadratic falloff from tip center
  const falloff = 1.0 - normDist * normDist;
  return Math.max(0.0, Math.min(1.0, falloff * safePress));
}

/**
 * Blends and redistributes a local powder sample under the tortillon stump:
 * 1. Picks up from high ridges.
 * 2. Burnishes powder into tooth valleys.
 * 3. Softens tonal contrast into smooth chiaroscuro values.
 */
export function blendPowderSample(
  sourcePowder: number,
  reservoirPowder: number,
  toothHeight: number,
  influence: number,
  config?: Partial<CharcoalTortillonConfig>
): number {
  const cfg = validateCharcoalTortillonConfig(config);
  const safeSrc = Math.max(0.0, Math.min(1.0, sourcePowder));
  const safeRes = Math.max(0.0, Math.min(1.0, reservoirPowder));
  const safeTooth = Math.max(0.0, Math.min(1.0, toothHeight));
  const safeInf = Math.max(0.0, Math.min(1.0, influence));

  if (safeInf <= 0.001) {
    return safeSrc;
  }

  // Valleys (1.0 - toothHeight) absorb deposited powder from the reservoir
  const valleyBurnishWeight = Math.max(0.0, Math.min(1.0, 1.0 - safeTooth * 0.6)) * cfg.burnishDepth;
  const depositedPowder = safeRes * 0.5 * valleyBurnishWeight * safeInf;

  // Blended output balances smoothed existing powder and new valley deposition
  const erodedSource = safeSrc * (1.0 - safeInf * 0.4);
  return Math.min(1.0, Math.max(erodedSource, depositedPowder));
}
