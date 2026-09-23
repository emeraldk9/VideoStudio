import { create } from 'zustand';
import {
  type DuckingSettings,
  DEFAULT_DUCKING_SETTINGS,
  type AudioEqualizerSettings,
  DEFAULT_AUDIO_EQ_SETTINGS,
  type AudioCompressorSettings,
  DEFAULT_COMPRESSOR_SETTINGS,
  COMPRESSOR_PRESETS,
  type SubmixBusState,
  createDefaultSubmixBusState,
} from '@shared';

export interface TrackMixerState {
  volumeDb: number; // -60 to +6 dB, default 0 dB
  pan: number;      // -100 to +100, default 0 (center)
  mute: boolean;
  solo: boolean;
}

export interface AudioMixerState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  toggleIsOpen: () => void;
  masterVolumeDb: number;
  masterLimiter: boolean;
  setMasterVolumeDb: (db: number) => void;
  setMasterLimiter: (enabled: boolean) => void;
  trackMixer: Record<string, TrackMixerState>;
  setTrackVolume: (trackId: string, db: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  resetTrack: (trackId: string) => void;
  resetAllFaders: () => void;
  ducking: DuckingSettings;
  setDucking: (patch: Partial<DuckingSettings>) => void;
  resetDucking: () => void;
  currentGainReductionDb: number;
  setCurrentGainReductionDb: (db: number) => void;
  trackEq: Record<string, AudioEqualizerSettings>;
  setTrackEq: (trackId: string, patch: Partial<AudioEqualizerSettings>) => void;
  resetTrackEq: (trackId: string) => void;
  activeEqTrackId: string | null;
  setActiveEqTrackId: (trackId: string | null) => void;
  trackCompressor: Record<string, AudioCompressorSettings>;
  setTrackCompressor: (trackId: string, patch: Partial<AudioCompressorSettings>) => void;
  resetTrackCompressor: (trackId: string) => void;
  activeDynTrackId: string | null;
  setActiveDynTrackId: (trackId: string | null) => void;

  // S63 — Submix Auxiliary Buses & Track Routing Engine
  trackBusRouting: Record<string, string>;
  setTrackBusRouting: (trackId: string, busId: string) => void;
  submixBuses: Record<string, SubmixBusState>;
  setBusVolume: (busId: string, db: number) => void;
  setBusPan: (busId: string, pan: number) => void;
  toggleBusMute: (busId: string) => void;
  toggleBusSolo: (busId: string) => void;
  setBusEq: (busId: string, patch: Partial<AudioEqualizerSettings>) => void;
  resetBusEq: (busId: string) => void;
  setBusCompressor: (busId: string, patch: Partial<AudioCompressorSettings>) => void;
  resetBusCompressor: (busId: string) => void;
  activeBusEqId: string | null;
  setActiveBusEqId: (busId: string | null) => void;
  activeBusDynId: string | null;
  setActiveBusDynId: (busId: string | null) => void;
  resetBus: (busId: string) => void;
  resetAllBuses: () => void;

  // S63 — Master Glue Compressor
  masterCompressor: AudioCompressorSettings;
  setMasterCompressor: (patch: Partial<AudioCompressorSettings>) => void;
  resetMasterCompressor: () => void;
  showMasterCompressor: boolean;
  setShowMasterCompressor: (show: boolean) => void;
}

export const useAudioMixerStore = create<AudioMixerState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen }),
  toggleIsOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  masterVolumeDb: 0,
  masterLimiter: true,
  setMasterVolumeDb: (masterVolumeDb) => set({ masterVolumeDb }),
  setMasterLimiter: (masterLimiter) => set({ masterLimiter }),

  trackMixer: {},

  setTrackVolume: (trackId, volumeDb) =>
    set((state) => {
      const current = state.trackMixer[trackId] ?? { volumeDb: 0, pan: 0, mute: false, solo: false };
      return {
        trackMixer: {
          ...state.trackMixer,
          [trackId]: { ...current, volumeDb },
        },
      };
    }),

  setTrackPan: (trackId, pan) =>
    set((state) => {
      const current = state.trackMixer[trackId] ?? { volumeDb: 0, pan: 0, mute: false, solo: false };
      return {
        trackMixer: {
          ...state.trackMixer,
          [trackId]: { ...current, pan },
        },
      };
    }),

  toggleTrackMute: (trackId) =>
    set((state) => {
      const current = state.trackMixer[trackId] ?? { volumeDb: 0, pan: 0, mute: false, solo: false };
      return {
        trackMixer: {
          ...state.trackMixer,
          [trackId]: { ...current, mute: !current.mute },
        },
      };
    }),

  toggleTrackSolo: (trackId) =>
    set((state) => {
      const current = state.trackMixer[trackId] ?? { volumeDb: 0, pan: 0, mute: false, solo: false };
      return {
        trackMixer: {
          ...state.trackMixer,
          [trackId]: { ...current, solo: !current.solo },
        },
      };
    }),

  resetTrack: (trackId) =>
    set((state) => {
      const next = { ...state.trackMixer };
      delete next[trackId];
      return { trackMixer: next };
    }),

  resetAllFaders: () =>
    set({
      masterVolumeDb: 0,
      trackMixer: {},
      submixBuses: {},
    }),

  ducking: DEFAULT_DUCKING_SETTINGS,
  setDucking: (patch) =>
    set((state) => ({
      ducking: { ...state.ducking, ...patch },
    })),
  resetDucking: () => set({ ducking: DEFAULT_DUCKING_SETTINGS }),

  currentGainReductionDb: 0,
  setCurrentGainReductionDb: (currentGainReductionDb) => set({ currentGainReductionDb }),

  trackEq: {},
  setTrackEq: (trackId, patch) =>
    set((state) => {
      const current = state.trackEq[trackId] ?? DEFAULT_AUDIO_EQ_SETTINGS;
      return {
        trackEq: {
          ...state.trackEq,
          [trackId]: { ...current, ...patch },
        },
      };
    }),
  resetTrackEq: (trackId) =>
    set((state) => {
      const next = { ...state.trackEq };
      delete next[trackId];
      return { trackEq: next };
    }),

  activeEqTrackId: null,
  setActiveEqTrackId: (activeEqTrackId) => set({ activeEqTrackId }),

  trackCompressor: {},
  setTrackCompressor: (trackId, patch) =>
    set((state) => {
      const current = state.trackCompressor[trackId] ?? DEFAULT_COMPRESSOR_SETTINGS;
      return {
        trackCompressor: {
          ...state.trackCompressor,
          [trackId]: { ...current, ...patch },
        },
      };
    }),
  resetTrackCompressor: (trackId) =>
    set((state) => {
      const next = { ...state.trackCompressor };
      delete next[trackId];
      return { trackCompressor: next };
    }),

  activeDynTrackId: null,
  setActiveDynTrackId: (activeDynTrackId) => set({ activeDynTrackId }),

  // S63 — Submix Auxiliary Buses & Track Routing Engine
  trackBusRouting: {},
  setTrackBusRouting: (trackId, busId) =>
    set((state) => ({
      trackBusRouting: {
        ...state.trackBusRouting,
        [trackId]: busId,
      },
    })),

  submixBuses: {},
  setBusVolume: (busId, volumeDb) =>
    set((state) => {
      const current = state.submixBuses[busId] ?? createDefaultSubmixBusState();
      return {
        submixBuses: {
          ...state.submixBuses,
          [busId]: { ...current, volumeDb },
        },
      };
    }),

  setBusPan: (busId, pan) =>
    set((state) => {
      const current = state.submixBuses[busId] ?? createDefaultSubmixBusState();
      return {
        submixBuses: {
          ...state.submixBuses,
          [busId]: { ...current, pan },
        },
      };
    }),

  toggleBusMute: (busId) =>
    set((state) => {
      const current = state.submixBuses[busId] ?? createDefaultSubmixBusState();
      return {
        submixBuses: {
          ...state.submixBuses,
          [busId]: { ...current, mute: !current.mute },
        },
      };
    }),

  toggleBusSolo: (busId) =>
    set((state) => {
      const current = state.submixBuses[busId] ?? createDefaultSubmixBusState();
      return {
        submixBuses: {
          ...state.submixBuses,
          [busId]: { ...current, solo: !current.solo },
        },
      };
    }),

  setBusEq: (busId, patch) =>
    set((state) => {
      const current = state.submixBuses[busId] ?? createDefaultSubmixBusState();
      const currentEq = current.eq ?? { ...DEFAULT_AUDIO_EQ_SETTINGS, enabled: false };
      return {
        submixBuses: {
          ...state.submixBuses,
          [busId]: {
            ...current,
            eq: { ...currentEq, ...patch },
          },
        },
      };
    }),

  resetBusEq: (busId) =>
    set((state) => {
      const current = state.submixBuses[busId] ?? createDefaultSubmixBusState();
      return {
        submixBuses: {
          ...state.submixBuses,
          [busId]: {
            ...current,
            eq: { ...DEFAULT_AUDIO_EQ_SETTINGS, enabled: false },
          },
        },
      };
    }),

  setBusCompressor: (busId, patch) =>
    set((state) => {
      const current = state.submixBuses[busId] ?? createDefaultSubmixBusState();
      const currentComp = current.compressor ?? { ...DEFAULT_COMPRESSOR_SETTINGS, enabled: false };
      return {
        submixBuses: {
          ...state.submixBuses,
          [busId]: {
            ...current,
            compressor: { ...currentComp, ...patch },
          },
        },
      };
    }),

  resetBusCompressor: (busId) =>
    set((state) => {
      const current = state.submixBuses[busId] ?? createDefaultSubmixBusState();
      return {
        submixBuses: {
          ...state.submixBuses,
          [busId]: {
            ...current,
            compressor: { ...DEFAULT_COMPRESSOR_SETTINGS, enabled: false },
          },
        },
      };
    }),

  activeBusEqId: null,
  setActiveBusEqId: (activeBusEqId) => set({ activeBusEqId }),

  activeBusDynId: null,
  setActiveBusDynId: (activeBusDynId) => set({ activeBusDynId }),

  resetBus: (busId) =>
    set((state) => {
      const next = { ...state.submixBuses };
      delete next[busId];
      return { submixBuses: next };
    }),

  resetAllBuses: () =>
    set({
      submixBuses: {},
    }),

  // S63 — Master Glue Compressor
  masterCompressor: {
    ...COMPRESSOR_PRESETS.gentle_master_glue.settings,
    enabled: false,
  },
  setMasterCompressor: (patch) =>
    set((state) => ({
      masterCompressor: { ...state.masterCompressor, ...patch },
    })),
  resetMasterCompressor: () =>
    set({
      masterCompressor: {
        ...COMPRESSOR_PRESETS.gentle_master_glue.settings,
        enabled: false,
      },
    }),
  showMasterCompressor: false,
  setShowMasterCompressor: (showMasterCompressor) => set({ showMasterCompressor }),
}));
