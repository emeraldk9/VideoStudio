import { useEffect, useRef, useState } from 'react';

import { renderProgressFraction, type SequenceRenderProgress } from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import {
  advanceEta,
  IDLE_ETA,
  renderProgressView,
  type EtaState,
} from '../lib/render-progress-model';

/**
 * Beta S253 — the export's progress bar, its step, and its two clocks.
 *
 * Replaces a single line of monospace text that named a stage and a count.
 * On an 18-minute timeline that line was several minutes of near-motionless
 * output with no way to tell a slow export from a stuck one — the case a
 * progress indicator exists for in the first place.
 *
 * The elapsed clock ticks here rather than arriving over IPC: it is a
 * once-a-second render of a number the renderer can compute itself, and
 * putting it on the event stream would mean a main-process timer emitting
 * events whose only purpose is to move a label.
 *
 * Every clock and every fold lives in an effect, and the render body is a
 * pure function of props and state. That is not incidental tidiness — under
 * StrictMode's double render, an estimate folded during render would be
 * folded twice per event and converge to the wrong number, silently and only
 * in development.
 */

/** How often the clocks redraw. One second — the precision they display. */
const TICK_MS = 1_000;

/**
 * How often the live region is allowed to speak.
 *
 * Progress events arrive many times a second during a streamed stage. An
 * `aria-live` region wired straight to them would queue an utterance per
 * event and leave a screen-reader user unable to hear anything else for the
 * length of the export. Twenty seconds is frequent enough to convey motion
 * and rare enough to stay out of the way; the bar's own `aria-valuenow`
 * carries the exact figure for anyone who asks for it directly.
 */
const ANNOUNCE_MS = 20_000;

export function RenderProgress({ progress }: { progress: SequenceRenderProgress }) {
  // The start is the store's, not this component's. The panel unmounts on
  // every navigation away, and a clock owned here restarts at zero on the way
  // back — on the one screen a user is most likely to leave running.
  const startedAt = useSequenceStore((state) => state.renderStartedAt);
  const lastAnnouncedAt = useRef(0);
  const [now, setNow] = useState(() => 0);
  const [eta, setEta] = useState<EtaState>(IDLE_ETA);
  const [announcement, setAnnouncement] = useState('');

  // Both writes happen in timer callbacks, never synchronously in the effect
  // body — a synchronous setState here cascades an extra render
  // (`react-hooks/set-state-in-effect`). The zero-delay refresh is what stops
  // a panel reopened mid-export showing `0:00` until the first tick, which is
  // the very flicker this whole change exists to remove.
  useEffect(() => {
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);

  const elapsedMs = startedAt === null || now === 0 ? 0 : Math.max(0, now - startedAt);

  // Folded on every event, not on every tick: the events are what carry new
  // information, and a tick between them would only re-fold the same fraction
  // against a larger elapsed and drag the estimate upward.
  //
  // Remounting after a navigation restarts the smoothing from a single raw
  // projection rather than resuming the old curve. That is a visible wobble
  // for a few seconds and no more — and unlike the elapsed clock the estimate
  // is self-correcting, so it does not need to be carried in the store.
  useEffect(() => {
    if (startedAt === null) return undefined;
    const elapsed = Date.now() - startedAt;
    // Deferred for the same reason as the clock above: a synchronous write
    // here cascades a second render for every progress event, and those
    // arrive many times a second during a streamed stage.
    const id = setTimeout(
      () => setEta((previous) => advanceEta(previous, renderProgressFraction(progress), elapsed)),
      0,
    );
    return () => clearTimeout(id);
  }, [progress, startedAt]);

  const view = renderProgressView(progress, elapsedMs, eta);

  useEffect(() => {
    const at = Date.now();
    if (at - lastAnnouncedAt.current < ANNOUNCE_MS) return;
    lastAnnouncedAt.current = at;
    const id = setTimeout(() => setAnnouncement(view.ariaValueText), 0);
    return () => clearTimeout(id);
  }, [view.ariaValueText]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-text-primary">
          {view.stageCount > 0 ? `Step ${view.stageIndex} of ${view.stageCount} · ` : ''}
          {view.stageLabel}
          {view.stageCounter ? (
            <span className="ml-1 font-mono text-text-secondary">{view.stageCounter}</span>
          ) : null}
        </span>
        {view.determinate ? (
          <span className="font-mono text-xs tabular-nums text-text-primary">{view.percent}%</span>
        ) : null}
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-bg-hover"
        role="progressbar"
        aria-label="Export progress"
        aria-valuenow={view.determinate ? view.percent : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={view.ariaValueText}
      >
        {view.determinate ? (
          <div
            // Eased width rather than a hard set: the streamed stages report
            // many times a second and the coarse ones jump a whole step, and
            // the same transition makes both read as continuous motion.
            className="h-full rounded-full bg-accent-info transition-[width] duration-300 ease-out"
            style={{ width: `${view.percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent-info/60" />
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3 text-xs text-text-secondary">
        <span className="truncate font-mono" title={view.detail ?? undefined}>
          {view.detail ?? ''}
        </span>
        <span className="shrink-0 tabular-nums">
          {view.elapsedLabel} elapsed
          {view.remainingLabel ? ` · ${view.remainingLabel}` : ''}
        </span>
      </div>

      {/* Throttled, and deliberately not the bar itself: the bar's value
          updates far too often to be a polite live region. */}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
