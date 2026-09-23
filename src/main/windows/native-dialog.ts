import { BaseWindow, dialog } from 'electron';
import type { OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from 'electron';

/**
 * Beta S511 — every native dialog this process opens has an owner window.
 *
 * Nineteen call sites opened `dialog.showOpenDialog` / `showSaveDialog`
 * **unparented**, on the strength of a comment in `storage-ipc.ts` (Beta
 * Step 6): *"`dialog`'s parent-window overload specifically requires a
 * `BrowserWindow` instance, which doesn't exist anywhere in this app."* That
 * was true when it was written and stopped being true when the shell moved
 * to `BaseWindow` — `dialog.showOpenDialog(window: BaseWindow, options)` is
 * the signature Electron has shipped since the class existed. Nobody re-read
 * the comment, and the comment's reasoning spread: *"Unparented, as every
 * dialog in this process is"* (`story-ipc.ts`).
 *
 * What an unowned dialog costs on Windows: it is a top-level window, not a
 * modal of the app. It opens wherever and however large Windows last left a
 * dialog for this executable — and once it has been maximised once, it comes
 * back maximised every time, with no owner to centre on and no frame to drag
 * (owner report, 2026-09-13: *"a picker window is always open full screen and
 * can't be resized"*, with a screenshot of "Choose a folder of pictures"
 * filling the display). It also does not block the app window behind it, so
 * a second press opens a second dialog (`story-ipc.ts:99` already had to
 * defend against exactly that).
 *
 * Owned, a dialog is what the platform means by one: centred on the window
 * that asked, sized like a dialog, modal to that window and to nothing else.
 *
 * The owner is the **focused** `BaseWindow` — the detached Voice and Timeline
 * windows open dialogs too, and a dialog belongs over the window whose button
 * was pressed — falling back to the first window when none is focused (the
 * press that opened the dialog is what took focus, so that case is a test or
 * a very fast Alt-Tab). With no window at all the dialog opens unowned, as
 * before: the sole such caller is `bootstrap.ts`'s crash-time save prompt,
 * which may run before or after the window exists.
 *
 * `try` around the lookup, because unit tests mock `electron` with only the
 * exports each test names, and Vitest throws on access to a missing one.
 */
export function dialogOwner(): BaseWindow | undefined {
  try {
    const win = BaseWindow.getFocusedWindow() ?? BaseWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      return win;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const owner = dialogOwner();
  // On Windows, passing an owner window with `titleBarStyle: 'hidden'` causes Win32 IFileDialog
  // to deadlock its modal message pump when querying virtual/cloud filesystems (Google Drive G:\, OneDrive).
  // Opening unowned on Windows completely eliminates this deadlock while `owner.focus()` restores focus on close.
  const safeProperties = [...(options.properties ?? [])];
  if (!safeProperties.includes('dontAddToRecent')) {
    safeProperties.push('dontAddToRecent');
  }
  if (!safeProperties.includes('noResolveAliases')) {
    safeProperties.push('noResolveAliases');
  }

  const safeOptions: OpenDialogOptions = {
    ...options,
    properties: safeProperties,
  };

  const promise =
    owner && process.platform !== 'win32'
      ? dialog.showOpenDialog(owner, safeOptions)
      : dialog.showOpenDialog(safeOptions);

  return promise.then((result) => {
    if (owner && !owner.isDestroyed() && 'focus' in owner) {
      try {
        (owner as any).focus();
      } catch {}
    }
    return result;
  });
}

export function showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const owner = dialogOwner();
  const promise =
    owner && process.platform !== 'win32'
      ? dialog.showSaveDialog(owner, options)
      : dialog.showSaveDialog(options);

  return promise.then((result) => {
    if (owner && !owner.isDestroyed() && 'focus' in owner) {
      try {
        (owner as any).focus();
      } catch {}
    }
    return result;
  });
}
