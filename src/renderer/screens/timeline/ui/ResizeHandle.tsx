import { useRef } from 'react';

/**
 * Beta S154 — one splitter between two panes of the Timeline workspace.
 *
 * WAI-ARIA window-splitter pattern: `role="separator"` with
 * `aria-valuenow`/`min`/`max` as percentages of the first pane, arrow keys
 * moving 1% per press, `Home`/`End` to the extremes, double-click back to the
 * default. Continuous drag uses `setPointerCapture` — the same mechanism
 * `useTimelineDrag` chose over HTML5 DnD, for the same reason: exact per-pixel
 * deltas that behave identically for mouse and trackpad.
 *
 * The handle is deliberately dumb about geometry: it reports the pointer's
 * travel in pixels and lets the parent convert to a percentage, because only
 * the parent knows the measured size of the axis being split (and clamping
 * against *pixel* minimums is the parent's rule — CSS `minmax()` + `fr`
 * interact badly once a track hits its floor).
 *
 * Lives in the screen slice per the one-consumer rule (precedent:
 * `QueueGridCard` staying inside `queue-grid`). Promote to `shared/ui` when a
 * second screen wants a splitter.
 *
 * `aria-orientation` follows the APG: a separator between two *rows* is
 * `horizontal` (it moves vertically), one between *columns* is `vertical`.
 */
export interface ResizeHandleProps {
  orientation: 'horizontal' | 'vertical';
  /** Percentage of the first pane, 0–100. What the arrow keys and readout speak. */
  value: number;
  min: number;
  max: number;
  label: string;
  /** Pointer travel in px along the split axis since the drag began. */
  onDrag: (deltaPx: number) => void;
  onDragStart: () => void;
  /** Keyboard: an absolute next value, already stepped. The parent clamps. */
  onKeyChange: (next: number) => void;
  onReset: () => void;
  /** Grid placement from the parent — the handle *is* a grid track. */
  className?: string;
}

export function ResizeHandle({
  orientation,
  value,
  min,
  max,
  label,
  onDrag,
  onDragStart,
  onKeyChange,
  onReset,
  className = '',
}: ResizeHandleProps) {
  const origin = useRef<number | null>(null);
  const vertical = orientation === 'vertical';

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      className={[
        'group relative flex shrink-0 items-center justify-center outline-none',
        vertical ? 'cursor-col-resize' : 'cursor-row-resize',
        className,
      ].join(' ')}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = vertical ? event.clientX : event.clientY;
        onDragStart();
      }}
      onPointerMove={(event) => {
        if (origin.current === null) return;
        onDrag((vertical ? event.clientX : event.clientY) - origin.current);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        origin.current = null;
      }}
      onPointerCancel={() => {
        origin.current = null;
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const grow = vertical ? 'ArrowRight' : 'ArrowDown';
        const shrink = vertical ? 'ArrowLeft' : 'ArrowUp';
        if (event.key === grow) {
          event.preventDefault();
          onKeyChange(value + 1);
        } else if (event.key === shrink) {
          event.preventDefault();
          onKeyChange(value - 1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          onKeyChange(min);
        } else if (event.key === 'End') {
          event.preventDefault();
          onKeyChange(max);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          onReset();
        }
      }}
    >
      {/* The visible grip: a hairline that thickens to the selection tone on
          hover/focus. State via background shift only, per the design system —
          no glow, no scale. */}
      <span
        aria-hidden="true"
        className={[
          'rounded-full bg-hairline transition-colors duration-100 group-hover:bg-bg-selected group-focus-visible:bg-bg-selected',
          vertical ? 'h-full w-0.5' : 'h-0.5 w-full',
        ].join(' ')}
      />
    </div>
  );
}
