/**
 * Milestone S160 — Stylus Capture & Live Vector Recording Store.
 *
 * Manages live drawing mode, active nib & color settings, real-time recording session,
 * and captured stroke arrays ready to commit to the timeline.
 */

import { create } from 'zustand';
import {
  DEFAULT_TOOL_COLORS,
  DEFAULT_TOOL_SIZES,
  type RecordedStroke,
  type StylusNibTool,
} from '@shared';

export interface StylusCaptureState {
  isStylusModeActive: boolean;
  isRecording: boolean;
  activeTool: StylusNibTool;
  activeColor: string;
  activeSize: number;
  foleyEnabled: boolean;
  foleyVolume: number;
  syncWithPlayback: boolean;
  smoothing: 'none' | 'subtle' | 'smooth';

  // Recorded Session Data
  recordedStrokes: RecordedStroke[];
  sessionStartFrame: number;
  sessionEndFrame: number;
  sessionFps: number;

  // Actions
  openStylusMode: () => void;
  closeStylusMode: () => void;
  setTool: (tool: StylusNibTool) => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  setFoleyEnabled: (enabled: boolean) => void;
  setFoleyVolume: (volume: number) => void;
  setSyncWithPlayback: (sync: boolean) => void;
  setSmoothing: (smoothing: 'none' | 'subtle' | 'smooth') => void;

  startRecording: (startFrame: number, fps: number) => void;
  stopRecording: (endFrame: number) => void;
  addStroke: (stroke: RecordedStroke) => void;
  undoStroke: () => void;
  clearStrokes: () => void;
}

export const useStylusCaptureStore = create<StylusCaptureState>((set) => ({
  isStylusModeActive: false,
  isRecording: false,
  activeTool: 'marker',
  activeColor: DEFAULT_TOOL_COLORS.marker,
  activeSize: DEFAULT_TOOL_SIZES.marker,
  foleyEnabled: true,
  foleyVolume: 0.65,
  syncWithPlayback: true,
  smoothing: 'smooth',

  recordedStrokes: [],
  sessionStartFrame: 0,
  sessionEndFrame: 0,
  sessionFps: 30,

  openStylusMode: () =>
    set({
      isStylusModeActive: true,
    }),

  closeStylusMode: () =>
    set({
      isStylusModeActive: false,
      isRecording: false,
      recordedStrokes: [],
    }),

  setTool: (tool: StylusNibTool) =>
    set((state) => ({
      activeTool: tool,
      activeColor: DEFAULT_TOOL_COLORS[tool] ?? state.activeColor,
      activeSize: DEFAULT_TOOL_SIZES[tool] ?? state.activeSize,
    })),

  setColor: (color: string) => set({ activeColor: color }),

  setSize: (size: number) => set({ activeSize: Math.max(1, Math.min(64, size)) }),

  setFoleyEnabled: (enabled: boolean) => set({ foleyEnabled: enabled }),

  setFoleyVolume: (volume: number) => set({ foleyVolume: Math.max(0, Math.min(1, volume)) }),

  setSyncWithPlayback: (sync: boolean) => set({ syncWithPlayback: sync }),

  setSmoothing: (smoothing) => set({ smoothing }),

  startRecording: (startFrame: number, fps: number) =>
    set({
      isRecording: true,
      sessionStartFrame: Math.max(0, startFrame),
      sessionEndFrame: Math.max(0, startFrame),
      sessionFps: Math.max(1, fps),
      recordedStrokes: [],
    }),

  stopRecording: (endFrame: number) =>
    set((state) => ({
      isRecording: false,
      sessionEndFrame: Math.max(state.sessionStartFrame + 1, endFrame),
    })),

  addStroke: (stroke: RecordedStroke) =>
    set((state) => ({
      recordedStrokes: [...state.recordedStrokes, stroke],
    })),

  undoStroke: () =>
    set((state) => ({
      recordedStrokes: state.recordedStrokes.slice(0, -1),
    })),

  clearStrokes: () => set({ recordedStrokes: [] }),
}));
