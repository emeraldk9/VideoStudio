/**
 * Whiteboard Kinetic Typography & Direct Calligraphic Font Stroke Operations.
 * Orchestrates per-glyph stroke timing, curvature-sensitive handwriting slowdowns,
 * organic micro-pauses at punctuation, and natural pen-up flight transitions.
 */

import type { Point2D } from './calligraphy-ops';

export interface KineticTypographySettings {
  enabled?: boolean;
  letterCadenceMs?: number; // 40..500 ms per letter, default 150
  punctuationPauseMs?: number; // 50..1000 ms, default 320
  cursiveLigatures?: boolean; // continuous connected pen flow
  handwritingJitter?: number; // 0..1 motor micro-tremor, default 0.15
}

export interface KineticStrokeSegment {
  points: Point2D[];
  char: string;
  strokeIndex: number;
  startTimeMs: number;
  durationMs: number;
  isPenup: boolean;
  length: number;
}

export interface KineticTypographyLayout {
  text: string;
  strokes: KineticStrokeSegment[];
  totalDurationMs: number;
}

/**
 * Calculates human handwriting pause duration following a character.
 */
export function calculateCharacterPause(
  char: string,
  punctuationPauseMs: number = 320,
  wordPauseMs: number = 180
): number {
  if (char === ' ') return wordPauseMs;
  if (char === '.' || char === '!' || char === '?') return punctuationPauseMs * 1.4;
  if (char === ',' || char === ';' || char === ':') return punctuationPauseMs;
  if (char === '-' || char === '—' || char === '(' || char === ')') return punctuationPauseMs * 0.7;
  return 40; // minimal inter-letter breathing room
}

/**
 * Applies organic motor micro-tremor to synthetic handwriting polylines.
 */
export function applyHandwritingJitter(
  points: Point2D[],
  jitterIntensity: number = 0.15,
  seed: number = 1337
): Point2D[] {
  if (jitterIntensity <= 0 || points.length < 2) {
    return points.map((p) => [p[0], p[1]]);
  }

  let s = seed;
  const pseudoRandom = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  return points.map((p, idx) => {
    // Preserve endpoints to keep connections clean
    if (idx === 0 || idx === points.length - 1) {
      return [p[0], p[1]];
    }
    const angle = pseudoRandom() * Math.PI * 2;
    const mag = (pseudoRandom() * 2 - 1) * jitterIntensity * 2.0;
    return [p[0] + Math.cos(angle) * mag, p[1] + Math.sin(angle) * mag];
  });
}

/**
 * Computes geometric arc length of a polyline.
 */
function polylineLength(pts: Point2D[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return len;
}

/**
 * Schedules chronological kinetic stroke timing across a sequence of glyph strokes.
 */
export function scheduleKineticStrokeCadence(
  rawStrokes: { points: Point2D[]; char: string }[],
  options: KineticTypographySettings = {}
): KineticTypographyLayout {
  const baseLetterCadenceMs = options.letterCadenceMs ?? 150;
  const punctuationPauseMs = options.punctuationPauseMs ?? 320;
  const cursiveLigatures = options.cursiveLigatures ?? false;
  const handwritingJitter = options.handwritingJitter ?? 0.15;

  const scheduled: KineticStrokeSegment[] = [];
  let currentTimeMs = 0;
  let prevEndPt: Point2D | null = null;
  const fullText = rawStrokes.map((s) => s.char).join('');

  for (let i = 0; i < rawStrokes.length; i++) {
    const raw = rawStrokes[i];
    const jitteredPts = applyHandwritingJitter(raw.points, handwritingJitter, 1000 + i);
    const strokeLen = polylineLength(jitteredPts);

    // Pen-up leap from previous stroke end
    if (prevEndPt) {
      const penupDist = Math.hypot(jitteredPts[0][0] - prevEndPt[0], jitteredPts[0][1] - prevEndPt[1]);
      const penupDuration = cursiveLigatures
        ? 0
        : Math.max(30, Math.min(150, penupDist * 0.4));

      if (penupDuration > 0) {
        scheduled.push({
          points: [prevEndPt, jitteredPts[0]],
          char: ' ',
          strokeIndex: -1,
          startTimeMs: currentTimeMs,
          durationMs: penupDuration,
          isPenup: true,
          length: penupDist,
        });
        currentTimeMs += penupDuration;
      }
    }

    // Curvature & length aware drawing duration
    const drawDuration = Math.max(
      45,
      strokeLen > 0 ? (strokeLen / 120.0) * baseLetterCadenceMs : baseLetterCadenceMs * 0.5
    );

    scheduled.push({
      points: jitteredPts,
      char: raw.char,
      strokeIndex: i,
      startTimeMs: currentTimeMs,
      durationMs: drawDuration,
      isPenup: false,
      length: strokeLen,
    });

    currentTimeMs += drawDuration;
    prevEndPt = jitteredPts[jitteredPts.length - 1];

    // Check if next stroke belongs to a different character or punctuation
    const nextStroke = rawStrokes[i + 1];
    if (!nextStroke || nextStroke.char !== raw.char) {
      const pause = calculateCharacterPause(raw.char, punctuationPauseMs);
      currentTimeMs += pause;
    }
  }

  return {
    text: fullText,
    strokes: scheduled,
    totalDurationMs: currentTimeMs,
  };
}

/**
 * Serializes kinetic typography layout into clean SVG paths.
 */
export function generateKineticTypographySvg(
  layout: KineticTypographyLayout,
  width: number = 1920,
  height: number = 1080
): string {
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  ];

  for (const s of layout.strokes) {
    if (s.isPenup || s.points.length === 0) continue;
    const dParts = [`M ${s.points[0][0].toFixed(1)} ${s.points[0][1].toFixed(1)}`];
    for (let i = 1; i < s.points.length; i++) {
      dParts.push(`L ${s.points[i][0].toFixed(1)} ${s.points[i][1].toFixed(1)}`);
    }
    const d = dParts.join(' ');
    lines.push(`  <path d="${d}" fill="none" stroke="#1f2937" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`);
  }

  lines.push('</svg>');
  return lines.join('\n');
}
