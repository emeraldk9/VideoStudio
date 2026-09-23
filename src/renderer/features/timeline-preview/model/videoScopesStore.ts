import { create } from 'zustand';

export type VideoScopeType = 'waveform' | 'parade' | 'vectorscope' | 'histogram';

export interface VideoScopesState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  toggleIsOpen: () => void;

  scopeType: VideoScopeType;
  setScopeType: (scopeType: VideoScopeType) => void;

  intensity: number;
  setIntensity: (intensity: number) => void;

  showGraticule: boolean;
  setShowGraticule: (show: boolean) => void;

  showSkinToneLine: boolean;
  setShowSkinToneLine: (show: boolean) => void;

  /** Lightweight downsampled frame buffer from the video/canvas element */
  frameBuffer: { data: Uint8ClampedArray; width: number; height: number } | null;
  setFrameBuffer: (buffer: { data: Uint8ClampedArray; width: number; height: number } | null) => void;
}

export const useVideoScopesStore = create<VideoScopesState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen }),
  toggleIsOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  scopeType: 'waveform',
  setScopeType: (scopeType) => set({ scopeType }),

  intensity: 0.75,
  setIntensity: (intensity) => set({ intensity }),

  showGraticule: true,
  setShowGraticule: (showGraticule) => set({ showGraticule }),

  showSkinToneLine: true,
  setShowSkinToneLine: (showSkinToneLine) => set({ showSkinToneLine }),

  frameBuffer: null,
  setFrameBuffer: (frameBuffer) => set({ frameBuffer }),
}));
