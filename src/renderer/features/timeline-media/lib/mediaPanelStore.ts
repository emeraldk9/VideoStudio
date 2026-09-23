import { create } from 'zustand';

export type MediaPanelCategory =
  | 'media'
  | 'text'
  | 'subtitles'
  | 'transitions'
  | 'effects'
  | 'filters'
  | 'sketch';

interface MediaPanelState {
  category: MediaPanelCategory;
  setCategory: (category: MediaPanelCategory) => void;
}

export const useMediaPanelStore = create<MediaPanelState>((set) => ({
  category: 'media',
  setCategory: (category) => set({ category }),
}));
