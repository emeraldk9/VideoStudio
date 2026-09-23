import { describe, expect, it } from 'vitest';

import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  createTimelineClipboard,
  executeCutClips,
  executeLiftOrExtractWorkArea,
  executePasteClips,
} from '../clipboard-ops';

function makeMockTrack(id: string, kind: 'video' | 'audio', orderIndex = 0, locked = false): SequenceTrack {
  return {
    id,
    sequenceId: 'seq-1',
    kind,
    orderIndex,
    name: id,
    magnetic: false,
    locked,
    muted: false,
    videoEnabled: true,
    heightPx: 48,
    role: null,
  };
}

function makeMockClip(
  id: string,
  trackId: string,
  startFrames: number,
  durationFrames: number,
): SequenceClip {
  return {
    id,
    sequenceId: 'seq-1',
    trackId,
    orderIndex: 0,
    sourceKind: 'video',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: 'test.mp4',
    startFrames,
    durationFrames,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: id,
    overrides: [],
  };
}

describe('clipboard-ops', () => {
  const v1 = makeMockTrack('v1', 'video', 0);
  const a1 = makeMockTrack('a1', 'audio', 0);
  const tracks = [v1, a1];

  describe('createTimelineClipboard', () => {
    it('creates clipboard payload from single clip with relative start = 0', () => {
      const clip1 = makeMockClip('c1', 'v1', 100, 50);
      const clipboard = createTimelineClipboard([clip1], tracks, ['c1']);

      expect(clipboard).not.toBeNull();
      expect(clipboard?.items).toHaveLength(1);
      expect(clipboard?.items[0].relativeStartFrames).toBe(0);
      expect(clipboard?.totalDurationFrames).toBe(50);
      expect(clipboard?.minStartFrames).toBe(100);
      expect(clipboard?.maxEndFrames).toBe(150);
    });

    it('preserves relative offsets when copying multi-track clips', () => {
      const clip1 = makeMockClip('c1', 'v1', 100, 50);
      const clip2 = makeMockClip('c2', 'a1', 120, 60); // Starts 20 frames after clip1, ends at 180
      const clipboard = createTimelineClipboard([clip1, clip2], tracks, ['c1', 'c2']);

      expect(clipboard).not.toBeNull();
      expect(clipboard?.items).toHaveLength(2);
      expect(clipboard?.items[0].relativeStartFrames).toBe(0);
      expect(clipboard?.items[1].relativeStartFrames).toBe(20);
      expect(clipboard?.totalDurationFrames).toBe(80); // 180 - 100 = 80 frames
    });

    it('returns null if selection is empty', () => {
      const clip1 = makeMockClip('c1', 'v1', 100, 50);
      expect(createTimelineClipboard([clip1], tracks, [])).toBeNull();
    });
  });

  describe('executeCutClips', () => {
    it('standard cut leaves gap and returns clipboard', () => {
      const c1 = makeMockClip('c1', 'v1', 0, 50);
      const c2 = makeMockClip('c2', 'v1', 100, 50);
      const { nextClips, clipboard } = executeCutClips([c1, c2], tracks, ['c1'], false);

      expect(clipboard?.items[0].clip.id).toBe('c1');
      expect(nextClips).toHaveLength(1);
      expect(nextClips[0].id).toBe('c2');
      expect(nextClips[0].startFrames).toBe(100); // untouched start position
    });

    it('ripple cut closes the gap by shifting downstream clips left', () => {
      const c1 = makeMockClip('c1', 'v1', 0, 50);
      const c2 = makeMockClip('c2', 'v1', 100, 50);
      const { nextClips, clipboard } = executeCutClips([c1, c2], tracks, ['c1'], true);

      expect(clipboard?.items[0].clip.id).toBe('c1');
      expect(nextClips).toHaveLength(1);
      expect(nextClips[0].id).toBe('c2');
      // Shifted left by c1's duration (50 frames): 100 - 50 = 50
      expect(nextClips[0].startFrames).toBe(50);
    });
  });

  describe('executePasteClips', () => {
    it('standard overwrite paste places clips at playhead without shifting downstream', () => {
      const c1 = makeMockClip('c1', 'v1', 0, 40);
      const c2 = makeMockClip('c2', 'v1', 200, 50);
      const clipboard = createTimelineClipboard([c1], tracks, ['c1'])!;

      let id = 100;
      const { nextClips, pastedClips } = executePasteClips([c1, c2], tracks, clipboard, 80, {
        ripple: false,
        mintId: () => `pasted-${id++}`,
      });

      expect(pastedClips).toHaveLength(1);
      expect(pastedClips[0].startFrames).toBe(80);
      expect(pastedClips[0].durationFrames).toBe(40);
      // Downstream clip c2 remains untouched at 200
      const originalC2 = nextClips.find((c) => c.id === 'c2');
      expect(originalC2?.startFrames).toBe(200);
    });

    it('ripple insert paste splits spanning clip and ripples downstream media forward', () => {
      // One long clip from 0 to 100 on v1
      const longClip = makeMockClip('long', 'v1', 0, 100);
      const copySource = makeMockClip('insertMe', 'v1', 0, 30); // 30 frames duration
      const clipboard = createTimelineClipboard([copySource], tracks, ['insertMe'])!;

      let id = 1;
      // Paste insert at frame 40 on v1
      const { nextClips, pastedClips } = executePasteClips([longClip], tracks, clipboard, 40, {
        ripple: true,
        mintId: () => `clip-${id++}`,
      });

      expect(pastedClips).toHaveLength(1);
      expect(pastedClips[0].startFrames).toBe(40);
      expect(pastedClips[0].durationFrames).toBe(30);

      // Long clip should be split: head [0..40], tail shifted by 30 to [70..130]
      const v1Clips = nextClips.filter((c) => c.trackId === 'v1');
      expect(v1Clips).toHaveLength(3); // head + pasted + tail

      const head = v1Clips.find((c) => (c.startFrames ?? 0) === 0);
      expect(head?.durationFrames).toBe(40);

      const pasted = v1Clips.find((c) => (c.startFrames ?? 0) === 40);
      expect(pasted?.durationFrames).toBe(30);

      const tail = v1Clips.find((c) => (c.startFrames ?? 0) === 70);
      expect(tail?.durationFrames).toBe(60); // 100 - 40 = 60
    });
  });

  describe('executeLiftOrExtractWorkArea', () => {
    it('Lift cuts range without rippling', () => {
      const c1 = makeMockClip('c1', 'v1', 0, 100);
      const { nextClips, clipboard } = executeLiftOrExtractWorkArea([c1], tracks, 20, 60, false);

      expect(clipboard).not.toBeNull();
      expect(clipboard?.totalDurationFrames).toBe(40);

      // Remaining clips: [0..20] and [60..100]
      expect(nextClips).toHaveLength(2);
      expect(nextClips[0].startFrames).toBe(0);
      expect(nextClips[0].durationFrames).toBe(20);
      expect(nextClips[1].startFrames).toBe(60);
      expect(nextClips[1].durationFrames).toBe(40);
    });

    it('Extract cuts range and ripples downstream media backward', () => {
      const c1 = makeMockClip('c1', 'v1', 0, 100);
      const c2 = makeMockClip('c2', 'v1', 120, 30);
      const { nextClips, clipboard } = executeLiftOrExtractWorkArea([c1, c2], tracks, 20, 60, true);

      expect(clipboard).not.toBeNull();
      // Range is 40 frames.
      // c1 head [0..20].
      // c1 tail was [60..100], shifted left by 40 -> [20..60].
      // c2 was at 120, shifted left by 40 -> 80.
      expect(nextClips).toHaveLength(3);
      const sorted = [...nextClips].sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));
      expect(sorted[0].startFrames).toBe(0);
      expect(sorted[0].durationFrames).toBe(20);
      expect(sorted[1].startFrames).toBe(20);
      expect(sorted[1].durationFrames).toBe(40);
      expect(sorted[2].startFrames).toBe(80);
      expect(sorted[2].durationFrames).toBe(30);
    });

    it('respects locked tracks during lift/extract', () => {
      const lockedTrack = makeMockTrack('locked-v', 'video', 1, true);
      const cLocked = makeMockClip('c-locked', 'locked-v', 0, 100);
      const { nextClips } = executeLiftOrExtractWorkArea([cLocked], [lockedTrack], 20, 60, true);

      // Locked clip should remain completely untouched
      expect(nextClips).toHaveLength(1);
      expect(nextClips[0].startFrames).toBe(0);
      expect(nextClips[0].durationFrames).toBe(100);
    });
  });
});
