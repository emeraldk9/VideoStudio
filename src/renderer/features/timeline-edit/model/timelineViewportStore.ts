import { create } from 'zustand';

export interface TimelineViewportState {
  /** Current horizontal scroll position of the timeline scroll container */
  scrollLeft: number;
  /** Visible client width of the timeline trough viewport */
  viewportWidth: number;
  /** Updates the visible scroll bounds */
  setViewport: (scrollLeft: number, viewportWidth: number) => void;
}

export const useTimelineViewportStore = create<TimelineViewportState>((set) => ({
  scrollLeft: 0,
  viewportWidth: 1920,
  setViewport: (scrollLeft, viewportWidth) =>
    set((state) => {
      const nextScrollLeft = Math.max(0, Math.round(scrollLeft));
      const nextViewportWidth = Math.max(1, Math.round(viewportWidth));

      // Threshold check: avoid redundant store dispatches on sub-pixel micro-jitter
      if (
        Math.abs(state.scrollLeft - nextScrollLeft) < 2 &&
        Math.abs(state.viewportWidth - nextViewportWidth) < 2
      ) {
        return state;
      }

      return {
        scrollLeft: nextScrollLeft,
        viewportWidth: nextViewportWidth,
      };
    }),
}));
