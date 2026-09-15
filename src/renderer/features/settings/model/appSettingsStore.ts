import { create } from 'zustand';

import type { AspectRatioOption, RenderAcceleration } from '@shared';

import { pushThemeToMain, THEME_STORAGE_KEY } from '../../../shared/lib/theme';

export type AppTheme = 'dark' | 'light' | 'oled' | 'cinema' | 'system';
export type AppAccent = 'violet' | 'cyan' | 'amber' | 'emerald' | 'coral';
export type AppDensity = 'standard' | 'compact' | 'relaxed';
export type TimecodeFormat = 'smpte' | 'seconds' | 'frames';

export interface AppSettings {
  // Appearance
  theme: AppTheme;
  accentColor: AppAccent;
  uiDensity: AppDensity;
  timecodeFormat: TimecodeFormat;
  showWaveforms: boolean;
  showFilmstrips: boolean;

  // General & Timeline
  defaultAspectRatio: AspectRatioOption;
  defaultFps: number;
  defaultStillDurationSec: number;
  snappingDefault: boolean;
  magneticDefault: boolean;

  // Performance & GPU
  hardwareAcceleration: RenderAcceleration;
  previewQuality: 'full' | 'half' | 'quarter';

  // Audio
  audioSampleRate: 44100 | 48000;
  duckingSensitivityDb: number;
}

const STORAGE_KEY = 'videostudio_app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: 'violet',
  uiDensity: 'standard',
  timecodeFormat: 'smpte',
  showWaveforms: true,
  showFilmstrips: true,

  defaultAspectRatio: '16:9',
  defaultFps: 30,
  defaultStillDurationSec: 3.0,
  snappingDefault: true,
  magneticDefault: true,

  hardwareAcceleration: 'auto',
  previewQuality: 'full',

  audioSampleRate: 48000,
  duckingSensitivityDb: -12,
};

export function resolveEffectiveTheme(theme: AppTheme): 'dark' | 'light' | 'oled' | 'cinema' {
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }
  return theme;
}

export function applyAppearance(settings: Pick<AppSettings, 'theme' | 'accentColor' | 'uiDensity'>) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = resolveEffectiveTheme(settings.theme);

  if (resolved === 'light') {
    root.setAttribute('data-theme', 'light');
  } else if (resolved === 'oled') {
    root.setAttribute('data-theme', 'oled');
  } else if (resolved === 'cinema') {
    root.setAttribute('data-theme', 'cinema');
  } else {
    root.removeAttribute('data-theme');
  }

  root.setAttribute('data-accent', settings.accentColor);
  root.setAttribute('data-density', settings.uiDensity);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, resolved === 'light' ? 'light' : 'dark');
    pushThemeToMain(
      settings.theme === 'light' ? 'light' : 'dark',
      resolved === 'light' ? 'light' : 'dark',
    );
  } catch {
    // Ignore in non-electron or sandbox environments
  }
}

function readStoredSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

interface AppSettingsState extends AppSettings {
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const initialSettings = readStoredSettings();
applyAppearance(initialSettings);

export const useAppSettingsStore = create<AppSettingsState>((set) => ({
  ...initialSettings,

  updateSettings: (patch) => {
    set((state) => {
      const next = { ...state, ...patch };
      try {
        const { updateSettings, resetSettings, ...clean } = next;
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      } catch {
        // Ignore storage errors
      }
      applyAppearance(next);
      return next;
    });
  },

  resetSettings: () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    applyAppearance(DEFAULT_SETTINGS);
    set({ ...DEFAULT_SETTINGS });
  },
}));
