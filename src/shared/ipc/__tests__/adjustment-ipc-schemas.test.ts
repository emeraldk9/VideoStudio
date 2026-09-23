import { describe, expect, it } from 'vitest';

import { createAdjustmentLayerClip } from '../../utils/timeline/adjustment-layer-ops';
import { DEFAULT_COLOR_GRADING } from '../../utils/timeline/color-grading-ops';
import { clipEffectsSchema } from '../../utils/timeline/effects';
import { IPC_CHANNELS } from '../ipc-channels';
import { IPC_SCHEMAS, sequenceClipSchema } from '../ipc-schemas';

describe('Adjustment Layer IPC Schemas & Validation', () => {
  it('validates a newly minted adjustment layer clip against sequenceClipSchema without error', () => {
    const adjClip = createAdjustmentLayerClip({
      sequenceId: 'seq-1',
      trackId: 'track-1',
      startFrames: 100,
      durationFrames: 150,
      orderIndex: 0,
    });

    const parsed = sequenceClipSchema.safeParse(adjClip);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sourceKind).toBe('effect');
      expect(parsed.data.colorLabel).toBe('violet');
      expect(parsed.data.effects?.colorGrade).toBeDefined();
      expect(parsed.data.effects?.colorGrade?.contrast).toBe(1.0);
    }
  });

  it('validates adjustment layer clip in IPC_SCHEMAS.SEQUENCE_REPLACE_CLIPS', () => {
    const adjClip = createAdjustmentLayerClip({
      sequenceId: 'seq-1',
      trackId: 'track-1',
      startFrames: 0,
      durationFrames: 120,
    });

    const schema = IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_REPLACE_CLIPS];
    const result = schema.safeParse({
      sequenceId: 'seq-1',
      clips: [adjClip],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clips[0].colorLabel).toBe('violet');
      expect(result.data.clips[0].effects?.colorGrade).toBeDefined();
    }
  });

  it('validates custom colorGrade settings in clipEffectsSchema', () => {
    const customGrade = {
      ...DEFAULT_COLOR_GRADING,
      temperature: 25,
      tint: -10,
      exposure: 1.5,
      contrast: 1.2,
      saturation: 1.1,
      vibrance: 15,
      lift: { r: 0.05, g: -0.02, b: 0.01, luma: 0.1 },
    };

    const parsed = clipEffectsSchema.safeParse({
      colorGrade: customGrade,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.colorGrade?.temperature).toBe(25);
      expect(parsed.data.colorGrade?.lift.r).toBe(0.05);
    }
  });

  it('validates compound clip settings in clipEffectsSchema', () => {
    const compoundSettings = {
      nestedSequenceId: 'nested-seq-1',
      nestedSequenceName: 'Sub-Scene A',
      childClipCount: 3,
      childTrackCount: 2,
      durationFrames: 240,
    };

    const parsed = clipEffectsSchema.safeParse({
      compound: compoundSettings,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.compound?.nestedSequenceName).toBe('Sub-Scene A');
    }
  });

  it('validates clips with linkedClipId and syncOffsetFrames', () => {
    const clipWithLink = {
      ...createAdjustmentLayerClip({
        sequenceId: 'seq-1',
        trackId: 'track-1',
        startFrames: 0,
        durationFrames: 60,
      }),
      linkedClipId: 'sibling-clip-99',
      syncOffsetFrames: -12,
    };

    const parsed = sequenceClipSchema.safeParse(clipWithLink);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.linkedClipId).toBe('sibling-clip-99');
      expect(parsed.data.syncOffsetFrames).toBe(-12);
    }
  });

  it('rejects truly invalid unknown keys in clipEffectsSchema', () => {
    const invalidEffects = {
      unknownBogusEffectProperty: 12345,
    };

    const parsed = clipEffectsSchema.safeParse(invalidEffects);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('Unrecognized key');
    }
  });
});
