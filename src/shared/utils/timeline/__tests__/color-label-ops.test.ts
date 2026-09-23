import { describe, it, expect } from 'vitest';
import type { SequenceClip } from '../../../types/sequence';
import {
  COLOR_LABEL_DEFINITIONS,
  getColorLabelMeta,
  setClipColorLabel,
  selectClipsByColorLabel,
} from '../color-label-ops';

const makeClip = (id: string, colorLabel?: any): SequenceClip => ({
  id,
  sequenceId: 'seq-1',
  trackId: 'track-1',
  orderIndex: 0,
  sourceKind: 'video',
  filePath: 'c:/video.mp4',
  durationFrames: 100,
  startFrames: 0,
  sourceInFrames: 0,
  sourceOutFrames: 100,
  transitionIn: 'cut',
  transitionFrames: 0,
  motionPreset: 'none',
  gainDb: 0,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  label: `Clip ${id}`,
  overrides: [],
  effects: undefined,
  colorLabel,
});

describe('color-label-ops', () => {
  describe('getColorLabelMeta', () => {
    it('returns default metadata for undefined or missing label', () => {
      const meta = getColorLabelMeta(undefined);
      expect(meta.id).toBe('default');
      expect(meta.name).toBe('Default');
    });

    it('returns exact metadata for specified color labels', () => {
      const rose = getColorLabelMeta('rose');
      expect(rose.name).toBe('Rose');
      expect(rose.dotClass).toBe('bg-rose-500');

      const emerald = getColorLabelMeta('emerald');
      expect(emerald.name).toBe('Emerald');
      expect(emerald.dotClass).toBe('bg-emerald-500');

      const cyan = getColorLabelMeta('cyan');
      expect(cyan.name).toBe('Cyan');
      expect(cyan.dotClass).toBe('bg-cyan-500');
    });
  });

  describe('setClipColorLabel', () => {
    it('updates color label on specified clips', () => {
      const clips = [makeClip('c1'), makeClip('c2')];
      const updated = setClipColorLabel(clips, ['c1'], 'emerald');

      expect(updated[0].colorLabel).toBe('emerald');
      expect(updated[1].colorLabel).toBeUndefined();
    });

    it('batch applies color label across multiple clips', () => {
      const clips = [makeClip('c1'), makeClip('c2'), makeClip('c3')];
      const updated = setClipColorLabel(clips, ['c1', 'c3'], 'violet');

      expect(updated[0].colorLabel).toBe('violet');
      expect(updated[1].colorLabel).toBeUndefined();
      expect(updated[2].colorLabel).toBe('violet');
    });

    it('resets colorLabel to undefined when applying default', () => {
      const clips = [makeClip('c1', 'amber')];
      const updated = setClipColorLabel(clips, ['c1'], 'default');

      expect(updated[0].colorLabel).toBeUndefined();
    });

    it('returns unchanged copy if clipIds array is empty', () => {
      const clips = [makeClip('c1')];
      const updated = setClipColorLabel(clips, [], 'rose');

      expect(updated).toEqual(clips);
    });
  });

  describe('selectClipsByColorLabel', () => {
    it('finds all clips matching a custom color label', () => {
      const clips = [
        makeClip('c1', 'amber'),
        makeClip('c2', 'rose'),
        makeClip('c3', 'amber'),
        makeClip('c4'),
      ];

      const amberIds = selectClipsByColorLabel(clips, 'amber');
      expect(amberIds).toEqual(['c1', 'c3']);

      const roseIds = selectClipsByColorLabel(clips, 'rose');
      expect(roseIds).toEqual(['c2']);
    });

    it('matches clips with undefined colorLabel as default', () => {
      const clips = [makeClip('c1'), makeClip('c2', 'cyan'), makeClip('c3')];
      const defaultIds = selectClipsByColorLabel(clips, 'default');

      expect(defaultIds).toEqual(['c1', 'c3']);
    });
  });
});
