import { useCallback, useMemo, useState } from 'react';

import {
  FILTER_CATEGORIES,
  FILTER_PRESETS,
  buildCssFilter,
  resolveFilterWithIntensity,
  secondsToFrames,
  type FilterCategory,
  type FilterPreset,
} from '@shared';

import { currentPlayheadFrame, selectSelectedClip, useSequenceStore } from '../../../entities/sequence';
import { ensureOverlayTrack } from '../lib/ensure-free-track';
import { beginTimelineDrag } from '../lib/timeline-drag';

export const FILTER_CLIP_DEFAULT_SECONDS = 3;

interface FilterCardProps {
  preset: FilterPreset;
  isActive: boolean;
  intensity: number;
  canApplyToClip: boolean;
  onAddTrack: (preset: FilterPreset) => void;
  onApplyToClip: (preset: FilterPreset) => void;
}

function FilterCard({
  preset,
  isActive,
  intensity,
  canApplyToClip,
  onAddTrack,
  onApplyToClip,
}: FilterCardProps) {
  const scaledFilters = useMemo(() => {
    return resolveFilterWithIntensity(preset.filters, isActive ? intensity : 100);
  }, [preset.filters, isActive, intensity]);

  const filter = buildCssFilter({ filters: scaledFilters }) || undefined;

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
      {/* Thumbnail Aspect Square (CapCut standard) */}
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-[#0a0b0d]">
        <span
          className="absolute inset-0 transition-transform duration-300 group-hover:scale-110"
          style={{
            background:
              'linear-gradient(135deg, var(--media-swatch-sky) 0%, var(--media-swatch-sand) 40%, var(--media-swatch-clay) 70%, var(--media-swatch-dusk) 100%)',
            filter,
          }}
        />

        {/* CapCut Pro Style Diamond Badge */}
        <span className="absolute top-1 left-1 flex items-center justify-center text-[10px] text-accent-ai opacity-80 group-hover:opacity-100 transition-opacity">
          <span className="material-symbols-outlined text-[13px]">diamond</span>
        </span>

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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/65 opacity-0 backdrop-blur-xs transition-opacity duration-150 group-hover:opacity-100 p-1">
          <button
            type="button"
            title="Add as Adjustment Layer on timeline at playhead"
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
              title="Apply look directly to selected clip"
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

      {/* Label beneath thumbnail */}
      <span className="w-full truncate text-[11px] font-normal text-text-secondary group-hover:text-text-primary px-0.5">
        {preset.label}
      </span>
    </div>
  );
}

export function FiltersPane() {
  const document = useSequenceStore((state) => state.document);
  const selectedClip = useSequenceStore(selectSelectedClip);
  const patchClip = useSequenceStore((state) => state.patchClip);
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const canApplyToClip = Boolean(
    selectedClip && (selectedClip.sourceKind === 'video' || selectedClip.sourceKind === 'still' || selectedClip.sourceKind === 'effect'),
  );

  const activeIntensity = selectedClip?.effects?.filterIntensity ?? 100;
  const hasActiveFilters = Boolean(selectedClip?.effects?.filters);

  const handleAddTrack = useCallback(async (preset: FilterPreset) => {
    setBusy(true);
    try {
      const state = useSequenceStore.getState();
      if (!state.document) return;
      const fps = state.document.sequence.fps;
      const startFrames = currentPlayheadFrame();
      const durationFrames = Math.max(1, secondsToFrames(FILTER_CLIP_DEFAULT_SECONDS, fps));
      const trackId = await ensureOverlayTrack('Filters', startFrames, durationFrames);
      const fresh = useSequenceStore.getState();
      if (!trackId || !fresh.document) return;
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
          effects: { filters: { ...preset.filters }, filterIntensity: 100 },
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleApplyToClip = useCallback(
    (preset: FilterPreset) => {
      if (!selectedClip) return;
      patchClip(selectedClip.id, {
        effects: {
          ...selectedClip.effects,
          filters: { ...preset.filters },
          filterIntensity: selectedClip.effects?.filterIntensity ?? 100,
        },
      });
    },
    [selectedClip, patchClip],
  );

  const handleIntensityChange = useCallback(
    (newVal: number) => {
      if (!selectedClip) return;
      patchClip(selectedClip.id, {
        effects: {
          ...selectedClip.effects,
          filterIntensity: newVal,
        },
      });
    },
    [selectedClip, patchClip],
  );

  const handleResetFilter = useCallback(() => {
    if (!selectedClip) return;
    patchClip(selectedClip.id, {
      effects: {
        ...selectedClip.effects,
        filters: undefined,
        filterIntensity: undefined,
      },
    });
  }, [selectedClip, patchClip]);

  const filteredPresets = useMemo(() => {
    return FILTER_PRESETS.filter((preset) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return preset.label.toLowerCase().includes(q) || (preset.description?.toLowerCase().includes(q) ?? false);
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
          Filters
        </span>
        {FILTER_CATEGORIES.map((cat) => {
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

      {/* Main Filters Area */}
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
            placeholder="Search filters..."
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

        {/* CapCut-Style Filter Intensity Slider & Quick Actions (Active when clip has filters) */}
        {hasActiveFilters && canApplyToClip && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-accent-ai/30 bg-accent-ai/5 px-3 py-1.5 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="material-symbols-outlined text-accent-ai text-[16px]">tune</span>
              <span className="text-[11px] font-medium text-text-secondary shrink-0">Filter Intensity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={activeIntensity}
                onChange={(e) => handleIntensityChange(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-hairline accent-accent-ai"
              />
              <span className="font-mono text-[11px] font-semibold text-accent-ai w-8 text-right">
                {activeIntensity}%
              </span>
            </div>
            <button
              type="button"
              onClick={handleResetFilter}
              title="Reset filter from clip"
              className="flex items-center gap-1 rounded bg-bg-hover hover:bg-bg-selected px-2 py-0.5 text-[10px] text-text-secondary hover:text-text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">restart_alt</span>
              <span>Reset</span>
            </button>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between px-0.5 select-none shrink-0">
          <span className="text-xs font-semibold text-text-primary tracking-tight">
            {searchQuery.trim()
              ? `Results for "${searchQuery.trim()}"`
              : FILTER_CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? 'Filters'}
          </span>
          <span className="text-[10px] text-text-disabled">
            {filteredPresets.length} filters
          </span>
        </div>

        {/* Filter Cards Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <div
            className={`grid gap-2 ${busy ? 'pointer-events-none opacity-70' : ''}`}
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}
          >
            {filteredPresets.map((preset) => {
              const isActive =
                Boolean(selectedClip?.effects?.filters) &&
                JSON.stringify(selectedClip?.effects?.filters) === JSON.stringify(preset.filters);

              return (
                <FilterCard
                  key={preset.id}
                  preset={preset}
                  isActive={isActive}
                  intensity={activeIntensity}
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
              <span>No matching filters found</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
