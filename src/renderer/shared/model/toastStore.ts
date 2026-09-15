import { create } from 'zustand';

import { readLocalSetting, writeLocalSetting } from '../lib/localSetting';

/**
 * Transient user notifications.
 *
 * The toast shape lives with the queue that owns it rather than with the
 * component that renders it — `shared/ui/Toast` re-exports both types, so
 * importers are unaffected and the component keeps depending on the store
 * rather than the other way round.
 */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/**
 * Beta S207 — one control a toast may carry.
 *
 * Added for Undo, which is the only affordance that has to appear *after* the
 * thing it reverses and cannot live anywhere else: the takes it would restore
 * are gone from the strip that would otherwise hold the button.
 */
export interface ToastAction {
  label: string;
  onAct: () => void | Promise<void>;
}

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
  /**
   * S298 — how many times this exact toast has been pushed while it was
   * already showing. Owner-reported: a debounced persist that keeps failing
   * (one storm: a stale main process rejecting every `replaceClips`) pushed
   * an identical error toast per edit, and errors never auto-dismiss — a
   * wall of duplicates carrying one fact. Identical actionless toasts now
   * coalesce into the existing card with a ×N badge instead of stacking.
   */
  count?: number;
}

export interface ToastStoreState {
  toasts: ToastMessage[];
  /** Auto-dismiss non-error toasts. Persisted; errors always stay until dismissed. */
  toastAutoDismiss: boolean;
  /** How long an auto-dismissing toast stays up. */
  toastAutoDismissSeconds: 3 | 5;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  setToastAutoDismiss: (enabled: boolean) => void;
  setToastAutoDismissSeconds: (seconds: 3 | 5) => void;
}

export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  toastAutoDismiss: readLocalSetting('ai_video_studio_toast_auto_dismiss') !== 'off',
  toastAutoDismissSeconds:
    readLocalSetting('ai_video_studio_toast_seconds') === '5' ? 5 : 3,

  pushToast: (toast) =>
    set((store) => {
      // S298 — coalesce: a re-push of a showing, actionless, identical toast
      // bumps its badge rather than adding a card. Action toasts never
      // coalesce — each carries its own live control.
      if (!toast.action) {
        const existing = store.toasts.find(
          (item) => !item.action && item.variant === toast.variant && item.message === toast.message,
        );
        if (existing) {
          return {
            toasts: store.toasts.map((item) =>
              item === existing ? { ...item, count: (item.count ?? 1) + 1 } : item,
            ),
          };
        }
      }
      return { toasts: [...store.toasts, { ...toast, id: crypto.randomUUID() }] };
    }),

  dismissToast: (id) => set((store) => ({ toasts: store.toasts.filter((toast) => toast.id !== id) })),

  setToastAutoDismiss: (enabled) => {
    writeLocalSetting('ai_video_studio_toast_auto_dismiss', enabled ? 'on' : 'off');
    set({ toastAutoDismiss: enabled });
  },

  setToastAutoDismissSeconds: (seconds) => {
    writeLocalSetting('ai_video_studio_toast_seconds', String(seconds));
    set({ toastAutoDismissSeconds: seconds });
  },
}));
