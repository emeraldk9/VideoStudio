/**
 * Milestone S68 — Audio Stem Delivery & Multi-Format Exporter.
 *
 * Provides separated audio stem isolation (DIA / MUS / SFX / MST), track bus mapping,
 * standardized deliverable filename generation, and batch export job planning for
 * post-production delivery and international localization.
 */

import type { AudioStemType, SequenceClip, SequenceRenderRequest, SequenceTrack } from '../../types/sequence';
import { AUDIO_STEM_TYPES } from '../../types/sequence';
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
  foley: {
    type: 'foley',
    label: 'Whiteboard Foley & SFX',
    shortLabel: 'FOL',
    suffix: '_FOLEY',
    colorClass: 'text-orange-400',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    description: 'Drawing stylus, chalk, marker squeaks, eraser sweeps, and tactile whiteboard foley',
  },
  binaural3d: {
    type: 'binaural3d',
    label: '3D Binaural HRTF',
    shortLabel: '3D',
    suffix: '_BINAURAL3D',
    colorClass: 'text-sky-400',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    description: 'Binaural 3D spatialized headphone mix with Woodworth HRTF ITD/ILD cues and pinna elevation',
  },
  atmos714: {
    type: 'atmos714',
    label: 'Dolby Atmos 7.1.4 Bed',
    shortLabel: 'ATMOS',
    suffix: '_ATMOS714',
    colorClass: 'text-indigo-400',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    description: '12-channel Dolby Atmos speaker bed mix (L, R, C, LFE, Ls, Rs, Lb, Rb, Tfl, Tfr, Tbl, Tbr)',
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

export const ALL_STEM_TYPES: readonly AudioStemType[] = AUDIO_STEM_TYPES;

/**
 * Determines whether a sequence track matches an audio stem target.
 */
export function isTrackMatchingStem(
  track: Pick<SequenceTrack, 'id' | 'kind' | 'role'>,
  stemType: AudioStemType,
  routingMap?: Record<string, string>,
): boolean {
  if (stemType === 'master' || stemType === 'binaural3d' || stemType === 'atmos714') return true;

  // 1. Explicit routing override takes top priority
  if (routingMap && routingMap[track.id]) {
    const rawBus = routingMap[track.id].toLowerCase();
    const isDia = rawBus === BUS_DIALOGUE || rawBus === 'dialogue' || rawBus === 'bus_dialogue';
    const isMus = rawBus === BUS_MUSIC || rawBus === 'music' || rawBus === 'bus_music';
    const isSfx = rawBus === BUS_SFX || rawBus === 'sfx' || rawBus === 'bus_sfx';
    const isFoley = rawBus === 'foley' || rawBus === 'bus_foley';

    if (stemType === 'dialogue' && isDia) return true;
    if (stemType === 'music' && isMus) return true;
    if (stemType === 'sfx' && (isSfx || isFoley)) return true;
    if (stemType === 'foley' && isFoley) return true;
    if (isDia || isMus || isSfx || isFoley) {
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
  if ((track.role as string) === 'foley') {
    return stemType === 'foley' || stemType === 'sfx';
  }

  // 3. Fallback: video sync audio belongs to dialogue; general audio tracks belong to SFX
  if (track.kind === 'video') {
    return stemType === 'dialogue';
  }

  if (stemType === 'foley') {
    return false;
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
    if (stemType === 'master' || stemType === 'binaural3d' || stemType === 'atmos714') return true;
    if (clip.id.startsWith('foley-')) {
      return stemType === 'foley' || stemType === 'sfx';
    }
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
