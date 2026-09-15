import { useCallback, useEffect, useRef } from 'react';

/**
 * Beta S352 — a callback whose **identity** never changes and whose **body** is
 * always the latest render's.
 *
 * ## Why this exists rather than a `useCallback`
 *
 * The Storyboard and the Handoff mount a card per shot — 217 of them on the
 * owner's largest episode — and hand each one four or five callbacks. Inline
 * lambdas made every card's props new on every render, so `React.memo` could
 * never bite and a single shot's change re-rendered the whole board: 180 ms per
 * store write, measured.
 *
 * The obvious fix is `useCallback`, and it does not work here. `renderStills`
 * closes over the project, the presets, the entities, the continuity ledger and
 * **the episode's shots** — so a dependency-correct `useCallback` returns a new
 * identity on precisely the store writes this is meant to make cheap. The
 * tempting move at that point is to trim the dependency array, and on this path
 * that is not a style choice: these callbacks enqueue paid Flow renders, and a
 * stale closure would enqueue against last render's settings. `StoryboardCard`
 * has carried a comment about exactly this since Beta S335.
 *
 * A latest-ref callback resolves the two requirements separately. The ref is
 * rewritten after **every** commit, and the returned wrapper reads it at call
 * time — so identity is constant for the component's whole life while the body
 * is never older than the last render.
 *
 * ## The one rule for using it
 *
 * **Never call the returned function during render.** Between the render that
 * changed the closure and the effect that stores it, the ref still holds the
 * previous one; every event handler, effect and timeout runs after that effect,
 * so only a render-phase call can observe the stale value. This is the same
 * constraint React's own `useEffectEvent` carries, and the reason the read
 * below is in a callback rather than in the render body — which is also what
 * `react-hooks/refs` enforces.
 *
 * @example
 * const onRender = useStableCallback((shot: StoryShot) => void renderStills([shot]));
 * // `onRender` is the same function forever; `renderStills` is always current.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback);

  // No dependency array: the closure is replaced after every commit, which is
  // what makes "always the latest render's body" true rather than approximately
  // true. An `[callback]` array would be equivalent (the identity changes every
  // render anyway) and would only invite someone to narrow it later.
  useEffect(() => {
    latest.current = callback;
  });

  return useCallback((...args: Args) => latest.current(...args), []);
}
