import { describe, expect, it } from 'vitest';
import {
  ALL_MULTI_FORMAT_PROFILE_IDS,
  buildMultiFormatBatch,
  calculateBatchEstimatedDuration,
  calculateLiveEta,
  DEFAULT_BATCH_PROFILE_IDS,
  formatBatchSummary,
  generateBatchOutputPath,
  MULTI_FORMAT_PROFILES,
  type MultiFormatProfileId,
} from '../multi-format-batch-ops';
import type { SequenceRenderRequest } from '../../../types/sequence';

describe('multi-format-batch-ops (Milestone S177: Comprehensive Multi-Format Export Batch Automation)', () => {
  const mockBaseRequest: SequenceRenderRequest = {
    sequenceId: 'seq-master-1',
    outputPath: 'C:/Exports/MyProject_Final.mp4',
    draft: false,
    duckMusicUnderNarration: true,
    outputHeight: 1080,
    quality: 'high',
    audioBitrateKbps: 192,
    acceleration: 'auto',
    audioOnly: false,
    format: 'mp4',
    twoPass: false,
    burnInSubtitles: true,
    subtitleStylePresetId: 'classic_clean',
  };

  describe('MULTI_FORMAT_PROFILES Configuration', () => {
    it('contains all registered profile IDs with valid delivery properties', () => {
      expect(ALL_MULTI_FORMAT_PROFILE_IDS.length).toBe(6);

      for (const id of ALL_MULTI_FORMAT_PROFILE_IDS) {
        const profile = MULTI_FORMAT_PROFILES[id];
        expect(profile).toBeDefined();
        expect(profile.id).toBe(id);
        expect(profile.label.length).toBeGreaterThan(3);
        expect(profile.suffix.length).toBeGreaterThan(2);
        expect(['mp4', 'mov', 'webm', 'wav']).toContain(profile.extension);
        expect(profile.relativeSpeedWeight).toBeGreaterThan(0);
      }
    });

    it('has sensible default batch profiles', () => {
      expect(DEFAULT_BATCH_PROFILE_IDS).toEqual([
        'youtube_4k',
        'tiktok_9_16',
        'instagram_1_1',
        'prores_422hq',
      ]);
    });
  });

  describe('generateBatchOutputPath', () => {
    it('appends profile suffix and extension while preserving source directory', () => {
      const profile = MULTI_FORMAT_PROFILES['youtube_4k'];
      const out = generateBatchOutputPath('C:/Exports/Commercial_Cut.mp4', profile);
      expect(out).toBe('C:/Exports/Commercial_Cut_YouTube_4K.mp4');
    });

    it('handles Windows backslashes and converts them to clean path separators', () => {
      const profile = MULTI_FORMAT_PROFILES['tiktok_9_16'];
      const out = generateBatchOutputPath('D:\\Renders\\Teaser.mov', profile);
      expect(out).toBe('D:/Renders/Teaser_TikTok_9x16.mp4');
    });

    it('supports custom destination directory overrides', () => {
      const profile = MULTI_FORMAT_PROFILES['prores_422hq'];
      const out = generateBatchOutputPath(
        'C:/Temp/Draft.mp4',
        profile,
        'E:/Deliverables/ClientA',
      );
      expect(out).toBe('E:/Deliverables/ClientA/Draft_ProRes_422HQ.mov');
    });

    it('handles filenames without directory paths', () => {
      const profile = MULTI_FORMAT_PROFILES['soundtrack_wav'];
      const out = generateBatchOutputPath('SongMix.mp4', profile);
      expect(out).toBe('./SongMix_Soundtrack_Master.wav');
    });
  });

  describe('buildMultiFormatBatch', () => {
    it('generates customized requests for all selected profile IDs', () => {
      const selected: MultiFormatProfileId[] = ['youtube_4k', 'prores_422hq', 'soundtrack_wav'];
      const batch = buildMultiFormatBatch(mockBaseRequest, selected);

      expect(batch.length).toBe(3);

      // YouTube 4K
      expect(batch[0].outputPath).toBe('C:/Exports/MyProject_Final_YouTube_4K.mp4');
      expect(batch[0].outputHeight).toBe(2160);
      expect(batch[0].format).toBe('mp4');
      expect(batch[0].quality).toBe('high');
      expect(batch[0].ebuTargetLufs).toBe(-14);
      expect(batch[0].burnInSubtitles).toBe(true);

      // ProRes 422 HQ
      expect(batch[1].outputPath).toBe('C:/Exports/MyProject_Final_ProRes_422HQ.mov');
      expect(batch[1].format).toBe('prores');
      expect(batch[1].proresProfile).toBe(3);
      expect(batch[1].ebuTargetLufs).toBe(-24);

      // Soundtrack WAV
      expect(batch[2].outputPath).toBe('C:/Exports/MyProject_Final_Soundtrack_Master.wav');
      expect(batch[2].format).toBe('wav');
      expect(batch[2].audioOnly).toBe(true);
    });

    it('preserves base sequence ID and options', () => {
      const batch = buildMultiFormatBatch(mockBaseRequest, ['instagram_1_1']);
      expect(batch[0].sequenceId).toBe('seq-master-1');
      expect(batch[0].duckMusicUnderNarration).toBe(true);
      expect(batch[0].outputHeight).toBe(1080);
      expect(batch[0].outputPath).toBe('C:/Exports/MyProject_Final_Instagram_1x1.mp4');
    });
  });

  describe('calculateBatchEstimatedDuration', () => {
    it('calculates total and per-profile estimated render times', () => {
      const durationSeconds = 120; // 2 minute sequence
      const selected: MultiFormatProfileId[] = ['youtube_4k', 'tiktok_9_16', 'soundtrack_wav'];
      const estimates = calculateBatchEstimatedDuration(durationSeconds, selected, 'auto');

      expect(estimates.profileEstimates['youtube_4k']).toBeGreaterThan(0);
      expect(estimates.profileEstimates['tiktok_9_16']).toBeGreaterThan(0);
      expect(estimates.profileEstimates['soundtrack_wav']).toBeGreaterThan(0);

      // 4K should take longer than vertical 1080p and WAV
      expect(estimates.profileEstimates['youtube_4k']).toBeGreaterThan(
        estimates.profileEstimates['tiktok_9_16'],
      );
      expect(estimates.profileEstimates['tiktok_9_16']).toBeGreaterThan(
        estimates.profileEstimates['soundtrack_wav'],
      );

      expect(estimates.totalEstimatedSeconds).toBe(
        estimates.profileEstimates['youtube_4k'] +
          estimates.profileEstimates['tiktok_9_16'] +
          estimates.profileEstimates['soundtrack_wav'],
      );
      expect(estimates.formattedTotal).toMatch(/(\d+m\s)?\d+s/);
    });

    it('scales faster under hardware acceleration compared to software CPU', () => {
      const duration = 60;
      const hw = calculateBatchEstimatedDuration(duration, ['youtube_4k'], 'nvenc');
      const sw = calculateBatchEstimatedDuration(duration, ['youtube_4k'], 'off');

      expect(hw.totalEstimatedSeconds).toBeLessThan(sw.totalEstimatedSeconds);
    });
  });

  describe('calculateLiveEta', () => {
    it('calculates smooth remaining seconds and formatted string', () => {
      const now = 100000;
      const startedAt = now - 30000; // 30 seconds ago
      const progressPct = 50; // halfway through -> 30s remaining

      const eta = calculateLiveEta(startedAt, progressPct, now);
      expect(eta).not.toBeNull();
      expect(eta?.remainingSeconds).toBe(30);
      expect(eta?.formattedEta).toBe('00:30');
    });

    it('returns null for unstarted, 0%, or completed jobs', () => {
      expect(calculateLiveEta(undefined, 50)).toBeNull();
      expect(calculateLiveEta(Date.now(), 0)).toBeNull();
      expect(calculateLiveEta(Date.now(), 100)).toBeNull();
    });
  });

  describe('formatBatchSummary', () => {
    it('generates clean summary strings for UI chips and badges', () => {
      expect(formatBatchSummary(0, '0s')).toBe('0 Deliverables Selected');
      expect(formatBatchSummary(1, '45s')).toBe('1 Deliverable · Est. 45s');
      expect(formatBatchSummary(4, '3m 12s')).toBe('4 Deliverables · Est. 3m 12s');
    });
  });
});
