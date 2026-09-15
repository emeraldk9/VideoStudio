/**
 * Every `uiStore.activeModal` id, enumerated in one place — the same
 * no-magic-strings convention `src/shared/ipc/ipc-channels.ts` uses for IPC
 * channels, applied to the renderer's modal registry.
 *
 * These ids used to be declared next to the component that renders each
 * modal, which made a shared constant a reason to import a whole screen. Four
 * of the renderer's worst cross-layer edges existed only to read one of these
 * strings — including both halves of a `studio` ↔ `screens` import cycle
 * (`UnifiedPromptCardStream` reached up into `screens/BatchConfirmationModal`
 * while `screens/VideoStudioScreen` reached down into `studio/StudioScreen`).
 *
 * A modal id is shared vocabulary between whoever opens a modal and whoever
 * renders it, so it belongs to neither — it belongs here.
 */
export const MODAL_IDS = {
  KEYBOARD_SHORTCUTS: 'keyboard-shortcuts',
  PROJECT_SELECTOR: 'project-selector',
  /**
   * Beta S314 — the workspace switcher's dropdown.
   *
   * An `activeModal` id rather than local state for the same reason
   * `PROJECT_SELECTOR` is one: the panel hangs out of the TitleBar into the
   * workspace rect, and `AppLayout`'s single effect uses this to bring
   * `appView` in front of `browserView` while it is open.
   */
  WORKSPACE_SELECTOR: 'workspace-selector',
  /** Beta Step 31 — was `CHARACTER_REF_PANEL`; the modal now tabs across Character/Location/Prop. */
  WORLD_ASSET_LIBRARY: 'world-asset-library',
  SIGN_IN: 'session-sign-in',
  CREATE_PROJECT: 'create-project',
  BATCH_CONFIRMATION: 'batch-confirmation',
  /** Beta Step 7 — pre-filled GitHub issue composer. */
  BETA_FEEDBACK: 'beta-feedback',
  /** Beta Step 149 — app configuration. Was a routed screen until it became a centred dialog. */
  SETTINGS: 'settings',
  /** Beta S235 — batch watermark removal over the Library selection or external files. */
  WATERMARK_BATCH: 'watermark-batch',
  /**
   * Beta S282 — the Flow duplicate reports, characters and references in one
   * dialog.
   *
   * An id rather than a component import because two sibling feature slices
   * open it: the Story Builder's entity boards and the Library's world-asset
   * browsers. `features/character-refs` may not import `features/story-builder`,
   * so the report had to become globally reachable to be reachable from both.
   */
  FLOW_DUPLICATES: 'flow-duplicates',
  /**
   * Beta S280 — why the queue stopped, and the one action that resolves it.
   *
   * A dialog rather than a banner because `QueuePausedBanner` cannot render on
   * the embedded Home screen at all (`browserView` covers the workspace rect),
   * and an overlay the shell reports to `WindowManager` is what survives there
   * — see `QueuePausedModal` for the whole argument.
   */
  QUEUE_PAUSED: 'queue-paused',
  /**
   * Beta S497 — the approved-take upscale, planned per Google account.
   *
   * An id rather than a component import because its openers are the
   * Storyboard and Handoff toolbars (`features/story-builder`), the queue
   * panel's resume offer (`features/queue-control`) and the boot-time resume
   * prompt (`app`), while the dialog lives in `features/quality-upgrade` —
   * three slices that may not import a fourth.
   */
  QUALITY_UPGRADE: 'quality-upgrade',
} as const;

export type ModalId = (typeof MODAL_IDS)[keyof typeof MODAL_IDS];
