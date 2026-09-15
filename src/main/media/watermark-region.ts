import {
  detectWatermarkConfig,
  calculateWatermarkPosition,
} from '@pilio/gemini-watermark-remover/image-data';

import type {
  NormalizedRect,
  PixelRect,
  WatermarkPresetId,
  WatermarkPresetSummary,
  WatermarkRegionSpec,
} from '../../shared/types/watermark';

/**
 * Beta S235 — where the watermark is, for one image or frame.
 *
 * ## Why this delegates rather than reimplements
 *
 * The Veo diamond's geometry is not a formula anyone should retype: the
 * upstream catalogue carries a reference 1920x1080 pair, projects it to other
 * resolutions by long-side scale, *and* holds exact-size exceptions that the
 * projection would otherwise get wrong (720p has a 44px "compact" variant at
 * margin 29/40 that is not 1080p's 72px scaled by anything). So `veo-diamond`
 * asks `resolveVideoWatermarkCandidates`, and `gemini-still` asks
 * `detectWatermarkConfig`/`calculateWatermarkPosition`. We own only the Veo
 * text geometry — whose margins are absolute rather than projected — and the
 * manual box.
 *
 * ## The clamping rule
 *
 * Every rect leaving this module is guaranteed to sit inside the image with at
 * least one pixel of extent. That is not defensive habit: these rects go
 * straight into an ffmpeg `crop=`/`delogo=` filter string and into a raw
 * `Uint8ClampedArray` index. A negative origin is a malformed subprocess
 * argument, and an out-of-bounds index silently reads a neighbouring row. Same
 * discipline `sheet-crop.ts` states for its crops, and for the same reason.
 */

/**
 * Beta S235 — what the UI lists.
 *
 * The shape itself lives in `@shared/types/watermark` because it crosses IPC;
 * this alias keeps the local name that reads better at the call sites here.
 */
export type WatermarkPresetDef = WatermarkPresetSummary;

/**
 * The Veo text marks.
 *
 * Margins here are **absolute pixels, not reference-scaled** — verified against
 * real 1280x720 Flow output in Phase 0 (§2.5): 1280 - 15 - 23 = 1242 and
 * 720 - 16 - 10 = 694, which is exactly where the detector found it at NCC
 * 0.98. Do not "fix" these by scaling them to the frame.
 */
const VEO_TEXT_GEOMETRY: Record<string, { width: number; height: number; marginRight: number; marginBottom: number }> = {
  'veo-text-23x10': { width: 23, height: 10, marginRight: 15, marginBottom: 16 },
  'veo-text-68x30': { width: 68, height: 30, marginRight: 44, marginBottom: 48 },
  'veo-text-99x43': { width: 99, height: 43, marginRight: 64, marginBottom: 68 },
};

export const WATERMARK_PRESETS: readonly WatermarkPresetDef[] = Object.freeze([
  {
    id: 'auto',
    label: 'Detect the mark',
    family: 'auto',
    hasAlphaTemplate: true,
    hint: 'Scores every known mark on the item itself and removes the one it finds. Skips items with none.',
  },
  {
    id: 'gemini-auto',
    label: 'Gemini image badge',
    family: 'gemini-still',
    hasAlphaTemplate: true,
    hint: 'Bottom-right badge on generated stills. Size follows the output resolution.',
  },
  {
    id: 'veo-text-23x10',
    label: 'Veo text mark (small)',
    family: 'veo-text',
    hasAlphaTemplate: true,
    hint: 'The 23x10 wordmark. Most common on 720p Flow clips.',
  },
  {
    id: 'veo-text-68x30',
    label: 'Veo text mark (medium)',
    family: 'veo-text',
    hasAlphaTemplate: true,
    hint: 'The 68x30 wordmark.',
  },
  {
    id: 'veo-text-99x43',
    label: 'Veo text mark (large)',
    family: 'veo-text',
    hasAlphaTemplate: true,
    hint: 'The 99x43 wordmark.',
  },
  {
    id: 'veo-diamond-auto',
    label: 'Veo diamond logo',
    family: 'veo-diamond',
    hasAlphaTemplate: true,
    hint: 'The square diamond on Flow clips. For a generated still, use the Gemini badge.',
  },
  {
    id: 'manual',
    label: 'Draw a box',
    family: 'manual',
    hasAlphaTemplate: false,
    hint: 'Anything else. Filled rather than unblended, since there is no template to invert.',
  },
]);

export function presetById(id: WatermarkPresetId): WatermarkPresetDef | null {
  return WATERMARK_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Forces a rect inside `width`x`height` with a non-zero extent.
 *
 * Origin is clamped first, then extent against the remaining room, so a box
 * that starts past the right edge collapses to a legal 1px rect at the edge
 * rather than to a negative width.
 */
export function clampRect(rect: PixelRect, width: number, height: number): PixelRect {
  const imgW = Math.max(1, Math.floor(width));
  const imgH = Math.max(1, Math.floor(height));
  const x = Math.max(0, Math.min(imgW - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(imgH - 1, Math.round(rect.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(imgW - x, Math.round(rect.width))),
    height: Math.max(1, Math.min(imgH - y, Math.round(rect.height))),
  };
}

/** Normalized 0..1 box to real pixels, clamped. */
export function rectFromNormalized(rect: NormalizedRect, width: number, height: number): PixelRect {
  const w = Math.max(0, Math.min(1, rect.w));
  const h = Math.max(0, Math.min(1, rect.h));
  return clampRect(
    {
      x: Math.max(0, Math.min(1, rect.x)) * width,
      y: Math.max(0, Math.min(1, rect.y)) * height,
      width: w * width,
      height: h * height,
    },
    width,
    height,
  );
}

/** Pixels back to normalized, for storing a drawn box that must survive a resolution change. */
export function rectToNormalized(rect: PixelRect, width: number, height: number): NormalizedRect {
  const imgW = Math.max(1, width);
  const imgH = Math.max(1, height);
  return {
    x: rect.x / imgW,
    y: rect.y / imgH,
    w: rect.width / imgW,
    h: rect.height / imgH,
  };
}

/**
 * The Gemini still badge — a **hypothesis, not the applied rect**.
 *
 * `detectWatermarkConfig` returns the catalogue's static guess from the output
 * dimensions alone. On real Flow stills that guess is routinely wrong: at
 * 1376x768 it says 48px at (1296, 688), while the adaptive search — which
 * actually looks at the pixels — lands on 53px at (1253, 645) on every one of
 * six real samples. That is 43px away in both axes, far more than the mark's
 * own size.
 *
 * So this rect is only good enough to draw a preview box and to seed a search.
 * The rect that gets *cleaned* comes back from the harness as `meta.position`,
 * alongside the per-image `alphaGain`. A caller that treats this as the answer
 * will confidently repair the wrong patch and leave the watermark in place.
 */
function geminiRect(width: number, height: number): PixelRect | null {
  const config = detectWatermarkConfig(width, height);
  if (!config?.logoSize) return null;
  const pos = calculateWatermarkPosition(width, height, config);
  if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) return null;
  return clampRect(
    { x: pos.x, y: pos.y, width: config.logoSize, height: config.logoSize },
    width,
    height,
  );
}

function veoTextRect(presetId: string, width: number, height: number): PixelRect | null {
  const g = VEO_TEXT_GEOMETRY[presetId];
  if (!g) return null;

  const x = width - g.marginRight - g.width;
  const y = height - g.marginBottom - g.height;
  // A mark that does not fit is **absent**, not clamped. These margins are
  // absolute, so on a frame smaller than the mark plus its inset the origin
  // goes negative — and clamping that to (0,0) would hand back a rect the mark
  // was never at, which the engine would then confidently "clean". Returning
  // null lets the caller skip the item, which is the truthful outcome.
  if (x < 0 || y < 0) return null;

  return clampRect({ x, y, width: g.width, height: g.height }, width, height);
}

/**
 * Resolves a region spec against one image's real dimensions.
 *
 * Returns `null` when the preset has nothing to say about this resolution —
 * a real answer, not a failure. The caller surfaces it as "no watermark found
 * here" and the item is skipped rather than being cleaned at a guessed rect,
 * which would damage a picture to no purpose.
 *
 * **`gemini-auto` returns a hypothesis, not the applied rect** — see
 * `geminiRect`. Veo presets and `manual` return the real thing; only the
 * Gemini still badge needs the search to find its true position.
 *
 * `veo-diamond-auto` intentionally returns only the catalogue's *highest
 * priority* candidate, and `auto` returns nothing at all: choosing between
 * candidates needs pixels. Beta S495 — that decision lives in
 * `watermark-detect.ts`, which scores every candidate on sampled frames; this
 * function is the geometry gate ("could it fit?") and the fallback rect for a
 * fill engine, not the answer to "where is it?".
 */
export function resolveRect(
  spec: WatermarkRegionSpec,
  width: number,
  height: number,
  candidates?: readonly { x?: number; y?: number; width?: number; height?: number }[],
): PixelRect | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;

  if (spec.kind === 'manual') return rectFromNormalized(spec.rect, width, height);

  switch (spec.presetId) {
    case 'gemini-auto':
      return geminiRect(width, height);
    case 'veo-text-23x10':
    case 'veo-text-68x30':
    case 'veo-text-99x43':
      return veoTextRect(spec.presetId, width, height);
    case 'veo-diamond-auto': {
      const top = candidates?.[0];
      if (top == null) return null;
      const { x, y, width: w, height: h } = top;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !w || !h) return null;
      return clampRect({ x: x!, y: y!, width: w, height: h }, width, height);
    }
    default:
      return null;
  }
}

/**
 * Beta S243 — where a **fill** should look for the Gemini mark when the exact
 * search declined.
 *
 * The catalogue rect is a hypothesis, and S235 §6 measured how wrong it can
 * be: `detectWatermarkConfig(1376, 768)` says 48 px at (1296, 688), while the
 * search lands at 53 px at (1253, 645) on every real sample — 43 px away in
 * both axes, more than the mark's own size. While the search *works* that is
 * harmless, because the applied rect comes back from the search. But when the
 * search declines — a faint emboss on flat parchment was the real case — the
 * ladder used to hand the fill engines the hypothesis, and they confidently
 * repaired a patch the diamond is not in. The mark survived a "successful"
 * clean, which is indistinguishable from the tool not working.
 *
 * The observed positions (one day's logs: origins x 1252-1255, y 645-648,
 * sizes 26-53) all sit up-and-left of the hypothesis. Doubling the rect while
 * keeping its **bottom-right corner** covers every one of them with margin,
 * and stays anchored the way the mark itself is — to the frame's corner. A
 * larger mask costs a fill engine nothing it cannot afford: LaMa reconstructs
 * the whole region either way, and `delogo` is the last rung.
 */
export function geminiFillFallbackRect(rect: PixelRect, width: number, height: number): PixelRect {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const w = Math.min(right, rect.width * 2);
  const h = Math.min(bottom, rect.height * 2);
  return {
    x: Math.max(0, Math.min(width - 1, right - w)),
    y: Math.max(0, Math.min(height - 1, bottom - h)),
    width: Math.min(w, width),
    height: Math.min(h, height),
  };
}
