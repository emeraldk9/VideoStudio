import { describe, expect, it } from 'vitest';

import {
  IPC_CHANNELS,
  IPC_SCHEMAS,
  separateClipAudio,
  duplicateClips,
  insertFreezeFrame,
  type SequenceClip,
  type SequenceTrack,
} from '../../../index';

describe('S12 Advanced Timeline Editorial Operations', () => {
  const mockTracks: SequenceTrack[] = [
    {
      id: 'track-v1',
      sequenceId: 'seq-1',
      orderIndex: 0,
      kind: 'video',
      name: 'V1',
      magnetic: true,
      muted: false,
      locked: false,
      videoEnabled: true,
      heightPx: 64,
      role: null,
    },
    {
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
    },
    {
      id: 'track-a1',
      sequenceId: 'seq-1',
      orderIndex: 0,
      kind: 'audio',
      name: 'A1',
      magnetic: false,
      muted: false,
      locked: false,
      videoEnabled: false,
      heightPx: 48,
      role: null,
    },
  ];

  const mockVideoClip: SequenceClip = {
    id: 'clip-video-1',
    sequenceId: 'seq-1',
    trackId: 'track-v1',
    orderIndex: 0,
    sourceKind: 'video',
    filePath: 'C:/media/video1.mp4',
    startFrames: null,
    durationFrames: 120,
    sourceInFrames: 30,
    sourceOutFrames: 150,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: -2,
    fadeInFrames: 5,
    fadeOutFrames: 10,
    label: 'Main Scene',
    overrides: [],
  };

  describe('separateClipAudio', () => {
    it('extracts audio from video clip onto first unlocked audio track and mutes original video audio', () => {
      let idCounter = 1;
      const mintId = () => `audio-clip-${idCounter++}`;

      const res = separateClipAudio([mockVideoClip], mockTracks, mockVideoClip.id, mintId);
      expect(res).not.toBeNull();
      if (!res) return;

      const { clips, createdClip } = res;
      expect(clips).toHaveLength(2);

      // Video clip is muted
      const updatedVideo = clips.find((c) => c.id === mockVideoClip.id);
      expect(updatedVideo?.sourceAudioEnabled).toBe(false);

      // Audio clip is created on A1
      expect(createdClip.id).toBe('audio-clip-1');
      expect(createdClip.trackId).toBe('track-a1');
      expect(createdClip.sourceKind).toBe('audio');
      expect(createdClip.filePath).toBe('C:/media/video1.mp4');
      expect(createdClip.startFrames).toBe(0); // Video was at 0 in magnetic V1
      expect(createdClip.durationFrames).toBe(120);
      expect(createdClip.sourceInFrames).toBe(30);
      expect(createdClip.gainDb).toBe(-2);
      expect(createdClip.fadeInFrames).toBe(5);
      expect(createdClip.fadeOutFrames).toBe(10);
      expect(createdClip.label).toBe('Main Scene (Audio)');
    });

    it('returns null when clip has no audio track or is not a video with file', () => {
      const mintId = () => 'audio-clip-x';
      const textClip: SequenceClip = {
        ...mockVideoClip,
        id: 'clip-text-1',
        sourceKind: 'text',
        filePath: null,
      };

      expect(separateClipAudio([textClip], mockTracks, textClip.id, mintId)).toBeNull();

      // No audio tracks
      const videoOnlyTracks = mockTracks.filter((t) => t.kind !== 'audio');
      expect(separateClipAudio([mockVideoClip], videoOnlyTracks, mockVideoClip.id, mintId)).toBeNull();
    });
  });

  describe('duplicateClips', () => {
    it('duplicates clip on magnetic track inserting immediately after and shifting subsequent clips', () => {
      const clip1 = { ...mockVideoClip, id: 'v1-clip1', orderIndex: 0 };
      const clip2 = { ...mockVideoClip, id: 'v1-clip2', orderIndex: 1 };
      const clips = [clip1, clip2];

      let idCounter = 1;
      const mintId = () => `dup-${idCounter++}`;

      const res = duplicateClips(clips, mockTracks, [clip1.id], mintId);
      expect(res.duplicatedClips).toHaveLength(1);

      const duplicated = res.duplicatedClips[0];
      expect(duplicated.id).toBe('dup-1');
      expect(duplicated.orderIndex).toBe(1);
      expect(duplicated.label).toBe('Main Scene (Copy)');

      // Downstream clip orderIndex shifted from 1 to 2
      const updatedClip2 = res.clips.find((c) => c.id === 'v1-clip2');
      expect(updatedClip2?.orderIndex).toBe(2);
    });

    it('duplicates clip on free track with frame offset matching duration', () => {
      const freeClip: SequenceClip = {
        ...mockVideoClip,
        id: 'v2-clip1',
        trackId: 'track-v2',
        startFrames: 100,
        durationFrames: 60,
      };

      const mintId = () => 'dup-free';
      const res = duplicateClips([freeClip], mockTracks, [freeClip.id], mintId);

      expect(res.duplicatedClips).toHaveLength(1);
      const dup = res.duplicatedClips[0];
      expect(dup.startFrames).toBe(160); // 100 + 60
    });
  });

  describe('insertFreezeFrame', () => {
    it('splits video clip at playhead and inserts still clip between the halves', () => {
      const freezeImagePath = 'C:/media/freeze_frame.jpg';
      const frame = 40; // 40 frames into the 120-frame clip
      const freezeDuration = 72; // 3 seconds at 24fps

      const mintIds = {
        splitId: 'split-part-2',
        freezeId: 'freeze-clip-1',
      };

      const track = mockTracks[0];
      const res = insertFreezeFrame(
        [mockVideoClip],
        track,
        mockVideoClip.id,
        frame,
        freezeImagePath,
        freezeDuration,
        mintIds,
      );

      expect(res).not.toBeNull();
      if (!res) return;

      const { clips, freezeClip } = res;
      expect(clips).toHaveLength(3); // first half, freeze, second half

      // First half
      const first = clips.find((c) => c.id === mockVideoClip.id);
      expect(first?.durationFrames).toBe(40);

      // Freeze frame clip
      expect(freezeClip.id).toBe('freeze-clip-1');
      expect(freezeClip.sourceKind).toBe('still');
      expect(freezeClip.filePath).toBe(freezeImagePath);
      expect(freezeClip.durationFrames).toBe(72);
      expect(freezeClip.orderIndex).toBe(1);

      // Second half
      const second = clips.find((c) => c.id === 'split-part-2');
      expect(second?.durationFrames).toBe(80); // 120 - 40
      expect(second?.sourceInFrames).toBe(70); // 30 + 40
      expect(second?.orderIndex).toBe(2);
    });

    it('returns null when cut frame is on or outside boundary', () => {
      const mintIds = { splitId: 'split', freezeId: 'freeze' };
      const track = mockTracks[0];

      // At boundary 0
      expect(
        insertFreezeFrame([mockVideoClip], track, mockVideoClip.id, 0, 'img.jpg', 60, mintIds),
      ).toBeNull();

      // Outside duration (150 > 120)
      expect(
        insertFreezeFrame([mockVideoClip], track, mockVideoClip.id, 150, 'img.jpg', 60, mintIds),
      ).toBeNull();
    });
  });

  describe('SEQUENCE_CAPTURE_FRAME Schema', () => {
    it('validates capture frame request schema accurately', () => {
      const schema = IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_CAPTURE_FRAME];
      expect(schema).toBeDefined();

      const valid = {
        sourcePath: 'C:/Videos/source.mp4',
        atSeconds: 12.5,
        sequenceId: 'seq-1',
      };
      expect(schema.safeParse(valid).success).toBe(true);

      const invalidNegativeSeconds = {
        sourcePath: 'C:/Videos/source.mp4',
        atSeconds: -1,
      };
      expect(schema.safeParse(invalidNegativeSeconds).success).toBe(false);

      const emptyPath = {
        sourcePath: '',
        atSeconds: 5,
      };
      expect(schema.safeParse(emptyPath).success).toBe(false);
    });
  });
});
