import { describe, expect, it } from 'vitest';
import type { SequenceMarker } from '../../../types/sequence';
import {
  filterMarkersByCategory,
  findMarkerAtPlayhead,
  findNextMarker,
  findPreviousMarker,
  formatMarkerTimecodeBadge,
  getMarkerCountsByCategory,
  getMarkerGlyph,
  MARKER_FILTER_CATEGORIES,
} from '../marker-navigation-ops';

const sampleMarkers: SequenceMarker[] = [
  {
    id: 'm1',
    sequenceId: 'seq1',
    frame: 24,
    name: 'Intro Chapter',
    color: 'ai',
    locked: false,
    markerKind: 'standard',
  },
  {
    id: 'm2',
    sequenceId: 'seq1',
    frame: 72,
    name: 'Audio Sync Lock',
    color: 'info',
    locked: true,
  },
  {
    id: 'm3',
    sequenceId: 'seq1',
    frame: 120,
    name: 'Color Review',
    color: 'warning',
    locked: false,
    notes: 'Fix highlight blowout in grade',
  },
  {
    id: 'm4',
    sequenceId: 'seq1',
    frame: 180,
    name: 'Downbeat Bar 1',
    color: 'success',
    locked: false,
    markerKind: 'downbeat',
  },
  {
    id: 'm5',
    sequenceId: 'seq1',
    frame: 210,
    name: 'Music Beat 2',
    color: 'success',
    locked: false,
    markerKind: 'beat',
  },
  {
    id: 'm6',
    sequenceId: 'seq1',
    frame: 300,
    name: 'AI Scene Cut',
    color: 'ai',
    locked: false,
    markerKind: 'scene_cut',
  },
];

describe('marker-navigation-ops', () => {
  describe('bidirectional marker navigation', () => {
    it('returns null when navigating empty marker array', () => {
      expect(findNextMarker([], 100)).toBeNull();
      expect(findPreviousMarker([], 100)).toBeNull();
      expect(findMarkerAtPlayhead([], 100)).toBeNull();
    });

    it('finds next marker from timeline start or intermediate positions', () => {
      // From frame 0 before first marker at 24
      const nextFrom0 = findNextMarker(sampleMarkers, 0);
      expect(nextFrom0?.id).toBe('m1');
      expect(nextFrom0?.frame).toBe(24);

      // From frame 50 (between 24 and 72)
      const nextFrom50 = findNextMarker(sampleMarkers, 50);
      expect(nextFrom50?.id).toBe('m2');
      expect(nextFrom50?.frame).toBe(72);

      // From frame 250 (between 210 and 300)
      const nextFrom250 = findNextMarker(sampleMarkers, 250);
      expect(nextFrom250?.id).toBe('m6');
      expect(nextFrom250?.frame).toBe(300);
    });

    it('applies hysteresis so navigating next from an exact marker advances forward', () => {
      // At frame 24, next marker should be m2 at 72
      const nextFrom24 = findNextMarker(sampleMarkers, 24);
      expect(nextFrom24?.id).toBe('m2');
      expect(nextFrom24?.frame).toBe(72);

      // At frame 180, next marker should be m5 at 210
      const nextFrom180 = findNextMarker(sampleMarkers, 180);
      expect(nextFrom180?.id).toBe('m5');
      expect(nextFrom180?.frame).toBe(210);

      // At or beyond last marker (300), next should return null
      expect(findNextMarker(sampleMarkers, 300)).toBeNull();
      expect(findNextMarker(sampleMarkers, 350)).toBeNull();
    });

    it('finds previous marker from end or intermediate positions', () => {
      // From beyond the last marker (frame 400)
      const prevFrom400 = findPreviousMarker(sampleMarkers, 400);
      expect(prevFrom400?.id).toBe('m6');
      expect(prevFrom400?.frame).toBe(300);

      // From frame 150 (between 120 and 180)
      const prevFrom150 = findPreviousMarker(sampleMarkers, 150);
      expect(prevFrom150?.id).toBe('m3');
      expect(prevFrom150?.frame).toBe(120);
    });

    it('applies hysteresis so navigating previous from an exact marker walks backward', () => {
      // At frame 300, previous should be m5 at 210
      const prevFrom300 = findPreviousMarker(sampleMarkers, 300);
      expect(prevFrom300?.id).toBe('m5');
      expect(prevFrom300?.frame).toBe(210);

      // At frame 72, previous should be m1 at 24
      const prevFrom72 = findPreviousMarker(sampleMarkers, 72);
      expect(prevFrom72?.id).toBe('m1');
      expect(prevFrom72?.frame).toBe(24);

      // At or before first marker (24), previous should return null
      expect(findPreviousMarker(sampleMarkers, 24)).toBeNull();
      expect(findPreviousMarker(sampleMarkers, 10)).toBeNull();
      expect(findPreviousMarker(sampleMarkers, 0)).toBeNull();
    });

    it('locates marker at playhead within tolerance', () => {
      expect(findMarkerAtPlayhead(sampleMarkers, 24)?.id).toBe('m1');
      expect(findMarkerAtPlayhead(sampleMarkers, 24.3)?.id).toBe('m1');
      expect(findMarkerAtPlayhead(sampleMarkers, 23.7)?.id).toBe('m1');
      expect(findMarkerAtPlayhead(sampleMarkers, 24.8)).toBeNull();
      expect(findMarkerAtPlayhead(sampleMarkers, 100)).toBeNull();
    });
  });

  describe('marker taxonomy filtering & categories', () => {
    it('defines standard filter categories with valid icons', () => {
      expect(MARKER_FILTER_CATEGORIES.map((c) => c.id)).toEqual([
        'all',
        'chapter',
        'sync',
        'review',
        'beat',
        'scene_cut',
      ]);
    });

    it('filters markers by editorial category', () => {
      expect(filterMarkersByCategory(sampleMarkers, 'all')).toHaveLength(6);

      const syncMarkers = filterMarkersByCategory(sampleMarkers, 'sync');
      expect(syncMarkers.map((m) => m.id)).toEqual(['m2']);

      const reviewMarkers = filterMarkersByCategory(sampleMarkers, 'review');
      expect(reviewMarkers.map((m) => m.id)).toEqual(['m3']);

      const beatMarkers = filterMarkersByCategory(sampleMarkers, 'beat');
      expect(beatMarkers.map((m) => m.id)).toEqual(['m4', 'm5']);

      const sceneCutMarkers = filterMarkersByCategory(sampleMarkers, 'scene_cut');
      expect(sceneCutMarkers.map((m) => m.id)).toEqual(['m6']);

      const chapterMarkers = filterMarkersByCategory(sampleMarkers, 'chapter');
      expect(chapterMarkers.map((m) => m.id)).toEqual(['m1']);
    });

    it('calculates counts across categories accurately', () => {
      const counts = getMarkerCountsByCategory(sampleMarkers);
      expect(counts).toEqual({
        all: 6,
        chapter: 1,
        sync: 1,
        review: 1,
        beat: 2,
        scene_cut: 1,
      });
    });
  });

  describe('HUD timecode and badge formatting', () => {
    it('formats timecode badge with marker name and timecode string', () => {
      // 24fps: frame 24 = 1s = 0:01
      const badgeM1 = formatMarkerTimecodeBadge(sampleMarkers[0], 24);
      expect(badgeM1).toContain('Intro Chapter');
      expect(badgeM1).toContain('0:01');

      // Locked marker
      const badgeM2 = formatMarkerTimecodeBadge(sampleMarkers[1], 24);
      expect(badgeM2).toContain('[Lock]');
      expect(badgeM2).toContain('0:03');

      // Review marker with note
      const badgeM3 = formatMarkerTimecodeBadge(sampleMarkers[2], 24);
      expect(badgeM3).toContain('[Note]');
    });

    it('resolves semantic icon glyphs for marker kinds', () => {
      expect(getMarkerGlyph(sampleMarkers[0])).toBe('bookmark');
      expect(getMarkerGlyph(sampleMarkers[1])).toBe('lock');
      expect(getMarkerGlyph(sampleMarkers[2])).toBe('rate_review');
      expect(getMarkerGlyph(sampleMarkers[3])).toBe('radio_button_checked');
      expect(getMarkerGlyph(sampleMarkers[4])).toBe('fiber_manual_record');
      expect(getMarkerGlyph(sampleMarkers[5])).toBe('movie_filter');
    });
  });
});
