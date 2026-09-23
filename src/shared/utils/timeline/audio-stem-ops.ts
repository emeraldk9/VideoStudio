/**
 * Milestone S68 — Audio Stem Delivery & Multi-Format Exporter.
 *
 * Provides separated audio stem isolation (DIA / MUS / SFX / MST), track bus mapping,
 * standardized deliverable filename generation, and batch export job planning for
 * post-production delivery and international localization.
 */

import type { AudioStemType, SequenceClip, SequenceRenderRequest, SequenceTrack } from '../../types/sequence';
import { BUS_DIALOGUE, BUS_MUSIC, BUS_SFX } from './audio-bus-ops';

export interface AudioStemConfig {
  type: AudioStemType;
  label: string;
  shortLabel: string;
  suffix: string;
  colorClass: string;
  badgeClass: string;
  description: string;
}

export const AUDIO_STEM_CONFIGS: Record<AudioStemType, AudioStemConfig> = {
  dialogue: {
    type: 'dialogue',
    label: 'Dialogue & Narration',
    shortLabel: 'DIA',
    suffix: '_DIA',
    colorClass: 'text-purple-400',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'Dialogue, voiceover, narration, and synced camera production audio',
  },
  music: {
    type: 'music',
    label: 'Music Bed',
    shortLabel: 'MUS',
    suffix: '_MUS',
    colorClass: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Score, background soundtrack, cues, and musical themes',
  },
  sfx: {
    type: 'sfx',
    label: 'Sound Effects & Foley',
    shortLabel: 'SFX',
    suffix: '_SFX',
    colorClass: 'text-amber-400',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Hard effects, ambient atmosphere, whooshes, impacts, and foley',
  },
  master: {
    type: 'master',
    label: 'Composite Master Mix',
    shortLabel: 'MST',
    suffix: '_FULLMIX',
    colorClass: 'text-cyan-400',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    description: 'Complete integrated soundtrack with all buses summed',
  },
};

export const ALL_STEM_TYPES: readonly AudioStemType[] = ['dialogue', 'music', 'sfx', 'master'] as const;

/**
 * Determines whether a sequence track matches an audio stem target.
 */
export function isTrackMatchingStem(
  track: Pick<SequenceTrack, 'id' | 'kind' | 'role'>,
  stemType: AudioStemType,
  routingMap?: Record<string, string>,
): boolean {
  if (stemType === 'master') return true;

  // 1. Explicit routing override takes top priority
  if (routingMap && routingMap[track.id]) {
    const rawBus = routingMap[track.id].toLowerCase();
    const isDia = rawBus === BUS_DIALOGUE || rawBus === 'dialogue' || rawBus === 'bus_dialogue';
    const isMus = rawBus === BUS_MUSIC || rawBus === 'music' || rawBus === 'bus_music';
    const isSfx = rawBus === BUS_SFX || rawBus === 'sfx' || rawBus === 'bus_sfx';

    if (stemType === 'dialogue' && isDia) return true;
    if (stemType === 'music' && isMus) return true;
    if (stemType === 'sfx' && isSfx) return true;
    if (isDia || isMus || isSfx) {
      return false; // explicitly routed to another submix bus
    }
  }

  // 2. Track role heuristic
  if (track.role === 'narration') {
    return stemType === 'dialogue';
  }
  if (track.role === 'music') {
    return stemType === 'music';
  }

  // 3. Fallback: video sync audio belongs to dialogue; general audio tracks belong to SFX
  if (track.kind === 'video') {
    return stemType === 'dialogue';
  }

  return stemType === 'sfx';
}

/**
 * Filters clips down to those matching the requested audio stem.
 */
export function filterClipsForStem(
  clips: readonly SequenceClip[],
  tracks: readonly SequenceTrack[],
  stemType: AudioStemType,
  routingMap?: Record<string, string>,
): SequenceClip[] {
  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  return clips.filter((clip) => {
    // Only sound-carrying clips contribute to audio stems
    if (clip.sourceKind !== 'audio' && clip.sourceKind !== 'video') {
      return false;
    }
    if (stemType === 'master') return true;
    const track = trackMap.get(clip.trackId);
    if (!track) return false;
    return isTrackMatchingStem(track, stemType, routingMap);
  });
}

/**
 * Derives a standardized deliverable file path for an audio stem.
 * e.g. "C:/Exports/Feature.mp4" + "dialogue" -> "C:/Exports/Feature_DIA.wav"
 */
export function generateStemFilePath(
  baseOutputPath: string,
  stemType: AudioStemType,
  format: 'wav' | 'm4a' | 'mp4' = 'wav',
): string {
  const extMatch = baseOutputPath.match(/\.[^./\\]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const dirAndBase = ext ? baseOutputPath.slice(0, -ext.length) : baseOutputPath;
  const suffix = AUDIO_STEM_CONFIGS[stemType]?.suffix ?? `_${stemType.toUpperCase()}`;

  return `${dirAndBase}${suffix}.${format}`;
}

/**
 * Plans a batch of export requests for a package of selected audio stems.
 */
export function buildStemExportBatch(
  baseRequest: SequenceRenderRequest,
  selectedStems: readonly AudioStemType[],
  routingMap?: Record<string, string>,
  format: 'wav' | 'm4a' = 'wav',
): SequenceRenderRequest[] {
  return selectedStems.map((stem) => {
    const outputPath = generateStemFilePath(baseRequest.outputPath, stem, format);
    return {
      ...baseRequest,
      outputPath,
      audioOnly: true,
      format: format === 'wav' ? 'wav' : 'mp4',
      stemType: stem,
      stemRoutingMap: routingMap ?? baseRequest.stemRoutingMap,
    };
  });
}
