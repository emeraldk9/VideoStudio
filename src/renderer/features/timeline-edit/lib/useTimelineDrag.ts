import { useCallback, useRef, useState } from 'react';

import { snapFrame, type SequenceClip } from '@shared';

/**
 * Beta S145 — continuous timeline gestures, on Pointer Events.
 *
 * **Two drag mechanisms exist in this module, deliberately.** Bin → lane drops
 * use HTML5 native DnD (discrete, crosses component boundaries, and the
 * precedent already in `Stage2Breakdown.tsx`). Everything *inside* the
 * timeline — moving a clip, dragging a trim handle, scrubbing the playhead —
 * uses this hook instead, because those are continuous gestures. HTML5 DnD
 * gives coarse `dragover` coordinates, a browser-drawn drag image that cannot
 * be fully controlled, and no clean way to express "snap the ghost to 24
 * frames". `setPointerCapture` gives exact per-pixel deltas and behaves
 * identically for mouse and trackpad.
 *
 * No new dependency: `dnd-kit`/`react-dnd` model list reordering, and a
 * timeline is a 2D coordinate space with snapping, which is not that.
 */

/**
 * Snap threshold in **pixels**, not frames.
 *
 * This is the whole reason snapping feels right at every zoom: a threshold
 * fixed in frames would be sticky when zoomed out (where one frame is a
 * fraction of a pixel) and unreachable when zoomed in. Screen space is the
 * only constant a hand works in.
 */
/** Screen-space snap distance — shared with the panel's external-drop landing (S200). */
export const SNAP_THRESHOLD_PX = 6;

export type DragKind = 'move' | 'trim-start' | 'trim-end' | 'scrub';

export interface DragState {
  kind: DragKind;
  clipId: string | null;
  /**
   * Frames moved, already snapped. S176 — live only in the object passed to
   * `onCommit`; the `drag` state object stays at 0 for the whole gesture,
   * because per-move position now travels imperatively through `onDelta`
   * (the `transportClock` rule: continuous motion never renders React).
   */
  deltaFrames: number;
  /**
   * S157 — where the pointer is vertically, in viewport coordinates. The
   * horizontal axis stays frames (the hook's whole vocabulary); the vertical
   * axis is resolved by the *panel* against its own row geometry, because only
   * it knows where the lanes sit. This is what makes a move a cross-track
   * move, and a drag into the empty dock a new lane.
   */
  clientY: number;
}

export interface TimelineDragOptions {
  pixelsPerSecond: number;
  fps: number;
  /** Snap targets in frames — `timelineSnapTargets(...)` at the call site. */
  targets: number[];
  /**
   * S175 — the scrub gesture's own target list, without the playhead: a
   * scrub snapping back to where the playhead already stands would fight
   * the gesture. Falls back to `targets`.
   */
  scrubTargets?: number[];
  /**
   * S175 — the magnet toggle. Defaults on. Composes with Alt as XOR: Alt
   * bypasses while the magnet is on **and** momentarily enables while it is
   * off — the Premiere/Resolve behaviour, one modifier useful in both
   * states.
   */
  snapEnabled?: boolean;
  onCommit: (state: DragState) => void;
  onScrub?: (frame: number) => void;
  /**
   * S175 — fired per move with the live (already-snapped) delta and the
   * target frame the gesture is currently held to, `null` when free. The
   * panel drives the snap indicator (and, S176, the live clip transform)
   * from this imperatively — no per-move React state beyond the existing
   * `drag` object.
   */
  onDelta?: (deltaFrames: number, snappedTarget: number | null) => void;
}

export function useTimelineDrag(options: TimelineDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const origin = useRef<{
    x: number;
    y: number;
    frame: number;
    span: number;
    /** S176 — the live gesture's last (snapped, clamped) delta; the commit reads this. */
    lastDeltaFrames: number;
    /** S176 — delta clamps for trims, so live and commit agree by construction. */
    bounds: { minDelta: number; maxDelta: number } | null;
  } | null>(null);

  const pixelsPerFrame = (options.pixelsPerSecond || 1) / (options.fps || 1);

  const begin = useCallback(
    (
      event: React.PointerEvent,
      kind: DragKind,
      clip: SequenceClip | null,
      startFrame: number,
      bounds?: { minDelta: number; maxDelta: number },
    ) => {
      // Left button only. A right-click opens a context menu and a middle-click
      // is a paste on Linux; either starting a drag would be a surprise.
      if (event.button !== 0) return;
      event.preventDefault();
      // Capture on the element itself so the gesture survives the pointer
      // leaving it — a trim handle is 8px wide and a hand moves faster than
      // that between frames.
      event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = {
        x: event.clientX,
        y: event.clientY,
        frame: startFrame,
        // S175 — the clip's length, so a move can snap its *trailing* edge
        // too. Zero for trims and scrubs: there the dragged edge is the
        // gesture.
        span: kind === 'move' ? (clip?.durationFrames ?? 0) : 0,
        lastDeltaFrames: 0,
        bounds: bounds ?? null,
      };
      setDrag({ kind, clipId: clip?.id ?? null, deltaFrames: 0, clientY: event.clientY });
    },
    [],
  );

  const move = useCallback(
    (event: React.PointerEvent) => {
      if (!drag || !origin.current) return;
      const rawDeltaFrames = (event.clientX - origin.current.x) / pixelsPerFrame;
      const rawFrame = Math.max(0, origin.current.frame + rawDeltaFrames);
      const rounded = Math.round(rawFrame);

      // S175 — magnet XOR Alt (see the option's doc). The pre-S175 behaviour
      // (always-on magnet, Alt bypasses) is the default's case exactly.
      const snapping = (options.snapEnabled ?? true) !== event.altKey;
      const tolerance = SNAP_THRESHOLD_PX / pixelsPerFrame;
      const targets =
        drag.kind === 'scrub' ? (options.scrubTargets ?? options.targets) : options.targets;

      /** Snap one point; report the target only when one actually held it. */
      const snapPoint = (frame: number): { frame: number; target: number | null } => {
        const result = snapFrame(frame, targets, tolerance);
        const held = Math.abs(result - frame) <= tolerance && targets.includes(result);
        return held ? { frame: result, target: result } : { frame, target: null };
      };

      let snapped = rounded;
      let snappedTarget: number | null = null;
      if (snapping) {
        // S175 — the nearer edge wins on a move: a clip can butt its tail
        // against a neighbour's head, not just its own head against a tail.
        // Ties go to the leading edge — it is the grabbed one.
        const lead = snapPoint(rounded);
        let frame = lead.frame;
        let target = lead.target;
        const span = origin.current.span;
        if (drag.kind === 'move' && span > 0) {
          const tail = snapPoint(rounded + span);
          const leadAdjust = lead.target === null ? Infinity : Math.abs(lead.frame - rounded);
          const tailAdjust = tail.target === null ? Infinity : Math.abs(tail.frame - (rounded + span));
          if (tailAdjust < leadAdjust) {
            frame = tail.frame - span;
            target = tail.target;
          }
        }
        snapped = Math.max(0, frame);
        snappedTarget = target;
      }

      let deltaFrames = snapped - origin.current.frame;
      // S176 — trim bounds: the same clamps `trimClipEdge` will apply on
      // commit, applied to the *live* value so the preview cannot promise a
      // trim the commit will refuse. A clamp that bites also drops the snap
      // report — the gesture is held by the bound, not by a target.
      const bounds = origin.current.bounds;
      if (bounds) {
        const clamped = Math.min(bounds.maxDelta, Math.max(bounds.minDelta, deltaFrames));
        if (clamped !== deltaFrames) {
          deltaFrames = clamped;
          snappedTarget = null;
        }
      }

      // S176 — no setState here, and none anywhere per move: the delta
      // travels through `onDelta` and the `lastDeltaFrames` ref, so a drag
      // renders React exactly twice (begin, end) however long it runs.
      origin.current.lastDeltaFrames = deltaFrames;
      options.onDelta?.(deltaFrames, snappedTarget);

      if (drag.kind === 'scrub') {
        options.onScrub?.(origin.current.frame + deltaFrames);
      }
    },
    [drag, options, pixelsPerFrame],
  );

  const end = useCallback(
    (event: React.PointerEvent) => {
      if (!drag) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      // A zero-delta drag is a click. Committing it would push an undo entry
      // for a gesture that changed nothing, which makes Ctrl+Z appear broken.
      // S157 — a *vertical* drag is a real gesture too (cross-track move, or
      // out into the empty dock to mint a lane), so the click test checks both
      // axes: no frames moved AND the pointer stayed within a hand's tremor.
      const movedVertically =
        origin.current !== null && Math.abs(event.clientY - origin.current.y) > 8;
      const deltaFrames = origin.current?.lastDeltaFrames ?? 0;
      if (deltaFrames !== 0 || (drag.kind === 'move' && movedVertically)) {
        options.onCommit({ kind: drag.kind, clipId: drag.clipId, deltaFrames, clientY: event.clientY });
      }
      origin.current = null;
      setDrag(null);
    },
    [drag, options],
  );

  return { drag, begin, move, end };
}
