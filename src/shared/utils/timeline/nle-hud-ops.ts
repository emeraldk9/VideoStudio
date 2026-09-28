/**
 * NLE HUD & Audio Gain Reduction Metering Ops (Milestone S176)
 *
 * Pure formatting and arithmetic utilities for:
 * 1. Live hardware playback telemetry (FPS, HW decoders, frame drop auditing).
 * 2. Downward audio gain reduction (GR) calculation across compressors and sidechain ducking.
 * 3. Interactive NLE gesture delta badges (Slip, Slide, Ripple, Roll, Trimming, Beat Snap).
 */

import { formatTimecode } from './frames';
import { calculateGainReductionDb, type AudioCompressorSettings } from './audio-compressor-ops';

export interface HardwareTelemetry {
  fps: number;
  hardwareBackend: 'D3D11 / NVDEC HW' | 'WebGL2 HW' | 'Native HW';
  droppedFrames: number;
  memoryBounded: boolean;
}

/**
 * Formats live hardware playback telemetry for the Studio preview monitor.
 */
export function formatHardwarePlaybackTelemetry(telemetry: HardwareTelemetry): {
  fpsText: string;
  backendText: string;
  dropsText: string;
  isSmooth: boolean;
} {
  const fpsText = `${telemetry.fps.toFixed(1)} FPS`;
  const backendText = telemetry.hardwareBackend;
  const dropsText = telemetry.droppedFrames === 0 ? '0 Drops' : `${telemetry.droppedFrames} Drops`;
  const isSmooth = telemetry.droppedFrames === 0 && telemetry.fps >= 23.9;

  return {
    fpsText,
    backendText,
    dropsText,
    isSmooth,
  };
}

/**
 * Calculates combined gain reduction (in positive dB) from track dynamics (compressor)
 * and sidechain ducking beds.
 */
export function calculateCombinedGainReduction(
  meterLevelDb: number,
  compressorSettings?: AudioCompressorSettings | null,
  duckingReductionDb?: number | null,
): number {
  let compGr = 0;
  if (compressorSettings && compressorSettings.enabled) {
    compGr = calculateGainReductionDb(meterLevelDb, compressorSettings);
  }

  let duckGr = 0;
  if (duckingReductionDb !== undefined && duckingReductionDb !== null) {
    duckGr = Math.abs(duckingReductionDb);
  }

  return Number(Math.max(compGr, duckGr).toFixed(1));
}

/**
 * Maps gain reduction in dB (0 to 24 dB) to downward meter height percentage (0 to 100%).
 */
export function gainReductionToMeterPercent(gainReductionDb: number, maxDb: number = 24): number {
  if (gainReductionDb <= 0 || !Number.isFinite(gainReductionDb)) return 0;
  const clamped = Math.min(maxDb, gainReductionDb);
  return Number(((clamped / maxDb) * 100).toFixed(1));
}

export type NleGestureKind =
  | 'move'
  | 'trim-start'
  | 'trim-end'
  | 'scrub'
  | 'slip'
  | 'slide'
  | 'ripple'
  | 'roll';

export interface DragDeltaBadgeOptions {
  kind: NleGestureKind;
  deltaFrames: number;
  snappedTarget: number | null;
  snapLabel?: string;
  fps: number;
}

/**
 * Generates an expressive, precision-formatted NLE HUD label during timeline manipulation.
 */
export function formatDragDeltaBadge(options: DragDeltaBadgeOptions): string {
  const { kind, deltaFrames, snappedTarget, snapLabel, fps } = options;

  const sign = deltaFrames >= 0 ? '+' : '';
  const timecodeDelta = formatTimecode(Math.abs(deltaFrames), fps);

  // 1. Slip mode: media slipping inside boundary
  if (kind === 'slip') {
    return `Slip: ${sign}${deltaFrames}f (${timecodeDelta})`;
  }

  // 2. Slide mode: sliding clip position between neighbours
  if (kind === 'slide') {
    const targetStr = snapLabel || (snappedTarget !== null ? `${snappedTarget}f` : null);
    return targetStr
      ? `Slide: ${sign}${deltaFrames}f · ${targetStr}`
      : `Slide: ${sign}${deltaFrames}f (${timecodeDelta})`;
  }

  // 3. Ripple edit mode
  if (kind === 'ripple') {
    const targetStr = snapLabel || (snappedTarget !== null ? `${snappedTarget}f` : null);
    return targetStr
      ? `Ripple: ${sign}${deltaFrames}f · ${targetStr}`
      : `Ripple Trim: ${sign}${deltaFrames}f (${timecodeDelta})`;
  }

  // 4. Rolling edit mode
  if (kind === 'roll') {
    const targetStr = snapLabel || (snappedTarget !== null ? `${snappedTarget}f` : null);
    return targetStr
      ? `Rolling Edit: ${sign}${deltaFrames}f · ${targetStr}`
      : `Roll: ${sign}${deltaFrames}f (${timecodeDelta})`;
  }

  // 5. Trimming (Head vs Tail)
  if (kind === 'trim-start' || kind === 'trim-end') {
    const edge = kind === 'trim-start' ? 'Head' : 'Tail';
    const targetStr = snapLabel || (snappedTarget !== null ? `${snappedTarget}f` : null);
    return targetStr
      ? `Trim ${edge}: ${sign}${deltaFrames}f · ${targetStr}`
      : `Trim ${edge}: ${sign}${deltaFrames}f (${timecodeDelta})`;
  }

  // 6. Scrubbing
  if (kind === 'scrub') {
    const frame = snappedTarget ?? 0;
    const targetStr = snapLabel ? ` · ${snapLabel}` : '';
    return `Scrub: ${frame}f (${formatTimecode(frame, fps)})${targetStr}`;
  }

  // 7. General Clip Move
  const targetStr = snapLabel || (snappedTarget !== null ? `${snappedTarget}f` : null);
  if (targetStr) {
    return `Move: ${sign}${deltaFrames}f · ${targetStr}`;
  }
  return `Move: ${sign}${deltaFrames}f (${timecodeDelta})`;
}
