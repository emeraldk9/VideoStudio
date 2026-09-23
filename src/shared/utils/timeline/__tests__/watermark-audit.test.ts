import { describe, expect, it } from 'vitest';

import {
  IPC_CHANNELS,
  IPC_SCHEMAS,
  WATERMARK_OUTPUT_MODES,
  WATERMARK_SOURCE_KINDS,
} from '../../../index';
import {
  selectTimelineWatermarkTargets,
  watermarkMediaTypeOf,
  watermarkSourceForClip,
} from '../watermark-sources';

describe('Watermark Audit & Schemas Test Suite', () => {
  it('validates WATERMARK_START_BATCH schema with real source list and options', () => {
    const validBatchPayload = {
      sources: [
        {
          kind: 'sequence-media' as const,
          sourceId: 'media-123',
          sourcePath: 'C:\\Videos\\scene1.mp4',
        },
        {
          kind: 'story-take' as const,
          sourceId: 'take-456',
        },
      ],
      region: {
        kind: 'preset' as const,
        presetId: 'auto',
      },
      outputMode: 'derive' as const,
      lossless: false,
    };

    const parsed = IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_START_BATCH].safeParse(validBatchPayload);
    expect(parsed.success).toBe(true);
  });

  it('validates manual region in WATERMARK_START_BATCH schema', () => {
    const validManualPayload = {
      sources: [
        {
          kind: 'external' as const,
          sourceId: 'ext-789',
        },
      ],
      region: {
        kind: 'manual' as const,
        rect: {
          x: 0.8,
          y: 0.85,
          w: 0.15,
          h: 0.1,
        },
      },
      outputMode: 'replace' as const,
    };

    const parsed = IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_START_BATCH].safeParse(validManualPayload);
    expect(parsed.success).toBe(true);
  });

  it('validates WATERMARK_FRAME and WATERMARK_PREVIEW schemas', () => {
    const framePayload = {
      source: {
        kind: 'sequence-media' as const,
        sourceId: 'media-1',
      },
      atSeconds: 2.5,
    };
    const frameParsed = IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_FRAME].safeParse(framePayload);
    expect(frameParsed.success).toBe(true);

    const previewPayload = {
      source: {
        kind: 'story-take' as const,
        sourceId: 'take-1',
      },
      region: {
        kind: 'preset' as const,
        presetId: 'veo-diamond-auto',
      },
      atSeconds: 0,
    };
    const previewParsed = IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_PREVIEW].safeParse(previewPayload);
    expect(previewParsed.success).toBe(true);
  });

  it('correctly categorizes watermark media type from file extension', () => {
    expect(watermarkMediaTypeOf('shot_01.mp4')).toBe('video');
    expect(watermarkMediaTypeOf('clip.MOV')).toBe('video');
    expect(watermarkMediaTypeOf('anim.webm')).toBe('video');
    expect(watermarkMediaTypeOf('image.png')).toBe('image');
    expect(watermarkMediaTypeOf('still_02.jpg')).toBe('image');
  });

  it('accurately resolves watermarkSourceForClip and dedupes timeline targets', () => {
    const mediaIdByPath = new Map<string, string>([
      ['C:/assets/clip_A.mp4', 'media-id-a'],
      ['C:/assets/still_B.png', 'media-id-b'],
    ]);

    const clip1 = {
      id: 'c1',
      sourceKind: 'video' as const,
      filePath: 'C:/assets/clip_A.mp4',
      outputId: null,
      sourceTakeId: null,
    };
    const clip2 = {
      id: 'c2',
      sourceKind: 'video' as const,
      filePath: 'C:/assets/clip_A.mp4',
      outputId: null,
      sourceTakeId: null,
    };
    const clip3 = {
      id: 'c3',
      sourceKind: 'still' as const,
      filePath: 'C:/assets/still_B.png',
      outputId: null,
      sourceTakeId: 'take-story-99',
    };

    const target1 = watermarkSourceForClip(clip1, mediaIdByPath);
    expect(target1).toEqual({ kind: 'sequence-media', sourceId: 'media-id-a' });

    const target3 = watermarkSourceForClip(clip3, mediaIdByPath);
    expect(target3).toEqual({ kind: 'story-take', sourceId: 'take-story-99' });

    const targets = selectTimelineWatermarkTargets([clip1 as any, clip2 as any, clip3 as any], mediaIdByPath);
    // clip1 and clip2 point to the same file, so they should be collapsed into 1 target
    expect(targets).toHaveLength(2);
    expect(targets[0].clipIds).toEqual(['c1', 'c2']);
    expect(targets[0].ref.sourceId).toBe('media-id-a');
    expect(targets[1].clipIds).toEqual(['c3']);
    expect(targets[1].ref.sourceId).toBe('take-story-99');
  });
});
