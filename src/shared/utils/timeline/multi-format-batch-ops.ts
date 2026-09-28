/**
 * Milestone S177 — Comprehensive Multi-Format Export Batch Automation & Final Stability Audit.
 *
 * Provides production-grade multi-profile export presets, batch deliverable orchestrator,
 * automated file naming, dynamic ETA calculation, and aggregate render time estimation.
 */

import type {
  RenderAcceleration,
  RenderAudioBitrate,
  RenderDeliveryFormat,
  RenderQuality,
  SequenceRenderRequest,
} from '../../types/sequence';

export type MultiFormatProfileId =
  | 'youtube_4k'
  | 'tiktok_9_16'
  | 'instagram_1_1'
  | 'prores_422hq'
  | 'web_vp9'
  | 'soundtrack_wav';

export type TargetPlatformCategory =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'archive'
  | 'web'
  | 'audio';

export interface MultiFormatProfileDefinition {
  id: MultiFormatProfileId;
  label: string;
  category: TargetPlatformCategory;
  icon: string;
  extension: 'mp4' | 'mov' | 'webm' | 'wav';
  suffix: string;
  description: string;
  resolutionLabel: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | 'native';
  outputHeight: number;
  format: RenderDeliveryFormat;
  quality: RenderQuality;
  audioBitrateKbps: RenderAudioBitrate;
  twoPass?: boolean;
  proresProfile?: number;
  audioOnly?: boolean;
  ebuTargetLufs?: number;
  /** Estimated relative encode duration compared to 1080p 1x real-time */
  relativeSpeedWeight: number;
}

export const MULTI_FORMAT_PROFILES: Record<MultiFormatProfileId, MultiFormatProfileDefinition> = {
  youtube_4k: {
    id: 'youtube_4k',
    label: 'YouTube 4K UHD',
    category: 'youtube',
    icon: 'smart_display',
    extension: 'mp4',
    suffix: 'YouTube_4K',
    description: '2160p 4K UHD · High Bitrate · -14 LUFS Streaming Target',
    resolutionLabel: '3840×2160 (4K UHD)',
    aspectRatio: '16:9',
    outputHeight: 2160,
    format: 'mp4',
    quality: 'high',
    audioBitrateKbps: 256,
    ebuTargetLufs: -14,
    relativeSpeedWeight: 1.6,
  },
  tiktok_9_16: {
    id: 'tiktok_9_16',
    label: 'TikTok & Reels (9:16)',
    category: 'tiktok',
    icon: 'stay_current_portrait',
    extension: 'mp4',
    suffix: 'TikTok_9x16',
    description: '1080×1920 Vertical · High Motion Clarity · Fast Encoding',
    resolutionLabel: '1080×1920 (9:16 Vertical)',
    aspectRatio: '9:16',
    outputHeight: 1920,
    format: 'mp4',
    quality: 'good',
    audioBitrateKbps: 192,
    ebuTargetLufs: -14,
    relativeSpeedWeight: 0.65,
  },
  instagram_1_1: {
    id: 'instagram_1_1',
    label: 'Instagram Feed (1:1)',
    category: 'instagram',
    icon: 'crop_square',
    extension: 'mp4',
    suffix: 'Instagram_1x1',
    description: '1080×1080 Square · Mobile Feed Optimized · Balanced Bitrate',
    resolutionLabel: '1080×1080 (1:1 Square)',
    aspectRatio: '1:1',
    outputHeight: 1080,
    format: 'mp4',
    quality: 'good',
    audioBitrateKbps: 192,
    ebuTargetLufs: -14,
    relativeSpeedWeight: 0.55,
  },
  prores_422hq: {
    id: 'prores_422hq',
    label: 'Apple ProRes 422 HQ',
    category: 'archive',
    icon: 'video_file',
    extension: 'mov',
    suffix: 'ProRes_422HQ',
    description: '10-bit Intraframe Master · Broadcast Archive · PCM Audio',
    resolutionLabel: 'Native Master (ProRes 422 HQ)',
    aspectRatio: 'native',
    outputHeight: 0,
    format: 'prores',
    quality: 'high',
    audioBitrateKbps: 256,
    proresProfile: 3, // ProRes 422 HQ
    ebuTargetLufs: -24, // EBU R128 Broadcast Standard
    relativeSpeedWeight: 0.35, // Intra-frame compression encodes very quickly
  },
  web_vp9: {
    id: 'web_vp9',
    label: 'WebM Stream (VP9/Opus)',
    category: 'web',
    icon: 'movie_edit',
    extension: 'webm',
    suffix: 'WebM_VP9',
    description: '1080p HTML5 Video · VP9 Video + Opus Audio',
    resolutionLabel: '1920×1080 (WebM VP9)',
    aspectRatio: '16:9',
    outputHeight: 1080,
    format: 'webm',
    quality: 'high',
    audioBitrateKbps: 192,
    relativeSpeedWeight: 1.2,
  },
  soundtrack_wav: {
    id: 'soundtrack_wav',
    label: 'Soundtrack Master (24-bit WAV)',
    category: 'audio',
    icon: 'queue_music',
    extension: 'wav',
    suffix: 'Soundtrack_Master',
    description: '24-bit 48kHz Linear PCM · Lossless Studio Mix Bed',
    resolutionLabel: 'Lossless Audio (48kHz / 24-bit)',
    aspectRatio: 'native',
    outputHeight: 0,
    format: 'wav',
    quality: 'high',
    audioBitrateKbps: 256,
    audioOnly: true,
    relativeSpeedWeight: 0.08,
  },
};

export const ALL_MULTI_FORMAT_PROFILE_IDS: readonly MultiFormatProfileId[] = [
  'youtube_4k',
  'tiktok_9_16',
  'instagram_1_1',
  'prores_422hq',
  'web_vp9',
  'soundtrack_wav',
] as const;

/** Default primary social & broadcast batch selection */
export const DEFAULT_BATCH_PROFILE_IDS: readonly MultiFormatProfileId[] = [
  'youtube_4k',
  'tiktok_9_16',
  'instagram_1_1',
  'prores_422hq',
] as const;

/**
 * Generates an output file path for a given profile, appending the standardized suffix.
 */
export function generateBatchOutputPath(
  baseFilePath: string,
  profile: MultiFormatProfileDefinition,
  destinationDir?: string,
): string {
  // Normalize slashes
  const normalized = baseFilePath.replace(/\\/g, '/');
  const lastSlashIndex = normalized.lastIndexOf('/');
  const rawDir = lastSlashIndex !== -1 ? normalized.slice(0, lastSlashIndex) : '.';
  const filename = lastSlashIndex !== -1 ? normalized.slice(lastSlashIndex + 1) : normalized;

  // Extract base name without extension
  const lastDotIndex = filename.lastIndexOf('.');
  const baseName = lastDotIndex !== -1 ? filename.slice(0, lastDotIndex) : filename;

  const targetDir = destinationDir ? destinationDir.replace(/\\/g, '/').replace(/\/+$/, '') : rawDir;
  return `${targetDir}/${baseName}_${profile.suffix}.${profile.extension}`;
}

/**
 * Builds an array of discrete SequenceRenderRequest objects configured for each selected profile.
 */
export function buildMultiFormatBatch(
  baseRequest: SequenceRenderRequest,
  profileIds: readonly MultiFormatProfileId[],
  destinationDir?: string,
): SequenceRenderRequest[] {
  return profileIds.map((id) => {
    const profile = MULTI_FORMAT_PROFILES[id];
    const outputPath = generateBatchOutputPath(baseRequest.outputPath, profile, destinationDir);

    const req: SequenceRenderRequest = {
      ...baseRequest,
      outputPath,
      format: profile.format,
      outputHeight: profile.outputHeight,
      quality: profile.quality,
      audioBitrateKbps: profile.audioBitrateKbps,
      audioOnly: profile.audioOnly ?? false,
      twoPass: profile.twoPass ?? false,
      proresProfile: profile.proresProfile,
      ebuTargetLufs: profile.ebuTargetLufs,
      truePeakCeilingDb: profile.ebuTargetLufs != null ? -1.0 : undefined,
    };

    return req;
  });
}

/**
 * Calculates estimated render durations per profile and in total.
 */
export function calculateBatchEstimatedDuration(
  totalSequenceSeconds: number,
  profileIds: readonly MultiFormatProfileId[],
  acceleration: RenderAcceleration = 'auto',
): {
  totalEstimatedSeconds: number;
  profileEstimates: Record<MultiFormatProfileId, number>;
  formattedTotal: string;
} {
  const hwMultiplier =
    acceleration === 'off'
      ? 1.2
      : acceleration === 'nvenc' || acceleration === 'mediafoundation' || acceleration === 'amf'
        ? 0.35
        : acceleration === 'videotoolbox' || acceleration === 'qsv'
          ? 0.45
          : 0.5; // 'auto' default baseline

  const profileEstimates = {} as Record<MultiFormatProfileId, number>;
  let totalEstimatedSeconds = 0;

  for (const id of profileIds) {
    const profile = MULTI_FORMAT_PROFILES[id];
    if (!profile) continue;

    const estSeconds = Math.max(
      1,
      Math.round(totalSequenceSeconds * profile.relativeSpeedWeight * hwMultiplier),
    );
    profileEstimates[id] = estSeconds;
    totalEstimatedSeconds += estSeconds;
  }

  const mins = Math.floor(totalEstimatedSeconds / 60);
  const secs = totalEstimatedSeconds % 60;
  const formattedTotal = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return {
    totalEstimatedSeconds,
    profileEstimates,
    formattedTotal,
  };
}

/**
 * Calculates a smoothed real-time ETA based on started timestamp and current progress percentage.
 */
export function calculateLiveEta(
  startedAt: number | undefined,
  progressPct: number,
  now: number = Date.now(),
): { remainingSeconds: number; formattedEta: string } | null {
  if (!startedAt || progressPct <= 0 || progressPct >= 100) {
    return null;
  }

  const elapsedSeconds = Math.max(0.1, (now - startedAt) / 1000);
  const totalEstimated = (elapsedSeconds / progressPct) * 100;
  const remainingSeconds = Math.max(1, Math.round(totalEstimated - elapsedSeconds));

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const formattedEta = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return {
    remainingSeconds,
    formattedEta,
  };
}

/**
 * Formats a concise human-readable summary badge for multi-format batch operations.
 */
export function formatBatchSummary(
  profileCount: number,
  formattedEstDuration: string,
): string {
  if (profileCount === 0) return '0 Deliverables Selected';
  const label = profileCount === 1 ? '1 Deliverable' : `${profileCount} Deliverables`;
  return `${label} · Est. ${formattedEstDuration}`;
}
