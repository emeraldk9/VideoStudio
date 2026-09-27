/**
 * Whiteboard Storyboard Sequence Timeline Exporter & Multi-Scene Packaging Operations.
 * Converts multi-scene storyboard descriptors into non-linear timeline clips,
 * calculates frame-accurate draw/hold/erase schedules, and formats VideoStudio project payloads.
 */

import type { WhiteboardSettings } from './whiteboard';

export interface StoryboardSceneInput {
  sceneId: string;
  title: string;
  imagePath: string;
  durationSec: number;
  subtitleText?: string;
  handStylus?: 'pen' | 'marker' | 'pencil' | 'chalk' | 'none';
  drawFraction?: number;
  eraseOut?: boolean;
  erasePattern?: 'zigzag' | 'wipe';
  eraseFraction?: number;
  foleyEnabled?: boolean;
  foleyVolume?: number;
  zoomStart?: number;
  zoomEnd?: number;
}

export interface StoryboardPackageOptions {
  packageId: string;
  title: string;
  fps?: number;
  scenes: StoryboardSceneInput[];
}

export interface StoryboardTimelineItem {
  sceneId: string;
  title: string;
  imagePath: string;
  subtitleText: string;
  startFrame: number;
  durationFrames: number;
  endFrame: number;
  drawFraction: number;
  eraseOut: boolean;
  eraseFraction: number;
  erasePattern: 'zigzag' | 'wipe';
  handStylus: 'pen' | 'marker' | 'pencil' | 'chalk' | 'none';
  foleyEnabled: boolean;
  foleyVolume: number;
  camera: {
    zoomStart: number;
    zoomEnd: number;
  };
}

export interface GeneratedTimelineClips {
  videoClips: any[];
  subtitleClips: any[];
  totalFrames: number;
  totalDurationSec: number;
}

/**
 * Validate scene inputs for non-empty IDs, positive durations, and valid paths.
 */
export function validateStoryboardContinuity(scenes: StoryboardSceneInput[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!scenes || scenes.length === 0) {
    errors.push('Storyboard must contain at least one scene.');
    return { valid: false, errors };
  }

  const seenIds = new Set<string>();
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s.sceneId || s.sceneId.trim().length === 0) {
      errors.push(`Scene at index ${i} has empty sceneId.`);
    } else if (seenIds.has(s.sceneId)) {
      errors.push(`Duplicate sceneId "${s.sceneId}" at index ${i}.`);
    } else {
      seenIds.add(s.sceneId);
    }

    if (typeof s.durationSec !== 'number' || s.durationSec <= 0) {
      errors.push(`Scene "${s.sceneId || i}" duration must be a positive number.`);
    }
    if (!s.imagePath || s.imagePath.trim().length === 0) {
      errors.push(`Scene "${s.sceneId || i}" imagePath cannot be empty.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calculate frame-accurate schedules for all scenes without gaps.
 */
export function calculateStoryboardSchedule(
  scenes: StoryboardSceneInput[],
  fps: number = 30.0
): StoryboardTimelineItem[] {
  const safeFps = Math.max(1.0, fps);
  let currentFrame = 0;

  return scenes.map((s) => {
    const durSec = Math.max(0.5, s.durationSec);
    const durationFrames = Math.max(1, Math.round(durSec * safeFps));
    const startFrame = currentFrame;
    const endFrame = startFrame + durationFrames;
    currentFrame = endFrame;

    const eraseOut = s.eraseOut ?? true;
    const eraseFraction = eraseOut ? (s.eraseFraction ?? 0.20) : 0.0;
    const drawFraction = Math.min(0.95, Math.max(0.1, s.drawFraction ?? 0.80));

    return {
      sceneId: s.sceneId,
      title: s.title || `Scene ${s.sceneId}`,
      imagePath: s.imagePath,
      subtitleText: s.subtitleText || '',
      startFrame,
      durationFrames,
      endFrame,
      drawFraction,
      eraseOut,
      eraseFraction,
      erasePattern: s.erasePattern ?? 'zigzag',
      handStylus: s.handStylus ?? 'marker',
      foleyEnabled: s.foleyEnabled ?? true,
      foleyVolume: s.foleyVolume ?? 0.6,
      camera: {
        zoomStart: s.zoomStart ?? 1.0,
        zoomEnd: s.zoomEnd ?? 1.05,
      },
    };
  });
}

/**
 * Assemble multi-scene storyboard items into ready-to-mount video and subtitle timeline clips.
 */
export function buildStoryboardClips(
  pkg: StoryboardPackageOptions,
  videoTrackId: string = 'track_v1_whiteboard',
  subtitleTrackId: string = 'track_sub_captions'
): GeneratedTimelineClips {
  const fps = Math.max(1.0, pkg.fps ?? 30.0);
  const schedule = calculateStoryboardSchedule(pkg.scenes, fps);
  const totalFrames = schedule.length > 0 ? schedule[schedule.length - 1].endFrame : 0;

  const videoClips: any[] = [];
  const subtitleClips: any[] = [];

  for (const item of schedule) {
    const whiteboardEffect: WhiteboardSettings = {
      pattern: 'trace',
      rows: 8,
      hand: item.handStylus,
      look: 'sketch',
      drawFraction: item.drawFraction,
      eraseOut: item.eraseOut,
      eraseFraction: item.eraseFraction,
      erasePattern: item.erasePattern,
      foleyEnabled: item.foleyEnabled,
      foleyVolume: item.foleyVolume,
      clusteringMode: 'hierarchical',
    };

    videoClips.push({
      id: `clip_${item.sceneId}`,
      trackId: videoTrackId,
      name: item.title,
      sourceKind: 'still',
      filePath: item.imagePath,
      startFrame: item.startFrame,
      durationFrames: item.durationFrames,
      trimInFrames: 0,
      effects: {
        whiteboard: whiteboardEffect,
        transform: {
          scale: item.camera.zoomStart,
          position: { x: 0.0, y: 0.0 },
        },
      },
    });

    if (item.subtitleText.trim().length > 0) {
      subtitleClips.push({
        id: `sub_${item.sceneId}`,
        trackId: subtitleTrackId,
        name: `Sub: ${item.title}`,
        sourceKind: 'subtitle',
        startFrame: item.startFrame,
        durationFrames: item.durationFrames,
        trimInFrames: 0,
        textContent: {
          text: item.subtitleText,
          fontSizePx: 42,
          colorHex: '#ffffff',
          align: 'center',
          positionPct: { x: 0.5, y: 0.88 },
          anchor: 'middle',
          preset: 'caption',
          box: {
            colorHex: '#000000',
            opacity: 0.7,
            paddingPx: 12,
            borderRadiusPx: 6,
          },
        },
      });
    }
  }

  return {
    videoClips,
    subtitleClips,
    totalFrames,
    totalDurationSec: totalFrames / fps,
  };
}
