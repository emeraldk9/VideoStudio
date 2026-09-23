import { describe, expect, it } from 'vitest';
import {
  findNextCut,
  findPreviousCut,
  MARKER_COLORS,
  timelineSnapTargets,
  type SequenceMarker,
} from '../../../index';

describe('markers and transport HUD navigation', () => {
  it('navigates backwards across marker frames using findPreviousCut', () => {
    const markerFrames = [0, 48, 120, 240];

    // From beyond the last marker
    expect(findPreviousCut(markerFrames, 300)).toBe(240);

    // From between markers
    expect(findPreviousCut(markerFrames, 180)).toBe(120);

    // From exact marker frame (hysteresis jumps to previous)
    expect(findPreviousCut(markerFrames, 120)).toBe(48);
    expect(findPreviousCut(markerFrames, 48)).toBe(0);

    // At or before origin
    expect(findPreviousCut(markerFrames, 0)).toBe(0);
  });

  it('navigates forwards across marker frames using findNextCut', () => {
    const markerFrames = [0, 48, 120, 240];
    const duration = 300;

    // From start
    expect(findNextCut(markerFrames, 0, duration)).toBe(48);

    // From exact marker frame (hysteresis jumps to next)
    expect(findNextCut(markerFrames, 48, duration)).toBe(120);
    expect(findNextCut(markerFrames, 120, duration)).toBe(240);

    // From last marker jumps to sequence end duration
    expect(findNextCut(markerFrames, 240, duration)).toBe(300);

    // Beyond duration stays clamped
    expect(findNextCut(markerFrames, 300, duration)).toBe(300);
  });

  it('correctly merges clip snap targets and marker frames via timelineSnapTargets', () => {
    const clipTargets = [0, 24, 72, 144];
    const markerFrames = [36, 72, 100]; // 72 overlaps
    const merged = timelineSnapTargets({
      base: clipTargets,
      markerFrames,
      playheadFrame: null,
      sequenceEndFrame: 200,
    });

    // Should be sorted ascending without duplicates
    expect(merged).toEqual([0, 24, 36, 72, 100, 144, 200]);
  });

  it('supports all standard NLE marker color tokens', () => {
    expect(MARKER_COLORS).toContain('ai');
    expect(MARKER_COLORS).toContain('success');
    expect(MARKER_COLORS).toContain('warning');
    expect(MARKER_COLORS).toContain('info');
    expect(MARKER_COLORS.length).toBe(4);
  });

  it('identifies existing markers at playhead with tolerance', () => {
    const markers: SequenceMarker[] = [
      { id: 'm1', sequenceId: 'seq1', frame: 50, color: 'ai', name: 'Marker 1', locked: false },
      { id: 'm2', sequenceId: 'seq1', frame: 120, color: 'warning', name: 'Review', locked: false },
    ];

    const findAtPlayhead = (frame: number) =>
      markers.find((m) => Math.abs(m.frame - frame) <= 0.5) ?? null;

    expect(findAtPlayhead(50)?.id).toBe('m1');
    expect(findAtPlayhead(50.2)?.id).toBe('m1');
    expect(findAtPlayhead(49.8)?.id).toBe('m1');
    expect(findAtPlayhead(51)).toBeNull();
    expect(findAtPlayhead(120)?.name).toBe('Review');
    expect(findAtPlayhead(0)).toBeNull();
  });
});
