/**
 * Whiteboard Procedural Hand Contact Shadows & Dynamic Ambient Occlusion (AO).
 * Simulates realistic directional area light contact shadows cast by the presenter's
 * hand, stylus nib, and forearm onto the whiteboard:
 * 1. Contact Umbra & Penumbra: Sharp, dense contact umbra near pen tip; diffuse penumbra along forearm.
 * 2. Dynamic Z-Elevation Dissipation: As the pen lifts between strokes, the shadow diffuses, expands, and fades.
 * 3. Directional Key Light Projection: Offsets shadow according to customizable lighting angle.
 */

export interface ContactShadowSettings {
  enabled?: boolean;
  lightAngleDeg?: number; // 0..360, default 315° (top-left overhead key light)
  shadowOpacity?: number; // 0.05..0.80, default 0.35
  blurRadiusPx?: number; // 4..40, default 14.0
  offsetDistancePx?: number; // 2..40, default 12.0
  liftDissipation?: number; // 0.0..1.0, default 0.60
  wristSkewFactor?: number; // 1.0..3.0, default 1.8
}

export const DEFAULT_CONTACT_SHADOW_SETTINGS: Required<ContactShadowSettings> = {
  enabled: true,
  lightAngleDeg: 315.0,
  shadowOpacity: 0.35,
  blurRadiusPx: 14.0,
  offsetDistancePx: 12.0,
  liftDissipation: 0.6,
  wristSkewFactor: 1.8,
};

/**
 * Computes the 2D directional projection offset vector [dx, dy] cast by a light source.
 * Compass lighting model: 0° = Top/North, 90° = Right/East, 180° = Bottom/South, 270° = Left/West, 315° = Top-Left/NW.
 * Light at NW (315°) casts shadow to SE (bottom-right: dx > 0, dy > 0).
 */
export function computeShadowOffsetVector(
  angleDeg = 315.0,
  distancePx = 12.0,
  isLifting = false,
  liftDissipation = 0.6
): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  let dist = distancePx;
  if (isLifting) {
    dist *= 1.0 + liftDissipation * 0.8;
  }
  const dx = Math.round(-dist * Math.sin(rad) * 100) / 100;
  const dy = Math.round(dist * Math.cos(rad) * 100) / 100;
  return [dx, dy];
}

/**
 * Calculates distance-weighted penumbra blur radius in pixels.
 * Near the stylus tip (distance ~ 0), the shadow is a tight, sharp contact umbra.
 * Farther along the wrist, it diffuses into a soft penumbra.
 */
export function calculatePenumbraBlur(
  distanceFromTipPx: number,
  baseBlurPx = 14.0,
  isLifting = false,
  liftDissipation = 0.6
): number {
  let effectiveBase = baseBlurPx;
  if (isLifting) {
    effectiveBase *= 1.0 + liftDissipation;
    return Math.max(4.0, effectiveBase);
  }

  const proximityScale = 120.0;
  const proximityWeight = Math.max(0.0, Math.min(1.0, 1.0 - distanceFromTipPx / proximityScale));
  const tightBlur = Math.max(2.0, effectiveBase * 0.3);
  return tightBlur * proximityWeight + effectiveBase * (1.0 - proximityWeight);
}

/**
 * Generates CSS drop-shadow filter string for live preview rendering.
 */
export function generateContactShadowCssFilter(
  settings?: ContactShadowSettings,
  isLifting = false
): string {
  const cfg: Required<ContactShadowSettings> = {
    ...DEFAULT_CONTACT_SHADOW_SETTINGS,
    ...settings,
  };

  if (!cfg.enabled || cfg.shadowOpacity <= 0.001) {
    return 'none';
  }

  const [dx, dy] = computeShadowOffsetVector(
    cfg.lightAngleDeg,
    cfg.offsetDistancePx,
    isLifting,
    cfg.liftDissipation
  );

  let blur = cfg.blurRadiusPx;
  let opacity = cfg.shadowOpacity;

  if (isLifting) {
    blur *= 1.0 + cfg.liftDissipation;
    opacity *= Math.max(0.1, 1.0 - cfg.liftDissipation * 0.6);
  }

  const alpha = Math.min(1.0, Math.max(0.0, opacity));
  return `drop-shadow(${dx}px ${dy}px ${Math.round(blur)}px rgba(0, 0, 0, ${alpha.toFixed(2)}))`;
}
