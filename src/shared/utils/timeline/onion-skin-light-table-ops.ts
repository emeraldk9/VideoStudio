/**
 * Multi-Layer Animation Onion Skinning & Light Table Backlighting Operations.
 *
 * Implements classic hand-drawn 2D animation optical workflow:
 * 1. Multi-frame chromatic onion skinning with exponential alpha attenuation.
 * 2. Distinct chromatic tints for past frames (cool cyan/blue) and future frames (warm amber/orange).
 * 3. Backlit frosted glass light table substrate with radial luminous diffusion.
 * 4. Acme 3-hole animation peg bar registration pins (round center, slotted outer pins).
 */

export interface OnionSkinLightTableConfig {
  enabled: boolean;
  pastFramesCount: number;         // 1 to 5 past frames (default: 3)
  futureFramesCount: number;       // 1 to 5 future frames (default: 3)
  baseOpacity: number;             // 0.1 to 0.9 ghost frame base alpha (default: 0.45)
  opacityFalloffGamma: number;     // 0.3 to 0.95 attenuation per frame step (default: 0.65)
  pastTintHex: string;             // Cool Cyan/Blue hex (default: #1450dc)
  futureTintHex: string;           // Warm Amber/Orange hex (default: #eb7814)
  currentInkHex: string;           // Solid Charcoal/Black hex (default: #141414)
  lightTableIntensity: number;     // 0.0 to 1.0 backlight illumination (default: 0.65)
  pegBarEnabled: boolean;          // Acme standard peg bar (default: true)
}

export type OnionSkinSettings = Partial<OnionSkinLightTableConfig>;

export const DEFAULT_ONION_SKIN_CONFIG: OnionSkinLightTableConfig = {
  enabled: false,
  pastFramesCount: 3,
  futureFramesCount: 3,
  baseOpacity: 0.45,
  opacityFalloffGamma: 0.65,
  pastTintHex: '#1450dc',
  futureTintHex: '#eb7814',
  currentInkHex: '#141414',
  lightTableIntensity: 0.65,
  pegBarEnabled: true,
};

/**
 * Validates and clamps onion skinning and light table configuration parameters.
 */
export function validateOnionSkinConfig(
  config?: Partial<OnionSkinLightTableConfig>
): OnionSkinLightTableConfig {
  if (!config) {
    return { ...DEFAULT_ONION_SKIN_CONFIG };
  }
  return {
    enabled: Boolean(config.enabled ?? DEFAULT_ONION_SKIN_CONFIG.enabled),
    pastFramesCount: Math.max(1, Math.min(5, Math.round(Number(config.pastFramesCount ?? DEFAULT_ONION_SKIN_CONFIG.pastFramesCount)))),
    futureFramesCount: Math.max(1, Math.min(5, Math.round(Number(config.futureFramesCount ?? DEFAULT_ONION_SKIN_CONFIG.futureFramesCount)))),
    baseOpacity: Math.max(0.05, Math.min(0.95, Number(config.baseOpacity ?? DEFAULT_ONION_SKIN_CONFIG.baseOpacity))),
    opacityFalloffGamma: Math.max(0.2, Math.min(0.98, Number(config.opacityFalloffGamma ?? DEFAULT_ONION_SKIN_CONFIG.opacityFalloffGamma))),
    pastTintHex: typeof config.pastTintHex === 'string' && config.pastTintHex.length > 0
      ? config.pastTintHex
      : DEFAULT_ONION_SKIN_CONFIG.pastTintHex,
    futureTintHex: typeof config.futureTintHex === 'string' && config.futureTintHex.length > 0
      ? config.futureTintHex
      : DEFAULT_ONION_SKIN_CONFIG.futureTintHex,
    currentInkHex: typeof config.currentInkHex === 'string' && config.currentInkHex.length > 0
      ? config.currentInkHex
      : DEFAULT_ONION_SKIN_CONFIG.currentInkHex,
    lightTableIntensity: Math.max(0.0, Math.min(1.0, Number(config.lightTableIntensity ?? DEFAULT_ONION_SKIN_CONFIG.lightTableIntensity))),
    pegBarEnabled: Boolean(config.pegBarEnabled ?? DEFAULT_ONION_SKIN_CONFIG.pegBarEnabled),
  };
}

/**
 * Computes opacity of a frame layer at relative offset k.
 * Offset 0 (current active frame) has full opacity 1.0.
 * Non-zero offsets experience geometric attenuation: base * gamma^(|k| - 1).
 */
export function computeOnionFrameAlpha(
  offset: number,
  config?: Partial<OnionSkinLightTableConfig>
): number {
  const cfg = validateOnionSkinConfig(config);
  const kRound = Math.round(offset);

  if (kRound === 0) {
    return 1.0;
  }

  const absK = Math.abs(kRound);
  const maxK = kRound < 0 ? cfg.pastFramesCount : cfg.futureFramesCount;
  if (absK > maxK || absK <= 0) {
    return 0.0;
  }

  return cfg.baseOpacity * Math.pow(cfg.opacityFalloffGamma, absK - 1);
}

/**
 * Resolves chromatic tint color and alpha for a given frame offset.
 */
export function resolveOnionSkinTint(
  offset: number,
  config?: Partial<OnionSkinLightTableConfig>
): { hex: string; alpha: number } {
  const cfg = validateOnionSkinConfig(config);
  const alpha = computeOnionFrameAlpha(offset, cfg);
  const kRound = Math.round(offset);

  if (kRound < 0) {
    return { hex: cfg.pastTintHex, alpha };
  } else if (kRound > 0) {
    return { hex: cfg.futureTintHex, alpha };
  } else {
    return { hex: cfg.currentInkHex, alpha };
  }
}

/**
 * Generates Acme standard animation peg bar SVG elements for alignment rendering:
 * Center circular round pin + twin horizontal slotted outer pins.
 */
export function generatePegBarSvgMarkup(
  width: number,
  pegBarHeight: number = 32,
  pinSpacing: number = 120
): string {
  const safeW = Math.max(200, width);
  const cx = safeW / 2;
  const cy = pegBarHeight / 2;

  const leftPinX = cx - pinSpacing;
  const rightPinX = cx + pinSpacing;

  return `<g class="acme-peg-bar" aria-label="Acme animation registration peg bar">
  <rect x="0" y="0" width="${safeW}" height="${pegBarHeight}" fill="#505055" />
  <line x1="0" y1="${pegBarHeight}" x2="${safeW}" y2="${pegBarHeight}" stroke="#323237" stroke-width="1" />
  <!-- Center round pin -->
  <circle cx="${cx}" cy="${cy}" r="5" fill="#d2d7dc" stroke="#28282d" stroke-width="1" />
  <!-- Left slotted pin -->
  <rect x="${leftPinX - 9}" y="${cy - 3}" width="18" height="6" rx="1.5" fill="#d2d7dc" stroke="#28282d" stroke-width="1" />
  <!-- Right slotted pin -->
  <rect x="${rightPinX - 9}" y="${cy - 3}" width="18" height="6" rx="1.5" fill="#d2d7dc" stroke="#28282d" stroke-width="1" />
</g>`;
}

/**
 * Generates CSS radial-gradient string for frosted glass light table backlighting.
 */
export function calculateLightTableBacklightCss(
  config?: Partial<OnionSkinLightTableConfig>
): string {
  const cfg = validateOnionSkinConfig(config);
  if (!cfg.enabled || cfg.lightTableIntensity <= 0.01) {
    return 'none';
  }

  const alpha = (cfg.lightTableIntensity * 0.9).toFixed(2);
  const outerAlpha = (cfg.lightTableIntensity * 0.25).toFixed(2);
  return `radial-gradient(circle at 50% 50%, rgba(255, 252, 245, ${alpha}) 0%, rgba(245, 240, 230, ${alpha}) 45%, rgba(60, 60, 65, ${outerAlpha}) 90%, rgba(40, 40, 45, 0.95) 100%)`;
}
