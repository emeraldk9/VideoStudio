/**
 * Whiteboard Lasso Gesture Recognition, Auto-Callout Badges & Focus Pulsing Operations
 *
 * Implements:
 * 1. Loop closure and enclosed polygon area analysis to detect lasso gestures.
 * 2. Dynamic breathing sinusoidal pulse scale and opacity for focus spotlights.
 * 3. Generation of SVG focus halos, numbered pin badges, and magnifier loupes.
 */

import type { Point2D } from './sticky-stencil-ops';

export type CalloutBadgeStyle = 'pulse_beacon' | 'badge_pin' | 'magnifier_loupe';

export interface LassoCalloutSettings {
  enabled?: boolean;
  closureThresholdRatio?: number;
  minEnclosedArea?: number;
  calloutStyle?: CalloutBadgeStyle;
  badgeLabel?: string;
  pulseFrequencyHz?: number;
  glowColorHex?: string;
}

export interface LassoDetectionResult {
  isLasso: boolean;
  center: Point2D;
  bbox: { x: number; y: number; width: number; height: number };
  area: number;
  gap: number;
  perimeter: number;
}

export const DEFAULT_LASSO_CALLOUT_SETTINGS: Required<LassoCalloutSettings> = {
  enabled: false,
  closureThresholdRatio: 0.25,
  minEnclosedArea: 500,
  calloutStyle: 'pulse_beacon',
  badgeLabel: '1',
  pulseFrequencyHz: 1.2,
  glowColorHex: '#ffdc33',
};

/**
 * Analyzes a sequence of stroke points to determine if they form a closed lasso loop.
 */
export function detectLassoLoop(
  points: Point2D[],
  closureThresholdRatio: number = 0.25,
  minArea: number = 500,
): LassoDetectionResult {
  if (!points || points.length < 8) {
    return {
      isLasso: false,
      center: { x: 0, y: 0 },
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      area: 0,
      gap: 0,
      perimeter: 0,
    };
  }

  let perimeter = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    perimeter += Math.hypot(dx, dy);
  }

  if (perimeter <= 0) {
    return {
      isLasso: false,
      center: { x: 0, y: 0 },
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      area: 0,
      gap: 0,
      perimeter: 0,
    };
  }

  const p0 = points[0];
  const pLast = points[points.length - 1];
  const gap = Math.hypot(pLast.x - p0.x, pLast.y - p0.y);
  const gapRatio = gap / perimeter;

  const isClosed = gapRatio <= closureThresholdRatio || (gap < 45 && gapRatio < 0.35);

  if (!isClosed) {
    return {
      isLasso: false,
      center: { x: 0, y: 0 },
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      area: 0,
      gap: Math.round(gap * 100) / 100,
      perimeter: Math.round(perimeter * 100) / 100,
    };
  }

  // Shoelace formula for enclosed area
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  area = Math.abs(area) * 0.5;

  if (area < minArea) {
    return {
      isLasso: false,
      center: { x: 0, y: 0 },
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      area: Math.round(area * 100) / 100,
      gap: Math.round(gap * 100) / 100,
      perimeter: Math.round(perimeter * 100) / 100,
    };
  }

  // Centroid and bounding box
  let sumX = 0;
  let sumY = 0;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const pt of points) {
    sumX += pt.x;
    sumY += pt.y;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const cx = sumX / n;
  const cy = sumY / n;
  const width = maxX - minX;
  const height = maxY - minY;

  return {
    isLasso: true,
    center: { x: Math.round(cx * 100) / 100, y: Math.round(cy * 100) / 100 },
    bbox: {
      x: Math.round(minX * 100) / 100,
      y: Math.round(minY * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
    },
    area: Math.round(area * 100) / 100,
    gap: Math.round(gap * 100) / 100,
    perimeter: Math.round(perimeter * 100) / 100,
  };
}

/**
 * Computes breathing sinusoidal scale factor and opacity for pulsing focus halos.
 */
export function computeLassoPulseFactor(
  timeSec: number,
  freqHz: number = 1.2,
): { scale: number; opacity: number } {
  const phase = 2 * Math.PI * freqHz * timeSec;
  const scale = 1.0 + 0.08 * Math.sin(phase);
  const opacity = 0.65 + 0.25 * Math.cos(phase);
  return {
    scale: Math.round(scale * 10000) / 10000,
    opacity: Math.round(opacity * 10000) / 10000,
  };
}

/**
 * Generates SVG overlay markup for lasso callouts (pulse beacon, badge pin, or magnifier loupe).
 */
export function generateLassoCalloutSvg(
  result: LassoDetectionResult,
  timeSec: number,
  settings: Partial<LassoCalloutSettings> = {},
): string {
  if (!result.isLasso) return '';
  const cfg = { ...DEFAULT_LASSO_CALLOUT_SETTINGS, ...settings };
  const { cx, cy } = { cx: result.center.x, cy: result.center.y };
  const { width, height } = result.bbox;
  const { scale, opacity } = computeLassoPulseFactor(timeSec, cfg.pulseFrequencyHz);

  if (cfg.calloutStyle === 'pulse_beacon') {
    const rx = (width / 2 + 15) * scale;
    const ry = (height / 2 + 15) * scale;
    return `
      <g class="lasso-callout-beacon">
        <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${cfg.glowColorHex}" opacity="${opacity * 0.4}" filter="blur(8px)" />
        <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.85}" ry="${ry * 0.85}" fill="none" stroke="${cfg.glowColorHex}" stroke-width="2" opacity="${opacity}" />
      </g>
    `.trim();
  }

  if (cfg.calloutStyle === 'badge_pin') {
    const pinX = result.bbox.x + width + 8;
    const pinY = result.bbox.y - 6;
    return `
      <g class="lasso-callout-badge">
        <circle cx="${pinX}" cy="${pinY}" r="12" fill="#222" />
        <circle cx="${pinX}" cy="${pinY}" r="10" fill="#3182ce" />
        <text x="${pinX}" y="${pinY + 4}" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle" font-family="sans-serif">${cfg.badgeLabel}</text>
      </g>
    `.trim();
  }

  // magnifier_loupe
  const rLoupe = Math.max(width, height) / 2 + 12;
  return `
    <g class="lasso-callout-loupe">
      <circle cx="${cx}" cy="${cy}" r="${rLoupe}" fill="none" stroke="${cfg.glowColorHex}" stroke-width="3" opacity="${opacity}" />
      <circle cx="${cx}" cy="${cy}" r="${rLoupe + 4}" fill="none" stroke="#222" stroke-width="1" opacity="0.6" />
    </g>
  `.trim();
}
