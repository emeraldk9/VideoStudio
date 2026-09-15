import { useCallback, useEffect, useState } from 'react';

/**
 * Beta S145 — reads design-system colours for code that cannot use CSS.
 *
 * **A `<canvas>` takes no Tailwind classes and no CSS custom properties.**
 * Colours reach it as JS strings, so hardcoding them breaks the light theme
 * (Beta S141) while `typecheck`, `lint`, `dep-check` and `test` all stay green
 * — the identical silent-failure mode `index.css` already warns about for
 * `@theme inline`. Every colour the waveform and ruler draw with comes from
 * here, and `tests/unit/renderer/timeline-canvas-tokens.test.ts` asserts the
 * draw code contains no literal.
 *
 * The redraw signal is a **`MutationObserver` on `<html>`'s `data-theme`**,
 * deliberately not `shellStore`. `shellStore.theme` holds the *preference*, so
 * under `'system'` an OS light/dark flip changes the DOM attribute and the
 * store not at all — a store subscription would leave the waveform painted in
 * the old theme until something else re-rendered it. `applyThemeAttribute` is
 * the single chokepoint every path goes through (boot script, `setTheme`,
 * `syncResolvedTheme`), which makes the attribute the honest signal.
 */
export function useThemeTokens(): { read: (token: string) => string; themeVersion: number } {
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((version) => version + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const read = useCallback((token: string): string => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    // A missing token means a typo or a renamed variable. Returning the token
    // name would paint nothing; `currentColor` at least draws something visible
    // so the mistake surfaces in review rather than as an invisible waveform.
    return value || 'currentColor';
  }, []);

  return { read, themeVersion };
}
