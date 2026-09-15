import { create } from 'zustand';

import type { TimelineDragItem } from '@shared';

/**
 * Beta S200 — the media pool's **in-flight drag**, mirrored for the lanes.
 *
 * HTML5 drag-and-drop hides the payload until the drop: `dataTransfer.getData`
 * returns `''` during `dragover` (the spec's protected mode), and only the
 * MIME *types* are readable. So a lane hovering a drag can tell that it is a
 * pool drag but not how many items it carries or how long they are — which is
 * exactly what an insertion ghost needs to draw N rectangles of the right
 * width. Both panels live in this one renderer, so the pool publishes what it
 * put on the drag here, and the lanes read it. Cleared on `dragend`, however
 * the drag ended.
 *
 * Renderer-local and never persisted, like `toolMode`. Two writes per drag
 * (begin, end); nothing here moves per pointer event.
 */
interface MediaDragState {
  /** The resolved items on the current drag, in drag order; `null` when nothing is being dragged. */
  items: TimelineDragItem[] | null;
  begin: (items: TimelineDragItem[]) => void;
  end: () => void;
}

export const useMediaDragStore = create<MediaDragState>((set) => ({
  items: null,
  begin: (items) => set({ items }),
  end: () => set({ items: null }),
}));
