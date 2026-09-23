import { describe, expect, it } from 'vitest';

import {
  runPreflight,
  type Sequence,
  type SequenceClip,
  type SequenceTrack,
} from '../../../index';

describe('S18 Custom Export Presets & Track Visibility Enforcement', () => {
  const sequence: Sequence = {
    id: 'seq-export-test',
    projectId: 'proj-1',
    name: 'Export Test Sequence',
    fps: 30,
    width: 1920,
    height: 1080,
    spineTrackId: 'track-v1',
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
  };

  const activeSpineTrack: SequenceTrack = {
    id: 'track-v1',
    sequenceId: 'seq-export-test',
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

  const clip1: SequenceClip = {
    id: 'clip-1',
    sequenceId: 'seq-export-test',
    trackId: 'track-v1',
    orderIndex: 0,
    sourceKind: 'video',
    outputId: null,
    storyShotId: null,
    sourceTakeId: null,
    filePath: 'C:/media/video1.mp4',
    startFrames: 0,
    durationFrames: 90,
    sourceInFrames: 0,
    sourceOutFrames: 90,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Shot 1',
    overrides: [],
  };

  it('preflight passes when spine track is visible and unmuted', () => {
    const findings = runPreflight({
      sequence,
      tracks: [activeSpineTrack],
      clips: [clip1],
    });

    const spineFinding = findings.find((f) => f.code === 'spine_track_hidden_or_muted');
    expect(spineFinding).toBeUndefined();
  });

  it('preflight raises a blocking finding when spine track is muted', () => {
    const mutedSpineTrack: SequenceTrack = {
      ...activeSpineTrack,
      muted: true,
    };

    const findings = runPreflight({
      sequence,
      tracks: [mutedSpineTrack],
      clips: [clip1],
    });

    const spineFinding = findings.find((f) => f.code === 'spine_track_hidden_or_muted');
    expect(spineFinding).toBeDefined();
    expect(spineFinding?.severity).toBe('blocking');
    expect(spineFinding?.message).toContain('muted');
  });

  it('preflight raises a blocking finding when spine track is hidden (videoEnabled === false)', () => {
    const hiddenSpineTrack: SequenceTrack = {
      ...activeSpineTrack,
      videoEnabled: false,
    };

    const findings = runPreflight({
      sequence,
      tracks: [hiddenSpineTrack],
      clips: [clip1],
    });

    const spineFinding = findings.find((f) => f.code === 'spine_track_hidden_or_muted');
    expect(spineFinding).toBeDefined();
    expect(spineFinding?.severity).toBe('blocking');
    expect(spineFinding?.message).toContain('hidden');
  });

  it('preflight raises a blocking finding when spine track is both hidden and muted', () => {
    const hiddenAndMutedSpineTrack: SequenceTrack = {
      ...activeSpineTrack,
      muted: true,
      videoEnabled: false,
    };

    const findings = runPreflight({
      sequence,
      tracks: [hiddenAndMutedSpineTrack],
      clips: [clip1],
    });

    const spineFinding = findings.find((f) => f.code === 'spine_track_hidden_or_muted');
    expect(spineFinding).toBeDefined();
    expect(spineFinding?.severity).toBe('blocking');
    expect(spineFinding?.message).toContain('hidden and muted');
  });

  it('verifies custom export preset structure and properties', () => {
    const customPreset = {
      id: 'custom-12345',
      name: 'YouTube 4K Pro Master',
      badge: 'User Preset',
      icon: 'bookmark',
      description: '2160p · MP4 · high',
      format: 'mp4' as const,
      quality: 'high' as const,
      draft: false,
      outputHeight: 2160,
      audioBitrate: 256 as const,
      audioOnly: false,
      isCustom: true,
    };

    expect(customPreset.isCustom).toBe(true);
    expect(customPreset.outputHeight).toBe(2160);
    expect(customPreset.format).toBe('mp4');
    expect(customPreset.audioBitrate).toBe(256);
  });
});
