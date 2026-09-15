export interface ClipTimeWindow {
  startSec: number;
  endSec: number;
}

export type ClipSegmentationDoubt = 'almost-no-silence' | 'too-fragmented' | 'all-windows-short';

export type ClipSoundSegmentation =
  | { kind: 'none'; reason: 'no-audio-stream' | 'continuous-sound' }
  | { kind: 'uncertain'; windows: ClipTimeWindow[]; reason: ClipSegmentationDoubt }
  | { kind: 'candidate'; windows: ClipTimeWindow[] };

export interface ClipProbeOptions {
  noiseDb: number;
  minSilenceSec: number;
}

export interface ClipProbe {
  durationSec: number;
  decodedSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  audioSampleRate: number | null;
  silences: ClipTimeWindow[];
  segmentation: ClipSoundSegmentation;
  noiseDb: number;
  minSilenceSec: number;
}

export interface TtsHistoryLine {
  text: string;
  offsetSeconds: number;
  targetSeconds?: number | null;
  speakerCue?: string | null;
  voiceId?: string | null;
  audioPath?: string | null;
  durationSec?: number | null;
}
