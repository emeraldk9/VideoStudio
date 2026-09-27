/**
 * Whiteboard Graphite Sheen Reflection & Textured Paper Grain Bump Mapping Operations.
 *
 * Implements traditional pencil and comic sketch physical surface dynamics:
 * 1. Paper tooth resistance vs stylus downward pressure for micro-pore deposition.
 * 2. Anisotropic Blinn-Phong metallic graphite sheen from sheared crystalline graphene flakes.
 * 3. SVG filter definitions for procedural paper tooth noise and specular lighting.
 */

export interface GraphiteGrainConfig {
  enabled: boolean;
  grainScale: number; // Paper tooth wavelength in pixels (2 - 30, default 8)
  grainRoughness: number; // Micro-relief contrast [0.0 - 0.80] (default 0.35)
  graphiteSheenIntensity: number; // Specular sheen intensity [0.0 - 0.80] (default 0.25)
  sheenShininess: number; // Blinn-Phong specular shininess exponent (8 - 64, default 32)
  lightAzimuthDeg: number; // Light source azimuth angle [0 - 360] (default 45)
  lightElevationDeg: number; // Light source elevation [10 - 80] (default 35)
  stylusPressure: number; // Drawing pressure [0.1 - 1.0] (default 0.70)
}

export interface GraphiteGrainSettings {
  enabled?: boolean;
  grainRoughness?: number;
  graphiteSheenIntensity?: number;
  sheenShininess?: number;
  lightAzimuthDeg?: number;
}

/**
 * Computes paper tooth deposition bite factor [0.0, 1.0] given pressure, surface roughness, and micro-height.
 */
export function computeGrainDepositionFactor(
  pressure: number,
  roughness: number,
  height: number
): number {
  const p = Math.max(0.05, Math.min(1.0, pressure));
  const r = Math.max(0.0, Math.min(1.0, roughness));
  const h = Math.max(0.0, Math.min(1.0, height));

  const toothResistance = (1.0 - h) * r;
  const factor = Math.max(0.0, Math.min(1.0, (p - toothResistance) / (p + 1e-4)));
  const bite = factor * (1.0 + 0.25 * p);
  return Number(Math.max(0.0, Math.min(1.0, bite)).toFixed(3));
}

/**
 * Computes normalized incident light vector from azimuth and elevation angles.
 */
export function computeIncidentLightVector(
  azimuthDeg = 45.0,
  elevationDeg = 35.0
): { lx: number; ly: number; lz: number } {
  const azRad = (azimuthDeg * Math.PI) / 180.0;
  const elRad = (elevationDeg * Math.PI) / 180.0;
  const lx = Math.cos(elRad) * Math.cos(azRad);
  const ly = Math.cos(elRad) * Math.sin(azRad);
  const lz = Math.sin(elRad);
  return {
    lx: Number(lx.toFixed(4)),
    ly: Number(ly.toFixed(4)),
    lz: Number(lz.toFixed(4)),
  };
}

/**
 * Computes Blinn-Phong metallic graphite sheen specular luminance gain.
 */
export function computeGraphiteSheenSpecular(
  nDotH: number,
  graphiteDensity: number,
  sheenIntensity: number,
  shininess = 32.0
): number {
  const clampedNDotH = Math.max(0.0, Math.min(1.0, nDotH));
  const clampedDensity = Math.max(0.0, Math.min(1.0, graphiteDensity));
  const specular = Math.pow(clampedNDotH, shininess) * Math.max(0.0, sheenIntensity);
  return Number((specular * clampedDensity).toFixed(4));
}

/**
 * Generates an SVG defs block with feTurbulence paper tooth grain and feSpecularLighting for metallic graphite sheen.
 */
export function generatePaperGrainFeTurbulenceDefs(
  grainScale = 8.0,
  roughness = 0.35,
  sheenIntensity = 0.25,
  lightAzimuthDeg = 45.0
): string {
  // Base frequency inversely proportional to grain scale
  const baseFreq = Number((1.0 / Math.max(2.0, grainScale * 2.0)).toFixed(4));
  const elevation = 35.0;

  return [
    '<defs>',
    '  <filter id="paper-grain-graphite-sheen" x="-10%" y="-10%" width="120%" height="120%">',
    `    <feTurbulence type="fractalNoise" baseFrequency="${baseFreq}" numOctaves="3" result="grainNoise" />`,
    `    <feColorMatrix type="matrix" in="grainNoise" result="grainContrast" values="`,
    `      ${(1 + roughness).toFixed(2)} 0 0 0 -${(roughness * 0.5).toFixed(2)}`,
    `      0 ${(1 + roughness).toFixed(2)} 0 0 -${(roughness * 0.5).toFixed(2)}`,
    `      0 0 ${(1 + roughness).toFixed(2)} 0 -${(roughness * 0.5).toFixed(2)}`,
    `      0 0 0 1 0" />`,
    `    <feDiffuseLighting in="grainContrast" lighting-color="#ffffff" surfaceScale="${(roughness * 2.0).toFixed(2)}" result="diffuseLight">`,
    `      <feDistantLight azimuth="${lightAzimuthDeg}" elevation="${elevation}" />`,
    '    </feDiffuseLighting>',
    `    <feSpecularLighting in="grainContrast" surfaceScale="1.5" specularConstant="${sheenIntensity.toFixed(2)}" specularExponent="32" lighting-color="#e0e0f0" result="specularSheen">`,
    `      <feDistantLight azimuth="${lightAzimuthDeg}" elevation="${elevation}" />`,
    '    </feSpecularLighting>',
    '    <feComposite in="SourceGraphic" in2="diffuseLight" operator="arithmetic" k1="1.0" k2="0.0" k3="0.0" k4="0.0" result="texturedStroke" />',
    '    <feComposite in="texturedStroke" in2="specularSheen" operator="arithmetic" k1="0" k2="1.0" k3="1.0" k4="0" />',
    '  </filter>',
    '</defs>',
  ].join('\n');
}
