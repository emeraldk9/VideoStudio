import { formatIpcError } from '../../../shared/lib/formatIpcError';
import { useToastStore } from '../../../shared/model/toastStore';

/**
 * Beta S172 — a timeline write that failed, said out loud.
 *
 * Every persistence path in `sequenceStore` used to record its failure with
 * `set({ error })` and stop there — and **nothing in the renderer has ever
 * read that field**. The store's optimistic writes mean the screen has
 * already moved on, so a rejected write left the document on screen
 * disagreeing with the database, with no signal at all. That is how the S165
 * `replaceDocument` regression stayed invisible: undo appeared to work, threw
 * in the main process, and was lost on the next load.
 *
 * The `error` field stays (it is state, and tests seed it); this adds the
 * output it never had.
 *
 * Layer note: an entity importing `shared/model` is the sanctioned direction
 * (`fsd-entities-import-only-shared`) — `entities/tts/lib/announce.ts` and
 * `entities/world-asset` already reach `toastStore` exactly this way.
 */
export function announceTimelineError(error: unknown, fallback: string): string {
  let message = formatIpcError(error, fallback);
  // S298 — a schema rejection of renderer-produced data means the two halves
  // of the app disagree about the contract, and in practice that is version
  // skew: this window is running newer code than the main process (a dev
  // hot-reload, or an update mid-flight). Say the actionable part.
  if (message.includes('Invalid IPC payload')) {
    message += ' — the app is likely mid-update; restarting it reloads both halves.';
  }
  useToastStore.getState().pushToast({ variant: 'error', message });
  return message;
}
