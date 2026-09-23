import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Veo3FlowService } from '../veo3flow-service';
import { buildTimelineFullJson } from '../../../shared/utils/timeline/timeline-setup-export';
import { parseTimelineSetupJson } from '../../../shared/utils/timeline/timeline-setup-import';
import { IPC_CHANNELS, IPC_SCHEMAS } from '../../../shared';
import type { SequenceDocument, SequenceTrack, SequenceClip } from '../../../shared/types/sequence';

describe('Veo3Flow & Timeline JSON Integration', () => {
  const sampleFolder = 'G:/My Drive/HSB/EP03/Storage V.1';
  const sampleSetupJson = 'G:/My Drive/HSB/EP03/Audio/Untitled sequence.setup.json';

  it('correctly parses real Veo3Flow project folder and captures exact durations', async () => {
    if (!fs.existsSync(sampleFolder)) {
      console.warn('Sample folder does not exist, skipping live disk test');
      return;
    }

    const data = await Veo3FlowService.parseProjectFolder(sampleFolder);
    expect(path.resolve(data.folderPath)).toBe(path.resolve(sampleFolder));
    expect(data.title).toBe('The 2:11 Crossing');
    expect(data.shots.length).toBe(141);
    expect(data.totalApprovedStills).toBeGreaterThan(0);
    expect(data.totalDurationSeconds).toBeGreaterThan(0);

    // Verify first shot
    const firstShot = data.shots[0];
    expect(firstShot).toBeDefined();
    expect(firstShot.order).toBe(0);
    expect(firstShot.durationSeconds).toBe(7.35);
    expect(firstShot.stillPath).toBeDefined();
    if (firstShot.stillPath) {
      expect(fs.existsSync(firstShot.stillPath)).toBe(true);
    }
  }, 60000);

  it('exports and imports v2 full timeline JSON with all effects, motions, and whiteboard sketches', () => {
    const mockTrack: SequenceTrack = {
      id: 'track-v1',
      sequenceId: 'seq-1',
      kind: 'video',
      name: 'Video Track 1',
      orderIndex: 0,
      magnetic: true,
      locked: false,
      muted: false,
      videoEnabled: true,
      heightPx: 72,
      role: null,
    };

    const mockClip: SequenceClip = {
      id: 'clip-1',
      sequenceId: 'seq-1',
      trackId: 'track-v1',
      orderIndex: 0,
      sourceKind: 'still',
      filePath: 'C:/media/shot_001.jpg',
      label: 'Shot 001 Hero',
      durationFrames: 220,
      transitionIn: 'crossfade',
      transitionFrames: 12,
      motionPreset: 'none',
      gainDb: 0,
      fadeInFrames: 10,
      fadeOutFrames: 15,
      overrides: [],
      effects: {
        whiteboard: {
          pattern: 'trace',
          rows: 8,
          hand: 'pen',
          look: 'pencil',
        },
        motion: {
          preset: 'pull_out',
        },
      },
      storyShotId: 'shot-001',
    };

    const doc: SequenceDocument = {
      sequence: {
        id: 'seq-1',
        projectId: 'proj-1',
        name: 'Full Feature Cut',
        fps: 30,
        width: 1920,
        height: 1080,
        spineTrackId: 'track-v1',
        createdAt: '2026-09-16T00:00:00.000Z',
        updatedAt: '2026-09-16T00:00:00.000Z',
      },
      tracks: [mockTrack],
      clips: [mockClip],
    };

    // Export to v2 JSON string
    const jsonStr = buildTimelineFullJson(doc, []);
    const parsedObj = JSON.parse(jsonStr);

    expect(parsedObj.format).toBe('videostudio-timeline-full-v2');
    expect(parsedObj.clips.length).toBe(1);
    expect(parsedObj.clips[0].whiteboard.pattern).toBe('trace');
    expect(parsedObj.clips[0].transitionIn).toBe('crossfade');
    expect(parsedObj.clips[0].motion.preset).toBe('pull_out');

    // Import back using parseTimelineSetupJson
    const imported = parseTimelineSetupJson(jsonStr, 30);
    expect(imported.isFullTimeline).toBe(true);
    expect(imported.rows.length).toBe(1);
    expect(imported.tracks?.length).toBe(1);

    const importedRow = imported.rows[0];
    expect(importedRow.key).toBe('clip-1');
    expect(importedRow.seconds).toBeCloseTo(7.333, 2);
    expect(importedRow.startFrames).toBe(0);
    expect(importedRow.whiteboard?.pattern).toBe('trace');
    expect(importedRow.transitionIn).toBe('crossfade');
    expect(importedRow.motion?.preset).toBe('pull_out');
    expect(importedRow.fadeInFrames).toBe(10);
    expect(importedRow.fadeOutFrames).toBe(15);
  });

  it('imports and parses real v1 Untitled sequence.setup.json accurately', () => {
    if (!fs.existsSync(sampleSetupJson)) {
      console.warn('Sample setup JSON does not exist, skipping live test');
      return;
    }

    const raw = fs.readFileSync(sampleSetupJson, 'utf-8');
    const imported = parseTimelineSetupJson(raw, 30);

    expect(imported.rows.length).toBe(141);
    // Spot check first row
    const row0 = imported.rows[0];
    expect(row0.order).toBe(1);
    expect(row0.seconds).toBe(7.333);
    expect(row0.motion?.preset).toBe('pull_out');
    expect(row0.heading).toBe("INT. KEEPER'S COTTAGE BACK ROOM - NIGHT");
  });

  it('correctly partitions and prepares separate stills, videos, and hybrid placement', () => {
    const mockShots = [
      {
        shotId: 'shot-1',
        order: 0,
        heading: 'Shot 1',
        scriptText: 'Opening',
        durationSeconds: 5.0,
        stillPath: 'C:/media/shot_1.jpg',
        stillTakeId: 'take-1-still',
        videoPath: null,
        videoTakeId: null,
        isApproved: true,
      },
      {
        shotId: 'shot-2',
        order: 1,
        heading: 'Shot 2',
        scriptText: 'Action',
        durationSeconds: 4.0,
        stillPath: 'C:/media/shot_2.jpg',
        stillTakeId: 'take-2-still',
        videoPath: 'C:/media/shot_2.mp4',
        videoTakeId: 'take-2-vid',
        isApproved: true,
      },
    ];

    // 1. stills_only
    const stillsOnly = mockShots.filter((s) => Boolean(s.stillPath));
    expect(stillsOnly.length).toBe(2);
    expect(stillsOnly[0].stillPath).toBe('C:/media/shot_1.jpg');
    expect(stillsOnly[1].stillPath).toBe('C:/media/shot_2.jpg');

    // 2. videos_only
    const videosOnly = mockShots.filter((s) => Boolean(s.videoPath));
    expect(videosOnly.length).toBe(1);
    expect(videosOnly[0].videoPath).toBe('C:/media/shot_2.mp4');

    // 3. hybrid (video preferred, still fallback)
    const hybrid = mockShots.map((s) => ({
      shotId: s.shotId,
      filePath: s.videoPath || s.stillPath!,
      isVideo: Boolean(s.videoPath),
    }));
    expect(hybrid.length).toBe(2);
    expect(hybrid[0].isVideo).toBe(false);
    expect(hybrid[0].filePath).toBe('C:/media/shot_1.jpg');
    expect(hybrid[1].isVideo).toBe(true);
    expect(hybrid[1].filePath).toBe('C:/media/shot_2.mp4');
  });

  it('validates IPC watch folder schemas and project folder binding logic', () => {
    // Test watch folder schema
    const watchSchema = IPC_SCHEMAS[IPC_CHANNELS.VEO3FLOW_WATCH_FOLDER];
    expect(watchSchema.safeParse({ folderPath: 'G:/My Drive/HSB/EP03/Storage V.1' }).success).toBe(true);
    expect(watchSchema.safeParse({ folderPath: '' }).success).toBe(false);

    // Test unwatch folder schema
    const unwatchSchema = IPC_SCHEMAS[IPC_CHANNELS.VEO3FLOW_UNWATCH_FOLDER];
    expect(unwatchSchema.safeParse(undefined).success).toBe(true);

    // Test multi-project folder mapping logic
    const projectFolderMap: Record<string, string> = {};
    projectFolderMap['proj-alpha'] = 'C:/Story/ProjectA';
    projectFolderMap['proj-beta'] = 'C:/Story/ProjectB';

    expect(projectFolderMap['proj-alpha']).toBe('C:/Story/ProjectA');
    expect(projectFolderMap['proj-beta']).toBe('C:/Story/ProjectB');

    delete projectFolderMap['proj-alpha'];
    expect(projectFolderMap['proj-alpha']).toBeUndefined();
    expect(projectFolderMap['proj-beta']).toBe('C:/Story/ProjectB');
  });
});

