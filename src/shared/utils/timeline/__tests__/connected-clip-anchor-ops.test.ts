import { describe, expect, it } from 'vitest';
import type { SequenceClip } from '../../../types/sequence';
import {
  anchorClipToParent,
  calculateAnchorPointFrame,
  detachClipAnchor,
  generateAnchorVisualStems,
  getAnchoredDescendantIds,
  getClipAnchorParentId,
  handleParentClipDeletion,
  isClipAnchored,
  resolveAnchoredClipPositions,
  resolveClipAbsoluteStart,
  validateAnchorHierarchy,
} from '../connected-clip-anchor-ops';

describe('connected-clip-anchor-ops (Milestone S188: Timeline Magnetic Connected Clips & Clip Anchoring Engine)', () => {
  function createTestClip(partial: Partial<SequenceClip>): SequenceClip {
    return {
      id: 'test-clip',
      sequenceId: 'seq-1',
      trackId: 'track-v1',
      orderIndex: 0,
      sourceKind: 'video',
      filePath: '/media/sample.mp4',
      startFrames: 0,
      durationFrames: 100,
      sourceInFrames: 0,
      gainDb: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      label: 'Test Clip',
      motionPreset: 'none',
      transitionIn: 'cut',
      transitionOut: 'cut',
      transitionFrames: 0,
      overrides: [],
      ...partial,
    };
  }

  describe('isClipAnchored & getClipAnchorParentId', () => {
    it('accurately identifies unanchored and anchored clips', () => {
      const unanchored = createTestClip({ id: 'c1' });
      expect(isClipAnchored(unanchored)).toBe(false);
      expect(getClipAnchorParentId(unanchored)).toBeNull();

      const anchored = createTestClip({
        id: 'c2',
        effects: {
          anchor: {
            enabled: true,
            parentClipId: 'c1',
            offsetFrames: 10,
          },
        },
      });
      expect(isClipAnchored(anchored)).toBe(true);
      expect(getClipAnchorParentId(anchored)).toBe('c1');

      const disabledAnchor = createTestClip({
        id: 'c3',
        effects: {
          anchor: {
            enabled: false,
            parentClipId: 'c1',
            offsetFrames: 10,
          },
        },
      });
      expect(isClipAnchored(disabledAnchor)).toBe(false);
      expect(getClipAnchorParentId(disabledAnchor)).toBeNull();
    });
  });

  describe('resolveClipAbsoluteStart & calculateAnchorPointFrame', () => {
    it('resolves start frames for free tracks and cumulative magnetic tracks', () => {
      const freeClip = createTestClip({ id: 'f1', startFrames: 48 });
      expect(resolveClipAbsoluteStart(freeClip)).toBe(48);

      // Magnetic track clips where startFrames is null
      const mag1 = createTestClip({ id: 'm1', trackId: 'v1', orderIndex: 0, startFrames: null, durationFrames: 50 });
      const mag2 = createTestClip({ id: 'm2', trackId: 'v1', orderIndex: 1, startFrames: null, durationFrames: 60 });
      const clips = [mag1, mag2];

      expect(resolveClipAbsoluteStart(mag1, clips)).toBe(0);
      expect(resolveClipAbsoluteStart(mag2, clips)).toBe(50);
    });

    it('calculates anchor point frame based on anchorPoint alignment', () => {
      const parent = createTestClip({ id: 'p1', startFrames: 100, durationFrames: 40 });
      expect(calculateAnchorPointFrame(parent, 'start')).toBe(100);
      expect(calculateAnchorPointFrame(parent, 'midpoint')).toBe(120);
      expect(calculateAnchorPointFrame(parent, 'end')).toBe(140);
    });
  });

  describe('anchorClipToParent', () => {
    it('binds child to parent with accurate frame offset', () => {
      const parent = createTestClip({ id: 'parent-1', startFrames: 100, durationFrames: 100 });
      const child = createTestClip({ id: 'child-1', startFrames: 124, durationFrames: 48 });

      const bound = anchorClipToParent({
        childClip: child,
        parentClip: parent,
        anchorPoint: 'start',
        orphanPolicy: 'keep_absolute',
      });

      expect(bound.effects?.anchor).toEqual({
        enabled: true,
        parentClipId: 'parent-1',
        offsetFrames: 24, // 124 - 100
        anchorPoint: 'start',
        orphanPolicy: 'keep_absolute',
      });
    });

    it('supports midpoint anchor reference point', () => {
      const parent = createTestClip({ id: 'parent-1', startFrames: 100, durationFrames: 100 }); // midpoint is 150
      const child = createTestClip({ id: 'child-1', startFrames: 160, durationFrames: 30 });

      const bound = anchorClipToParent({
        childClip: child,
        parentClip: parent,
        anchorPoint: 'midpoint',
      });

      expect(bound.effects?.anchor?.offsetFrames).toBe(10); // 160 - 150
      expect(bound.effects?.anchor?.anchorPoint).toBe('midpoint');
    });

    it('throws error when attempting to anchor clip to itself', () => {
      const clip = createTestClip({ id: 'self-1' });
      expect(() => {
        anchorClipToParent({ childClip: clip, parentClip: clip });
      }).toThrow('Cannot anchor clip "self-1" to itself.');
    });
  });

  describe('detachClipAnchor', () => {
    it('removes anchor settings while preserving absolute startFrames', () => {
      const anchored = createTestClip({
        id: 'child-1',
        startFrames: 150,
        effects: {
          anchor: {
            enabled: true,
            parentClipId: 'p1',
            offsetFrames: 50,
          },
          transform: { x: 0.5, y: 0.5 },
        },
      });

      const detached = detachClipAnchor(anchored);
      expect(detached.effects?.anchor).toBeUndefined();
      expect(detached.effects?.transform).toEqual({ x: 0.5, y: 0.5 });
      expect(detached.startFrames).toBe(150);
    });
  });

  describe('validateAnchorHierarchy', () => {
    it('validates a clean parent-child and multi-level tree hierarchy', () => {
      const spine = createTestClip({ id: 'spine-1', startFrames: 0 });
      const broll = createTestClip({
        id: 'broll-1',
        startFrames: 10,
        effects: { anchor: { enabled: true, parentClipId: 'spine-1', offsetFrames: 10 } },
      });
      const title = createTestClip({
        id: 'title-1',
        startFrames: 15,
        effects: { anchor: { enabled: true, parentClipId: 'broll-1', offsetFrames: 5 } }, // grandchild
      });

      const validation = validateAnchorHierarchy([spine, broll, title]);
      expect(validation.valid).toBe(true);
      expect(validation.cycles).toHaveLength(0);
      expect(validation.orphanClipIds).toHaveLength(0);
      expect(validation.depths['spine-1']).toBe(0);
      expect(validation.depths['broll-1']).toBe(1);
      expect(validation.depths['title-1']).toBe(2);
    });

    it('detects missing parents (orphans)', () => {
      const child = createTestClip({
        id: 'orphan-1',
        effects: { anchor: { enabled: true, parentClipId: 'nonexistent-clip', offsetFrames: 0 } },
      });

      const validation = validateAnchorHierarchy([child]);
      expect(validation.valid).toBe(false);
      expect(validation.orphanClipIds).toContain('orphan-1');
    });

    it('detects circular dependency cycles', () => {
      const clipA = createTestClip({
        id: 'clipA',
        effects: { anchor: { enabled: true, parentClipId: 'clipB', offsetFrames: 0 } },
      });
      const clipB = createTestClip({
        id: 'clipB',
        effects: { anchor: { enabled: true, parentClipId: 'clipA', offsetFrames: 0 } },
      });

      const validation = validateAnchorHierarchy([clipA, clipB]);
      expect(validation.valid).toBe(false);
      expect(validation.cycles.length).toBeGreaterThan(0);
      expect(validation.cycles[0]).toContain('clipA');
      expect(validation.cycles[0]).toContain('clipB');
    });
  });

  describe('getAnchoredDescendantIds', () => {
    it('recursively gathers all descendant child IDs', () => {
      const parent = createTestClip({ id: 'p' });
      const child1 = createTestClip({
        id: 'c1',
        effects: { anchor: { enabled: true, parentClipId: 'p', offsetFrames: 0 } },
      });
      const child2 = createTestClip({
        id: 'c2',
        effects: { anchor: { enabled: true, parentClipId: 'p', offsetFrames: 10 } },
      });
      const grandChild = createTestClip({
        id: 'gc1',
        effects: { anchor: { enabled: true, parentClipId: 'c1', offsetFrames: 5 } },
      });
      const unrelated = createTestClip({ id: 'u1' });

      const descendants = getAnchoredDescendantIds('p', [parent, child1, child2, grandChild, unrelated]);
      expect(descendants).toHaveLength(3);
      expect(descendants).toContain('c1');
      expect(descendants).toContain('c2');
      expect(descendants).toContain('gc1');
      expect(descendants).not.toContain('u1');
    });
  });

  describe('resolveAnchoredClipPositions', () => {
    it('shifts child clips in lockstep when parent is translated', () => {
      const parent = createTestClip({ id: 'p1', startFrames: 0, durationFrames: 100 });
      const child = createTestClip({
        id: 'c1',
        startFrames: 20,
        effects: { anchor: { enabled: true, parentClipId: 'p1', offsetFrames: 20 } },
      });

      // Shift parent by +50 frames (startFrames becomes 50)
      const result = resolveAnchoredClipPositions({
        clips: [parent, child],
        deltaFramesMap: { p1: 50 },
      });

      expect(result.shiftedCount).toBe(2);
      expect(result.shiftedClipIds).toContain('p1');
      expect(result.shiftedClipIds).toContain('c1');

      const updatedParent = result.updatedClips.find((c) => c.id === 'p1')!;
      const updatedChild = result.updatedClips.find((c) => c.id === 'c1')!;

      expect(updatedParent.startFrames).toBe(50);
      expect(updatedChild.startFrames).toBe(70); // 50 + 20
    });

    it('cascades position shifts through multi-level grandchild hierarchy', () => {
      const parent = createTestClip({ id: 'p', startFrames: 10, durationFrames: 100 });
      const child = createTestClip({
        id: 'c',
        startFrames: 30, // offset 20
        effects: { anchor: { enabled: true, parentClipId: 'p', offsetFrames: 20 } },
      });
      const grandChild = createTestClip({
        id: 'gc',
        startFrames: 45, // offset 15 from child
        effects: { anchor: { enabled: true, parentClipId: 'c', offsetFrames: 15 } },
      });

      // Parent moves +100 frames to start at 110
      const result = resolveAnchoredClipPositions({
        clips: [parent, child, grandChild],
        deltaFramesMap: { p: 100 },
      });

      const updatedP = result.updatedClips.find((x) => x.id === 'p')!;
      const updatedC = result.updatedClips.find((x) => x.id === 'c')!;
      const updatedGC = result.updatedClips.find((x) => x.id === 'gc')!;

      expect(updatedP.startFrames).toBe(110);
      expect(updatedC.startFrames).toBe(130); // 110 + 20
      expect(updatedGC.startFrames).toBe(145); // 130 + 15
    });
  });

  describe('handleParentClipDeletion', () => {
    it('detaches children and preserves absolute position under "keep_absolute" policy', () => {
      const parent = createTestClip({ id: 'p1', startFrames: 100 });
      const child = createTestClip({
        id: 'c1',
        startFrames: 120,
        effects: {
          anchor: {
            enabled: true,
            parentClipId: 'p1',
            offsetFrames: 20,
            orphanPolicy: 'keep_absolute',
          },
        },
      });

      const res = handleParentClipDeletion({
        clips: [parent, child],
        deletedClipIds: ['p1'],
      });

      expect(res.deletedChildIds).toHaveLength(0);
      expect(res.detachedChildIds).toContain('c1');
      expect(res.updatedClips).toHaveLength(1);

      const survivingChild = res.updatedClips[0];
      expect(survivingChild.id).toBe('c1');
      expect(survivingChild.effects?.anchor).toBeUndefined();
      expect(survivingChild.startFrames).toBe(120);
    });

    it('cascades deletion to child under "delete" policy', () => {
      const parent = createTestClip({ id: 'p1', startFrames: 100 });
      const child = createTestClip({
        id: 'c1',
        startFrames: 120,
        effects: {
          anchor: {
            enabled: true,
            parentClipId: 'p1',
            offsetFrames: 20,
            orphanPolicy: 'delete',
          },
        },
      });

      const res = handleParentClipDeletion({
        clips: [parent, child],
        deletedClipIds: ['p1'],
      });

      expect(res.deletedChildIds).toContain('c1');
      expect(res.updatedClips).toHaveLength(0);
    });

    it('re-anchors to nearest neighbor on same track under "reanchor_nearest" policy', () => {
      const deletedParent = createTestClip({ id: 'p1', trackId: 'v1', startFrames: 0, durationFrames: 100 });
      const neighborParent = createTestClip({ id: 'p2', trackId: 'v1', startFrames: 100, durationFrames: 100 });
      const child = createTestClip({
        id: 'c1',
        trackId: 'v2',
        startFrames: 80,
        effects: {
          anchor: {
            enabled: true,
            parentClipId: 'p1',
            offsetFrames: 80,
            orphanPolicy: 'reanchor_nearest',
          },
        },
      });

      const res = handleParentClipDeletion({
        clips: [deletedParent, neighborParent, child],
        deletedClipIds: ['p1'],
      });

      expect(res.reanchoredChildIds).toContain('c1');
      const reanchored = res.updatedClips.find((c) => c.id === 'c1')!;
      expect(reanchored.effects?.anchor?.parentClipId).toBe('p2');
      // child start was 80, p2 start is 100 -> new offset is -20
      expect(reanchored.effects?.anchor?.offsetFrames).toBe(-20);
    });
  });

  describe('generateAnchorVisualStems', () => {
    it('generates visual stem alignment coordinates for rendering SVG stems', () => {
      const parent = createTestClip({ id: 'p1', trackId: 'v1', startFrames: 100, durationFrames: 80 });
      const child = createTestClip({
        id: 'c1',
        trackId: 'v2',
        startFrames: 130,
        effects: {
          anchor: {
            enabled: true,
            parentClipId: 'p1',
            offsetFrames: 30,
            anchorPoint: 'start',
          },
        },
      });

      const stems = generateAnchorVisualStems([parent, child]);
      expect(stems).toHaveLength(1);
      expect(stems[0]).toEqual({
        childClipId: 'c1',
        parentClipId: 'p1',
        anchorFrame: 100,
        childStartFrame: 130,
        childTrackId: 'v2',
        parentTrackId: 'v1',
        offsetFrames: 30,
        anchorPoint: 'start',
      });
    });
  });
});
