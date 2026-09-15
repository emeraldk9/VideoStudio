/**
 * The Studio's own generation settings, readable by anything that needs to
 * defer to them.
 *
 * **The rule this exists for** (owner, 2026-08-02): *"The image, setting and
 * video setting is just a customised setting on the Story Builder; for other
 * values it should match the rule set up in the Image Studio and Video
 * Studio."* A Story project's settings are **overrides**, not an independent
 * configuration — so anything the project does not state should come from what
 * the user configured in the Studio, and only fall through to the registry's
 * default when the Studio has nothing to say either.
 *
 * Before this, an unset Story setting jumped straight to the registry default,
 * so a user who had set the Video Studio to 9:16 still got 16:9 on every story
 * shot. Two screens in one app disagreeing about the user's own stated
 * preference.
 *
 * ### Resolution order
 *
 * ```
 * project override  →  Studio setting  →  registry default
 * ```
 *
 * Compose it with `firstStated`, which already treats a blank string as "not
 * stated" — the distinction that matters when a stored value was cleared.
 *
 * ### Why localStorage, and why a plain read
 *
 * `ModelSettingsPanel` persists there (it is an app-wide preference that must
 * not travel with a story project's folder, unlike the Story Builder's own
 * settings which do). This module reads the same keys rather than introducing a
 * store: the values change rarely and every consumer is a popover that mounts
 * when it is opened, so a read at render is both current and free. A store
 * would add a synchronisation problem to solve a staleness problem nobody has.
 */

/**
 * Separate keys per media type, matching `ModelSettingsPanel`'s own split: the
 * two modes offer genuinely different option sets (video has 2 aspect ratios to
 * image's 5, and a disjoint model list), so one shared key would restore a
 * value the other mode cannot select.
 *
 * ⚠️ `ModelSettingsPanel` still declares its own copy of these strings. Point it
 * at these constants when that file is next touched — a duplicated storage key
 * is a silent divergence, and the failure mode is the panel writing where
 * nothing reads.
 */
export const STUDIO_SETTINGS_STORAGE_KEYS: Record<'image' | 'video', string> = {
  image: 'ai_video_studio_model_settings',
  video: 'ai_video_studio_model_settings_video',
};

/** Exactly what `ModelSettingsPanel` persists. Every field optional — an older payload may predate any of them. */
export interface StudioSettings {
  aspectRatio?: string;
  modelVariant?: string;
  variations?: number;
  /** Video only, and written only when the selected model actually offers durations. */
  duration?: string;
  /** Beta S269 — video only, and written only when the selected model actually renders a resolution row (today, one model of four). */
  resolution?: string;
}

/**
 * What the user configured in the Studio for this media type, or `{}`.
 *
 * Never throws. A malformed payload — hand-edited, or written by a build that
 * shaped it differently — degrades to "the Studio has no opinion", which lands
 * the caller on the registry default. That is the same value it would have used
 * before this module existed, so a bad read can only ever fail *back* to the
 * previous behaviour rather than into something new.
 */
export function readStudioSettings(mediaType: 'image' | 'video'): StudioSettings {
  try {
    const raw = window.localStorage.getItem(STUDIO_SETTINGS_STORAGE_KEYS[mediaType]);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const { aspectRatio, modelVariant, variations, duration, resolution } = parsed as Record<
      string,
      unknown
    >;
    return {
      aspectRatio: typeof aspectRatio === 'string' ? aspectRatio : undefined,
      modelVariant: typeof modelVariant === 'string' ? modelVariant : undefined,
      // A stored `variations` of `0`, `NaN` or `"3"` is not a count this app
      // ever wrote; treated as absent rather than coerced into a render size.
      variations: typeof variations === 'number' && Number.isFinite(variations) ? variations : undefined,
      duration: typeof duration === 'string' ? duration : undefined,
      resolution: typeof resolution === 'string' ? resolution : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * The Studio setting, but only when the provider still offers it.
 *
 * A preference saved months ago can name an option the registry no longer
 * lists — a retired model, an aspect ratio dropped from a mode. Handing that to
 * a render would produce a click the adapter cannot make, so an unavailable
 * stored value is treated exactly like an absent one.
 */
export function studioSettingIfOffered(stored: string | undefined, offered: readonly string[]): string | undefined {
  if (!stored) return undefined;
  return offered.includes(stored) ? stored : undefined;
}
