import { create } from 'zustand';

import type { WatermarkProgress } from '@shared/types/watermark';

/**
 * Beta S247 — the running watermark batch, where every surface can see it.
 *
 * ## Why this is not in the `watermark-removal` slice
 *
 * It was. The batch modal owns the dialog's state and held the progress with
 * it, which was right while the dialog was the only thing that showed it. It
 * stopped being right once the Storyboard, the Handoff and the entity boards
 * each grew a clean button: those live in `features/story-builder`, slices are
 * siblings, and a sibling may not import `features/watermark-removal`.
 *
 * So the progress moved **down** a layer rather than being mirrored into a
 * second store — the same move `useRegionDrag` made in S235, and for the same
 * reason. Two stores holding the same number is the arrangement that rots:
 * whichever one a surface happens to read decides whether it is right.
 *
 * The rest of the dialog's state stays in the slice, because nothing outside
 * it has any use for a preview or a source list.
 *
 * ## Why a batch outlives the dialog
 *
 * The work runs in the main process. Someone starts 400 items, closes the
 * modal and goes back to the Storyboard — the ticks keep arriving, and the
 * stage's own button is what should show them. Subscribed once, app-level, in
 * `useIpcSynchronizer`.
 */
export interface WatermarkProgressStoreState {
  /** The live batch, or `null` when none has run this session. */
  progress: WatermarkProgress | null;
  setProgress: (progress: WatermarkProgress) => void;
  /** Clears the last batch's tail, so a new run does not open on a stale bar. */
  clear: () => void;
}

export const useWatermarkProgressStore = create<WatermarkProgressStoreState>((set) => ({
  progress: null,
  setProgress: (progress) => set({ progress }),
  clear: () => set({ progress: null }),
}));

/**
 * The running batch's completion as a percentage, or `null` when nothing is
 * running.
 *
 * A selector rather than a field: it is derived, and a control that renders it
 * should re-render when the underlying counts move and not otherwise. Rounded
 * here so every surface shows the same number.
 */
export function selectActiveWatermarkPercent(
  state: WatermarkProgressStoreState,
): number | null {
  const { progress } = state;
  if (progress?.status !== 'running') return null;
  return Math.min(100, Math.max(0, Math.round(progress.progress * 100)));
}
