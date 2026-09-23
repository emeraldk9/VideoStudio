/**
 * The one sentence a user needs out of a rejected `window.api` call.
 *
 * Electron wraps any main-process throw crossing `ipcRenderer.invoke` as:
 *
 *   Error: Error invoking remote method 'queue:enqueueBatch': Error: Disk full
 *
 * Toasts were interpolating that whole string with `${String(error)}`, so the
 * one useful clause arrived buried under two layers of plumbing plus a channel
 * name that means nothing outside this codebase. `StoryBuilderScreen` already
 * carried a local fix with a comment explaining exactly this; the audit found
 * the same raw interpolation at ~16 other call sites, so it lives here now.
 *
 * Strips every `…Error: ` prefix chain non-greedily (`/s` so a multi-line
 * message still matches) and falls back to `fallback` when what's left is
 * empty — an error whose message is blank must not surface as a toast that
 * says nothing at all.
 */
export function formatIpcError(error: unknown, fallback = 'Something went wrong.'): string {
  if (error === null || error === undefined) return fallback;

  let msg =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message
      : String(error);

  let prev: string;
  do {
    prev = msg;
    msg = msg
      .replace(/^(?:Error|ElectronRemoteError):\s*/i, '')
      .replace(/^Error invoking remote method (?:'[^']*'|"[^"]*"|`[^`]*`|[^:]+):\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim();
  } while (msg !== prev && msg.length > 0);

  return msg || fallback;
}
