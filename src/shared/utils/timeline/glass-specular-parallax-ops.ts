/**
 * Whiteboard Dual-Layer Tempered Glass Specular Glare & Parallax Reflection Operations.
 *
 * Implements architectural tempered glassboard physics:
 * 1. Schlick's Fresnel reflectivity equation for glancing angle specular glare.
 * 2. Perspective parallax displacement of secondary refracted shadows on rear ceramic backing.
 * 3. Overhead luminaire elongated specular glare gradient generation for SVG and canvas rendering.
 */

export interface GlassParallaxConfig {
  enabled: boolean;
  glassThickness: number; // Effective pixel parallax depth (1 - 25, default 8)
  refractiveIndex: number; // 1.52 soda-lime glass
  fresnelGlareIntensity: number; // 0.0 - 0.60 (default 0.20)
  parallaxGhostOpacity: number; // 0.01 - 0.25 (default 0.10)
  overheadGlarePos: { x: number; y: number }; // Normalized [0, 1] (default {x: 0.5, y: 0.15})
  overheadGlareSpreadX: number; // 0.2 - 0.8 (default 0.55)
  overheadGlareSpreadY: number; // 0.1 - 0.5 (default 0.20)
}

export interface GlassParallaxSettings {
  enabled?: boolean;
  glassThickness?: number;
  fresnelGlareIntensity?: number;
  parallaxGhostOpacity?: number;
  glarePosX?: number;
  glarePosY?: number;
}

/**
 * Computes Fresnel reflectance factor using Schlick's approximation:
 * R(theta) = R0 + (1 - R0) * (1 - cos(theta))^5
 * where R0 = ((n1 - n2) / (n1 + n2))^2
 */
export function computeFresnelReflectance(
  cosTheta: number,
  n1 = 1.0,
  n2 = 1.52
): number {
  const cosT = Math.max(0, Math.min(1, cosTheta));
  const r0 = Math.pow((n1 - n2) / (n1 + n2), 2);
  const reflectance = r0 + (1.0 - r0) * Math.pow(1.0 - cosT, 5);
  return Math.max(0, Math.min(1, reflectance));
}

/**
 * Calculates 2D parallax displacement in pixels of the rear shadow relative to front surface ink.
 * @param ptNorm Normalized (x, y) coordinates of the ink point on the whiteboard plane [0, 1].
 * @param camPosNorm (x, y, z) normalized camera coordinates, z is distance in board widths.
 * @param thicknessPx Physical glass thickness scaled to viewport pixels.
 */
export function computeParallaxOffset(
  ptNorm: { x: number; y: number },
  camPosNorm: { x: number; y: number; z: number } = { x: 0.5, y: 0.5, z: 2.0 },
  thicknessPx = 8.0
): { dx: number; dy: number } {
  if (camPosNorm.z <= 1e-4) {
    return { dx: 0, dy: 0 };
  }
  const dx = (thicknessPx * (ptNorm.x - camPosNorm.x)) / camPosNorm.z;
  const dy = (thicknessPx * (ptNorm.y - camPosNorm.y)) / camPosNorm.z;
  return {
    dx: Number(dx.toFixed(3)),
    dy: Number(dy.toFixed(3)),
  };
}

/**
 * Generates parameters for an SVG radial/elliptical gradient simulating an overhead luminaire glare streak.
 */
export function generateOverheadGlareGradient(
  lightX = 0.5,
  lightY = 0.15,
  intensity = 0.20,
  spreadX = 0.55,
  spreadY = 0.20
): {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  stops: Array<{ offset: string; stopColor: string; stopOpacity: number }>;
} {
  const cx = `${Math.round(Math.max(0, Math.min(1, lightX)) * 100)}%`;
  const cy = `${Math.round(Math.max(0, Math.min(1, lightY)) * 100)}%`;
  const rx = `${Math.round(Math.max(0.05, Math.min(1, spreadX)) * 100)}%`;
  const ry = `${Math.round(Math.max(0.05, Math.min(1, spreadY)) * 100)}%`;

  const clampedIntensity = Math.max(0, Math.min(0.8, intensity));

  return {
    cx,
    cy,
    rx,
    ry,
    stops: [
      { offset: '0%', stopColor: '#ffffff', stopOpacity: clampedIntensity },
      { offset: '45%', stopColor: '#f8fafc', stopOpacity: Number((clampedIntensity * 0.5).toFixed(3)) },
      { offset: '80%', stopColor: '#f1f5f9', stopOpacity: Number((clampedIntensity * 0.15).toFixed(3)) },
      { offset: '100%', stopColor: '#ffffff', stopOpacity: 0.0 },
    ],
  };
}

/**
 * Generates an SVG defs block containing a parallax drop shadow filter and overhead specular glare gradient.
 */
export function generateGlassParallaxSvgDefs(
  thicknessPx = 8.0,
  camPos: { x: number; y: number; z: number } = { x: 0.5, y: 0.5, z: 2.0 },
  ghostOpacity = 0.10,
  glareIntensity = 0.20,
  lightPos: { x: number; y: number } = { x: 0.5, y: 0.15 }
): string {
  const { dx, dy } = computeParallaxOffset({ x: 0.5, y: 0.5 }, camPos, thicknessPx);
  const glare = generateOverheadGlareGradient(lightPos.x, lightPos.y, glareIntensity);

  return [
    '<defs>',
    '  <filter id="glass-parallax-ghost" x="-20%" y="-20%" width="140%" height="140%">',
    `    <feOffset in="SourceGraphic" dx="${dx}" dy="${dy}" result="shifted" />`,
    '    <feGaussianBlur in="shifted" stdDeviation="1.5" result="blurred" />',
    `    <feComponentTransfer in="blurred" result="attenuated">`,
    `      <feFuncA type="linear" slope="${ghostOpacity.toFixed(3)}" />`,
    '    </feComponentTransfer>',
    '    <feMerge>',
    '      <feMergeNode in="attenuated" />',
    '      <feMergeNode in="SourceGraphic" />',
    '    </feMerge>',
    '  </filter>',
    `  <radialGradient id="glass-specular-glare" cx="${glare.cx}" cy="${glare.cy}" rx="${glare.rx}" ry="${glare.ry}">`,
    ...glare.stops.map(
      (s) =>
        `    <stop offset="${s.offset}" stop-color="${s.stopColor}" stop-opacity="${s.stopOpacity}" />`
    ),
    '  </radialGradient>',
    '</defs>',
  ].join('\n');
}
