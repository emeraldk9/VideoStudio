import { create } from 'zustand';

export type MediaPanelCategory = 'media' | 'transitions' | 'text' | 'effects' | 'sketch' | 'export';

interface MediaPanelState {
  category: MediaPanelCategory;
  setCategory: (category: MediaPanelCategory) => void;
}

export const useMediaPanelStore = create<MediaPanelState>((set) => ({
  category: 'media',
  setCategory: (category) => set({ category }),
}));
