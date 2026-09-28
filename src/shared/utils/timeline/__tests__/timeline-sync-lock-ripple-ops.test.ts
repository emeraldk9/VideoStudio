import { describe, it, expect } from 'vitest';
import {
  validateRippleRange,
  findSyncLockTrackGaps,
  findAllSyncLockGaps,
  findGlobalVideoBlackoutGaps,
  executeRangeRippleDelete,
  collapseTrackGaps,
  fillTrackGaps,
  auditSyncLockIntegrity,
  type SyncLockTimelineGap,
} from '../timeline-sync-lock-ripple-ops';
import type { SequenceClip, SequenceTrack } from '../../../types/sequence';

describe('timeline-sync-lock-ripple-ops', () => {
  const mockTracks: SequenceTrack[] = [
    {
      id: 'v1',
      sequenceId: 'seq-1',
      kind: 'video',
      orderIndex: 0,
      name: 'V1 Spine',
      magnetic: false,
      locked: false,
      muted: false,
      videoEnabled: true,
      heightPx: 72,
      role: null,
      syncLocked: true,
    },
    {
      id: 'v2',
      sequenceId: 'seq-1',
      kind: 'video',
      orderIndex: 1,
      name: 'V2 B-Roll',
      magnetic: false,
      locked: false,
      muted: false,
      videoEnabled: true,
      heightPx: 72,
      role: 'overlay',
      syncLocked: true,
    },
    {
      id: 'a1',
      sequenceId: 'seq-1',
      kind: 'audio',
      orderIndex: 0,
      name: 'A1 Dialogue',
      magnetic: false,
      locked: false,
      muted: false,
      videoEnabled: true,
      heightPx: 56,
      role: 'narration',
      syncLocked: true,
    },
    {
      id: 'a2',
      sequenceId: 'seq-1',
      kind: 'audio',
      orderIndex: 1,
      name: 'A2 Music Bed (Unlocked Sync)',
      magnetic: false,
      locked: false,
      muted: false,
      videoEnabled: true,
      heightPx: 56,
      role: 'music',
      syncLocked: false, // user unlinked sync lock!
    },
    {
      id: 'a3',
      sequenceId: 'seq-1',
      kind: 'audio',
      orderIndex: 2,
      name: 'A3 Locked Sound FX',
      magnetic: false,
      locked: true, // locked track!
      muted: false,
      videoEnabled: true,
      heightPx: 56,
      role: null,
      syncLocked: true,
    },
  ];

  const makeClip = (
    id: string,
    trackId: string,
    startFrames: number,
    durationFrames: number,
    orderIndex: number = 0,
    sourceKind: SequenceClip['sourceKind'] = 'video',
  ): SequenceClip => ({
    id,
    sequenceId: 'seq-1',
    trackId,
    startFrames,
    durationFrames,
    sourceInFrames: 0,
    sourceOutFrames: durationFrames,
    orderIndex,
    sourceKind,
    filePath: `/media/${id}.mp4`,
    label: id,
    overrides: [],
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
  });

  describe('validateRippleRange', () => {
    it('approves valid chronological ranges', () => {
      expect(validateRippleRange(100, 200).valid).toBe(true);
      expect(validateRippleRange(0, 48).valid).toBe(true);
    });

    it('rejects negative or reversed ranges', () => {
      expect(validateRippleRange(-10, 50).valid).toBe(false);
      expect(validateRippleRange(100, 100).valid).toBe(false);
      expect(validateRippleRange(200, 100).valid).toBe(false);
      expect(validateRippleRange(NaN, 100).valid).toBe(false);
    });
  });

  describe('findSyncLockTrackGaps & findAllSyncLockGaps', () => {
    const clips: SequenceClip[] = [
      makeClip('c1', 'v1', 50, 100, 0), // Gap from 0 to 50, ends at 150
      makeClip('c2', 'v1', 200, 100, 1), // Gap from 150 to 200, ends at 300
    ];

    it('identifies leading and interior gaps on a track', () => {
      const gaps = findSyncLockTrackGaps(clips, mockTracks[0]);
      expect(gaps.length).toBe(2);

      expect(gaps[0].startFrames).toBe(0);
      expect(gaps[0].endFrames).toBe(50);
      expect(gaps[0].durationFrames).toBe(50);

      expect(gaps[1].startFrames).toBe(150);
      expect(gaps[1].endFrames).toBe(200);
      expect(gaps[1].durationFrames).toBe(50);
      expect(gaps[1].precedingClipId).toBe('c1');
      expect(gaps[1].followingClipId).toBe('c2');
    });

    it('returns empty array for magnetic continuous tracks', () => {
      const magneticTrack: SequenceTrack = { ...mockTracks[0], magnetic: true };
      const gaps = findSyncLockTrackGaps(clips, magneticTrack);
      expect(gaps).toEqual([]);
    });

    it('finds all timeline gaps across multiple tracks', () => {
      const multiClips: SequenceClip[] = [
        ...clips,
        makeClip('b1', 'v2', 80, 40, 0),
      ];
      const allGaps = findAllSyncLockGaps(multiClips, mockTracks.slice(0, 2));
      expect(allGaps.length).toBe(3); // 2 on v1, 1 leading on v2
    });
  });

  describe('findGlobalVideoBlackoutGaps', () => {
    it('detects spans where no video clip exists across any unlocked video track', () => {
      const clips: SequenceClip[] = [
        makeClip('v1_c1', 'v1', 0, 100, 0),
        makeClip('v2_c1', 'v2', 100, 50, 0),
        makeClip('v1_c2', 'v1', 200, 80, 1),
      ];

      const globalGaps = findGlobalVideoBlackoutGaps(clips, mockTracks);
      expect(globalGaps.length).toBe(1);
      expect(globalGaps[0].startFrames).toBe(150);
      expect(globalGaps[0].endFrames).toBe(200);
      expect(globalGaps[0].durationFrames).toBe(50);
    });
  });

  describe('executeRangeRippleDelete', () => {
    const clips: SequenceClip[] = [
      // V1: 0 to 100
      makeClip('v1_c1', 'v1', 0, 100, 0),
      // V1: 100 to 200 (TARGET FOR EXCISION: in=100, out=200)
      makeClip('v1_c2', 'v1', 100, 100, 1),
      // V1: 200 to 300 (DOWNSTREAM: should shift to 100)
      makeClip('v1_c3', 'v1', 200, 100, 2),
      // A1: Dialogue (Sync-locked, straddles in-point: 50 to 150)
      makeClip('a1_c1', 'a1', 50, 100, 0, 'audio'),
      // A1: Dialogue downstream (250 to 350 -> should shift left by 100 to 150)
      makeClip('a1_c2', 'a1', 250, 100, 1, 'audio'),
      // A2: Music Bed (NOT Sync-locked! Downstream at 250 -> must NOT shift)
      makeClip('a2_c1', 'a2', 250, 200, 0, 'audio'),
      // A3: Locked Track (Should remain completely untouched)
      makeClip('a3_c1', 'a3', 150, 100, 0, 'audio'),
    ];

    it('excises range, truncates straddlers, and ripples sync-locked downstream clips', () => {
      const result = executeRangeRippleDelete({
        clips,
        tracks: mockTracks,
        inFrame: 100,
        outFrame: 200,
      });

      expect(result.gapClosedFrames).toBe(100);
      expect(result.deletedClipIds).toContain('v1_c2');

      // V1 downstream clip c3 should shift from 200 to 100
      const shiftedV1C3 = result.updatedClips.find((c) => c.id === 'v1_c3');
      expect(shiftedV1C3).toBeDefined();
      expect(shiftedV1C3?.startFrames).toBe(100);

      // A1 straddler c1 (50-150) was truncated to 50-100 (duration 50)
      const truncatedA1C1 = result.updatedClips.find((c) => c.id === 'a1_c1');
      expect(truncatedA1C1).toBeDefined();
      expect(truncatedA1C1?.startFrames).toBe(50);
      expect(truncatedA1C1?.durationFrames).toBe(50);

      // A1 downstream c2 (250-350) should shift by 100 to start at 150
      const shiftedA1C2 = result.updatedClips.find((c) => c.id === 'a1_c2');
      expect(shiftedA1C2).toBeDefined();
      expect(shiftedA1C2?.startFrames).toBe(150);

      // A2 Music Bed (syncLocked: false) must stay at 250!
      const unshiftedA2 = result.updatedClips.find((c) => c.id === 'a2_c1');
      expect(unshiftedA2).toBeDefined();
      expect(unshiftedA2?.startFrames).toBe(250);
      expect(result.syncWarnings.length).toBeGreaterThan(0);

      // A3 Locked track must be completely unchanged at 150
      const lockedA3 = result.updatedClips.find((c) => c.id === 'a3_c1');
      expect(lockedA3).toBeDefined();
      expect(lockedA3?.startFrames).toBe(150);
    });

    it('splits and splices a clip that spans across both in and out points', () => {
      const spanningClip = makeClip('span_1', 'v1', 50, 200, 0); // 50 to 250

      const result = executeRangeRippleDelete({
        clips: [spanningClip],
        tracks: [mockTracks[0]],
        inFrame: 100,
        outFrame: 160,
        overlapPolicy: 'split_and_splice',
      });

      expect(result.splitClipIds).toContain('span_1');
      // Head part: 50 to 100 (duration 50)
      const headPart = result.updatedClips.find((c) => c.id === 'span_1');
      expect(headPart).toBeDefined();
      expect(headPart?.startFrames).toBe(50);
      expect(headPart?.durationFrames).toBe(50);

      // Tail part: starts at 100 (seamlessly butted!), duration = 250 - 160 = 90
      const tailPart = result.updatedClips.find((c) => c.id !== 'span_1');
      expect(tailPart).toBeDefined();
      expect(tailPart?.startFrames).toBe(100);
      expect(tailPart?.durationFrames).toBe(90);
    });
  });

  describe('connected clip anchor preservation during ripple delete', () => {
    it('maintains frame-accurate anchor position when parent clip is shifted left', () => {
      const parentClip = makeClip('parent_clip', 'v1', 200, 100, 0);
      const childClip: SequenceClip = {
        ...makeClip('child_clip', 'v2', 220, 50, 0),
        effects: {
          anchor: {
            enabled: true,
            parentClipId: 'parent_clip',
            offsetFrames: 20,
            anchorPoint: 'start',
            orphanPolicy: 'keep_absolute',
          },
        },
      };

      const result = executeRangeRippleDelete({
        clips: [parentClip, childClip],
        tracks: mockTracks.slice(0, 2),
        inFrame: 50,
        outFrame: 150, // 100-frame ripple deletion
        propagateAnchoredClips: true,
      });

      const updatedParent = result.updatedClips.find((c) => c.id === 'parent_clip');
      const updatedChild = result.updatedClips.find((c) => c.id === 'child_clip');

      expect(updatedParent?.startFrames).toBe(100);
      // Child should shift in lockstep to 120 (100 + 20 offset)
      expect(updatedChild?.startFrames).toBe(120);
    });
  });

  describe('collapseTrackGaps', () => {
    it('collapses multiple gaps on a track chronologically', () => {
      const clips: SequenceClip[] = [
        makeClip('c1', 'v1', 20, 60, 0), // 20-80
        makeClip('c2', 'v1', 110, 50, 1), // 110-160
      ];

      const collapseRes = collapseTrackGaps({
        clips,
        tracks: [mockTracks[0]],
        trackId: 'v1',
      });

      expect(collapseRes.collapsedGaps.length).toBe(2);
      expect(collapseRes.totalFramesRemoved).toBe(50); // 20 + 30

      // c1 should be pulled to 0
      const c1 = collapseRes.updatedClips.find((c) => c.id === 'c1');
      expect(c1?.startFrames).toBe(0);

      // c2 should be pulled directly behind c1 (start at 60)
      const c2 = collapseRes.updatedClips.find((c) => c.id === 'c2');
      expect(c2?.startFrames).toBe(60);
    });
  });

  describe('fillTrackGaps', () => {
    it('creates filler clips in all empty gaps on designated track', () => {
      const clips: SequenceClip[] = [
        makeClip('c1', 'v1', 30, 70, 0), // Gap 1: 0-30
        makeClip('c2', 'v1', 150, 50, 1), // Gap 2: 100-150
      ];

      const fillRes = fillTrackGaps({
        clips,
        tracks: [mockTracks[0]],
        targetTrackId: 'v1',
        fillerLabel: 'Black Slug',
      });

      expect(fillRes.filledGapCount).toBe(2);
      expect(fillRes.totalFramesFilled).toBe(80); // 30 + 50
      expect(fillRes.createdFillerClips.length).toBe(2);

      // Verify continuous layout
      const sorted = fillRes.updatedClips.sort((a, b) => (a.startFrames ?? 0) - (b.startFrames ?? 0));
      expect(sorted[0].startFrames).toBe(0);
      expect(sorted[0].durationFrames).toBe(30);
      expect(sorted[1].id).toBe('c1');
      expect(sorted[2].startFrames).toBe(100);
      expect(sorted[2].durationFrames).toBe(50);
      expect(sorted[3].id).toBe('c2');
    });
  });

  describe('auditSyncLockIntegrity', () => {
    it('detects disparity when audio is non-sync-locked while video is sync-locked', () => {
      const report = auditSyncLockIntegrity([], mockTracks);
      expect(report.driftWarnings.length).toBeGreaterThan(0);
    });

    it('detects orphan anchored clip whose parent does not exist', () => {
      const orphanClip: SequenceClip = {
        ...makeClip('orphan', 'v2', 100, 50, 0),
        effects: {
          anchor: {
            enabled: true,
            parentClipId: 'non-existent-parent',
            offsetFrames: 0,
          },
        },
      };

      const report = auditSyncLockIntegrity([orphanClip], mockTracks);
      expect(report.isAligned).toBe(false);
      expect(report.unalignedTracks).toContain('v2');
      expect(report.driftWarnings.some((w) => w.includes('non-existent-parent'))).toBe(true);
    });
  });
});
