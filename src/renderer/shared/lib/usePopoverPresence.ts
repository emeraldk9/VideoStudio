import { useEffect } from 'react';

import { useModalStore } from '../model/modalStore';

/**
 * Beta S281 — tells the shell that a non-modal overlay is open, so the
 * embedded browser gets out from in front of it.
 *
 * `browserView` is a native child view layered over the workspace rect, and
 * CSS z-index has no effect across sibling native views. `WindowManager`
 * handles that by restacking — `setEmbeddedOverlayActive` puts `appView` in
 * front while an overlay is open, deliberately *not* by collapsing the browser
 * to 0×0, which is the same automation-breaking geometry change that once cost
 * a running job its viewport. But the renderer only ever reported *modals*, so
 * every popover that escaped the sidebar was painted over by the browser on
 * the Home screen: the account menu, the project selector, and (without this)
 * the queue panel added in this step.
 *
 * A hook rather than a call in each `onClick`, because the flag has to be
 * released on unmount too — a popover whose parent unmounts while open would
 * otherwise leave the embedded browser parked behind the app.
 *
 * `id` is any stable string unique to the popover; it exists so two open
 * popovers cannot clear each other's registration.
 */
export function usePopoverPresence(id: string, open: boolean): void {
  const setPopoverOpen = useModalStore((store) => store.setPopoverOpen);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPopoverOpen(id, true);
    return () => setPopoverOpen(id, false);
  }, [id, open, setPopoverOpen]);
}
