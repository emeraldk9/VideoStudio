/**
 * Beta S155 — `localStorage`, safe to touch at module load.
 *
 * The UI stores read their persisted preferences in the initializer passed to
 * `create()`, which runs the moment the module is imported. That is fine in the
 * renderer and fatal anywhere else: a plain unit test importing a store — or
 * any module that transitively reaches one — dies with `window is not defined`
 * before a single assertion runs.
 *
 * It stopped being hypothetical when `entities/tts`'s run announcer began
 * reading `shellStore` to decide whether a finished run needs a toast. That is
 * the right place for it (the announcement has to fire from a store action,
 * with no component mounted), but it meant every TTS store test suddenly
 * imported the shell's persisted layout state.
 *
 * Reads fall back to `null` and writes are dropped when there is no DOM. Both
 * are the correct behaviour rather than a test accommodation: a preference that
 * cannot be stored is a preference at its default, which is exactly what each
 * caller's own fallback already expresses.
 */

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Access itself throws when storage is disabled by policy (private mode on
    // some engines), not merely when it is absent.
    return null;
  }
}

export function readLocalSetting(key: string): string | null {
  return storage()?.getItem(key) ?? null;
}

export function writeLocalSetting(key: string, value: string): void {
  storage()?.setItem(key, value);
}
