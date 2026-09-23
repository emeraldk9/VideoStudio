import { useCallback, useState, useMemo } from 'react';

import { secondsToFrames, type ClipTransition, type TextContent } from '@shared';

import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { MODAL_IDS } from '../../../shared/config/modal-ids';
import { useModalStore } from '../../../shared/model/modalStore';
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
      box: { colorHex: '#1e293b', opacity: 0.75, paddingPx: 14 },
      preset: 'lower_third',
    },
  },
  {
    id: 'documentary-subtle',
    category: 'lower_third',
    categoryLabel: 'Lower Thirds',
    name: 'Documentary Classic',
    sampleText: 'Prof. Marcus Vance · Oxford University',
    durationSeconds: 4.5,
    transitionIn: 'fade_black',
    effects: {
      fontSizePx: 40,
      colorHex: '#e2e8f0',
      align: 'left',
      positionPct: { x: 0.08, y: 0.87 },
      anchor: 'bottom',
      box: { colorHex: '#0f172a', opacity: 0.8, paddingPx: 12 },
      preset: 'lower_third',
    },
  },

  // Titles
  {
    id: 'cinematic-opener',
    category: 'title',
    categoryLabel: 'Titles',
    name: 'Cinematic Chapter',
    sampleText: 'CHAPTER ONE: THE BEGINNING',
    durationSeconds: 4,
    transitionIn: 'blur_dissolve',
    effects: {
      fontSizePx: 64,
      colorHex: '#f8fafc',
      align: 'center',
      positionPct: { x: 0.5, y: 0.5 },
      anchor: 'middle',
      box: { colorHex: '#020617', opacity: 0.7, paddingPx: 24 },
      preset: 'title',
    },
  },
  {
    id: 'bold-impact',
    category: 'title',
    categoryLabel: 'Titles',
    name: 'Bold Impact Intro',
    sampleText: 'DON’T MISS THIS MOMENT',
    durationSeconds: 3,
    transitionIn: 'flash_frame',
    effects: {
      fontSizePx: 72,
      colorHex: '#facc15',
      align: 'center',
      positionPct: { x: 0.5, y: 0.48 },
      anchor: 'middle',
      preset: 'title',
    },
  },
  {
    id: 'minimal-modern',
    category: 'title',
    categoryLabel: 'Titles',
    name: 'Modern Sans Title',
    sampleText: 'SUMMER ARCHIVE 2026',
    durationSeconds: 3.5,
    transitionIn: 'crossfade',
    effects: {
      fontSizePx: 54,
      colorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.5 },
      anchor: 'middle',
      preset: 'title',
    },
  },
  {
    id: 'tech-cyber',
    category: 'title',
    categoryLabel: 'Titles',
    name: 'Futuristic Grid',
    sampleText: 'SYSTEM ACTIVATED // v4.2',
    durationSeconds: 4,
    transitionIn: 'pixelize',
    effects: {
      fontSizePx: 50,
      colorHex: '#38bdf8',
      align: 'center',
      positionPct: { x: 0.5, y: 0.5 },
      anchor: 'middle',
      box: { colorHex: '#082f49', opacity: 0.85, paddingPx: 16 },
      preset: 'title',
    },
  },

  // Captions
  {
    id: 'social-subtitle',
    category: 'caption',
    categoryLabel: 'Captions',
    name: 'Social Media Pop',
    sampleText: 'Wait until you see what happens next!',
    durationSeconds: 3,
    transitionIn: 'crossfade',
    effects: {
      fontSizePx: 44,
      colorHex: '#ffffff',
      align: 'center',
      positionPct: { x: 0.5, y: 0.82 },
      anchor: 'bottom',
      box: { colorHex: '#000000', opacity: 0.8, paddingPx: 14 },
      preset: 'caption',
    },
  },
  {
    id: 'high-contrast-yellow',
    category: 'caption',
    categoryLabel: 'Captions',
    name: 'Viral Yellow Accent',
    sampleText: 'This is the most important part...',
    durationSeconds: 3,
    transitionIn: 'cut',
    effects: {
      fontSizePx: 46,
      colorHex: '#facc15',
      align: 'center',
      positionPct: { x: 0.5, y: 0.82 },
      anchor: 'bottom',
      box: { colorHex: '#09090b', opacity: 0.9, paddingPx: 14 },
      preset: 'caption',
    },
  },
  {
    id: 'clean-caption',
    category: 'caption',
    categoryLabel: 'Captions',
    name: 'Clean Narration Bar',
    sampleText: '“The journey begins with a single deliberate step.”',
    durationSeconds: 4,
    transitionIn: 'luma_dissolve',
    effects: {
      fontSizePx: 40,
      colorHex: '#f1f5f9',
      align: 'center',
      positionPct: { x: 0.5, y: 0.84 },
      anchor: 'bottom',
      box: { colorHex: '#18181b', opacity: 0.75, paddingPx: 12 },
      preset: 'caption',
    },
  },
  {
    id: 'bold-reels',
    category: 'caption',
    categoryLabel: 'Captions',
    name: 'Shorts & Reels Highlight',
    sampleText: '100% GAME CHANGER',
    durationSeconds: 2.5,
    transitionIn: 'flash_frame',
    effects: {
      fontSizePx: 52,
      colorHex: '#4ade80',
      align: 'center',
      positionPct: { x: 0.5, y: 0.8 },
      anchor: 'bottom',
      box: { colorHex: '#052e16', opacity: 0.85, paddingPx: 16 },
      preset: 'caption',
    },
  },
];

type TextCategory = 'default' | 'all' | 'title' | 'lower_third' | 'caption';

const TEXT_CATEGORIES: { id: TextCategory; label: string; icon: string }[] = [
  { id: 'default', label: 'Default text', icon: 'text_fields' },
  { id: 'all', label: 'All Templates', icon: 'dashboard' },
  { id: 'title', label: 'Titles', icon: 'title' },
  { id: 'lower_third', label: 'Lower Thirds', icon: 'subtitles' },
  { id: 'caption', label: 'Captions', icon: 'closed_caption' },
];

export function TextPane() {
  const [filter, setFilter] = useState<TextCategory>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const document = useSequenceStore((state) => state.document);

  const filteredTemplates = useMemo(() => {
    return TITLE_TEMPLATES.filter((tmpl) => {
      if (filter !== 'all' && filter !== 'default' && tmpl.category !== filter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          tmpl.name.toLowerCase().includes(q) ||
          tmpl.sampleText.toLowerCase().includes(q) ||
          tmpl.categoryLabel.toLowerCase().includes(q)
        );
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

  const handleAddDefaultText = async (preset: 'title' | 'caption') => {
    const tmpl: TitleTemplate =
      preset === 'title'
        ? {
            id: 'default-heading',
            category: 'title',
            categoryLabel: 'Titles',
            name: 'Default Heading',
            sampleText: 'Default Heading',
            durationSeconds: 3,
            effects: {
              fontSizePx: 56,
              colorHex: '#ffffff',
              align: 'center',
              positionPct: { x: 0.5, y: 0.5 },
              anchor: 'middle',
              preset: 'title',
            },
          }
        : {
            id: 'default-caption',
            category: 'caption',
            categoryLabel: 'Captions',
            name: 'Default Subtitle',
            sampleText: 'Add subtitle text here',
            durationSeconds: 3,
            effects: {
              fontSizePx: 38,
              colorHex: '#facc15',
              align: 'center',
              positionPct: { x: 0.5, y: 0.85 },
              anchor: 'bottom',
              preset: 'caption',
            },
          };
    await handleAddTemplate(tmpl);
  };

  if (!document) return null;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-canvas text-text-primary select-none">
      {/* Left Vertical Sub-Sidebar (CapCut style) */}
      <div className="flex w-36 shrink-0 flex-col gap-1 border-r border-hairline/60 bg-bg-sidebar/40 p-2 select-none overflow-y-auto">
        <span className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-disabled">
          Text
        </span>
        {TEXT_CATEGORIES.map((cat) => {
          const active = filter === cat.id;
          const count =
            cat.id === 'default'
              ? 2
              : cat.id === 'all'
                ? TITLE_TEMPLATES.length
                : TITLE_TEMPLATES.filter((t) => t.category === cat.id).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilter(cat.id)}
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
                  {cat.icon}
                </span>
                <span className="truncate">{cat.label}</span>
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
        {/* Search header */}
        <div className="flex flex-col gap-2 border-b border-hairline p-3 bg-bg-card/30">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-text-disabled pointer-events-none">
              search
            </span>
            <input
              type="text"
              placeholder="Search text templates..."
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
        </div>

        {/* Content Area */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 flex flex-col gap-4">
          {/* Quick Default Text Hero Cards (CapCut style) */}
          {(filter === 'default' || filter === 'all') && !searchQuery && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
                Default Text
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAddDefaultText('title')}
                  className="flex items-center gap-2.5 rounded-lg border border-hairline bg-bg-app p-2.5 text-left hover:border-accent-ai hover:bg-bg-hover transition-all group"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-ai/15 text-accent-ai group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-[18px]">title</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-text-primary block leading-tight">
                      Heading
                    </span>
                    <span className="text-[10px] text-text-disabled block mt-0.5">
                      1-click add
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAddDefaultText('caption')}
                  className="flex items-center gap-2.5 rounded-lg border border-hairline bg-bg-app p-2.5 text-left hover:border-accent-ai hover:bg-bg-hover transition-all group"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-ai/15 text-accent-ai group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-[18px]">subtitles</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-text-primary block leading-tight">
                      Subtitle
                    </span>
                    <span className="text-[10px] text-text-disabled block mt-0.5">
                      1-click add
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => useModalStore.getState().openModal(MODAL_IDS.SUBTITLES)}
                  className="flex items-center gap-2.5 rounded-lg border border-hairline bg-bg-app p-2.5 text-left hover:border-accent-ai hover:bg-bg-hover transition-all group"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-purple-500/15 text-purple-400 group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-[18px]">closed_caption</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-text-primary block leading-tight">
                      SRT / VTT
                    </span>
                    <span className="text-[10px] text-text-disabled block mt-0.5">
                      Auto-ingest
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* S26 — Caption File Auto-Ingest Callout Banner */}
          {(filter === 'caption' || filter === 'all') && !searchQuery && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--accent-ai)]/30 bg-[var(--accent-ai)]/10 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-ai)]/20 text-[var(--accent-ai)]">
                  <span className="material-symbols-outlined text-[20px]">closed_caption</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-text-primary block">
                    Auto-Ingest Subtitles (.srt / .vtt)
                  </span>
                  <span className="text-[11px] text-text-muted block mt-0.5">
                    Batch convert Whisper, YouTube, or sidecar captions into timed text clips
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => useModalStore.getState().openModal(MODAL_IDS.SUBTITLES)}
                className="shrink-0 flex items-center gap-1.5 rounded-card bg-[var(--accent-ai)] text-white px-3 py-1.5 text-xs font-medium shadow hover:opacity-95 transition"
              >
                <span className="material-symbols-outlined text-sm">upload_file</span>
                Import Subtitles
              </button>
            </div>
          )}

          {/* Templates Grid */}
          <div className="flex flex-col gap-2">
            {filter !== 'default' && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
                Templates ({filteredTemplates.length})
              </span>
            )}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                  className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-button)] border border-hairline bg-bg-card p-2.5 transition-all duration-200 hover:border-accent-ai/50 hover:bg-bg-hover cursor-grab active:cursor-grabbing"
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
                        className="inline-block rounded px-2 py-0.5 font-medium leading-tight tracking-tight text-[11px]"
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
                      className="w-full flex items-center justify-center gap-1 rounded bg-accent-ai py-1 text-[11px] font-medium text-text-on-accent hover:opacity-90 transition-opacity"
                      title="Add to timeline at playhead"
                    >
                      <span className="material-symbols-outlined text-[13px]">add</span>
                      Add at Playhead
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-2 text-center text-[10px] text-text-disabled">
            Click &ldquo;Add at Playhead&rdquo; or drag any template directly onto the timeline.
          </p>
        </div>
      </div>
    </div>
  );
}
