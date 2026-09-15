/**
 * Display formatters shared across the renderer.
 *
 * These lived inline in the components that happened to need them first,
 * which is how the app ended up rendering the same byte count two different
 * ways: `DashboardScreen` had a binary-prefix ladder, `VideoLightboxModal`
 * hardcoded `/(1024*1024)` and always said MB. Same number, two strings.
 */

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/** Binary-prefix byte size — `900 B`, `1.5 MB`, `2.3 GB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

/**
 * `YYYY-MM-DD` from an ISO timestamp.
 *
 * Deliberately not relative ("2 days ago"): the app shows what it knows, and a
 * relative string is a claim about *now* that goes stale in place — the call
 * `Beta_S6b_1_Refinement.md` made and this keeps.
 */
export function formatIsoDate(iso: string): string {
  return iso.slice(0, 10);
}

/** `mm:ss` from a whole number of seconds — countdowns and cooldowns. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * A story length in seconds as `45s`, `1m 30s`, `2m` — Beta Step 52.
 *
 * Distinct from `formatClock`: that is a running countdown and wants fixed
 * `mm:ss` so the digits don't jump; this is a target read at a glance, where
 * `1m 30s` is what a writer would say out loud and `01:30` reads like a timer.
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/** `1 image` / `2 images` — pluralizes on the count it is given. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
