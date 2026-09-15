import { formatTimecode } from '@shared';

export interface TimelineRulerProps {
  durationFrames: number;
  fps: number;
  pixelsPerSecond: number;
  /**
   * Beta S154 (B4) — the width the lanes render at, so the scale and the
   * troughs are one surface. The ruler used to size itself from the sequence
   * duration while the lanes clamped to `Math.max(600, …)`, so on a short
   * sequence the ruler ended at 0:02, the troughs at 600px, and neither
   * reached the panel's edge. Ticks continue past the sequence end — empty
   * timeline is still addressable time, which is what makes dropping a clip
   * out there feel sane.
   */
  widthPx: number;
}

/**
 * Beta S145 — the time scale above the lanes.
 *
 * DOM rather than canvas, unlike the waveform: the tick labels are text, and
 * text in a canvas is text no screen reader can reach and no user can select.
 * A ruler is at most a few dozen nodes, so the DOM cost the waveform avoids
 * does not apply here — and it means the ruler takes its colours from Tailwind
 * tokens directly, with no theme-reading indirection.
 */

/**
 * S174 — the ruler strip's height, exported because the sticky chrome and the
 * reorder auto-scroll threshold both need the same number the `h-7` class
 * encodes. Change the class, change this.
 */
export const TIMELINE_RULER_HEIGHT_PX = 28;

/**
 * Tick spacing in seconds, chosen so labels never collide.
 *
 * A 1-2-5-10 progression rather than powers of two: those are the intervals a
 * clock reads naturally, and the same ladder every charting library settles on.
 */
const TICK_LADDER = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** Below this the labels overlap; the ladder steps up until they do not. */
const MIN_LABEL_SPACING_PX = 56;

export function chooseTickSeconds(pixelsPerSecond: number): number {
  return (
    TICK_LADDER.find((seconds) => seconds * pixelsPerSecond >= MIN_LABEL_SPACING_PX) ??
    TICK_LADDER[TICK_LADDER.length - 1]
  );
}

/** Below this the minor marks smear into a grey band; suppress rather than crowd. */
const MIN_SUBTICK_SPACING_PX = 7;

/** Past this many pixels per frame, the honest subdivision is the frame itself. */
const FRAME_TICK_THRESHOLD_PX = 6;

/**
 * S160 (owner item 1) — the minor ticks between labelled majors.
 *
 * Two regimes, the standard NLE ruler behaviour:
 *
 * - Zoomed far enough that a single frame is ≥6px wide, the subdivision is
 *   **one tick per frame** — the ruler is now addressing frames, and marks at
 *   any other interval would be lines that nothing can snap to.
 * - Otherwise the major interval divides by 5 (by 4 on the 60s+ rungs, so
 *   the marks land on clock quarters), suppressed entirely once the spacing
 *   falls under {@link MIN_SUBTICK_SPACING_PX}.
 *
 * Returns the minor interval in seconds, or `null` when the zoom is too far
 * out for minors to be legible.
 */
export function chooseSubTickSeconds(pixelsPerSecond: number, fps: number): number | null {
  if (fps > 0 && pixelsPerSecond / fps >= FRAME_TICK_THRESHOLD_PX) return 1 / fps;
  const major = chooseTickSeconds(pixelsPerSecond);
  const divisor = major >= 60 ? 4 : 5;
  const minor = major / divisor;
  return minor * pixelsPerSecond >= MIN_SUBTICK_SPACING_PX ? minor : null;
}

export function TimelineRuler({ durationFrames, fps, pixelsPerSecond, widthPx }: TimelineRulerProps) {
  // Ticks span the rendered width, not just the sequence — see `widthPx`.
  const totalSeconds = Math.max(1, durationFrames / fps, widthPx / pixelsPerSecond);
  const tickSeconds = chooseTickSeconds(pixelsPerSecond);
  const tickCount = Math.floor(totalSeconds / tickSeconds) + 1;

  // S160 — minor marks between the labels. Generated per major interval and
  // skipped where a major already stands, so the two families never stack.
  // Frame ticks on a long sequence at max zoom would mint thousands of DOM
  // nodes (the ruler renders its full scroll width); past the cap the
  // subdivision degrades to the ladder's, which stays in the hundreds.
  let subSeconds = chooseSubTickSeconds(pixelsPerSecond, fps);
  const MAX_SUB_TICKS = 1200;
  if (subSeconds && totalSeconds / subSeconds > MAX_SUB_TICKS) {
    const ladderMinor = tickSeconds / 5;
    subSeconds = totalSeconds / ladderMinor > MAX_SUB_TICKS ? null : ladderMinor;
  }
  const subPerMajor = subSeconds ? Math.round(tickSeconds / subSeconds) : 0;

  return (
    <div
      className="relative h-7 shrink-0 bg-bg-workspace"
      style={{ width: Math.max(widthPx, 1) }}
      aria-hidden="true"
    >
      {Array.from({ length: tickCount }, (_, index) => {
        const seconds = index * tickSeconds;
        return (
          <div
            key={seconds}
            className="absolute top-0 flex h-full items-center gap-1 pl-1"
            style={{ left: seconds * pixelsPerSecond }}
          >
            <span className="h-3 w-px bg-hairline" />
            <span className="font-mono text-[10px] leading-none text-text-disabled">
              {formatTimecode(seconds * fps, fps)}
            </span>
          </div>
        );
      })}
      {subSeconds
        ? Array.from({ length: tickCount * subPerMajor }, (_, index) => {
            if (index % subPerMajor === 0) return null; // a major stands here
            const seconds = index * subSeconds;
            if (seconds > totalSeconds) return null;
            return (
              <span
                key={`sub-${index}`}
                className="absolute bottom-0 h-1.5 w-px bg-hairline opacity-60"
                style={{ left: seconds * pixelsPerSecond }}
              />
            );
          })
        : null}
    </div>
  );
}
