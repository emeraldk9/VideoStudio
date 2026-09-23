import { useState, useMemo, useCallback } from 'react';
import {
  CLIP_TRANSITIONS,
  type ClipTransition,
  spineTrackOf,
  layoutTrack,
} from '@shared';
import { useSequenceStore } from '../../../entities/sequence';

type TransitionCategory = 'all' | 'dissolves' | 'fades' | 'wipes' | 'stylized';

interface TransitionMeta {
  id: ClipTransition;
  label: string;
  category: TransitionCategory;
  description: string;
  icon: string;
}

const TRANSITIONS_METADATA: readonly TransitionMeta[] = [
  // Dissolves
  {
    id: 'crossfade',
    label: 'Cross Dissolve',
    category: 'dissolves',
    description: 'Standard linear-light crossfade blend between consecutive clips',
    icon: 'blur_linear',
  },
  {
    id: 'blur_dissolve',
    label: 'Blur Dissolve',
    category: 'dissolves',
    description: 'Dreamlike optical blur blend across incoming and outgoing frames',
    icon: 'lens_blur',
  },
  {
    id: 'luma_dissolve',
    label: 'Luma Dissolve',
    category: 'dissolves',
    description: 'Grayscale luminance-driven soft threshold wipe dissolve',
    icon: 'gradient',
  },
  {
    id: 'additive_dissolve',
    label: 'Additive Dissolve',
    category: 'dissolves',
    description: 'Bright high-energy optical bloom and additive luminance wash',
    icon: 'flare',
  },
  {
    id: 'asymmetric_dissolve',
    label: 'Asymmetric Dissolve',
    category: 'dissolves',
    description: 'Fast lead-in, elongated tail dissolve for cinematic pacing',
    icon: 'waves',
  },
  {
    id: 'match_dissolve',
    label: 'Match Dissolve',
    category: 'dissolves',
    description: 'Subject registration alignment with subtle spatial dampening',
    icon: 'switch_access_shortcut',
  },

  // Fades & Dips
  {
    id: 'fade_black',
    label: 'Dip to Black',
    category: 'fades',
    description: 'Classic scene transition dipping luminance to pure black',
    icon: 'brightness_empty',
  },
  {
    id: 'fade_white',
    label: 'Dip to White',
    category: 'fades',
    description: 'Flash-like high exposure wash dipping luminance to pure white',
    icon: 'brightness_high',
  },
  {
    id: 'dip_to_color',
    label: 'Dip to Color',
    category: 'fades',
    description: 'Dip through custom brand or theme accent color',
    icon: 'palette',
  },
  {
    id: 'flash_frame',
    label: 'Flash Frame',
    category: 'fades',
    description: 'Punchy 1-3 frame hard color flash for high-impact cuts',
    icon: 'bolt',
  },

  // Wipes & Slides
  {
    id: 'wipe_left',
    label: 'Wipe Left',
    category: 'wipes',
    description: 'Horizontal linear wipe revealing next scene from right to left',
    icon: 'west',
  },
  {
    id: 'wipe_right',
    label: 'Wipe Right',
    category: 'wipes',
    description: 'Horizontal linear wipe revealing next scene from left to right',
    icon: 'east',
  },
  {
    id: 'wipe_up',
    label: 'Wipe Up',
    category: 'wipes',
    description: 'Vertical linear wipe moving upward',
    icon: 'north',
  },
  {
    id: 'wipe_down',
    label: 'Wipe Down',
    category: 'wipes',
    description: 'Vertical linear wipe moving downward',
    icon: 'south',
  },
  {
    id: 'slide_left',
    label: 'Slide Left',
    category: 'wipes',
    description: 'Incoming clip slides on top of previous frame leftward',
    icon: 'keyboard_double_arrow_left',
  },
  {
    id: 'slide_right',
    label: 'Slide Right',
    category: 'wipes',
    description: 'Incoming clip slides on top of previous frame rightward',
    icon: 'keyboard_double_arrow_right',
  },
  {
    id: 'slide_up',
    label: 'Slide Up',
    category: 'wipes',
    description: 'Incoming clip slides up over outgoing frame',
    icon: 'keyboard_double_arrow_up',
  },
  {
    id: 'slide_down',
    label: 'Slide Down',
    category: 'wipes',
    description: 'Incoming clip slides down over outgoing frame',
    icon: 'keyboard_double_arrow_down',
  },
  {
    id: 'radial',
    label: 'Radial Clock Wipe',
    category: 'wipes',
    description: 'Sweeping 360-degree clock hand angular wipe reveal',
    icon: 'timelapse',
  },

  // Stylized
  {
    id: 'circle_open',
    label: 'Iris Circle Open',
    category: 'stylized',
    description: 'Circular iris expanding outward from center',
    icon: 'adjust',
  },
  {
    id: 'circle_close',
    label: 'Iris Circle Close',
    category: 'stylized',
    description: 'Circular iris contracting into center vignette',
    icon: 'radio_button_checked',
  },
  {
    id: 'pixelize',
    label: 'Pixelize Glitch',
    category: 'stylized',
    description: 'Mosaic block pixelization dissolve for digital glitch effect',
    icon: 'grid_view',
  },
  {
    id: 'cut',
    label: 'Hard Cut',
    category: 'all',
    description: 'Standard instantaneous zero-frame editorial cut',
    icon: 'content_cut',
  },
];

const CATEGORY_TABS: { id: TransitionCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'auto_awesome_motion' },
  { id: 'dissolves', label: 'Dissolves', icon: 'blur_linear' },
  { id: 'fades', label: 'Fades', icon: 'tonality' },
  { id: 'wipes', label: 'Wipes & Slides', icon: 'swipe' },
  { id: 'stylized', label: 'Stylized', icon: 'flare' },
];

const DURATION_PRESETS = [
  { label: '0.5s', frames: 12 },
  { label: '1.0s', frames: 24 },
  { label: '1.5s', frames: 36 },
  { label: '2.0s', frames: 48 },
];

export function TransitionsPane() {
  const [selectedCategory, setSelectedCategory] = useState<TransitionCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [durationFrames, setDurationFrames] = useState(24);
  const [appliedFeedback, setAppliedFeedback] = useState<string | null>(null);

  const document = useSequenceStore((state) => state.document);
  const selectedClipIds = useSequenceStore((state) => state.selectedClipIds);
  const patchClips = useSequenceStore((state) => state.patchClips);

  const filteredTransitions = useMemo(() => {
    return TRANSITIONS_METADATA.filter((t) => {
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [selectedCategory, searchQuery]);

  const handleApplyToSelected = useCallback(
    (transitionId: ClipTransition) => {
      if (selectedClipIds.length === 0) return;
      patchClips(selectedClipIds, {
        transitionIn: transitionId,
        transitionFrames: transitionId === 'cut' ? 0 : transitionId === 'flash_frame' ? 2 : durationFrames,
      });
      setAppliedFeedback(`Applied ${transitionId} to ${selectedClipIds.length} clip(s)`);
      setTimeout(() => setAppliedFeedback(null), 2500);
    },
    [selectedClipIds, patchClips, durationFrames],
  );

  const handleApplyToAllCuts = useCallback(
    (transitionId: ClipTransition) => {
      if (!document) return;
      const spine = spineTrackOf(document);
      if (!spine) return;
      const spineClips = layoutTrack(document.clips, spine);
      // Skip the first clip since it has no previous cut
      const targetIds = spineClips.slice(1).map((p) => p.clip.id);
      if (targetIds.length === 0) return;

      patchClips(targetIds, {
        transitionIn: transitionId,
        transitionFrames: transitionId === 'cut' ? 0 : transitionId === 'flash_frame' ? 2 : durationFrames,
      });
      setAppliedFeedback(`Applied ${transitionId} to all ${targetIds.length} spine transitions`);
      setTimeout(() => setAppliedFeedback(null), 2500);
    },
    [document, patchClips, durationFrames],
  );

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-canvas text-text-primary select-none">
      {/* Left Vertical Sub-Sidebar (CapCut style) */}
      <div className="flex w-36 shrink-0 flex-col gap-1 border-r border-hairline/60 bg-bg-sidebar/40 p-2 select-none overflow-y-auto">
        <span className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-disabled">
          Transitions
        </span>
        {CATEGORY_TABS.map((tab) => {
          const active = selectedCategory === tab.id;
          const count =
            tab.id === 'all'
              ? TRANSITIONS_METADATA.length
              : TRANSITIONS_METADATA.filter((t) => t.category === tab.id).length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id)}
              className={`flex items-center justify-between rounded-button px-2 py-1.5 text-xs transition-all text-left ${
                active
                  ? 'bg-accent-ai/15 font-semibold text-accent-ai'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className={`material-symbols-outlined text-[16px] ${active ? 'text-accent-ai' : ''}`}
                >
                  {tab.icon}
                </span>
                <span className="truncate">{tab.label}</span>
              </div>
              <span className="font-mono text-[10px] text-text-disabled ml-1 shrink-0">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right Content Area */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden bg-bg-canvas">
        {/* Top Controls Header */}
        <div className="flex flex-col gap-2 border-b border-hairline p-3 bg-bg-card/30">
          {/* Search Bar */}
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-text-disabled pointer-events-none">
              search
            </span>
            <input
              type="text"
              placeholder="Search transitions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-hairline bg-bg-app pl-8 pr-7 py-1 text-xs text-text-primary placeholder:text-text-disabled focus:border-accent-ai focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-text-disabled hover:text-text-secondary"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Duration selector & Target clip hint */}
          <div className="flex items-center justify-between pt-1 border-t border-hairline/60 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-text-disabled">Duration:</span>
              <div className="flex items-center gap-0.5 bg-bg-app border border-hairline rounded p-0.5">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.frames}
                    type="button"
                    onClick={() => setDurationFrames(preset.frames)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      durationFrames === preset.frames
                        ? 'bg-accent-ai/20 text-accent-ai font-semibold'
                        : 'text-text-disabled hover:text-text-secondary'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1 text-text-secondary">
              <span className="material-symbols-outlined text-[14px] text-accent-ai">layers</span>
              <span>
                {selectedClipIds.length > 0
                  ? `${selectedClipIds.length} clip(s)`
                  : 'Select clip'}
              </span>
            </div>
          </div>
        </div>

        {/* Applied Feedback Banner */}
        {appliedFeedback && (
          <div className="flex items-center justify-center gap-1.5 bg-accent-ai/15 border-b border-accent-ai/30 py-1.5 px-3 text-xs text-accent-ai font-medium animate-fadeIn">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            {appliedFeedback}
          </div>
        )}

      {/* Grid of Transition Cards */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2.5">
          {filteredTransitions.map((t) => {
            return (
              <div
                key={t.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-button)] border border-hairline bg-bg-card p-2.5 transition-all duration-200 hover:border-accent-ai/50 hover:bg-bg-hover"
              >
                {/* Visual Preview Box with CSS animation on hover */}
                <div className="relative mb-2 flex h-20 w-full items-center justify-center overflow-hidden rounded bg-[#0b0d13] border border-hairline/40">
                  {/* Underlay swatch (Outgoing clip) */}
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 to-purple-900/60 flex items-center justify-center text-white/30 text-[10px] font-mono">
                    A
                  </div>

                  {/* Incoming swatch with simulated transition on card hover */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br from-amber-600/70 to-rose-600/70 flex items-center justify-center text-white/80 text-[10px] font-mono font-bold transition-all duration-700 ease-in-out ${
                      t.id === 'wipe_left'
                        ? 'translate-x-full group-hover:translate-x-0'
                        : t.id === 'wipe_right'
                          ? '-translate-x-full group-hover:translate-x-0'
                          : t.id === 'wipe_up'
                            ? 'translate-y-full group-hover:translate-y-0'
                            : t.id === 'wipe_down'
                              ? '-translate-y-full group-hover:translate-y-0'
                              : t.id === 'circle_open'
                                ? 'scale-0 rounded-full group-hover:scale-150'
                                : t.id === 'fade_black'
                                  ? 'opacity-0 group-hover:opacity-100'
                                  : t.id === 'cut'
                                    ? 'opacity-0 group-hover:opacity-100 transition-none'
                                    : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    B
                  </div>

                  {/* Icon Indicator */}
                  <span className="material-symbols-outlined text-[20px] text-white/40 drop-shadow group-hover:text-white/80 transition-colors pointer-events-none z-10">
                    {t.icon}
                  </span>
                </div>

                {/* Transition Info */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-primary tracking-tight">
                      {t.label}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-text-disabled">
                      {t.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-secondary leading-tight line-clamp-2 min-h-[24px]">
                    {t.description}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="mt-2.5 flex items-center gap-1.5 pt-2 border-t border-hairline/50">
                  <button
                    type="button"
                    onClick={() => handleApplyToSelected(t.id)}
                    disabled={selectedClipIds.length === 0}
                    className={`flex-1 flex items-center justify-center gap-1 rounded py-1 text-[11px] font-medium transition-colors ${
                      selectedClipIds.length > 0
                        ? 'bg-accent-ai text-text-on-accent hover:opacity-90'
                        : 'bg-bg-app border border-hairline text-text-disabled cursor-not-allowed'
                    }`}
                    title={
                      selectedClipIds.length > 0
                        ? `Apply ${t.label} to selected clips`
                        : 'Select clip on timeline first'
                    }
                  >
                    <span className="material-symbols-outlined text-[13px]">check</span>
                    Apply
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyToAllCuts(t.id)}
                    className="flex items-center justify-center rounded border border-hairline bg-bg-app p-1 text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                    title={`Apply ${t.label} across all spine cuts`}
                  >
                    <span className="material-symbols-outlined text-[14px]">done_all</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);
}
