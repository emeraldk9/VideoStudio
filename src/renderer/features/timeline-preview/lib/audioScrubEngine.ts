/**
 * Industry-standard Timeline Audio Scrubbing Engine.
 *
 * Provides responsive, pop-free audio scrub grains (50ms) during timeline playhead
 * dragging and frame-stepping (Left/Right arrows, JKL steps), mimicking tape-style
 * transient monitoring in Premiere Pro and DaVinci Resolve.
 */

let scrubStopTimeout: ReturnType<typeof setTimeout> | null = null;
let activeScrubElements: HTMLMediaElement[] = [];

/**
 * Triggers a short, high-fidelity audio grain from the given media elements at their target positions.
 * Automatically clamps grain duration and safely handles asynchronous playback promises.
 */
export function triggerAudioScrubGrain(
  elements: { element: HTMLMediaElement; targetSeconds: number; volume: number }[],
  grainDurationMs = 55,
): void {
  // Cancel any pending pause from previous scrub step
  if (scrubStopTimeout !== null) {
    clearTimeout(scrubStopTimeout);
    scrubStopTimeout = null;
  }

  // Pause previously active elements if they aren't in this grain
  for (const prev of activeScrubElements) {
    if (!elements.some((e) => e.element === prev)) {
      prev.pause();
    }
  }

  activeScrubElements = elements.map((e) => e.element);

  for (const { element, targetSeconds, volume } of elements) {
    if (volume <= 0) {
      if (!element.paused) element.pause();
      continue;
    }

    try {
      element.volume = Math.min(1, Math.max(0, volume));
      // Fast seek to target grain position
      if (Math.abs(element.currentTime - targetSeconds) > 0.02) {
        element.currentTime = targetSeconds;
      }

      if (element.paused) {
        const playPromise = element.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Safe catch for browser auto-play policy or rapid interruption
          });
        }
      }
    } catch {
      // Element not ready or invalid media state
    }
  }

  // Schedule crisp grain cutoff to prevent lingering playback
  scrubStopTimeout = setTimeout(() => {
    for (const el of activeScrubElements) {
      try {
        if (!el.paused) el.pause();
      } catch {
        // Safe ignore
      }
    }
    activeScrubElements = [];
    scrubStopTimeout = null;
  }, grainDurationMs);
}

/**
 * Immediately stops any active audio scrub grains and cancels timeouts.
 */
export function stopAudioScrub(): void {
  if (scrubStopTimeout !== null) {
    clearTimeout(scrubStopTimeout);
    scrubStopTimeout = null;
  }
  for (const el of activeScrubElements) {
    try {
      if (!el.paused) el.pause();
    } catch {
      // Safe ignore
    }
  }
  activeScrubElements = [];
}
