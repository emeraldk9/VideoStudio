import { describe, expect, it } from 'vitest';

describe('S15 Audio Mixer Compounding and Isolation Pipeline', () => {
  /**
   * Helper duplicating the volume compounding formula implemented in
   * TimelinePreview.tsx and sequence-render-service.ts.
   */
  function calculateAudibleVolume(params: {
    clipGainDb: number;
    trackVolume?: number;
    mixerTrackDb?: number;
    masterVolumeDb?: number;
    isClipAudible?: boolean;
    isTrackMuted?: boolean;
    isMixerMuted?: boolean;
    activeSolos?: string[];
    trackId: string;
  }): number {
    const {
      clipGainDb,
      trackVolume = 1,
      mixerTrackDb = 0,
      masterVolumeDb = 0,
      isClipAudible = true,
      isTrackMuted = false,
      isMixerMuted = false,
      activeSolos = [],
      trackId,
    } = params;

    if (!isClipAudible) return 0;
    if (isTrackMuted || isMixerMuted) return 0;
    if (activeSolos.length > 0 && !activeSolos.includes(trackId)) return 0;

    const clipLinear = 10 ** (clipGainDb / 20);
    const mixerLinear = 10 ** (mixerTrackDb / 20);
    const masterLinear = 10 ** (masterVolumeDb / 20);

    const trackCompounded = trackVolume * mixerLinear;
    const finalVolume = clipLinear * trackCompounded * masterLinear;

    return Math.min(1, Math.max(0, finalVolume));
  }

  it('calculates unity gain (0 dB across clip, track, mixer, master) at 1.0', () => {
    const vol = calculateAudibleVolume({
      clipGainDb: 0,
      trackVolume: 1,
      mixerTrackDb: 0,
      masterVolumeDb: 0,
      trackId: 't1',
    });
    expect(vol).toBeCloseTo(1.0, 4);
  });

  it('correctly scales volume with -6 dB clip gain, 0.5 track volume, and +3 dB master', () => {
    // -6 dB is ~0.501187, track is 0.5 -> 0.25059. +3 dB is ~1.4125 -> ~0.35397
    const vol = calculateAudibleVolume({
      clipGainDb: -6,
      trackVolume: 0.5,
      mixerTrackDb: 0,
      masterVolumeDb: 3,
      trackId: 't1',
    });
    expect(vol).toBeCloseTo(0.354, 2);
  });

  it('silences audio if either track or mixer channel is muted', () => {
    expect(
      calculateAudibleVolume({
        clipGainDb: 0,
        trackVolume: 1,
        isTrackMuted: true,
        trackId: 't1',
      }),
    ).toBe(0);

    expect(
      calculateAudibleVolume({
        clipGainDb: 0,
        trackVolume: 1,
        isMixerMuted: true,
        trackId: 't1',
      }),
    ).toBe(0);
  });

  it('isolates soloed tracks and mutes non-soloed tracks', () => {
    const soloTrackId = 'track-lead-vocal';

    // Soloed track should be audible
    const soloVol = calculateAudibleVolume({
      clipGainDb: 0,
      trackVolume: 1,
      activeSolos: [soloTrackId],
      trackId: soloTrackId,
    });
    expect(soloVol).toBeCloseTo(1.0, 4);

    // Other tracks must be silent (0)
    const backgroundVol = calculateAudibleVolume({
      clipGainDb: 0,
      trackVolume: 1,
      activeSolos: [soloTrackId],
      trackId: 'track-b-roll-audio',
    });
    expect(backgroundVol).toBe(0);
  });

  it('clamps output volume to the standard 0.0 to 1.0 bounds', () => {
    // Excessive boost: +12 dB clip, 2.0 track, +6 dB mixer, +6 dB master
    const boosted = calculateAudibleVolume({
      clipGainDb: 12,
      trackVolume: 2,
      mixerTrackDb: 6,
      masterVolumeDb: 6,
      trackId: 't1',
    });
    expect(boosted).toBe(1.0); // Clamped to 1.0

    // Complete silence
    const attenuated = calculateAudibleVolume({
      clipGainDb: -60,
      trackVolume: 0,
      trackId: 't1',
    });
    expect(attenuated).toBe(0);
  });
});
