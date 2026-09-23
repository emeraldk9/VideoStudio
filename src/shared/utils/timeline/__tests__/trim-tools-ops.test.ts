import { describe, expect, it } from 'vitest';

import type { SequenceClip, SequenceMarker, SequenceTrack } from '../../../types/sequence';
import {
  buildSnapTargetsWithMeta,
  executeRippleTrim,
  executeRollingEdit,
  findJunctionAtFrame,
  snapFrameWithMeta,
  type SnapTargetEntry,
} from '../trim-tools-ops';

function makeMockTrack(id: string): SequenceTrack {
  return {
    id,
    sequenceId: 'seq-1',
    kind: 'video',
    orderIndex: 0,
    name: 'V1',
    magnetic: false,
    locked: false,
    muted: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
  };
}

function makeMockClip(
  id: string,
  startFrames: number,
  durationFrames: number,
  sourceInFrames: number | null = 0,
): SequenceClip {
  return {
    id,
    sequenceId: 'seq-1',
    trackId: 'v1',
    orderIndex: 0,
    sourceKind: 'video',
    filePath: 'test.mp4',
    startFrames,
    durationFrames,
    sourceInFrames,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: `Clip ${id}`,
    overrides: [],
  };
}

describe('trim-tools-ops', () => {
  const track = makeMockTrack('v1');
  const tracks = [track];

  describe('buildSnapTargetsWithMeta and snapFrameWithMeta', () => {
    it('builds rich snap targets including markers, In/Out points, playhead and clips', () => {
      const c1 = makeMockClip('c1', 0, 100);
      const markers: SequenceMarker[] = [
        {
          id: 'm1',
          sequenceId: 'seq-1',
          frame: 48,
          name: 'Hero Line',
          color: 'warning',
          locked: false,
        },
      ];

      const targets = buildSnapTargetsWithMeta({
        tracks,
        clips: [c1],
        markers,
        playheadFrame: 75,
        inPointFrame: 24,
        outPointFrame: 150,
        sequenceEndFrame: 200,
      });

      expect(targets.some((t) => t.frame === 0 && t.type === 'clip_head')).toBe(true);
      expect(targets.some((t) => t.frame === 100 && t.type === 'clip_tail')).toBe(true);
      expect(targets.some((t) => t.frame === 48 && t.label === 'Marker: Hero Line')).toBe(true);
      expect(targets.some((t) => t.frame === 24 && t.type === 'in_point')).toBe(true);
      expect(targets.some((t) => t.frame === 150 && t.type === 'out_point')).toBe(true);
      expect(targets.some((t) => t.frame === 75 && t.type === 'playhead')).toBe(true);
      expect(targets.some((t) => t.frame === 200 && t.type === 'sequence_end')).toBe(true);
    });

    it('snaps to nearest target within tolerance and returns metadata', () => {
      const targets: SnapTargetEntry[] = [
        { frame: 50, type: 'marker', label: 'Marker: Action' },
        { frame: 100, type: 'clip_tail', label: 'Clip A Out' },
      ];

      const snapped = snapFrameWithMeta(48, targets, 3);
      expect(snapped.didSnap).toBe(true);
      expect(snapped.snappedFrame).toBe(50);
      expect(snapped.target?.label).toBe('Marker: Action');

      const notSnapped = snapFrameWithMeta(70, targets, 3);
      expect(notSnapped.didSnap).toBe(false);
      expect(notSnapped.snappedFrame).toBe(70);
    });
  });

  describe('findJunctionAtFrame', () => {
    it('locates abutting outgoing and incoming clips at edit boundary', () => {
      const c1 = makeMockClip('c1', 0, 100);
      const c2 = makeMockClip('c2', 100, 80);

      const junction = findJunctionAtFrame([c1, c2], track, 100);
      expect(junction).not.toBeNull();
      expect(junction?.outgoing.id).toBe('c1');
      expect(junction?.incoming.id).toBe('c2');
    });

    it('returns null when there is a gap at the boundary', () => {
      const c1 = makeMockClip('c1', 0, 100);
      const c2 = makeMockClip('c2', 120, 80); // 20 frame gap

      expect(findJunctionAtFrame([c1, c2], track, 100)).toBeNull();
    });
  });

  describe('executeRollingEdit', () => {
    it('adjusts adjacent clip boundary while keeping total sequence duration unchanged', () => {
      const c1 = makeMockClip('c1', 0, 100, 0);
      const c2 = makeMockClip('c2', 100, 80, 0);

      // Roll junction forward by +20 frames
      const nextClips = executeRollingEdit([c1, c2], tracks, 100, 20);

      const nextC1 = nextClips.find((c) => c.id === 'c1');
      const nextC2 = nextClips.find((c) => c.id === 'c2');

      expect(nextC1?.durationFrames).toBe(120); // 100 + 20
      expect(nextC2?.startFrames).toBe(120); // starts 20 frames later
      expect(nextC2?.durationFrames).toBe(60); // 80 - 20
      expect(nextC2?.sourceInFrames).toBe(20); // trimmed into source by 20

      // Combined end frame is still exactly 180!
      expect((nextC2?.startFrames ?? 0) + (nextC2?.durationFrames ?? 0)).toBe(180);
    });

    it('clamps rolling edit so neither clip shrinks below 1 frame', () => {
      const c1 = makeMockClip('c1', 0, 100, 0);
      const c2 = makeMockClip('c2', 100, 20, 0);

      // Attempt to roll forward by 50 frames (which would make c2 negative)
      const nextClips = executeRollingEdit([c1, c2], tracks, 100, 50);

      const nextC1 = nextClips.find((c) => c.id === 'c1');
      const nextC2 = nextClips.find((c) => c.id === 'c2');

      // c2 can shrink by at most 19 frames (leaving 1 frame duration)
      expect(nextC2?.durationFrames).toBe(1);
      expect(nextC1?.durationFrames).toBe(119);
    });
  });

  describe('executeRippleTrim', () => {
    it('tail ripple trim extends clip and slides downstream clips right', () => {
      const c1 = makeMockClip('c1', 0, 50);
      const c2 = makeMockClip('c2', 50, 50);

      // Lengthen c1 by +30 frames (50 -> 80)
      const nextClips = executeRippleTrim([c1, c2], tracks, 'c1', 'end', 30);

      const nextC1 = nextClips.find((c) => c.id === 'c1');
      const nextC2 = nextClips.find((c) => c.id === 'c2');

      expect(nextC1?.durationFrames).toBe(80);
      expect(nextC2?.startFrames).toBe(80); // shifted right by 30
    });

    it('tail ripple trim shortens clip and slides downstream clips left', () => {
      const c1 = makeMockClip('c1', 0, 50);
      const c2 = makeMockClip('c2', 50, 50);

      // Shorten c1 by -20 frames (50 -> 30)
      const nextClips = executeRippleTrim([c1, c2], tracks, 'c1', 'end', -20);

      const nextC1 = nextClips.find((c) => c.id === 'c1');
      const nextC2 = nextClips.find((c) => c.id === 'c2');

      expect(nextC1?.durationFrames).toBe(30);
      expect(nextC2?.startFrames).toBe(30); // shifted left by 20 (no gap left!)
    });

    it('head ripple trim shortens clip and ripples downstream clips left without gaps', () => {
      const c1 = makeMockClip('c1', 0, 50);
      const c2 = makeMockClip('c2', 50, 50);

      // Trim head of c1 rightward by +15 frames (50 -> 35 duration, sourceIn +15)
      const nextClips = executeRippleTrim([c1, c2], tracks, 'c1', 'start', 15);

      const nextC1 = nextClips.find((c) => c.id === 'c1');
      const nextC2 = nextClips.find((c) => c.id === 'c2');

      expect(nextC1?.durationFrames).toBe(35);
      expect(nextC1?.sourceInFrames).toBe(15);
      expect(nextC2?.startFrames).toBe(35); // shifted left by 15 so c2 abuts c1 exactly
    });
  });
});
