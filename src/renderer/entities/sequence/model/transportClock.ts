/**
 * Beta S151 (H2) — the playhead's per-tick position, outside the store.
 *
 * During playback the transport advances at display rate (60–120Hz). Routing
 * every tick through `setPlayhead` made the whole timeline React tree —
 * panel, three lanes, every clip, every waveform — re-render per frame to
 * move a 1px line. So while playing, the position lives here: the preview's
 * clock publishes to this object, the playhead element subscribes and moves
 * itself via direct style writes, and **the store is committed once, on
 * pause/stop/seek** — the document of record, not the animation channel.
 *
 * Deliberately a plain mutable object, not a zustand store: a store's whole
 * contract is "a set re-renders subscribers", which is exactly the behaviour
 * this exists to avoid.
 */

type Listener = (frame: number) => void;

const listeners = new Set<Listener>();

export const transportClock = {
  /** True between play and pause — the window in which `frame` is the truth. */
  running: false,
  /** The playhead's live position while `running`; stale otherwise. */
  frame: 0,

  start(frame: number): void {
    this.running = true;
    this.publish(frame);
  },

  publish(frame: number): void {
    this.frame = frame;
    for (const listener of listeners) listener(frame);
  },

  stop(): void {
    this.running = false;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
