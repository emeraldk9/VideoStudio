import { create } from 'zustand';

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
}));
