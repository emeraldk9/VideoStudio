import type { ResolvedTheme, ThemePreference } from '@shared';

import { readLocalSetting } from './localSetting';

/**
 * Beta Step 141 — the appearance theme, as the renderer sees it.
 *
 * The storage key and the resolution rule are duplicated, deliberately and
 * exactly once, in the inline boot script in `index.html`. That script has to
 * run before the stylesheet paints anything, which rules out importing from
 * here — so `tests/unit/renderer/shared/theme.test.ts` asserts the two agree
 * rather than trusting a comment to keep them in step.
 */

export const THEME_STORAGE_KEY = 'ai_video_studio_theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

/** The stored preference, defaulting to `'system'` for a first run. */
export function readStoredTheme(): ThemePreference {
  const stored = readLocalSetting(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : 'system';
}

/**
 * Resolves `'system'` against the OS.
 *
 * `prefers-color-scheme` is truthful here only because the main process never
 * writes `nativeTheme.themeSource` — that setting is global to the Electron app
 * and would also flip the embedded Flow session. See `main/windows/theme-store.ts`.
 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'dark' || preference === 'light') {
    return preference;
  }
  // Beta S155 — `'system'` outside a DOM resolves to the palette the token
  // file treats as its base, rather than throwing. `shellStore` calls this at
  // module load, so anything that transitively imports the shell (the Voice
  // entity's run announcer, for one) would otherwise die on import.
  if (typeof window === 'undefined') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Stamps the resolved theme on `<html>`.
 *
 * Dark is the default `:root` block in `tokens/colors.css` and carries no
 * attribute, so switching to it *removes* the attribute rather than setting
 * `data-theme="dark"`. Either would work for the CSS; removing keeps the DOM
 * honest about which palette is the base one.
 */
export function applyThemeAttribute(resolved: ResolvedTheme): void {
  if (resolved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * Hands the theme to main so it can restyle the native title-bar overlay.
 *
 * The OS paints the minimise/maximise/close buttons, so the *only* way to
 * recolour them is `BaseWindow.setTitleBarOverlay` in the main process — no
 * amount of CSS reaches them. That makes this push the sole mechanism keeping
 * the window controls in step with the theme, and a silent failure here is
 * exactly the bug it produces: a light app wearing a black title bar.
 *
 * So it is deliberately loud. The first cut used
 * `void window.api?.browser?.setTheme?.(…)`, which had two ways to fail
 * invisibly — optional chaining turns a missing bridge method into a no-op, and
 * `void` on a rejecting `invoke` is an unhandled rejection rather than a
 * reported error. Both are the *expected* state when only the renderer has
 * reloaded: the preload bundle and the main process do not hot-reload, so the
 * bridge method and the IPC handler are both absent until a full restart.
 */
export function pushThemeToMain(preference: ThemePreference, resolved: ResolvedTheme): void {
  // `'setTheme' in browser` rather than reading the property: pulling the method
  // off its object to typeof-check it is exactly what `@typescript-eslint/
  // unbound-method` forbids, and the call below must stay a method call anyway.
  const browser = (window.api as any)?.browser;
  if (!browser || !('setTheme' in browser)) {
    console.warn(
      '[theme] window.api.browser.setTheme is missing — the native title bar will keep its previous colours. ' +
        'Expected after a renderer-only reload; restart the app so the preload bundle rebuilds.',
    );
    return;
  }
  void browser.setTheme({ preference, resolved }).catch((error: unknown) => {
    console.warn('[theme] main rejected the theme push; native title bar unchanged', error);
  });
}
