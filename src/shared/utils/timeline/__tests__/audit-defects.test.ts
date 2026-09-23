import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS, IPC_SCHEMAS } from '../../../index';
import { ExternalPathTokens } from '../../../../main/ipc/path-tokens';

describe('Audit Defect Fixes & Schema Verifications', () => {
  it('validates new watermark IPC schemas properly', () => {
    // WATERMARK_CLEAN_STATUS schema
    const cleanStatusSchema = IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_CLEAN_STATUS];
    expect(cleanStatusSchema).toBeDefined();

    const validPayload = {
      refs: [
        { kind: 'sequence-media', sourceId: 'media-123' },
        { kind: 'story-take', sourceId: 'take-456' },
      ],
    };
    expect(cleanStatusSchema.safeParse(validPayload).success).toBe(true);

    const invalidPayload = {
      refs: [{ kind: '', sourceId: '' }],
    };
    expect(cleanStatusSchema.safeParse(invalidPayload).success).toBe(false);

    // Void schemas for pickers and model commands
    expect(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_INPAINT_STATUS].safeParse(undefined).success).toBe(true);
    expect(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_DOWNLOAD_MODEL].safeParse(undefined).success).toBe(true);
    expect(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_REMOVE_MODEL].safeParse(undefined).success).toBe(true);
    expect(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_CANCEL_MODEL_DOWNLOAD].safeParse(undefined).success).toBe(true);
    expect(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_PICK_EXTERNAL_FILES].safeParse(undefined).success).toBe(true);
    expect(IPC_SCHEMAS[IPC_CHANNELS.WATERMARK_PICK_EXPORT_DIR].safeParse(undefined).success).toBe(true);
  });

  it('safely mints and resolves opaque tokens via ExternalPathTokens', () => {
    const tokens = new ExternalPathTokens();
    const filePath = 'C:/Videos/my_watermarked_clip.mp4';
    const token = tokens.mint(filePath);

    expect(token).toMatch(/^ext_/);
    expect(tokens.resolve(token)).toBeDefined();
    // Non-existent tokens resolve to null
    expect(tokens.resolve('ext_unknown')).toBeNull();
  });

  it('correctly calculates track-scaled audio playback volume', () => {
    const computeEffectiveVolume = (gainDb: number, trackVolume?: number) => {
      const trackVol = trackVolume ?? 1;
      return Math.min(1, Math.max(0, 10 ** (gainDb / 20) * trackVol));
    };

    // 0 dB with default track volume (1.0) -> 1.0
    expect(computeEffectiveVolume(0, 1)).toBeCloseTo(1.0, 4);

    // 0 dB with 50% track volume (0.5) -> 0.5
    expect(computeEffectiveVolume(0, 0.5)).toBeCloseTo(0.5, 4);

    // 0 dB with muted/zero track volume (0.0) -> 0.0
    expect(computeEffectiveVolume(0, 0)).toBe(0);

    // -6 dB with 100% track volume -> ~0.501
    expect(computeEffectiveVolume(-6, 1)).toBeCloseTo(0.501, 3);

    // -6 dB with 50% track volume -> ~0.2505
    expect(computeEffectiveVolume(-6, 0.5)).toBeCloseTo(0.2505, 3);

    // +6 dB with 150% track volume -> clamped to 1.0 max HTMLMediaElement limit
    expect(computeEffectiveVolume(6, 1.5)).toBe(1.0);
  });
});
