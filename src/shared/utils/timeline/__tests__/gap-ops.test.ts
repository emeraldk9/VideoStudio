import { describe, expect, it } from 'vitest';

import {
  findTrackGaps,
  findGapAtFrame,
  closeTrackGap,
  closeAllGapsOnTrack,
  closeAllGapsAcrossTracks,
  insertTextClipAt,
  type SequenceClip,
  type SequenceTrack,
} from '../../../index';

describe('S17 Timeline Gap Operations & Compaction', () => {
  const magneticTrack: SequenceTrack = {
    id: 'track-v1',
    sequenceId: 'seq-1',
    orderIndex: 0,
    kind: 'video',
    name: 'V1',
    magnetic: true,
    muted: false,
    locked: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
  };

  const freeTrackA1: SequenceTrack = {
    id: 'track-a1',
    sequenceId: 'seq-1',
    orderIndex: 0,
    kind: 'audio',
    name: 'A1',
    magnetic: false,
    muted: false,
    locked: false,
    videoEnabled: false,
    heightPx: 36,
    role: null,
  };

  const freeTrackV2: SequenceTrack = {
    id: 'track-v2',
    sequenceId: 'seq-1',
    orderIndex: 1,
    kind: 'video',
    name: 'V2',
    magnetic: false,
    muted: false,
    locked: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
  };

  const lockedTrackA2: SequenceTrack = {
    id: 'track-a2',
    sequenceId: 'seq-1',
    orderIndex: 1,
    kind: 'audio',
    name: 'A2',
    magnetic: false,
    muted: false,
    locked: true,
    videoEnabled: false,
    heightPx: 36,
    role: null,
  };

  const clipA1_1: SequenceClip = {
    id: 'clip-a1-1',
    sequenceId: 'seq-1',
    trackId: 'track-a1',
    orderIndex: 0,
    sourceKind: 'audio',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: 'C:/audio1.mp3',
    startFrames: 30, // Leading gap of 30 frames
    durationFrames: 60, // Ends at 90
    sourceInFrames: 0,
    sourceOutFrames: 60,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Audio 1',
    overrides: [],
  };

  const clipA1_2: SequenceClip = {
    id: 'clip-a1-2',
    sequenceId: 'seq-1',
    trackId: 'track-a1',
    orderIndex: 0,
    sourceKind: 'audio',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: 'C:/audio2.mp3',
    startFrames: 150, // Intermediate gap of 60 frames (90 -> 150)
    durationFrames: 50, // Ends at 200
    sourceInFrames: 0,
    sourceOutFrames: 50,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Audio 2',
    overrides: [],
  };

  const clipA1_3: SequenceClip = {
    id: 'clip-a1-3',
    sequenceId: 'seq-1',
    trackId: 'track-a1',
    orderIndex: 0,
    sourceKind: 'audio',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: 'C:/audio3.mp3',
    startFrames: 250, // Intermediate gap of 50 frames (200 -> 250)
    durationFrames: 40, // Ends at 290
    sourceInFrames: 0,
    sourceOutFrames: 40,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Audio 3',
    overrides: [],
  };

  const clips = [clipA1_1, clipA1_2, clipA1_3];

  it('findTrackGaps identifies leading and intermediate gaps on free tracks', () => {
    // With leading gap included
    const gapsWithLeading = findTrackGaps(clips, freeTrackA1, true);
    expect(gapsWithLeading).toHaveLength(3);
    expect(gapsWithLeading[0]).toEqual({
      trackId: 'track-a1',
      startFrames: 0,
      endFrames: 30,
      durationFrames: 30,
    });
    expect(gapsWithLeading[1]).toEqual({
      trackId: 'track-a1',
      startFrames: 90,
      endFrames: 150,
      durationFrames: 60,
    });
    expect(gapsWithLeading[2]).toEqual({
      trackId: 'track-a1',
      startFrames: 200,
      endFrames: 250,
      durationFrames: 50,
    });

    // Without leading gap
    const gapsWithoutLeading = findTrackGaps(clips, freeTrackA1, false);
    expect(gapsWithoutLeading).toHaveLength(2);
    expect(gapsWithoutLeading[0].startFrames).toBe(90);

    // Magnetic tracks return no gaps
    const magneticGaps = findTrackGaps(clips, magneticTrack, true);
    expect(magneticGaps).toHaveLength(0);
  });

  it('findGapAtFrame correctly pinpoints gap at timecode', () => {
    // Frame 10 is in the leading gap [0, 30]
    const leadingGap = findGapAtFrame(clips, freeTrackA1, 10);
    expect(leadingGap).not.toBeNull();
    expect(leadingGap?.startFrames).toBe(0);
    expect(leadingGap?.endFrames).toBe(30);

    // Frame 50 is inside clip 1 [30, 90]
    const clipHit = findGapAtFrame(clips, freeTrackA1, 50);
    expect(clipHit).toBeNull();

    // Frame 120 is in the intermediate gap [90, 150]
    const midGap = findGapAtFrame(clips, freeTrackA1, 120);
    expect(midGap).not.toBeNull();
    expect(midGap?.startFrames).toBe(90);
    expect(midGap?.durationFrames).toBe(60);

    // Magnetic track always returns null
    expect(findGapAtFrame(clips, magneticTrack, 120)).toBeNull();
  });

  it('closeTrackGap ripples downstream clips leftward while preserving upstream clips', () => {
    // Close the gap between clip 1 and clip 2: [90, 150] (duration 60)
    const gap = { startFrames: 90, endFrames: 150, durationFrames: 60 };
    const updated = closeTrackGap(clips, freeTrackA1, gap);

    const c1 = updated.find((c) => c.id === 'clip-a1-1')!;
    const c2 = updated.find((c) => c.id === 'clip-a1-2')!;
    const c3 = updated.find((c) => c.id === 'clip-a1-3')!;

    // Upstream clip unchanged
    expect(c1.startFrames).toBe(30);

    // Downstream clip 2 closed gap, moved from 150 to 90
    expect(c2.startFrames).toBe(90);

    // Downstream clip 3 moved from 250 to 190 (shifted by 60)
    expect(c3.startFrames).toBe(190);
  });

  it('closeAllGapsOnTrack compacts all clips contiguously', () => {
    // Compact with leading gap eliminated (starts at 0)
    const compacted = closeAllGapsOnTrack(clips, freeTrackA1, true);
    const c1 = compacted.find((c) => c.id === 'clip-a1-1')!;
    const c2 = compacted.find((c) => c.id === 'clip-a1-2')!;
    const c3 = compacted.find((c) => c.id === 'clip-a1-3')!;

    expect(c1.startFrames).toBe(0);
    expect(c2.startFrames).toBe(60); // 0 + 60
    expect(c3.startFrames).toBe(110); // 60 + 50

    // Compact preserving initial leading offset
    const compactedKeepLeading = closeAllGapsOnTrack(clips, freeTrackA1, false);
    const k1 = compactedKeepLeading.find((c) => c.id === 'clip-a1-1')!;
    const k2 = compactedKeepLeading.find((c) => c.id === 'clip-a1-2')!;
    const k3 = compactedKeepLeading.find((c) => c.id === 'clip-a1-3')!;

    expect(k1.startFrames).toBe(30);
    expect(k2.startFrames).toBe(90); // 30 + 60
    expect(k3.startFrames).toBe(140); // 90 + 50
  });

  it('closeAllGapsAcrossTracks compacts multiple tracks while respecting locks', () => {
    const clipV2: SequenceClip = {
      id: 'clip-v2-1',
      sequenceId: 'seq-1',
      trackId: 'track-v2',
      orderIndex: 0,
      sourceKind: 'video',
      outputId: null,
      storyShotId: null,
      sourceTakeId: null,
      filePath: 'C:/v2.mp4',
      startFrames: 100,
      durationFrames: 50,
      sourceInFrames: 0,
      sourceOutFrames: 50,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'V2 Overlay',
      overrides: [],
    };

    const clipA2Locked: SequenceClip = {
      id: 'clip-a2-locked',
      sequenceId: 'seq-1',
      trackId: 'track-a2',
      orderIndex: 0,
      sourceKind: 'audio',
      outputId: null,
      storyShotId: null,
      sourceTakeId: null,
      filePath: 'C:/locked.mp3',
      startFrames: 80,
      durationFrames: 40,
      sourceInFrames: 0,
      sourceOutFrames: 40,
      transitionIn: 'cut',
      transitionFrames: 0,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Locked Audio',
      overrides: [],
    };

    const allClips = [...clips, clipV2, clipA2Locked];
    const tracks = [freeTrackA1, freeTrackV2, lockedTrackA2, magneticTrack];

    const result = closeAllGapsAcrossTracks(allClips, tracks, true);

    // Track A1 compacted
    expect(result.find((c) => c.id === 'clip-a1-1')?.startFrames).toBe(0);
    expect(result.find((c) => c.id === 'clip-a1-2')?.startFrames).toBe(60);

    // Track V2 compacted
    expect(result.find((c) => c.id === 'clip-v2-1')?.startFrames).toBe(0);

    // Locked track A2 is untouched
    expect(result.find((c) => c.id === 'clip-a2-locked')?.startFrames).toBe(80);
  });

  it('insertTextClipAt creates a title text clip at specified frame', () => {
    let mintCount = 0;
    const mintId = () => `text-clip-${++mintCount}`;
    const { clips: nextClips, textClip } = insertTextClipAt(
      clips,
      freeTrackV2,
      75,
      90,
      mintId,
      'Lower Third Title',
    );

    expect(nextClips).toHaveLength(clips.length + 1);
    expect(textClip.id).toBe('text-clip-1');
    expect(textClip.trackId).toBe('track-v2');
    expect(textClip.sourceKind).toBe('text');
    expect(textClip.startFrames).toBe(75);
    expect(textClip.durationFrames).toBe(90);
    expect(textClip.label).toBe('Lower Third Title');
    expect(textClip.effects?.text?.text).toBe('Lower Third Title');
  });
});
