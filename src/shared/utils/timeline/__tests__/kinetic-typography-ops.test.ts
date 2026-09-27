import { describe, it, expect } from 'vitest';
import {
  calculateCharacterPause,
  applyHandwritingJitter,
  scheduleKineticStrokeCadence,
  generateKineticTypographySvg,
} from '../kinetic-typography-ops';
import type { Point2D } from '../calligraphy-ops';

describe('kinetic-typography-ops', () => {
  it('calculates character-specific kinetic micro pauses', () => {
    const regularPause = calculateCharacterPause('a', 300, 150);
    const wordPause = calculateCharacterPause(' ', 300, 150);
    const commaPause = calculateCharacterPause(',', 300, 150);
    const periodPause = calculateCharacterPause('.', 300, 150);

    expect(regularPause).toBe(40);
    expect(wordPause).toBe(150);
    expect(commaPause).toBe(300);
    expect(periodPause).toBeGreaterThan(commaPause);
  });

  it('applies handwriting jitter preserving polyline endpoints', () => {
    const pts: Point2D[] = [
      [10, 10],
      [20, 20],
      [30, 30],
      [40, 40],
    ];

    const jittered = applyHandwritingJitter(pts, 0.4, 42);
    expect(jittered.length).toBe(pts.length);
    // Endpoints must match exactly
    expect(jittered[0]).toEqual(pts[0]);
    expect(jittered[pts.length - 1]).toEqual(pts[pts.length - 1]);

    // Intermediate points have slight variation
    const dx = Math.abs(jittered[1][0] - pts[1][0]);
    const dy = Math.abs(jittered[1][1] - pts[1][1]);
    expect(dx + dy).toBeGreaterThan(0);
  });

  it('schedules monotonic stroke timestamps and pen-up flights', () => {
    const rawStrokes = [
      {
        char: 'H',
        points: [
          [100, 100],
          [100, 200],
        ] as Point2D[],
      },
      {
        char: 'H',
        points: [
          [150, 100],
          [150, 200],
        ] as Point2D[],
      },
      {
        char: 'i',
        points: [
          [200, 140],
          [200, 200],
        ] as Point2D[],
      },
      {
        char: '!',
        points: [
          [250, 100],
          [250, 180],
        ] as Point2D[],
      },
    ];

    const layout = scheduleKineticStrokeCadence(rawStrokes, {
      letterCadenceMs: 120,
      punctuationPauseMs: 250,
      cursiveLigatures: false,
    });

    expect(layout.strokes.length).toBeGreaterThan(rawStrokes.length); // includes pen-up leaps
    expect(layout.totalDurationMs).toBeGreaterThan(400);

    for (let i = 0; i < layout.strokes.length - 1; i++) {
      const curr = layout.strokes[i];
      const next = layout.strokes[i + 1];
      expect(next.startTimeMs).toBeGreaterThanOrEqual(curr.startTimeMs + curr.durationMs);
    }

    // Verify SVG generation
    const svg = generateKineticTypographySvg(layout, 800, 600);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 800 600"');
    expect(svg).toContain('<path');
    expect(svg).toContain('</svg>');
  });
});
