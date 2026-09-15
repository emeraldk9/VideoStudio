import { useCallback, useState } from 'react';

import {
  EFFECT_PRESETS,
  buildCssFilter,
  secondsToFrames,
  type EffectPreset,
} from '@shared';

import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { ensureOverlayTrack } from '../lib/ensure-free-track';
import { beginTimelineDrag } from '../lib/timeline-drag';

/**
 * Beta S157 (owner items 9 & 16) — the Effects category: the preset library
 * as a card grid, CapCut-shaped.
 *
 * Each card previews its own look — the same swatch under the preset's
 * `buildCssFilter`, so the card and the preview cannot describe two different
 * grades. Click adds an effect clip at the playhead on the topmost plain
 * overlay lane (minting "Effects" when none exists — `ensureOverlayTrack`;
 * text lanes are typed and excluded since S165); drag carries
 * `{kind: 'effect', presetId}` for the lanes' drop targets, so an effect can
 * be aimed at a specific track too.
 *
 * A plain CSS grid rather than `MediaGrid`'s virtualizer: a dozen presets
 * never need windowing, and these cards are square-ish rather than 16:9.
 */

export const EFFECT_CLIP_DEFAULT_SECONDS = 3;

function EffectCard({ preset, onAdd }: { preset: EffectPreset; onAdd: (preset: EffectPreset) => void }) {
  const filter = buildCssFilter({ filters: preset.filters }) || undefined;
  return (
    <button
      type="button"
      title={`${preset.label} — click to add at the playhead, or drag onto a track`}
      draggable
      className="group flex flex-col gap-1 text-left"
      onClick={() => onAdd(preset)}
      // S200 — the pool's one drag helper (payload, ghost, in-flight mirror).
      onDragStart={(event) =>
        beginTimelineDrag(event, [{ kind: 'effect', presetId: preset.id, label: preset.label }])
      }
    >
      <span
        aria-hidden="true"
        className="relative aspect-video overflow-hidden rounded-[var(--radius-button)] transition-transform duration-100 group-hover:scale-[1.03]"
      >
        {/* The swatch: a fixed scene-like gradient every preset recolours
            (`--media-swatch-*`, unthemed content tokens). One shared source
            image would be nicer; a gradient needs no asset and still
            separates warm from cool from mono at a glance. */}
        <span
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, var(--media-swatch-sky) 0%, var(--media-swatch-sand) 45%, var(--media-swatch-clay) 75%, var(--media-swatch-dusk) 100%)',
            filter,
          }}
        />
      </span>
      <span className="truncate text-[11px] text-text-secondary group-hover:text-text-primary">
        {preset.label}
      </span>
    </button>
  );
}

export function EffectsPane() {
  const document = useSequenceStore((state) => state.document);
  const [busy, setBusy] = useState(false);

  const handleAdd = useCallback(async (preset: EffectPreset) => {
    setBusy(true);
    try {
      // S165 — a plain overlay lane; text lanes are typed and off-limits here.
      const trackId = await ensureOverlayTrack('Effects');
      const state = useSequenceStore.getState();
      if (!trackId || !state.document) return;
      const fps = state.document.sequence.fps;
      state.commitClips([
        ...state.document.clips,
        {
          id: crypto.randomUUID(),
          sequenceId: state.document.sequence.id,
          trackId,
          orderIndex: state.document.clips.filter((clip) => clip.trackId === trackId).length,
          sourceKind: 'effect',
          outputId: null,
          storyShotId: null,
          sourceTakeId: null,
          filePath: null,
          startFrames: currentPlayheadFrame(),
          durationFrames: Math.max(1, secondsToFrames(EFFECT_CLIP_DEFAULT_SECONDS, fps)),
          sourceInFrames: null,
          sourceOutFrames: null,
          transitionIn: 'cut',
          transitionFrames: 0,
          motionPreset: 'none',
          gainDb: 0,
          fadeInFrames: 0,
          fadeOutFrames: 0,
          label: preset.label,
          overrides: [],
          effects: { filters: { ...preset.filters } },
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!document) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div
        className={`grid gap-2 ${busy ? 'pointer-events-none opacity-70' : ''}`}
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}
      >
        {EFFECT_PRESETS.map((preset) => (
          <EffectCard key={preset.id} preset={preset} onAdd={(entry) => void handleAdd(entry)} />
        ))}
      </div>
      <p className="text-xs text-text-disabled">
        An effect clip grades everything beneath it for its stretch of the timeline. Trim and move
        it like any clip; fine-tune its look in the inspector. Sharpen and vignette appear in the
        export.
      </p>
    </div>
  );
}
