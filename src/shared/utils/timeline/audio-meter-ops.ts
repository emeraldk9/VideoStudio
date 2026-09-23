import type { SequenceClip, SequenceTrack } from '../../types/sequence';
import { layoutTrack } from './layout';
import { valueAtFrame } from './keyframes';

export const MIN_METER_DB = -60;
export const MAX_METER_DB = 6;
export const CLIP_THRESHOLD_DB = 0;
export const DEFAULT_PEAK_HOLD_TICKS = 24; // ~1 second at 24fps
export const DEFAULT_PEAK_DECAY_DB = 1.5;

/**
 * Converts a linear amplitude multiplier to decibels (dBFS), floored at `floorDb`.
 */
export function linearToDb(linear: number, floorDb = MIN_METER_DB): number {
  if (linear <= 0.00001) return floorDb;
  const db = 20 * Math.log10(linear);
  return Math.max(floorDb, Math.min(MAX_METER_DB, db));
}

/**
 * Converts decibels (dBFS) to a linear amplitude multiplier.
 */
export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

/**
 * Maps a decibel value (-60 dB to +6 dB) to a non-linear percentage (0% to 100%)
 * providing expanded resolution across the critical mixing sweet spot (-24 dB to 0 dB).
 */
export function dbToMeterPercent(db: number, minDb = MIN_METER_DB, maxDb = MAX_METER_DB): number {
  const clampedDb = Math.max(minDb, Math.min(maxDb, db));
  if (clampedDb <= minDb) return 0;
  if (clampedDb >= maxDb) return 100;

  // 3-band piece-wise curve:
  // -60 dB to -18 dB: 0% to 50%
  // -18 dB to 0 dB: 50% to 85%
  // 0 dB to +6 dB: 85% to 100%
  if (clampedDb < -18) {
    const t = (clampedDb - minDb) / (-18 - minDb);
    return t * 50;
  }
  if (clampedDb < 0) {
    const t = (clampedDb - -18) / (0 - -18);
    return 50 + t * 35;
  }
  const t = (clampedDb - 0) / (maxDb - 0);
  return 85 + t * 15;
}

/**
 * Calculates equal-power stereo panning gains from a pan value (-100 Left to +100 Right).
 * At center (pan = 0), both channels output -3 dB (~0.7071) equal-power sum.
 */
export function calculateStereoPan(pan: number): { leftGain: number; rightGain: number } {
  const clampedPan = Math.max(-100, Math.min(100, pan));
  const normalized = (clampedPan + 100) / 200; // 0 to 1
  const angle = normalized * (Math.PI / 2);
  const leftGain = Math.cos(angle);
  const rightGain = Math.sin(angle);
  return { leftGain, rightGain };
}

export interface PeakHoldState {
  heldPeakDb: number;
  holdRemainingTicks: number;
  isClipping: boolean;
}

/**
 * Returns initial empty peak-hold state.
 */
export function createInitialPeakHoldState(): PeakHoldState {
  return {
    heldPeakDb: MIN_METER_DB,
    holdRemainingTicks: 0,
    isClipping: false,
  };
}

/**
 * Updates a peak hold state with new incoming signal level.
 */
export function updatePeakHold(
  currentDb: number,
  prevState: PeakHoldState,
  holdTicks = DEFAULT_PEAK_HOLD_TICKS,
  decayDbPerTick = DEFAULT_PEAK_DECAY_DB,
): PeakHoldState {
  const isClipping = prevState.isClipping || currentDb >= CLIP_THRESHOLD_DB;

  if (currentDb >= prevState.heldPeakDb) {
    return {
      heldPeakDb: currentDb,
      holdRemainingTicks: holdTicks,
      isClipping,
    };
  }

  if (prevState.holdRemainingTicks > 0) {
    return {
      heldPeakDb: prevState.heldPeakDb,
      holdRemainingTicks: prevState.holdRemainingTicks - 1,
      isClipping,
    };
  }

  const decayedDb = Math.max(MIN_METER_DB, prevState.heldPeakDb - decayDbPerTick);
  return {
    heldPeakDb: Math.max(currentDb, decayedDb),
    holdRemainingTicks: 0,
    isClipping,
  };
}

export interface StereoMeterLevels {
  leftDb: number;
  rightDb: number;
  leftPct: number;
  rightPct: number;
  isAudible: boolean;
}

/**
 * Computes instantaneous stereo levels for a single track at `playheadFrame`.
 */
export function computeTrackStereoLevels(params: {
  track: SequenceTrack;
  clips: readonly SequenceClip[];
  playheadFrame: number;
  trackMixerState?: {
    volumeDb: number;
    pan: number;
    mute: boolean;
    solo: boolean;
  };
  isSoloEngaged?: boolean;
}): StereoMeterLevels {
  const { track, clips, playheadFrame, trackMixerState, isSoloEngaged = false } = params;

  const isMuted = track.muted || Boolean(trackMixerState?.mute);
  const isSoloed = Boolean(trackMixerState?.solo);
  if (isMuted || (isSoloEngaged && !isSoloed)) {
    return {
      leftDb: MIN_METER_DB,
      rightDb: MIN_METER_DB,
      leftPct: 0,
      rightPct: 0,
      isAudible: false,
    };
  }

  // Find clip at playhead on this track
  const placedClips = layoutTrack(clips as SequenceClip[], track);
  const activePlaced = placedClips.find(
    (p) => playheadFrame >= p.startFrames && playheadFrame < p.endFrames,
  );

  if (!activePlaced) {
    return {
      leftDb: MIN_METER_DB,
      rightDb: MIN_METER_DB,
      leftPct: 0,
      rightPct: 0,
      isAudible: false,
    };
  }

  // Check if clip has disabled audio
  if (activePlaced.clip.sourceAudioEnabled === false) {
    return {
      leftDb: MIN_METER_DB,
      rightDb: MIN_METER_DB,
      leftPct: 0,
      rightPct: 0,
      isAudible: false,
    };
  }

  // Clip gain with keyframes
  const clipGainDb = valueAtFrame(
    activePlaced.clip.keyframes,
    'volume',
    playheadFrame - activePlaced.startFrames,
    activePlaced.clip.gainDb,
  );

  // Track volume and mixer volume
  const mixerGainDb = trackMixerState?.volumeDb ?? 0;
  const trackLinear = (track.volume ?? 1) * dbToLinear(mixerGainDb);
  const clipLinear = dbToLinear(clipGainDb);
  const baseLinear = clipLinear * trackLinear;

  // Stereo pan
  const pan = trackMixerState?.pan ?? 0;
  const { leftGain, rightGain } = calculateStereoPan(pan);

  const leftLinear = baseLinear * leftGain;
  const rightLinear = baseLinear * rightGain;

  const leftDb = linearToDb(leftLinear);
  const rightDb = linearToDb(rightLinear);

  return {
    leftDb,
    rightDb,
    leftPct: dbToMeterPercent(leftDb),
    rightPct: dbToMeterPercent(rightDb),
    isAudible: true,
  };
}

/**
 * Sums all audible tracks into master bus stereo output.
 */
export function computeMasterStereoLevels(params: {
  trackLevels: readonly StereoMeterLevels[];
  masterVolumeDb: number;
  masterLimiter?: boolean;
}): StereoMeterLevels {
  const { trackLevels, masterVolumeDb, masterLimiter = false } = params;

  let sumLeftLinear = 0;
  let sumRightLinear = 0;
  let hasAudible = false;

  for (const track of trackLevels) {
    if (track.isAudible) {
      hasAudible = true;
      sumLeftLinear += dbToLinear(track.leftDb);
      sumRightLinear += dbToLinear(track.rightDb);
    }
  }

  if (!hasAudible) {
    return {
      leftDb: MIN_METER_DB,
      rightDb: MIN_METER_DB,
      leftPct: 0,
      rightPct: 0,
      isAudible: false,
    };
  }

  const masterLinear = dbToLinear(masterVolumeDb);
  let finalLeftLinear = sumLeftLinear * masterLinear;
  let finalRightLinear = sumRightLinear * masterLinear;

  if (masterLimiter) {
    finalLeftLinear = Math.min(1.0, finalLeftLinear);
    finalRightLinear = Math.min(1.0, finalRightLinear);
  }

  const leftDb = linearToDb(finalLeftLinear);
  const rightDb = linearToDb(finalRightLinear);

  return {
    leftDb,
    rightDb,
    leftPct: dbToMeterPercent(leftDb),
    rightPct: dbToMeterPercent(rightDb),
    isAudible: true,
  };
}
