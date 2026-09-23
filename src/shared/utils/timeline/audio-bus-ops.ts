import type { TrackRole, SequenceTrack } from '../../types/sequence';
import type { AudioEqualizerSettings } from './audio-eq-ops';
import { DEFAULT_AUDIO_EQ_SETTINGS } from './audio-eq-ops';
import type { AudioCompressorSettings } from './audio-compressor-ops';
import { DEFAULT_COMPRESSOR_SETTINGS, calculateGainReductionDb } from './audio-compressor-ops';
import {
  MIN_METER_DB,
  MAX_METER_DB,
  linearToDb,
  dbToLinear,
  dbToMeterPercent,
  calculateStereoPan,
  type StereoMeterLevels,
} from './audio-meter-ops';

export const BUS_DIALOGUE = 'bus-dialogue';
export const BUS_MUSIC = 'bus-music';
export const BUS_SFX = 'bus-sfx';
export const BUS_MASTER = 'bus-master';

export interface SubmixBusConfig {
  id: string;
  name: string;
  shortLabel: string;
  color: string;
  badgeColor: string;
  defaultRole?: TrackRole;
}

export const DEFAULT_SUBMIX_BUSES: readonly SubmixBusConfig[] = [
  {
    id: BUS_DIALOGUE,
    name: 'Dialogue',
    shortLabel: 'DIA',
    color: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    badgeColor: 'bg-purple-500/25 text-purple-300 border-purple-500/40',
    defaultRole: 'narration',
  },
  {
    id: BUS_MUSIC,
    name: 'Music',
    shortLabel: 'MUS',
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    badgeColor: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40',
    defaultRole: 'music',
  },
  {
    id: BUS_SFX,
    name: 'SFX & Foley',
    shortLabel: 'SFX',
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    badgeColor: 'bg-amber-500/25 text-amber-300 border-amber-500/40',
  },
] as const;

export interface SubmixBusState {
  volumeDb: number; // -60 to +6 dB, default 0 dB unity
  pan: number;      // -100 to +100, default 0 center
  mute: boolean;
  solo: boolean;
  eq?: AudioEqualizerSettings;
  compressor?: AudioCompressorSettings;
}

export function createDefaultSubmixBusState(): SubmixBusState {
  return {
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    eq: { ...DEFAULT_AUDIO_EQ_SETTINGS, enabled: false },
    compressor: { ...DEFAULT_COMPRESSOR_SETTINGS, enabled: false },
  };
}

/**
 * Infers default submix bus destination from track role & kind.
 */
export function inferDefaultTrackBus(track: Pick<SequenceTrack, 'kind' | 'role'>): string {
  if (track.role === 'narration') {
    return BUS_DIALOGUE;
  }
  if (track.role === 'music') {
    return BUS_MUSIC;
  }
  return BUS_SFX;
}

/**
 * Resolves a track's active submix bus target, accounting for explicit routing overrides.
 */
export function resolveTrackBus(
  track: Pick<SequenceTrack, 'id' | 'kind' | 'role'>,
  routingMap?: Record<string, string>,
): string {
  if (routingMap && routingMap[track.id]) {
    return routingMap[track.id];
  }
  return inferDefaultTrackBus(track);
}

/**
 * Computes stereo meter levels for each Submix Bus based on routed track levels and bus controls.
 */
export function computeSubmixBusLevels(params: {
  trackLevels: Record<string, StereoMeterLevels>;
  tracks: readonly SequenceTrack[];
  routingMap?: Record<string, string>;
  busStates?: Record<string, SubmixBusState>;
  buses?: readonly SubmixBusConfig[];
}): Record<string, StereoMeterLevels> {
  const {
    trackLevels,
    tracks,
    routingMap = {},
    busStates = {},
    buses = DEFAULT_SUBMIX_BUSES,
  } = params;

  const result: Record<string, StereoMeterLevels> = {};

  for (const bus of buses) {
    const busState = busStates[bus.id] ?? createDefaultSubmixBusState();

    let sumLeftLinear = 0;
    let sumRightLinear = 0;
    let hasAudible = false;

    for (const track of tracks) {
      const assignedBus = resolveTrackBus(track, routingMap);
      if (assignedBus !== bus.id) continue;

      const trackMeter = trackLevels[track.id];
      if (!trackMeter || !trackMeter.isAudible) continue;

      hasAudible = true;
      sumLeftLinear += dbToLinear(trackMeter.leftDb);
      sumRightLinear += dbToLinear(trackMeter.rightDb);
    }

    if (!hasAudible || busState.mute) {
      result[bus.id] = {
        leftDb: MIN_METER_DB,
        rightDb: MIN_METER_DB,
        leftPct: 0,
        rightPct: 0,
        isAudible: false,
      };
      continue;
    }

    // Apply bus fader volume
    const busLinear = dbToLinear(busState.volumeDb);
    let finalLeftLinear = sumLeftLinear * busLinear;
    let finalRightLinear = sumRightLinear * busLinear;

    // Apply bus stereo pan balance
    if (busState.pan !== 0) {
      const { leftGain, rightGain } = calculateStereoPan(busState.pan);
      // Normalized to unity at center
      finalLeftLinear *= leftGain * Math.SQRT2;
      finalRightLinear *= rightGain * Math.SQRT2;
    }

    // Apply bus compressor if enabled
    if (busState.compressor?.enabled) {
      const peakDb = linearToDb(Math.max(finalLeftLinear, finalRightLinear));
      const gr = calculateGainReductionDb(peakDb, busState.compressor);
      const compGain = dbToLinear(-gr + busState.compressor.makeupGain);
      finalLeftLinear *= compGain;
      finalRightLinear *= compGain;
    }

    const leftDb = linearToDb(finalLeftLinear);
    const rightDb = linearToDb(finalRightLinear);

    result[bus.id] = {
      leftDb,
      rightDb,
      leftPct: dbToMeterPercent(leftDb),
      rightPct: dbToMeterPercent(rightDb),
      isAudible: leftDb > MIN_METER_DB || rightDb > MIN_METER_DB,
    };
  }

  return result;
}

/**
 * Aggregates all active Submix Buses and unrouted tracks into the final Master Bus stereo level.
 * Applies master volume, master glue compressor, and brickwall limiter.
 */
export function computeMasterWithBuses(params: {
  busLevels: Record<string, StereoMeterLevels>;
  busStates?: Record<string, SubmixBusState>;
  unroutedTrackLevels?: readonly StereoMeterLevels[];
  masterVolumeDb: number;
  masterLimiter?: boolean;
  masterCompressor?: AudioCompressorSettings;
}): { masterLevels: StereoMeterLevels; gainReductionDb: number } {
  const {
    busLevels,
    busStates = {},
    unroutedTrackLevels = [],
    masterVolumeDb,
    masterLimiter = false,
    masterCompressor,
  } = params;

  // Determine if any bus is in solo mode
  const soloedBusIds = Object.entries(busStates)
    .filter(([_, state]) => state.solo)
    .map(([id]) => id);
  const isBusSoloEngaged = soloedBusIds.length > 0;

  let sumLeftLinear = 0;
  let sumRightLinear = 0;
  let hasAudible = false;

  // Sum submix buses
  for (const [busId, meter] of Object.entries(busLevels)) {
    if (!meter.isAudible) continue;

    const busState = busStates[busId] ?? createDefaultSubmixBusState();
    if (busState.mute) continue;
    if (isBusSoloEngaged && !busState.solo) continue;

    hasAudible = true;
    sumLeftLinear += dbToLinear(meter.leftDb);
    sumRightLinear += dbToLinear(meter.rightDb);
  }

  // Sum any unrouted tracks directly assigned to master
  if (!isBusSoloEngaged) {
    for (const trackMeter of unroutedTrackLevels) {
      if (trackMeter.isAudible) {
        hasAudible = true;
        sumLeftLinear += dbToLinear(trackMeter.leftDb);
        sumRightLinear += dbToLinear(trackMeter.rightDb);
      }
    }
  }

  if (!hasAudible) {
    return {
      masterLevels: {
        leftDb: MIN_METER_DB,
        rightDb: MIN_METER_DB,
        leftPct: 0,
        rightPct: 0,
        isAudible: false,
      },
      gainReductionDb: 0,
    };
  }

  const masterLinear = dbToLinear(masterVolumeDb);
  let finalLeftLinear = sumLeftLinear * masterLinear;
  let finalRightLinear = sumRightLinear * masterLinear;

  let gainReductionDb = 0;

  // Apply Master Glue Compressor
  if (masterCompressor?.enabled) {
    const peakDb = linearToDb(Math.max(finalLeftLinear, finalRightLinear));
    const rawGr = calculateGainReductionDb(peakDb, masterCompressor);
    gainReductionDb = -rawGr;
    const compGain = dbToLinear(-rawGr + masterCompressor.makeupGain);
    finalLeftLinear *= compGain;
    finalRightLinear *= compGain;
  }

  // Apply Brickwall Master Limiter (Ceiling: 0 dBFS / 1.0 linear)
  if (masterLimiter) {
    if (finalLeftLinear > 1.0 || finalRightLinear > 1.0) {
      const overLinear = Math.max(finalLeftLinear, finalRightLinear);
      const limiterGr = -linearToDb(overLinear);
      gainReductionDb = Math.min(gainReductionDb, limiterGr);
      finalLeftLinear = Math.min(1.0, finalLeftLinear);
      finalRightLinear = Math.min(1.0, finalRightLinear);
    }
  }

  const leftDb = linearToDb(finalLeftLinear);
  const rightDb = linearToDb(finalRightLinear);

  return {
    masterLevels: {
      leftDb,
      rightDb,
      leftPct: dbToMeterPercent(leftDb),
      rightPct: dbToMeterPercent(rightDb),
      isAudible: true,
    },
    gainReductionDb,
  };
}
