import { describe, expect, it } from 'vitest';
import type { SequenceClip, SequenceTrack } from '../../../types/sequence';
import {
  detectClipCollisions,
  resolveCollisionBumping,
  applyAutoRippleInsert,
  applyRippleDelete,
  calculateRippleShiftPreview,
} from '../magnetic-ripple-ops';

function makeTrack(id: string, kind: 'video' | 'audio' = 'video', magnetic = false): SequenceTrack {
  return {
    id,
    sequenceId: 'seq-1',
    name: id,
    kind,
    role: null,
    orderIndex: 0,
    muted: false,
    locked: false,
    magnetic,
    videoEnabled: true,
    heightPx: 64,
  };
}

function makeClip(
  id: string,
  trackId: string,
  startFrames: number | null,
  durationFrames: number,
  orderIndex = 0,
): SequenceClip {
  return {
    id,
    trackId,
    startFrames,
    durationFrames,
    orderIndex,
    sourceStartFrames: 0,
    sourceDurationFrames: durationFrames,
    sourceKind: 'video',
    name: id,
    color: '#3b82f6',
  } as unknown as SequenceClip;
}

describe('magnetic-ripple-ops', () => {
  const freeTrack = makeTrack('v1', 'video', false);
  const magneticTrack = makeTrack('v1-mag', 'video', true);

  describe('detectClipCollisions', () => {
    it('returns empty array on magnetic tracks', () => {
      const clips = [makeClip('c1', magneticTrack.id, 0, 30)];
      const collisions = detectClipCollisions(clips, magneticTrack, 'c2', 10, 20);
      expect(collisions).toEqual([]);
    });

    it('detects overlap collision when intervals intersect', () => {
      const clips = [
        makeClip('c1', freeTrack.id, 10, 50), // [10, 60)
        makeClip('c2', freeTrack.id, 100, 40), // [100, 140)
      ];

      // Proposed clip [40, 80) overlaps c1 in [40, 60)
      const collisions = detectClipCollisions(clips, freeTrack, 'c3', 40, 40);
      expect(collisions).toHaveLength(1);
      expect(collisions[0].collidingClip.id).toBe('c1');
      expect(collisions[0].overlapStart).toBe(40);
      expect(collisions[0].overlapEnd).toBe(60);
      expect(collisions[0].overlapDuration).toBe(20);
    });

    it('ignores clips on other tracks or moving clip itself', () => {
      const clips = [
        makeClip('c1', 'other-track', 10, 50),
        makeClip('c2', freeTrack.id, 10, 50),
      ];

      // Moving c2 itself on freeTrack should not collide with itself
      const collisionsSelf = detectClipCollisions(clips, freeTrack, 'c2', 20, 30);
      expect(collisionsSelf).toEqual([]);

      // Collision check on freeTrack should ignore other-track
      const collisionsOther = detectClipCollisions(clips, freeTrack, 'c3', 20, 30);
      expect(collisionsOther).toHaveLength(1);
      expect(collisionsOther[0].collidingClip.id).toBe('c2');
    });

    it('does not report collision for abutting contiguous clips', () => {
      const clips = [makeClip('c1', freeTrack.id, 0, 50)]; // [0, 50)
      // Exactly abutting at frame 50: [50, 80)
      const collisions = detectClipCollisions(clips, freeTrack, 'c2', 50, 30);
      expect(collisions).toEqual([]);
    });
  });

  describe('resolveCollisionBumping', () => {
    it('returns unbumped position on magnetic tracks or empty tracks', () => {
      expect(resolveCollisionBumping([], freeTrack, 'c1', 50, 30)).toEqual({
        snappedStart: 50,
        bumped: false,
      });

      const clips = [makeClip('c1', magneticTrack.id, 0, 30)];
      expect(resolveCollisionBumping(clips, magneticTrack, 'c2', 50, 30)).toEqual({
        snappedStart: 50,
        bumped: false,
      });
    });

    it('snaps to abut right edge of preceding clip when within bumper tolerance', () => {
      const clips = [makeClip('c1', freeTrack.id, 0, 50)]; // [0, 50)
      // Dropping at 55 (tolerance is 15 frames) -> within 5 frames of edge 50
      const result = resolveCollisionBumping(clips, freeTrack, 'c2', 55, 30, 15);
      expect(result.bumped).toBe(true);
      expect(result.snappedStart).toBe(50);
    });

    it('snaps to abut left edge of succeeding clip when within bumper tolerance', () => {
      const clips = [makeClip('c1', freeTrack.id, 100, 50)]; // [100, 150)
      // Moving a 30-frame clip. To abut left edge, it must end at 100, so start = 70.
      // Dropping at 75 -> within 5 frames of 70
      const result = resolveCollisionBumping(clips, freeTrack, 'c2', 75, 30, 15);
      expect(result.bumped).toBe(true);
      expect(result.snappedStart).toBe(70);
    });

    it('snaps to track head (frame 0) when within bumper tolerance', () => {
      const clips = [makeClip('c1', freeTrack.id, 100, 50)];
      const result = resolveCollisionBumping(clips, freeTrack, 'c2', 8, 30, 15);
      expect(result.bumped).toBe(true);
      expect(result.snappedStart).toBe(0);
    });

    it('forces bump snapping to avoid collision when overlapping', () => {
      const clips = [makeClip('c1', freeTrack.id, 50, 50)]; // [50, 100)
      // Dropping a 20-frame clip directly on top at 60 (would span 60..80, colliding!)
      // Nearest candidate: abut left (ends at 50 -> starts at 30, diff = 30) or abut right (starts at 100, diff = 40)
      const result = resolveCollisionBumping(clips, freeTrack, 'c2', 60, 20, 15);
      expect(result.bumped).toBe(true);
      expect(result.snappedStart).toBe(30); // Cleanly abuts left of c1: [30, 50)
    });

    it('does not bump if far away from any boundary and non-colliding', () => {
      const clips = [makeClip('c1', freeTrack.id, 0, 30)];
      // Dropping at 120 (far from 30)
      const result = resolveCollisionBumping(clips, freeTrack, 'c2', 120, 30, 15);
      expect(result.bumped).toBe(false);
      expect(result.snappedStart).toBe(120);
    });
  });

  describe('applyAutoRippleInsert', () => {
    it('shifts downstream clips rightward on a free track', () => {
      const clips = [
        makeClip('c1', freeTrack.id, 0, 30),
        makeClip('c2', freeTrack.id, 50, 40),
        makeClip('c3', freeTrack.id, 120, 30),
        makeClip('other', 'v2', 40, 50),
        makeClip('c-new', 'v-temp', 0, 20),
      ];

      // Insert new clip 'c-new' at frame 40 with duration 20
      const result = applyAutoRippleInsert(clips, freeTrack, 'c-new', 40, 20);

      const cNew = result.find((c) => c.id === 'c-new');
      const c1 = result.find((c) => c.id === 'c1');
      const c2 = result.find((c) => c.id === 'c2');
      const c3 = result.find((c) => c.id === 'c3');
      const other = result.find((c) => c.id === 'other');

      expect(cNew?.startFrames).toBe(40);
      expect(c1?.startFrames).toBe(0); // Before insertStart (0 < 40), unchanged
      expect(c2?.startFrames).toBe(70); // Shifted: 50 + 20 = 70
      expect(c3?.startFrames).toBe(140); // Shifted: 120 + 20 = 140
      expect(other?.startFrames).toBe(40); // Other track unaffected
    });

    it('inserts and re-indexes clips consecutively on a magnetic track', () => {
      const clips = [
        makeClip('c1', magneticTrack.id, null, 30, 0),
        makeClip('c2', magneticTrack.id, null, 40, 1),
        makeClip('c-new', 'v-temp', 0, 20, 0),
      ];

      // Insert at frame 15 (inside c1 which spans 0..30)
      const result = applyAutoRippleInsert(clips, magneticTrack, 'c-new', 15, 20);
      const magClips = result
        .filter((c) => c.trackId === magneticTrack.id)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      expect(magClips.map((c) => c.id)).toEqual(['c-new', 'c1', 'c2']);
      expect(magClips.map((c) => c.orderIndex)).toEqual([0, 1, 2]);
    });
  });

  describe('applyRippleDelete', () => {
    it('returns identical copy if deletedClipIds is empty', () => {
      const clips = [makeClip('c1', freeTrack.id, 0, 30)];
      expect(applyRippleDelete(clips, [freeTrack], [])).toEqual(clips);
    });

    it('deletes clip and shifts downstream clips leftward on a free track', () => {
      const clips = [
        makeClip('c1', freeTrack.id, 0, 30),
        makeClip('c2', freeTrack.id, 40, 20), // [40, 60) -> to delete
        makeClip('c3', freeTrack.id, 80, 30), // [80, 110)
        makeClip('c4', freeTrack.id, 150, 50), // [150, 200)
      ];

      const result = applyRippleDelete(clips, [freeTrack], ['c2']);

      expect(result.find((c) => c.id === 'c2')).toBeUndefined();
      expect(result.find((c) => c.id === 'c1')?.startFrames).toBe(0);
      // c3 was at 80, shifted left by c2 duration (20) -> 60
      expect(result.find((c) => c.id === 'c3')?.startFrames).toBe(60);
      // c4 was at 150, shifted left by 20 -> 130
      expect(result.find((c) => c.id === 'c4')?.startFrames).toBe(130);
    });

    it('merges contiguous/overlapping deleted clips on a free track', () => {
      const clips = [
        makeClip('c1', freeTrack.id, 10, 20), // [10, 30) -> delete
        makeClip('c2', freeTrack.id, 30, 20), // [30, 50) -> delete (contiguous)
        makeClip('c3', freeTrack.id, 80, 20), // [80, 100)
      ];

      // Combined deleted span is [10, 50) with duration 40
      const result = applyRippleDelete(clips, [freeTrack], ['c1', 'c2']);
      expect(result).toHaveLength(1);
      // c3 shifts left by 40: 80 - 40 = 40
      expect(result[0].id).toBe('c3');
      expect(result[0].startFrames).toBe(40);
    });

    it('deletes and re-indexes on magnetic track', () => {
      const clips = [
        makeClip('c1', magneticTrack.id, null, 30, 0),
        makeClip('c2', magneticTrack.id, null, 30, 1),
        makeClip('c3', magneticTrack.id, null, 30, 2),
      ];

      const result = applyRippleDelete(clips, [magneticTrack], ['c2']);
      expect(result.find((c) => c.id === 'c2')).toBeUndefined();
      const remaining = result.sort((a, b) => a.orderIndex - b.orderIndex);
      expect(remaining.map((c) => c.id)).toEqual(['c1', 'c3']);
      expect(remaining.map((c) => c.orderIndex)).toEqual([0, 1]);
    });
  });

  describe('calculateRippleShiftPreview', () => {
    it('returns shift displacements for clips at or after dropFrame', () => {
      const clips = [
        makeClip('c1', freeTrack.id, 0, 30),
        makeClip('c2', freeTrack.id, 50, 40),
        makeClip('c3', freeTrack.id, 100, 30),
      ];

      // Drop at frame 40 with duration 25
      const shifts = calculateRippleShiftPreview(clips, freeTrack, 'moving', 40, 25);
      expect(shifts).toEqual({
        c2: 25,
        c3: 25,
      });
    });

    it('returns empty object if duration is <= 0', () => {
      const clips = [makeClip('c1', freeTrack.id, 50, 30)];
      expect(calculateRippleShiftPreview(clips, freeTrack, null, 40, 0)).toEqual({});
    });
  });
});
