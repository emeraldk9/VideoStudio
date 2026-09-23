/**
 * Beta S154 Phase 6 / S33 — Real-Time Audio Sidechain Auto-Ducking Engine.
 *
 * Provides frame-accurate dialogue/narration envelope following, sidechain
 * gain attenuation math with configurable attack/hold/release curves, track
 * and clip role classification, and unified FFmpeg sidechain filter alignment.
 */

import type { SequenceClip, SequenceDocument, SequenceTrack } from '../../types/sequence';
import { layoutTrack } from './layout';

export interface DuckingSettings {
  /** Master toggle for auto-ducking music and beds under dialogue. */
  enabled: boolean;
  /** Amount to attenuate the music bed in dB (e.g. -12 dB). Range: -30 dB to -3 dB. */
  duckingDepthDb: number;
  /** Dialogue sensitivity threshold in dB (e.g. -28 dB). Range: -40 dB to -10 dB. */
  thresholdDb: number;
  /** Attack time in milliseconds (how fast music ducks when dialogue starts). Range: 5 to 200 ms. */
  attackMs: number;
  /** Hold time in milliseconds to prevent pumping between spoken words. Range: 0 to 500 ms. */
  holdMs: number;
  /** Release time in milliseconds (how smoothly music recovers). Range: 100 to 2000 ms. */
  releaseMs: number;
}

export const DEFAULT_DUCKING_SETTINGS: DuckingSettings = {
  enabled: true,
  duckingDepthDb: -12,
  thresholdDb: -28,
  attackMs: 30,
  holdMs: 150,
  releaseMs: 400,
};

export interface DuckingGainResult {
  /** Linear gain multiplier (e.g. 1.0 for unity, ~0.25 for -12 dB). */
  gainMultiplier: number;
  /** Attenuation in decibels (0 dB when unducked, negative during ducking). */
  gainDb: number;
  /** True if attenuation is actively engaged (> 0.1 dB reduction). */
  isDuckingActive: boolean;
}

/**
 * Returns true if the track acts as a sidechain ducking key (Dialogue / Narration).
 */
export function isTrackDuckKey(track: SequenceTrack | null | undefined): boolean {
  if (!track) return false;
  return track.kind === 'audio' && track.role === 'narration';
}

/**
 * Returns true if the track acts as a ducking bed (Background Music).
 */
export function isTrackDuckTarget(track: SequenceTrack | null | undefined): boolean {
  if (!track) return false;
  return track.kind === 'audio' && track.role === 'music';
}

/**
 * Returns true if the clip acts as a sidechain key (pushes beds down).
 *
 * Covers narration tracks and video clips with `duckExempt: true` (source dialogue).
 */
export function isClipDuckKey(clip: SequenceClip, track?: SequenceTrack | null): boolean {
  if (track && isTrackDuckKey(track)) return true;
  if (clip.sourceKind === 'video' && clip.sourceAudioEnabled !== false && clip.duckExempt === true) {
    return true;
  }
  return false;
}

/**
 * Returns true if the clip should be ducked under dialogue.
 *
 * Covers music tracks and video clips with `duckExempt !== true` (bed audio).
 */
export function isClipDuckTarget(clip: SequenceClip, track?: SequenceTrack | null): boolean {
  if (track && isTrackDuckTarget(track)) return true;
  if (clip.sourceKind === 'video' && clip.sourceAudioEnabled !== false && clip.duckExempt !== true) {
    return true;
  }
  return false;
}

export interface DialogueActiveCheckOptions {
  document: SequenceDocument;
  frame: number;
  trackMixer?: Record<string, { mute?: boolean; solo?: boolean }>;
  soloTrackIds?: string[];
}

/**
 * Checks whether any audible dialogue / narration key clip is active at `frame`.
 */
export function isDialogueActiveAtFrame({
  document,
  frame,
  trackMixer,
  soloTrackIds = [],
}: DialogueActiveCheckOptions): boolean {
  if (!document || !document.tracks || !document.clips) return false;

  const mixerSolos = trackMixer
    ? Object.entries(trackMixer)
        .filter(([_, s]) => s.solo)
        .map(([id]) => id)
    : [];
  const effectiveSolos = mixerSolos.length > 0 ? mixerSolos : soloTrackIds;
  const isSoloEngaged = effectiveSolos.length > 0;

  // 1. Check audio tracks with role === 'narration'
  const narrationTracks = document.tracks.filter(
    (t) => t.kind === 'audio' && t.role === 'narration',
  );

  for (const track of narrationTracks) {
    const mixer = trackMixer?.[track.id];
    if (track.muted || mixer?.mute) continue;
    if (isSoloEngaged && !effectiveSolos.includes(track.id)) continue;

    const placedList = layoutTrack(document.clips, track);
    for (const p of placedList) {
      if (frame >= p.startFrames && frame < p.endFrames) {
        return true;
      }
    }
  }

  // 2. Check video clips with sound treated as dialogue (duckExempt === true)
  const videoTracks = document.tracks.filter((t) => t.kind === 'video');
  for (const track of videoTracks) {
    const mixer = trackMixer?.[track.id];
    if (track.muted || mixer?.mute) continue;
    if (isSoloEngaged && !effectiveSolos.includes(track.id)) continue;

    const placedList = layoutTrack(document.clips, track);
    for (const p of placedList) {
      if (
        p.clip.sourceKind === 'video' &&
        p.clip.sourceAudioEnabled !== false &&
        p.clip.duckExempt === true &&
        frame >= p.startFrames &&
        frame < p.endFrames
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calculates the real-time ducking gain multiplier and attenuation dB for ducked beds at `currentFrame`.
 *
 * Implements smooth attack, hold, and release envelopes to eliminate pumping and clicks.
 */
export function calculateDuckingEnvelopeGain(
  document: SequenceDocument | null | undefined,
  currentFrame: number,
  fps: number,
  settings: DuckingSettings = DEFAULT_DUCKING_SETTINGS,
  trackMixer?: Record<string, { mute?: boolean; solo?: boolean }>,
  soloTrackIds: string[] = [],
): DuckingGainResult {
  if (!settings.enabled || !document) {
    return { gainMultiplier: 1.0, gainDb: 0, isDuckingActive: false };
  }

  const safeFps = Math.max(1, fps);
  const depthDb = Math.min(0, settings.duckingDepthDb);
  if (depthDb >= 0) {
    return { gainMultiplier: 1.0, gainDb: 0, isDuckingActive: false };
  }

  const attackFrames = Math.max(1, Math.round((settings.attackMs / 1000) * safeFps));
  const holdFrames = Math.max(0, Math.round((settings.holdMs / 1000) * safeFps));
  const releaseFrames = Math.max(1, Math.round((settings.releaseMs / 1000) * safeFps));

  const isCurrentActive = isDialogueActiveAtFrame({
    document,
    frame: currentFrame,
    trackMixer,
    soloTrackIds,
  });

  if (isCurrentActive) {
    // Determine how long dialogue has been active up to currentFrame
    let activeDurationFrames = 1;
    for (let f = currentFrame - 1; f >= Math.max(0, currentFrame - attackFrames); f--) {
      if (isDialogueActiveAtFrame({ document, frame: f, trackMixer, soloTrackIds })) {
        activeDurationFrames++;
      } else {
        break;
      }
    }

    const attackProgress = Math.min(1, activeDurationFrames / attackFrames);
    // Smooth cosine or linear ramp into ducking depth
    const gainDb = depthDb * attackProgress;
    const gainMultiplier = 10 ** (gainDb / 20);
    return {
      gainMultiplier,
      gainDb,
      isDuckingActive: gainDb < -0.1,
    };
  }

  // Current frame is NOT active dialogue. Check if we are in the HOLD or RELEASE phase.
  let framesSinceLastDialogue = -1;
  const maxLookbackFrames = holdFrames + releaseFrames;

  for (let f = currentFrame - 1; f >= Math.max(0, currentFrame - maxLookbackFrames); f--) {
    if (isDialogueActiveAtFrame({ document, frame: f, trackMixer, soloTrackIds })) {
      framesSinceLastDialogue = currentFrame - f;
      break;
    }
  }

  if (framesSinceLastDialogue === -1) {
    // No recent dialogue -> fully unducked
    return { gainMultiplier: 1.0, gainDb: 0, isDuckingActive: false };
  }

  // 1. HOLD phase: maintain full ducking depth to avoid pumping between words
  if (framesSinceLastDialogue <= holdFrames) {
    const gainMultiplier = 10 ** (depthDb / 20);
    return {
      gainMultiplier,
      gainDb: depthDb,
      isDuckingActive: true,
    };
  }

  // 2. RELEASE phase: smoothly recover from depthDb back to 0 dB
  const releaseElapsed = framesSinceLastDialogue - holdFrames;
  if (releaseElapsed < releaseFrames) {
    const releaseProgress = Math.min(1, releaseElapsed / releaseFrames);
    // Smooth release curve
    const gainDb = depthDb * (1 - releaseProgress);
    const gainMultiplier = 10 ** (gainDb / 20);
    return {
      gainMultiplier,
      gainDb,
      isDuckingActive: gainDb < -0.1,
    };
  }

  return { gainMultiplier: 1.0, gainDb: 0, isDuckingActive: false };
}

/**
 * Builds the exact FFmpeg `sidechaincompress` filter string corresponding to `DuckingSettings`.
 */
export function buildFfmpegSidechainCompressFilter(
  settings: DuckingSettings = DEFAULT_DUCKING_SETTINGS,
): string {
  // Linear threshold: 10^(thresholdDb / 20)
  const thresholdLinear = Math.max(0.001, Math.min(1, 10 ** (settings.thresholdDb / 20)));
  // Compression ratio derived from ducking depth
  const ratio = Math.max(2, Math.min(20, Math.round(Math.abs(settings.duckingDepthDb) / 1.5)));
  const attack = Math.max(1, Math.min(1000, Math.round(settings.attackMs)));
  const release = Math.max(1, Math.min(5000, Math.round(settings.releaseMs)));

  return `sidechaincompress=threshold=${thresholdLinear.toFixed(4)}:ratio=${ratio}:attack=${attack}:release=${release}`;
}
