import { useEffect, useState } from 'react';

import { useToastStore } from '../../shared/model/toastStore';
import type { ToastAction, ToastMessage, ToastVariant } from '../model/toastStore';

export type { ToastAction, ToastMessage, ToastVariant };

/**
 * Beta S207 — how long a toast carrying a control stays up.
 *
 * Fixed, and deliberately longer than the 3/5s preference. That setting governs
 * *acknowledgements* — errors already override it in the other direction,
 * because an error is often the only copy of an explanation. An action toast is
 * neither: it is a **control**, and three seconds is under the reaction time for
 * "wait, no". Ten is the window Gmail and Google Photos settled on for the same
 * gesture.
 */
const ACTION_TOAST_SECONDS = 10;

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'border-l-4 border-l-accent-success',
  error: 'border-l-4 border-l-accent-danger',
  warning: 'border-l-4 border-l-accent-warning',
  info: 'border-l-4 border-l-accent-info',
};

export interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const autoDismiss = useToastStore((store) => store.toastAutoDismiss);
  const seconds = useToastStore((store) => store.toastAutoDismissSeconds);

  /*
   * Errors stay until dismissed even when auto-dismiss is on. A success toast
   * is an acknowledgement and can expire; an error is the only place some
   * failures are reported, and hiding one after three seconds can lose the
   * single explanation the user had.
   */
  const expires = autoDismiss && toast.variant !== 'error';
  /** S207 — an action toast's lifetime *is* its window; see `ACTION_TOAST_SECONDS`. */
  const lifetime = toast.action ? ACTION_TOAST_SECONDS : seconds;
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!expires) {
      return;
    }
    const timer = setTimeout(() => onDismiss(toast.id), lifetime * 1000);
    return () => clearTimeout(timer);
    // S298 — `toast.count` in the deps re-arms expiry when a coalesced
    // duplicate lands: a repeated acknowledgement stays visible from its
    // latest push, not its first.
  }, [expires, lifetime, toast.id, toast.count, onDismiss]);

  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-bg-workspace px-4 py-3 text-sm text-text-primary ${VARIANT_CLASSES[toast.variant]}`}
      style={{ boxShadow: 'var(--shadow-elevated)' }}
    >
      <span>
        {toast.message}
        {(toast.count ?? 1) > 1 ? (
          <span
            className="ml-2 rounded-full bg-bg-app px-1.5 py-0.5 text-xs font-medium text-text-secondary"
            aria-label={`Repeated ${toast.count} times`}
          >
            ×{toast.count}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {/* Busy rather than disabled-then-gone: a restore reads and moves files,
            so a slow one would otherwise invite a second press that undoes an
            undo. */}
        {toast.action ? (
          <button
            type="button"
            disabled={acting}
            className="font-medium text-text-primary underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            onClick={() => {
              setActing(true);
              void (async () => {
                try {
                  await toast.action?.onAct();
                } finally {
                  onDismiss(toast.id);
                }
              })();
            }}
          >
            {acting ? 'Working…' : toast.action.label}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Dismiss notification"
          className="text-text-secondary hover:text-text-primary"
          onClick={() => onDismiss(toast.id)}
        >
          ✕
        </button>
      </span>
    </div>
  );
}

export interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) {
    return null;
  }
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
