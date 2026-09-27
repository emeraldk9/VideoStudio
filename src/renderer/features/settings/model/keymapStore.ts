import { create } from 'zustand';

import {
  ALL_NLE_PROFILES,
  findKeymapConflicts,
  type KeyBinding,
  type KeymapConflict,
  type NleProfileId,
  type TimelineActionId,
} from '@shared';

const KEYMAP_PROFILE_STORAGE_KEY = 'videostudio_keymap_profile';
const KEYMAP_OVERRIDES_STORAGE_KEY = 'videostudio_keymap_overrides';

function loadStoredProfile(): NleProfileId {
  try {
    const raw = localStorage.getItem(KEYMAP_PROFILE_STORAGE_KEY);
    if (raw && raw in ALL_NLE_PROFILES) {
      return raw as NleProfileId;
    }
  } catch {
    // Ignore localStorage access failures
  }
  return 'videostudio';
}

function loadStoredOverrides(): Partial<Record<TimelineActionId, KeyBinding[]>> {
  try {
    const raw = localStorage.getItem(KEYMAP_OVERRIDES_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Partial<Record<TimelineActionId, KeyBinding[]>>;
    }
  } catch {
    // Ignore parse error
  }
  return {};
}

function computeEffective(
  profileId: NleProfileId,
  overrides: Partial<Record<TimelineActionId, KeyBinding[]>>,
): Record<TimelineActionId, KeyBinding[]> {
  const profile = ALL_NLE_PROFILES[profileId] ?? ALL_NLE_PROFILES.videostudio;
  return {
    ...profile.bindings,
    ...overrides,
  };
}

export interface KeymapState {
  activeProfile: NleProfileId;
  customOverrides: Partial<Record<TimelineActionId, KeyBinding[]>>;
  effectiveBindings: Record<TimelineActionId, KeyBinding[]>;
  conflicts: KeymapConflict[];
  searchQuery: string;
  isModalOpen: boolean;

  setProfile: (profile: NleProfileId) => void;
  rebindAction: (actionId: TimelineActionId, bindings: KeyBinding[]) => void;
  resetAction: (actionId: TimelineActionId) => void;
  resetToProfileDefaults: () => void;
  setSearchQuery: (query: string) => void;
  openModal: () => void;
  closeModal: () => void;
}

const initialProfile = loadStoredProfile();
const initialOverrides = loadStoredOverrides();
const initialEffective = computeEffective(initialProfile, initialOverrides);
const initialConflicts = findKeymapConflicts(initialEffective);

export const useKeymapStore = create<KeymapState>((set, get) => ({
  activeProfile: initialProfile,
  customOverrides: initialOverrides,
  effectiveBindings: initialEffective,
  conflicts: initialConflicts,
  searchQuery: '',
  isModalOpen: false,

  setProfile: (profile) => {
    try {
      localStorage.setItem(KEYMAP_PROFILE_STORAGE_KEY, profile);
    } catch {
      // Storage unavailable
    }
    const state = get();
    const effective = computeEffective(profile, state.customOverrides);
    const conflicts = findKeymapConflicts(effective);
    set({
      activeProfile: profile,
      effectiveBindings: effective,
      conflicts,
    });
  },

  rebindAction: (actionId, bindings) => {
    const state = get();
    const nextOverrides = {
      ...state.customOverrides,
      [actionId]: bindings,
    };
    try {
      localStorage.setItem(KEYMAP_OVERRIDES_STORAGE_KEY, JSON.stringify(nextOverrides));
    } catch {
      // Storage unavailable
    }
    const effective = computeEffective(state.activeProfile, nextOverrides);
    const conflicts = findKeymapConflicts(effective);
    set({
      customOverrides: nextOverrides,
      effectiveBindings: effective,
      conflicts,
    });
  },

  resetAction: (actionId) => {
    const state = get();
    const nextOverrides = { ...state.customOverrides };
    delete nextOverrides[actionId];
    try {
      localStorage.setItem(KEYMAP_OVERRIDES_STORAGE_KEY, JSON.stringify(nextOverrides));
    } catch {
      // Storage unavailable
    }
    const effective = computeEffective(state.activeProfile, nextOverrides);
    const conflicts = findKeymapConflicts(effective);
    set({
      customOverrides: nextOverrides,
      effectiveBindings: effective,
      conflicts,
    });
  },

  resetToProfileDefaults: () => {
    try {
      localStorage.removeItem(KEYMAP_OVERRIDES_STORAGE_KEY);
    } catch {
      // Storage unavailable
    }
    const state = get();
    const effective = computeEffective(state.activeProfile, {});
    const conflicts = findKeymapConflicts(effective);
    set({
      customOverrides: {},
      effectiveBindings: effective,
      conflicts,
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));
