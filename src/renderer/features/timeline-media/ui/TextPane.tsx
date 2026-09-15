import { useCallback, useState, useMemo } from 'react';

import {
  secondsToFrames,
  type ClipTransition,
  type TextContent,
} from '@shared';

import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { ensureTextTrack } from '../lib/ensure-free-track';
import { beginTimelineDrag } from '../lib/timeline-drag';

export interface TitleTemplate {
  id: string;
  category: 'lower_third' | 'title' | 'caption';
  categoryLabel: string;
  name: string;
  sampleText: string;
  durationSeconds: number;
  transitionIn?: ClipTransition;
  effects: Omit<TextContent, 'text'>;
}

const TITLE_TEMPLATES: readonly TitleTemplate[] = [
  // Lower Thirds
  {
    id: 'broadcast-reporter',
    category: 'lower_third',
    categoryLabel: 'Lower Thirds',
    name: 'Broadcast Standard',
    sampleText: 'Jane Doe — Chief Technical Officer',
    durationSeconds: 4,
    transitionIn: 'wipe_left',
    effects: {
      fontSizePx: 48,
      colorHex: '#ffffff',
      align: 'left',
      positionPct: { x: 0.08, y: 0.84 },
      anchor: 'bottom',
      box: { colorHex: '#0c0f1d', opacity: 0.85, paddingPx: 18 },
      preset: 'lower_third',
    },
  },
  {
    id: 'news-breaking',
    category: 'lower_third',
    categoryLabel: 'Lower Thirds',
    name: 'Breaking News Bar',
    sampleText: 'BREAKING — Special Live Coverage',
    durationSeconds: 5,
    transitionIn: 'flash_frame',
    effects: {
      fontSizePx: 44,
      colorHex: '#ffffff',
      align: 'left',
      positionPct: { x: 0.08, y: 0.86 },
      anchor: 'bottom',
      box: { colorHex: '#e11d48', opacity: 0.95, paddingPx: 16 },
      preset: 'lower_third',
    },
  },
  {
    id: 'vlog-frosted',
    category: 'lower_third',
    categoryLabel: 'Lower Thirds',
    name: 'Minimal Vlog Pill',
    sampleText: 'Alex Rivera · Visual Director',
    durationSeconds: 3.5,
    transitionIn: 'crossfade',
    effects: {
      fontSizePx: 42,
      colorHex: '#f1f5f9',
      align: 'left',
      positionPct: { x: 0.08, y: 0.85 },
      anchor: 'bottom',
      box: { colorHex: '#18181b', opacity: 0.65, paddingPx: 14 },
      preset: 'lower_third',
    },
  },
  {
    id: 'social-badge',
    category: 'lower_third',
    categoryLabel: 'Lower Thirds',
    name: 'Social Channel Badge',
    sampleText: '@videostudio · Follow for more',
    durationSeconds: 3,
    transitionIn: 'slide_up',
    effects: {
      fontSizePx: 38,
      colorHex: '#38bdf8',
      align: 'left',
      positionPct: { x: 0.08, y: 0.88 },
      anchor: 'bottom',
      box: { colorHex: '#020617', opacity: 0.8, paddingPx: 12 },
      preset: 'lower_third',
    },
  },

  // Titles
  {
    id: 'cinematic-chapter',
    category: 'title',
    categoryLabel: 'Titles',
    name: 'Cinematic Chapter',
    sampleText: 'CHAPTER 01 — THE DAWN',
    durationSeconds: 4,
    transitionIn: 'blur_dissolve',
    effects: {
      fontSizePx: 84,
      colorHex: '#fef08a',
      align: 'center',
      positionPct: { x: 0.5, y: 0.45 },
      anchor: 'middle',
      box: { colorHex: '#000000', opacity: 0.4, paddingPx: 24 },
      preset: 'title',
    },
  },
  {
    id: 'bold-headline',
    category: 'title',
    categoryLabel: 'Titles',
    name: 'Bold Punch Headline',
    sampleText: 'NEXT GENERATION STUDIO',
    durationSeconds: 3,
    transitionIn: 'crossfade',
    effects: {
      fontSizePx: 96,
      colorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.4 },
      anchor: 'middle',
      preset: 'title',
    },
  },
  {
    id: 'film-credits',
    category: 'title',
    categoryLabel: 'Titles',
    name: 'Film Opener Card',
    sampleText: 'A VIDEOSTUDIO PRODUCTION',
    durationSeconds: 4,
    transitionIn: 'fade_black',
    effects: {
      fontSizePx: 52,
      colorHex: '#e2e8f0',
      align: 'center',
      positionPct: { x: 0.5, y: 0.5 },
      anchor: 'middle',
      preset: 'title',
    },
  },

  // Captions & Subtitles
  {
    id: 'caption-standard',
    category: 'caption',
    categoryLabel: 'Captions',
    name: 'Standard Subtitle Bar',
    sampleText: 'Spoken narration or dialogue plays here.',
    durationSeconds: 3,
    transitionIn: 'cut',
    effects: {
      fontSizePx: 44,
      colorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.88 },
      anchor: 'bottom',
      box: { colorHex: '#000000', opacity: 0.75, paddingPx: 14 },
      preset: 'caption',
    },
  },
  {
    id: 'caption-highlight',
    category: 'caption',
    categoryLabel: 'Captions',
    name: 'High-Impact Callout',
    sampleText: '★ PAY ATTENTION TO THIS DETAIL ★',
    durationSeconds: 2.5,
    transitionIn: 'flash_frame',
    effects: {
      fontSizePx: 46,
      colorHex: '#facc15',
      align: 'center',
      positionPct: { x: 0.5, y: 0.86 },
      anchor: 'bottom',
      box: { colorHex: '#1e1b4b', opacity: 0.9, paddingPx: 16 },
      preset: 'caption',
    },
  },
];

type FilterCategory = 'all' | 'lower_third' | 'title' | 'caption';

export function TextPane() {
  const document = useSequenceStore((state) => state.document);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTemplates = useMemo(() => {
    return TITLE_TEMPLATES.filter((tmpl) => {
      if (filter !== 'all' && tmpl.category !== filter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return tmpl.name.toLowerCase().includes(q) || tmpl.sampleText.toLowerCase().includes(q);
      }
      return true;
    });
  }, [filter, searchQuery]);

  const handleAddTemplate = useCallback(
    async (template: TitleTemplate) => {
      setBusy(true);
      try {
        const trackId = await ensureTextTrack();
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
            sourceKind: 'text',
            outputId: null,
            storyShotId: null,
            sourceTakeId: null,
            filePath: null,
            startFrames: currentPlayheadFrame(),
            durationFrames: Math.max(1, secondsToFrames(template.durationSeconds, fps)),
            sourceInFrames: null,
            sourceOutFrames: null,
            transitionIn: template.transitionIn ?? 'cut',
            transitionFrames: template.transitionIn && template.transitionIn !== 'cut' ? 12 : 0,
            motionPreset: 'none',
            gainDb: 0,
            fadeInFrames: 0,
            fadeOutFrames: 0,
            label: template.name,
            overrides: [],
            effects: {
              text: {
                ...template.effects,
                text: template.sampleText,
              },
            },
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (!document) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-canvas text-text-primary select-none">
      {/* Header Controls */}
      <div className="flex flex-col gap-2.5 border-b border-hairline p-3 bg-bg-card/40">
        {/* Search */}
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-text-disabled pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder="Search titles & lower thirds..."
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

        {/* Category Pills */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'lower_third', label: 'Lower Thirds' },
              { id: 'title', label: 'Titles' },
              { id: 'caption', label: 'Captions' },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setFilter(pill.id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                filter === pill.id
                  ? 'bg-accent-ai text-text-on-accent shadow-xs'
                  : 'bg-bg-app border border-hairline text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredTemplates.map((tmpl) => (
            <div
              key={tmpl.id}
              draggable
              onDragStart={(event) =>
                beginTimelineDrag(event, [
                  {
                    kind: 'text',
                    presetId: tmpl.effects.preset,
                    label: tmpl.sampleText,
                  },
                ])
              }
              className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-button)] border border-hairline bg-bg-card p-2.5 transition-all duration-200 hover:border-accent-ai/50 hover:bg-bg-hover hover:shadow-md cursor-grab active:cursor-grabbing"
            >
              {/* Preview Thumbnail Box */}
              <div className="relative mb-2 flex h-24 w-full flex-col justify-end overflow-hidden rounded bg-[#0b0d13] p-2 border border-hairline/40">
                {/* Background grid texture */}
                <div className="absolute inset-0 bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:12px_12px] opacity-40" />

                {/* Simulated text placement */}
                <div
                  className={`relative z-10 font-sans ${
                    tmpl.effects.align === 'center'
                      ? 'text-center my-auto'
                      : tmpl.effects.align === 'right'
                        ? 'text-right ml-auto'
                        : 'text-left'
                  }`}
                >
                  <span
                    className="inline-block rounded px-2 py-0.5 font-medium leading-tight shadow-sm tracking-tight text-[11px]"
                    style={{
                      color: tmpl.effects.colorHex,
                      backgroundColor: tmpl.effects.box
                        ? tmpl.effects.box.colorHex +
                          Math.round(tmpl.effects.box.opacity * 255)
                            .toString(16)
                            .padStart(2, '0')
                        : undefined,
                    }}
                  >
                    {tmpl.sampleText}
                  </span>
                </div>

                {/* Duration indicator */}
                <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] text-text-disabled">
                  {tmpl.durationSeconds}s
                </span>
              </div>

              {/* Title & Category Info */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-primary tracking-tight">
                  {tmpl.name}
                </span>
                <span className="text-[10px] font-mono text-text-disabled uppercase">
                  {tmpl.categoryLabel}
                </span>
              </div>

              {/* Action Button */}
              <div className="mt-2 flex items-center gap-1.5 pt-1.5 border-t border-hairline/50">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAddTemplate(tmpl)}
                  className="w-full flex items-center justify-center gap-1 rounded bg-accent-ai py-1 text-[11px] font-medium text-text-on-accent hover:opacity-90 transition-opacity shadow-xs"
                  title="Add to timeline at playhead"
                >
                  <span className="material-symbols-outlined text-[13px]">add</span>
                  Add at Playhead
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] text-text-disabled">
          Click &ldquo;Add at Playhead&rdquo; or drag any template directly onto the timeline text tracks.
        </p>
      </div>
    </div>
  );
}
