import { describe, expect, it } from 'vitest';
import {
  classifyDrawingIntent,
  calculateToolStagingTransform,
  DEFAULT_TOOL_ORCHESTRATION_SETTINGS,
} from '../tool-orchestration-ops';
import type { Point2D } from '../calligraphy-ops';

describe('tool-orchestration-ops', () => {
  it('classifies stationary hover hesitation as laser pointer', () => {
    const pt: Point2D[] = [[100, 100]];
    const intent = classifyDrawingIntent(pt, 0.45, false, {
      enabled: true,
      autoLaserHoldSec: 0.35,
    });
    expect(intent).toBe('laser');
  });

  it('classifies long straight line as ruler', () => {
    const straight: Point2D[] = [];
    for (let i = 0; i <= 10; i++) {
      straight.push([i * 10, 100]); // 100px straight line
    }
    const intent = classifyDrawingIntent(straight, 0, true, {
      enabled: true,
      autoRulerThresholdPx: 80,
    });
    expect(intent).toBe('ruler');
  });

  it('classifies rapid zigzag as eraser', () => {
    const zigzag: Point2D[] = [
      [50, 50],
      [120, 50],
      [45, 55],
      [125, 60],
      [40, 65],
    ];
    const intent = classifyDrawingIntent(zigzag, 0, true, { enabled: true });
    expect(intent).toBe('eraser');
  });

  it('defaults to pen for gentle curved strokes', () => {
    const curve: Point2D[] = [];
    for (let i = 0; i < 8; i++) {
      curve.push([i * 6, Math.sin(i * 0.5) * 15]);
    }
    const intent = classifyDrawingIntent(curve, 0, true, { enabled: true });
    expect(intent).toBe('pen');
  });

  it('computes staging transforms for sliding entrance and retraction', () => {
    const target: Point2D = [400, 300];

    // Off-screen docked position
    const t0 = calculateToolStagingTransform('ruler', 0.0, target, 1920, 1080, 'bottom-right');
    expect(t0.opacity).toBe(0.0);
    expect(t0.x).toBeGreaterThan(1920);

    // Fully staged position
    const t1 = calculateToolStagingTransform('ruler', 1.0, target, 1920, 1080, 'bottom-right');
    expect(t1.opacity).toBe(1.0);
    expect(t1.x).toBe(400);
    expect(t1.y).toBe(300);
    expect(t1.rotationDeg).toBe(0);
  });
});
