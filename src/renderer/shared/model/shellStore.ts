import { create } from 'zustand';

import type { ThemePreference } from '@shared';

import { writeLocalSetting } from '../lib/localSetting';
import {
  applyThemeAttribute,
  pushThemeToMain,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
} from '../lib/theme';

export interface ShellState {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  themePreference: readStoredTheme(),

  setThemePreference: (preference: ThemePreference) => {
    writeLocalSetting(THEME_STORAGE_KEY, preference);
    const resolved = resolveTheme(preference);
    applyThemeAttribute(resolved);
    pushThemeToMain(preference, resolved);
    set({ themePreference: preference });
  },
}));
