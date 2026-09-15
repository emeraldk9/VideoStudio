export const DEFAULT_PROJECT_ID = 'default';

export type AspectRatioOption = '16:9' | '9:16' | '1:1' | '4:5' | '21:9';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  aspectRatio: AspectRatioOption;
  fps: number;
  width: number;
  height: number;
}
