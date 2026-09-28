/**
 * Pure mathematical operations for Musical Rhythmic Beat Grid & Audio Transient Alignment Engine.
 *
 * Implements:
 * - Tempo (BPM) and meter time signature (4/4, 3/4, 6/8) subdivision calculations
 * - Frame-accurate musical timecode conversion (Bar.Beat.Subdivision.Tick)
 * - Analytical O(1) nearest-rhythmic-grid-line snapping
 * - Windowed grid line generator for timeline ruler and track lane rendering
 * - Integration with magnetic snap target entries
 */

import type { SnapTargetEntry } from './trim-tools-ops';

export type RhythmicGridResolution =
  | 'off'
  | '1_bar'
  | '1_2'
  | '1_4'
  | '1_8'
  | '1_16'
  | '1_32'
  | '1_8_triplet'
  | '1_16_triplet';

export interface MusicalTimeSignature {
  /** Beats per measure (e.g. 4 for 4/4, 3 for 3/4, 6 for 6/8). */
  numerator: number;
  /** Beat unit note value (e.g. 4 for quarter note, 8 for eighth note). */
  denominator: number;
}

export interface RhythmicGridConfig {
  enabled: boolean;
  /** Tempo in Beats Per Minute (20 to 320 BPM, default 120). */
  bpm: number;
  /** Meter time signature (default 4/4). */
  timeSignature: MusicalTimeSignature;
  /** Quantization grid resolution. */
  resolution: RhythmicGridResolution;
  /** Starting frame offset where Bar 1 Beat 1 begins (default 0). */
  startOffsetFrame: number;
  /** Snap distance threshold in video frames (default 5 frames). */
  snapToleranceFrames: number;
  /** Whether to render rhythmic grid lines in timeline ruler & tracks. */
  showGridLines: boolean;
  /** Whether downbeats (Beat 1 of each bar) are visually accentuated. */
  highlightDownbeats: boolean;
}

export const DEFAULT_RHYTHMIC_GRID_CONFIG: RhythmicGridConfig = {
  enabled: false,
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  resolution: '1_4',
  startOffsetFrame: 0,
  snapToleranceFrames: 5,
  showGridLines: true,
  highlightDownbeats: true,
};

export const RHYTHMIC_RESOLUTION_LABELS: Record<RhythmicGridResolution, string> = {
  off: 'Off (Free)',
  '1_bar': '1 Bar (Measure)',
  '1_2': '1/2 Note',
  '1_4': '1/4 Note (Beat)',
  '1_8': '1/8 Note',
  '1_16': '1/16 Note',
  '1_32': '1/32 Note',
  '1_8_triplet': '1/8 Triplet (3/Beat)',
  '1_16_triplet': '1/16 Triplet (6/Beat)',
};

export type RhythmicPresetKey =
  | 'standard_4_4_quarter'
  | 'eighth_notes_groove'
  | 'trap_16th_grid'
  | 'waltz_3_4'
  | 'triplet_swing'
  | 'lofi_chill_slow';

export interface RhythmicPreset {
  name: string;
  description: string;
  config: Partial<RhythmicGridConfig>;
}

export const RHYTHMIC_PRESETS: Record<RhythmicPresetKey, RhythmicPreset> = {
  standard_4_4_quarter: {
    name: '4/4 Standard Beat (120 BPM)',
    description: 'Quarter note grid aligned to standard pop/dance tempo.',
    config: {
      enabled: true,
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      resolution: '1_4',
    },
  },
  eighth_notes_groove: {
    name: 'Eighth Note Groove (120 BPM)',
    description: 'Double-time 1/8 note subdivisions for fast rhythmic cuts.',
    config: {
      enabled: true,
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      resolution: '1_8',
    },
  },
  trap_16th_grid: {
    name: 'Trap 16th Hi-Hat Grid (140 BPM)',
    description: 'High-speed 16th note precision grid for rapid hip-hop cuts.',
    config: {
      enabled: true,
      bpm: 140,
      timeSignature: { numerator: 4, denominator: 4 },
      resolution: '1_16',
    },
  },
  waltz_3_4: {
    name: 'Waltz 3/4 Time (90 BPM)',
    description: 'Triple meter 3 beats per measure for classical and waltz music.',
    config: {
      enabled: true,
      bpm: 90,
      timeSignature: { numerator: 3, denominator: 4 },
      resolution: '1_4',
    },
  },
  triplet_swing: {
    name: 'Triplet Swing & Shuffle (100 BPM)',
    description: 'Blues, jazz, and swing triplet grid (3 divisions per beat).',
    config: {
      enabled: true,
      bpm: 100,
      timeSignature: { numerator: 4, denominator: 4 },
      resolution: '1_8_triplet',
    },
  },
  lofi_chill_slow: {
    name: 'Lo-Fi Chill (85 BPM)',
    description: 'Relaxed tempo quarter-note grid for chillhop and ambient tracks.',
    config: {
      enabled: true,
      bpm: 85,
      timeSignature: { numerator: 4, denominator: 4 },
      resolution: '1_4',
    },
  },
};

export interface RhythmicGridPoint {
  frame: number;
  timeSeconds: number;
  bar: number; // 1-indexed
  beat: number; // 1-indexed
  subdivision: number; // 0-indexed
  type: 'bar' | 'beat' | 'subdivision' | 'triplet';
  label: string;
  isDownbeat: boolean;
}

export interface RhythmicSnapResult {
  didSnap: boolean;
  originalFrame: number;
  snappedFrame: number;
  deltaFrames: number;
  gridPoint?: RhythmicGridPoint;
}

export interface MusicalPosition {
  bar: number; // 1-indexed
  beat: number; // 1-indexed
  sixteenth: number; // 1-indexed (1..4)
  ticks: number; // 0..95 (standard 96 PPQ)
  formatted: string;
}

/**
 * Validates and clamps Rhythmic Grid parameters into safe engineering bounds.
 */
export function clampRhythmicGridConfig(config: Partial<RhythmicGridConfig>): RhythmicGridConfig {
  const bpm = Math.max(20, Math.min(320, Number(config.bpm ?? DEFAULT_RHYTHMIC_GRID_CONFIG.bpm)));
  const numerator = Math.max(1, Math.min(16, Math.round(Number(config.timeSignature?.numerator ?? 4))));
  const denominator = [2, 4, 8, 16].includes(config.timeSignature?.denominator ?? 4)
    ? (config.timeSignature?.denominator as number)
    : 4;

  return {
    enabled: Boolean(config.enabled ?? DEFAULT_RHYTHMIC_GRID_CONFIG.enabled),
    bpm,
    timeSignature: { numerator, denominator },
    resolution: config.resolution ?? DEFAULT_RHYTHMIC_GRID_CONFIG.resolution,
    startOffsetFrame: Math.max(0, Math.round(Number(config.startOffsetFrame ?? 0))),
    snapToleranceFrames: Math.max(1, Math.min(30, Math.round(Number(config.snapToleranceFrames ?? 5)))),
    showGridLines: Boolean(config.showGridLines ?? true),
    highlightDownbeats: Boolean(config.highlightDownbeats ?? true),
  };
}

/**
 * Calculates video frames elapsed per single musical beat.
 */
export function calculateFramesPerBeat(bpm: number, fps: number): number {
  const safeBpm = Math.max(1, bpm);
  const safeFps = Math.max(1, fps);
  return (60 * safeFps) / safeBpm;
}

/**
 * Calculates fraction of a beat represented by a grid resolution.
 */
export function calculateBeatsPerSubdivision(
  resolution: RhythmicGridResolution,
  timeSignature: MusicalTimeSignature = { numerator: 4, denominator: 4 }
): number {
  switch (resolution) {
    case 'off':
      return 0;
    case '1_bar':
      return timeSignature.numerator;
    case '1_2':
      return 2.0;
    case '1_4':
      return 1.0;
    case '1_8':
      return 0.5;
    case '1_16':
      return 0.25;
    case '1_32':
      return 0.125;
    case '1_8_triplet':
      return 1 / 3;
    case '1_16_triplet':
      return 1 / 6;
  }
}

/**
 * Calculates number of video frames per grid subdivision interval.
 */
export function calculateSubdivisionFrames(config: RhythmicGridConfig, fps: number): number {
  if (config.resolution === 'off') return 0;
  const framesPerBeat = calculateFramesPerBeat(config.bpm, fps);
  const beatsPerSub = calculateBeatsPerSubdivision(config.resolution, config.timeSignature);
  return framesPerBeat * beatsPerSub;
}

/**
 * Converts a timeline frame number into exact musical position (Bar.Beat.16th.Ticks).
 */
export function frameToMusicalPosition(
  frame: number,
  config: RhythmicGridConfig,
  fps: number
): MusicalPosition {
  const safeFps = Math.max(1, fps);
  const framesPerBeat = calculateFramesPerBeat(config.bpm, safeFps);
  const beatsPerBar = config.timeSignature.numerator;

  const relFrame = Math.max(0, frame - config.startOffsetFrame);
  const totalBeats = relFrame / framesPerBeat;

  const totalBars = Math.floor(totalBeats / beatsPerBar);
  const bar = totalBars + 1;

  const beatInBarFraction = totalBeats - totalBars * beatsPerBar;
  const beat = Math.floor(beatInBarFraction) + 1;

  const subBeatFraction = beatInBarFraction - Math.floor(beatInBarFraction);
  const sixteenth = Math.floor(subBeatFraction * 4) + 1;

  const ticks = Math.round((subBeatFraction * 4 - Math.floor(subBeatFraction * 4)) * 24); // 96 PPQ

  const formatted = `${bar}.${beat}.${sixteenth}.${String(ticks).padStart(2, '0')}`;

  return { bar, beat, sixteenth, ticks, formatted };
}

/**
 * Converts musical position (Bar, Beat, 16th, Ticks) back into a timeline frame number.
 */
export function musicalPositionToFrame(
  bar: number,
  beat: number,
  sixteenth: number,
  config: RhythmicGridConfig,
  fps: number,
  ticks: number = 0
): number {
  const safeFps = Math.max(1, fps);
  const framesPerBeat = calculateFramesPerBeat(config.bpm, safeFps);
  const beatsPerBar = config.timeSignature.numerator;

  const barZero = Math.max(0, bar - 1);
  const beatZero = Math.max(0, beat - 1);
  const sixteenthZero = Math.max(0, sixteenth - 1);

  const fractionalBeat = beatZero + sixteenthZero * 0.25 + (ticks / 96);
  const totalBeats = barZero * beatsPerBar + fractionalBeat;

  return Math.round(config.startOffsetFrame + totalBeats * framesPerBeat);
}

/**
 * Snaps a target frame to the nearest rhythmic grid point in O(1) time.
 */
export function snapToRhythmicGrid(
  frame: number,
  config: RhythmicGridConfig,
  fps: number,
  toleranceFrames?: number
): RhythmicSnapResult {
  if (!config.enabled || config.resolution === 'off') {
    return {
      didSnap: false,
      originalFrame: frame,
      snappedFrame: frame,
      deltaFrames: 0,
    };
  }

  const tolerance = toleranceFrames ?? config.snapToleranceFrames;
  const subFrames = calculateSubdivisionFrames(config, fps);
  if (subFrames <= 0) {
    return {
      didSnap: false,
      originalFrame: frame,
      snappedFrame: frame,
      deltaFrames: 0,
    };
  }

  const offset = config.startOffsetFrame;
  const relFrame = frame - offset;
  const index = Math.round(relFrame / subFrames);
  const candidateFrame = Math.max(0, Math.round(offset + index * subFrames));
  const delta = candidateFrame - frame;

  if (Math.abs(delta) <= tolerance) {
    // Generate detailed point metadata for the snapped candidate
    const pos = frameToMusicalPosition(candidateFrame, config, fps);
    const isBar = pos.beat === 1 && pos.sixteenth === 1 && pos.ticks === 0;
    const isBeat = pos.sixteenth === 1 && pos.ticks === 0;
    const isTriplet = config.resolution.includes('triplet');

    const pointType = isBar ? 'bar' : isBeat ? 'beat' : isTriplet ? 'triplet' : 'subdivision';
    const label = isBar
      ? `Bar ${pos.bar} Downbeat`
      : `Bar ${pos.bar}, Beat ${pos.beat}`;

    const gridPoint: RhythmicGridPoint = {
      frame: candidateFrame,
      timeSeconds: candidateFrame / fps,
      bar: pos.bar,
      beat: pos.beat,
      subdivision: pos.sixteenth - 1,
      type: pointType,
      label,
      isDownbeat: isBar,
    };

    return {
      didSnap: true,
      originalFrame: frame,
      snappedFrame: candidateFrame,
      deltaFrames: delta,
      gridPoint,
    };
  }

  return {
    didSnap: false,
    originalFrame: frame,
    snappedFrame: frame,
    deltaFrames: 0,
  };
}

/**
 * Generates rhythmic grid points across a visible timeline viewport [startFrame, endFrame].
 * Enforces a safety limit (maxPoints) to ensure smooth 60fps rendering even at extreme zoom.
 */
export function generateRhythmicGridPoints(
  config: RhythmicGridConfig,
  startFrame: number,
  endFrame: number,
  fps: number,
  maxPoints: number = 500
): RhythmicGridPoint[] {
  if (!config.enabled || config.resolution === 'off') {
    return [];
  }

  const subFrames = calculateSubdivisionFrames(config, fps);
  if (subFrames <= 0) return [];

  const offset = config.startOffsetFrame;
  const minFrame = Math.max(0, startFrame);
  const maxFrame = Math.max(minFrame, endFrame);

  // Compute start and end indices
  const startIndex = Math.max(0, Math.floor((minFrame - offset) / subFrames));
  const endIndex = Math.ceil((maxFrame - offset) / subFrames);

  const totalPoints = endIndex - startIndex + 1;
  const step = totalPoints > maxPoints ? Math.ceil(totalPoints / maxPoints) : 1;

  const points: RhythmicGridPoint[] = [];

  for (let i = startIndex; i <= endIndex; i += step) {
    const frame = Math.round(offset + i * subFrames);
    if (frame < minFrame) continue;
    if (frame > maxFrame) break;

    const pos = frameToMusicalPosition(frame, config, fps);
    const isBar = pos.beat === 1 && pos.sixteenth === 1 && pos.ticks === 0;
    const isBeat = pos.sixteenth === 1 && pos.ticks === 0;
    const isTriplet = config.resolution.includes('triplet');

    const pointType = isBar ? 'bar' : isBeat ? 'beat' : isTriplet ? 'triplet' : 'subdivision';
    const label = isBar
      ? `Bar ${pos.bar}`
      : `${pos.bar}.${pos.beat}`;

    points.push({
      frame,
      timeSeconds: frame / fps,
      bar: pos.bar,
      beat: pos.beat,
      subdivision: pos.sixteenth - 1,
      type: pointType,
      label,
      isDownbeat: isBar,
    });
  }

  return points;
}

/**
 * Converts rhythmic grid lines into SnapTargetEntry structures compatible with
 * the timeline magnetic snap HUD engine.
 */
export function buildRhythmicSnapTargetEntries(
  config: RhythmicGridConfig,
  startFrame: number,
  endFrame: number,
  fps: number,
  maxTargets: number = 200
): SnapTargetEntry[] {
  const points = generateRhythmicGridPoints(config, startFrame, endFrame, fps, maxTargets);

  return points.map((pt) => ({
    frame: pt.frame,
    type: pt.isDownbeat ? 'downbeat' : 'beat',
    label: pt.isDownbeat ? `Bar ${pt.bar} Downbeat` : `Beat (${pt.label})`,
    priority: pt.isDownbeat ? 1 : 2,
  }));
}
