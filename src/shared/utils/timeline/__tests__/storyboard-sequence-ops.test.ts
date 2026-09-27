import { describe, it, expect } from 'vitest';
import {
  validateStoryboardContinuity,
  calculateStoryboardSchedule,
  buildStoryboardClips,
  type StoryboardSceneInput,
  type StoryboardPackageOptions,
} from '../storyboard-sequence-ops';

describe('storyboard-sequence-ops', () => {
  it('validates storyboard continuity and detects duplicate IDs or negative durations', () => {
    const invalidScenes: StoryboardSceneInput[] = [
      { sceneId: 's1', title: 'Scene 1', imagePath: '/path/1.png', durationSec: 3.0 },
      { sceneId: 's1', title: 'Scene 1 dup', imagePath: '/path/2.png', durationSec: 2.0 },
      { sceneId: 's3', title: 'Scene 3', imagePath: '', durationSec: -1 },
    ];

    const result = validateStoryboardContinuity(invalidScenes);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);

    const validScenes: StoryboardSceneInput[] = [
      { sceneId: 's1', title: 'Scene 1', imagePath: '/path/1.png', durationSec: 3.0 },
      { sceneId: 's2', title: 'Scene 2', imagePath: '/path/2.png', durationSec: 4.0 },
    ];
    expect(validateStoryboardContinuity(validScenes).valid).toBe(true);
  });

  it('calculates frame-accurate contiguous schedules for multi-scene storyboard', () => {
    const scenes: StoryboardSceneInput[] = [
      {
        sceneId: 'intro',
        title: 'Intro',
        imagePath: '/img/intro.png',
        durationSec: 2.0,
        drawFraction: 0.75,
        eraseOut: true,
        eraseFraction: 0.25,
      },
      {
        sceneId: 'main',
        title: 'Main Topic',
        imagePath: '/img/main.png',
        durationSec: 5.0,
        drawFraction: 0.85,
        eraseOut: true,
        eraseFraction: 0.15,
      },
      {
        sceneId: 'conclusion',
        title: 'Outro',
        imagePath: '/img/outro.png',
        durationSec: 3.0,
        eraseOut: false,
      },
    ];

    const fps = 30;
    const schedule = calculateStoryboardSchedule(scenes, fps);

    expect(schedule.length).toBe(3);
    // Intro: 2.0s * 30 = 60 frames (0 to 60)
    expect(schedule[0].startFrame).toBe(0);
    expect(schedule[0].durationFrames).toBe(60);
    expect(schedule[0].endFrame).toBe(60);
    expect(schedule[0].eraseOut).toBe(true);
    expect(schedule[0].eraseFraction).toBe(0.25);

    // Main: 5.0s * 30 = 150 frames (60 to 210)
    expect(schedule[1].startFrame).toBe(60);
    expect(schedule[1].durationFrames).toBe(150);
    expect(schedule[1].endFrame).toBe(210);

    // Conclusion: 3.0s * 30 = 90 frames (210 to 300)
    expect(schedule[2].startFrame).toBe(210);
    expect(schedule[2].durationFrames).toBe(90);
    expect(schedule[2].endFrame).toBe(300);
    expect(schedule[2].eraseOut).toBe(false);
    expect(schedule[2].eraseFraction).toBe(0.0);
  });

  it('builds timeline clips with synchronized captions and whiteboard effects', () => {
    const pkg: StoryboardPackageOptions = {
      packageId: 'pkg_unit_test',
      title: 'Unit Test Storyboard',
      fps: 30,
      scenes: [
        {
          sceneId: 's1',
          title: 'Scene 1',
          imagePath: '/media/s1.png',
          durationSec: 3.0,
          subtitleText: 'Spoken line 1',
          handStylus: 'marker',
        },
        {
          sceneId: 's2',
          title: 'Scene 2',
          imagePath: '/media/s2.png',
          durationSec: 4.0,
          // no subtitle text for scene 2
          handStylus: 'pen',
        },
      ],
    };

    const built = buildStoryboardClips(pkg);

    expect(built.totalFrames).toBe(210); // (3.0 + 4.0) * 30 = 210 frames
    expect(built.totalDurationSec).toBe(7.0);

    // 2 video clips
    expect(built.videoClips.length).toBe(2);
    expect(built.videoClips[0].id).toBe('clip_s1');
    expect(built.videoClips[0].effects.whiteboard.hand).toBe('marker');
    expect(built.videoClips[0].effects.whiteboard.clusteringMode).toBe('hierarchical');
    expect(built.videoClips[1].id).toBe('clip_s2');
    expect(built.videoClips[1].effects.whiteboard.hand).toBe('pen');

    // Only scene 1 has subtitle
    expect(built.subtitleClips.length).toBe(1);
    expect(built.subtitleClips[0].id).toBe('sub_s1');
    expect(built.subtitleClips[0].textContent.text).toBe('Spoken line 1');
    expect(built.subtitleClips[0].startFrame).toBe(0);
    expect(built.subtitleClips[0].durationFrames).toBe(90);
  });
});
