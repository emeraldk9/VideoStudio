import { create } from 'zustand';
import type {
  ParadeDisplayMode,
  ScopeRefreshRate,
  VectorscopeTargetMode,
} from '@shared';

export type VideoScopeType = 'all' | 'waveform' | 'parade' | 'vectorscope' | 'histogram';

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

  /** S181: Parade display arrangement (RGB vs YRGB) */
  paradeMode: ParadeDisplayMode;
  setParadeMode: (mode: ParadeDisplayMode) => void;

  /** S181: Vectorscope SMPTE target mode (75% or 100%) */
  vectorscopeTargetMode: VectorscopeTargetMode;
  setVectorscopeTargetMode: (mode: VectorscopeTargetMode) => void;

  /** S181: Skin tone line angle offset degrees (-10 to +10, default 0) */
  skinToneAngleOffset: number;
  setSkinToneAngleOffset: (offset: number) => void;

  /** S181: Highlight clipped highlights and crushed blacks with false-color alert dots */
  highlightGamutAlerts: boolean;
  setHighlightGamutAlerts: (highlight: boolean) => void;

  /** S181: Adaptive scope sampling rate (15, 30, or 60 FPS) */
  scopeFps: ScopeRefreshRate;
  setScopeFps: (fps: ScopeRefreshRate) => void;

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

  paradeMode: 'rgb',
  setParadeMode: (paradeMode) => set({ paradeMode }),

  vectorscopeTargetMode: '75pct',
  setVectorscopeTargetMode: (vectorscopeTargetMode) => set({ vectorscopeTargetMode }),

  skinToneAngleOffset: 0,
  setSkinToneAngleOffset: (skinToneAngleOffset) => set({ skinToneAngleOffset }),

  highlightGamutAlerts: false,
  setHighlightGamutAlerts: (highlightGamutAlerts) => set({ highlightGamutAlerts }),

  scopeFps: 30,
  setScopeFps: (scopeFps) => set({ scopeFps }),

  frameBuffer: null,
  setFrameBuffer: (frameBuffer) => set({ frameBuffer }),
}));
