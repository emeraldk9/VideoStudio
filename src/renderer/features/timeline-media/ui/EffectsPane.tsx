import { useCallback, useMemo, useState } from 'react';

import {
  VIDEO_EFFECT_CATEGORIES,
  VIDEO_EFFECT_PRESETS,
  secondsToFrames,
  type VideoEffectCategory,
  type VideoEffectPreset,
  type VideoEffectSettings,
} from '@shared';

import { currentPlayheadFrame, selectSelectedClip, useSequenceStore } from '../../../entities/sequence';
import { ensureOverlayTrack } from '../lib/ensure-free-track';
import { beginTimelineDrag } from '../lib/timeline-drag';

export const VIDEO_EFFECT_CLIP_DEFAULT_SECONDS = 3;

interface EffectCardProps {
  preset: VideoEffectPreset;
  isActive: boolean;
  canApplyToClip: boolean;
  onAddTrack: (preset: VideoEffectPreset) => void;
  onApplyToClip: (preset: VideoEffectPreset) => void;
}

function EffectCard({
  preset,
  isActive,
  canApplyToClip,
  onAddTrack,
  onApplyToClip,
}: EffectCardProps) {
  return (
    <div
      draggable
      onDragStart={(event) =>
        beginTimelineDrag(event, [{ kind: 'effect', presetId: preset.id, label: preset.label }])
      }
      onClick={() => {
        if (canApplyToClip) {
          onApplyToClip(preset);
        }
      }}
      className={`group relative flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all text-center select-none cursor-pointer ${
        isActive
          ? 'bg-accent-ai/15 ring-1 ring-accent-ai shadow-sm'
          : 'bg-[#121316] hover:bg-[#1a1b20]'
      }`}
    >
      {/* Thumbnail Aspect Square (CapCut standard with animated visual simulation) */}
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-[#0a0b0d]">
        {/* Dynamic Background Simulation Container */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 ${preset.cssClass}`}
          style={{
            background:
              'radial-gradient(circle at 50% 50%, #2a2d36 0%, #16171b 65%, #0d0e11 100%)',
          }}
        >
          {/* Visual Effect Glyph / Motif */}
          <div className="relative flex flex-col items-center justify-center">
            <span
              className={`material-symbols-outlined text-[28px] text-text-primary/80 transition-all group-hover:scale-110 ${
                isActive ? 'text-accent-ai' : 'group-hover:text-white'
              }`}
            >
              {preset.icon}
            </span>
          </div>

          {/* Preset-specific Visual Embellishments */}
          {preset.category === 'light_glitch' && (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-transparent to-pink-500/20 mix-blend-screen opacity-70" />
          )}
          {preset.category === 'retro_film' && (
            <div className="pointer-events-none absolute inset-0 bg-amber-500/10 mix-blend-color-dodge opacity-60" />
          )}
          {preset.category === 'atmosphere' && (
            <div className="pointer-events-none absolute inset-0 bg-blue-400/10 mix-blend-screen opacity-60" />
          )}
        </div>

        {/* Badge (PRO / HOT / NEW) */}
        {preset.badge && (
          <span
            className={`absolute top-1 left-1 flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
              preset.badge === 'PRO'
                ? 'bg-amber-500/90 text-black shadow-xs'
                : preset.badge === 'HOT'
                  ? 'bg-rose-500/90 text-white shadow-xs'
                  : 'bg-emerald-500/90 text-white shadow-xs'
            }`}
          >
            {preset.badge === 'PRO' && (
              <span className="material-symbols-outlined text-[10px]">diamond</span>
            )}
            {preset.badge}
          </span>
        )}

        {/* Active Badge */}
        {isActive && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-ai text-text-on-accent shadow-xs">
            <span className="material-symbols-outlined text-[11px] font-bold">check</span>
          </span>
        )}

        {/* Bottom Right Download / Add Icon (CapCut style) */}
        <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-text-secondary opacity-70 group-hover:opacity-0 transition-opacity">
          <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
        </span>

        {/* Hover Quick Action Buttons */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 opacity-0 backdrop-blur-xs transition-opacity duration-150 group-hover:opacity-100 p-1">
          <button
            type="button"
            title="Add as Adjustment Effect Layer on timeline at playhead"
            onClick={(e) => {
              e.stopPropagation();
              onAddTrack(preset);
            }}
            className="flex w-full items-center justify-center gap-1 rounded bg-white/15 hover:bg-white/25 px-1.5 py-1 text-[10px] font-medium text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[12px]">add</span>
            <span>Track</span>
          </button>

          {canApplyToClip && (
            <button
              type="button"
              title="Apply effect directly to selected clip"
              onClick={(e) => {
                e.stopPropagation();
                onApplyToClip(preset);
              }}
              className="flex w-full items-center justify-center gap-1 rounded bg-accent-ai px-1.5 py-1 text-[10px] font-medium text-text-on-accent hover:brightness-110 transition-all"
            >
              <span className="material-symbols-outlined text-[12px]">auto_fix_high</span>
              <span>Apply</span>
            </button>
          )}
        </div>
      </div>

      {/* Label beneath thumbnail (CapCut style) */}
      <span className="w-full truncate text-[11px] font-normal text-text-secondary group-hover:text-text-primary px-0.5">
        {preset.label}
      </span>
    </div>
  );
}

export function EffectsPane() {
  const document = useSequenceStore((state) => state.document);
  const selectedClip = useSequenceStore(selectSelectedClip);
  const patchClip = useSequenceStore((state) => state.patchClip);
  const [selectedCategory, setSelectedCategory] = useState<VideoEffectCategory>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const canApplyToClip = Boolean(
    selectedClip && (selectedClip.sourceKind === 'video' || selectedClip.sourceKind === 'still' || selectedClip.sourceKind === 'effect'),
  );

  const activeVideoEffect = selectedClip?.effects?.videoEffect;

  const handleAddTrack = useCallback(async (preset: VideoEffectPreset) => {
    setBusy(true);
    try {
      const state = useSequenceStore.getState();
      if (!state.document) return;
      const fps = state.document.sequence.fps;
      const startFrames = currentPlayheadFrame();
      const durationFrames = Math.max(1, secondsToFrames(VIDEO_EFFECT_CLIP_DEFAULT_SECONDS, fps));
      const trackId = await ensureOverlayTrack('Effects', startFrames, durationFrames);
      const fresh = useSequenceStore.getState();
      if (!trackId || !fresh.document) return;

      const newEffect: VideoEffectSettings = {
        id: crypto.randomUUID(),
        presetId: preset.id,
        label: preset.label,
        category: preset.category,
        intensity: preset.defaultIntensity,
        speed: preset.defaultSpeed,
        scale: preset.defaultScale,
        param: preset.defaultParam,
        colorHex: preset.colorHex,
      };

      fresh.commitClips([
        ...fresh.document.clips,
        {
          id: crypto.randomUUID(),
          sequenceId: fresh.document.sequence.id,
          trackId,
          orderIndex: fresh.document.clips.filter((clip) => clip.trackId === trackId).length,
          sourceKind: 'effect',
          outputId: null,
          storyShotId: null,
          sourceTakeId: null,
          filePath: null,
          startFrames,
          durationFrames,
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
          effects: { videoEffect: newEffect },
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleApplyToClip = useCallback(
    (preset: VideoEffectPreset) => {
      if (!selectedClip) return;
      const newEffect: VideoEffectSettings = {
        id: crypto.randomUUID(),
        presetId: preset.id,
        label: preset.label,
        category: preset.category,
        intensity: preset.defaultIntensity,
        speed: preset.defaultSpeed,
        scale: preset.defaultScale,
        param: preset.defaultParam,
        colorHex: preset.colorHex,
      };

      patchClip(selectedClip.id, {
        effects: {
          ...selectedClip.effects,
          videoEffect: newEffect,
        },
      });
    },
    [selectedClip, patchClip],
  );

  const handleUpdateActiveEffect = useCallback(
    (patch: Partial<VideoEffectSettings>) => {
      if (!selectedClip || !activeVideoEffect) return;
      patchClip(selectedClip.id, {
        effects: {
          ...selectedClip.effects,
          videoEffect: {
            ...activeVideoEffect,
            ...patch,
          },
        },
      });
    },
    [selectedClip, activeVideoEffect, patchClip],
  );

  const handleRemoveActiveEffect = useCallback(() => {
    if (!selectedClip) return;
    patchClip(selectedClip.id, {
      effects: {
        ...selectedClip.effects,
        videoEffect: undefined,
      },
    });
  }, [selectedClip, patchClip]);

  const filteredPresets = useMemo(() => {
    return VIDEO_EFFECT_PRESETS.filter((preset) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          preset.label.toLowerCase().includes(q) ||
          preset.description.toLowerCase().includes(q)
        );
      }
      return preset.category === selectedCategory;
    });
  }, [selectedCategory, searchQuery]);

  if (!document) return null;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-canvas text-text-primary select-none">
      {/* CapCut-style Left Category Sub-Sidebar */}
      <aside className="flex w-36 shrink-0 flex-col gap-1 border-r border-hairline/60 bg-bg-sidebar/40 p-2 select-none overflow-y-auto">
        <span className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-disabled">
          Effects
        </span>
        {VIDEO_EFFECT_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id && !searchQuery.trim();
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id);
                setSearchQuery('');
              }}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                active
                  ? 'bg-accent-ai/15 text-accent-ai font-semibold'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">{cat.icon}</span>
              <span className="truncate">{cat.label}</span>
            </button>
          );
        })}
      </aside>

      {/* Main Effects Area */}
      <div className="flex min-w-0 flex-1 flex-col p-2.5 gap-2 overflow-hidden">
        {/* Search Bar (CapCut style) */}
        <div className="relative shrink-0">
          <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-text-disabled">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search video effects..."
            className="w-full rounded-md border border-hairline/60 bg-bg-canvas py-1.5 pl-8 pr-7 text-xs text-text-primary placeholder:text-text-disabled outline-none focus:border-text-disabled"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-disabled hover:text-text-primary"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          ) : null}
        </div>

        {/* Active Effect Quick Bar (CapCut style) */}
        {activeVideoEffect && canApplyToClip && (
          <div className="flex flex-col gap-2 rounded-lg border border-accent-ai/30 bg-accent-ai/5 p-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-accent-ai text-[16px]">auto_fix_high</span>
                <span className="text-xs font-semibold text-text-primary">{activeVideoEffect.label}</span>
                <span className="rounded bg-accent-ai/20 px-1.5 py-0.2 text-[9px] font-medium text-accent-ai">
                  Active
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title={activeVideoEffect.disabled ? 'Enable effect' : 'Disable effect'}
                  onClick={() => handleUpdateActiveEffect({ disabled: !activeVideoEffect.disabled })}
                  className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                    activeVideoEffect.disabled
                      ? 'text-text-disabled hover:text-text-primary bg-bg-hover'
                      : 'text-accent-ai bg-accent-ai/20'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {activeVideoEffect.disabled ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
                <button
                  type="button"
                  title="Remove effect from clip"
                  onClick={handleRemoveActiveEffect}
                  className="flex h-6 w-6 items-center justify-center rounded text-text-disabled hover:text-text-primary hover:bg-bg-hover transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>
            </div>

            {/* Quick Sliders */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-secondary w-12 shrink-0">Intensity</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={activeVideoEffect.intensity}
                  onChange={(e) => handleUpdateActiveEffect({ intensity: Number(e.target.value) })}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-hairline accent-accent-ai"
                />
                <span className="font-mono text-[10px] text-text-secondary w-6 text-right">
                  {activeVideoEffect.intensity}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-secondary w-10 shrink-0">Speed</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={activeVideoEffect.speed}
                  onChange={(e) => handleUpdateActiveEffect({ speed: Number(e.target.value) })}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-hairline accent-accent-ai"
                />
                <span className="font-mono text-[10px] text-text-secondary w-6 text-right">
                  {activeVideoEffect.speed}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between px-0.5 select-none shrink-0">
          <span className="text-xs font-semibold text-text-primary tracking-tight">
            {searchQuery.trim()
              ? `Results for "${searchQuery.trim()}"`
              : VIDEO_EFFECT_CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? 'Effects'}
          </span>
          <span className="text-[10px] text-text-disabled">
            {filteredPresets.length} effects
          </span>
        </div>

        {/* Effect Cards Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <div
            className={`grid gap-2 ${busy ? 'pointer-events-none opacity-70' : ''}`}
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}
          >
            {filteredPresets.map((preset) => {
              const isActive = activeVideoEffect?.presetId === preset.id;

              return (
                <EffectCard
                  key={preset.id}
                  preset={preset}
                  isActive={isActive}
                  canApplyToClip={canApplyToClip}
                  onAddTrack={handleAddTrack}
                  onApplyToClip={handleApplyToClip}
                />
              );
            })}
          </div>

          {filteredPresets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-text-disabled">
              <span className="material-symbols-outlined text-[24px] mb-1 opacity-50">search_off</span>
              <span>No matching effects found</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
