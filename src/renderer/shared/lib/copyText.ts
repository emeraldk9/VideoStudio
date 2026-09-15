/**
 * Beta S218 — put text on the clipboard, and say whether it worked.
 *
 * Every Copy button in the app used to call `navigator.clipboard.writeText`
 * directly, as `void writeText(text).then(showTick)` — no `catch` anywhere. So
 * when S213's permission policy stopped granting `clipboard-sanitized-write`,
 * the promise rejected and each button did *nothing*: the tick never appeared,
 * no error surfaced, and the only evidence was a `permission refused` line in
 * the main process's log. "I can't copy the prompt", with nothing on screen to
 * explain it.
 *
 * Two things follow from that, and this module is both:
 *
 * 1. **A copy either succeeds or is reported.** The return value is the answer,
 *    and it never throws — a caller cannot accidentally re-create the silent
 *    failure by forgetting a `catch`.
 * 2. **A fallback for when the async API is refused.** `document.execCommand`
 *    is deprecated and is *not* the primary path, but it runs on the user
 *    gesture rather than through the Permissions API, so it is unaffected by
 *    the exact class of failure that caused this bug. One denied permission
 *    should degrade a copy button, not disable it.
 */

/**
 * The pre-Clipboard-API copy: a throwaway textarea, selected, `execCommand`.
 *
 * Off-screen rather than `hidden`/`display:none`, because a field that is not
 * rendered cannot be selected and the command silently copies nothing.
 * `readOnly` keeps the mobile keyboard down and the caret out of the way;
 * `aria-hidden` keeps a screen reader from announcing a field that exists for
 * one tick of a synchronous call.
 */
function copyByExecCommand(text: string): boolean {
  if (typeof document.execCommand !== 'function') {
    return false;
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.top = '-1000px';
  field.style.opacity = '0';
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * Copies `text`, returning whether it landed on the clipboard.
 *
 * Empty text is refused rather than quietly "succeeding" with nothing: a
 * disabled-looking button that reports a tick and leaves the clipboard holding
 * whatever was there before is the same silent lie in a different costume.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Refused (permission), unavailable (no secure context), or the API is
    // absent. All three have the same remedy.
    return copyByExecCommand(text);
  }
}
