import { useCallback, useState, useMemo } from 'react';

import {
  secondsToFrames,
  SMART_TEXT_TEMPLATES,
  type SmartTextTemplate,
  type SmartTextTemplateCategory,
  generateAITitleHooks,
  type AITitleHookSuggestion,
} from '@shared';

import { currentPlayheadFrame, useSequenceStore } from '../../../entities/sequence';
import { MODAL_IDS } from '../../../shared/config/modal-ids';
import { useModalStore } from '../../../shared/model/modalStore';
import { ensureTextTrack } from '../lib/ensure-free-track';
import { beginTimelineDrag } from '../lib/timeline-drag';

type TextPaneCategory = 'default' | 'all' | SmartTextTemplateCategory;

const TEXT_CATEGORIES: { id: TextPaneCategory; label: string; icon: string }[] = [
  { id: 'default', label: 'Default text', icon: 'text_fields' },
  { id: 'all', label: 'All Templates', icon: 'dashboard' },
  { id: 'titles', label: 'Titles & Intros', icon: 'title' },
  { id: 'social', label: 'Social & Vlog', icon: 'thumb_up' },
  { id: 'lower_thirds', label: 'Lower Thirds', icon: 'subtitles' },
  { id: 'callouts', label: 'Callouts & Badges', icon: 'sell' },
  { id: 'kinetic', label: 'Kinetic & Quotes', icon: 'speed' },
];

export function TextPane() {
  const [filter, setFilter] = useState<TextPaneCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);

  // AI Title & Hook Generator state
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState<'viral' | 'professional' | 'cinematic' | 'energetic'>('viral');
  const [aiSuggestions, setAiSuggestions] = useState<AITitleHookSuggestion[]>([]);

  const document = useSequenceStore((state) => state.document);

  const filteredTemplates = useMemo(() => {
    return SMART_TEXT_TEMPLATES.filter((tmpl) => {
      if (filter !== 'all' && filter !== 'default' && tmpl.category !== filter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          tmpl.name.toLowerCase().includes(q) ||
          tmpl.primaryText.toLowerCase().includes(q) ||
          (tmpl.secondaryText && tmpl.secondaryText.toLowerCase().includes(q)) ||
          tmpl.categoryLabel.toLowerCase().includes(q) ||
          tmpl.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filter, searchQuery]);

  const handleAddTemplate = useCallback(
    async (template: SmartTextTemplate, customPrimary?: string, customSecondary?: string) => {
      setBusy(true);
      try {
        const trackId = await ensureTextTrack();
        const state = useSequenceStore.getState();
        if (!trackId || !state.document) return;
        const fps = state.document.sequence.fps;

        const primaryText = customPrimary ?? template.primaryText;
        const secondaryText = customSecondary ?? template.secondaryText;

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
                ...template.style,
                text: primaryText,
                secondaryText,
                badgeIcon: template.badgeIcon,
                templateStyleId: template.id,
                templateLayout: template.layout,
                compoundAnimation: template.compoundAnimation,
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
    const tmpl: SmartTextTemplate =
      preset === 'title'
        ? {
            id: 'default-heading',
            category: 'titles',
            categoryLabel: 'Titles & Intros',
            name: 'Default Heading',
            description: 'Clean bold title for section headers',
            primaryText: 'Default Heading',
            layout: 'single',
            durationSeconds: 3,
            style: {
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
            category: 'lower_thirds',
            categoryLabel: 'Lower Thirds',
            name: 'Default Subtitle',
            description: 'Clean subtitle banner for speech and narration',
            primaryText: 'Add subtitle text here',
            layout: 'single',
            durationSeconds: 3,
            style: {
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

  const handleGenerateHooks = () => {
    const hooks = generateAITitleHooks(aiTopic, aiTone);
    setAiSuggestions(hooks);
  };

  const handleAddHookToTimeline = async (hook: AITitleHookSuggestion) => {
    const matched =
      SMART_TEXT_TEMPLATES.find((t) => t.id === hook.recommendedTemplateId) ??
      SMART_TEXT_TEMPLATES[0];
    await handleAddTemplate(matched, hook.title, hook.subtitle);
  };

  if (!document) return null;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-canvas text-text-primary select-none">
      {/* Left Vertical Sub-Sidebar (CapCut style) */}
      <div className="flex w-44 shrink-0 flex-col gap-1 border-r border-hairline/60 bg-bg-sidebar/40 p-2 select-none overflow-y-auto">
        <span className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-disabled">
          Text Library
        </span>
        {TEXT_CATEGORIES.map((cat) => {
          const active = filter === cat.id;
          const count =
            cat.id === 'default'
              ? 2
              : cat.id === 'all'
                ? SMART_TEXT_TEMPLATES.length
                : SMART_TEXT_TEMPLATES.filter((t) => t.category === cat.id).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilter(cat.id)}
              className={`flex items-center justify-between rounded-button px-2.5 py-1.5 text-xs transition-all text-left ${
                active
                  ? 'bg-accent-ai/15 font-semibold text-accent-ai'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span
                  className={`material-symbols-outlined text-[17px] ${active ? 'text-accent-ai' : ''}`}
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
        {/* Search & AI Actions Header */}
        <div className="flex flex-col gap-2 border-b border-hairline p-3 bg-bg-card/30">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 flex items-center">
              <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-text-disabled pointer-events-none">
                search
              </span>
              <input
                type="text"
                placeholder="Search motion graphics templates..."
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

            <button
              type="button"
              onClick={() => setShowAiDrawer((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold shadow-sm transition-all ${
                showAiDrawer
                  ? 'bg-accent-ai text-white'
                  : 'border border-accent-ai/40 bg-accent-ai/10 text-accent-ai hover:bg-accent-ai/20'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
              <span>AI Title Generator</span>
            </button>
          </div>

          {/* AI Smart Title & Hook Generator Expandable Drawer */}
          {showAiDrawer && (
            <div className="flex flex-col gap-3 rounded-lg border border-accent-ai/30 bg-bg-sidebar/80 p-3 mt-1 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-accent-ai">
                  <span className="material-symbols-outlined text-[18px]">psychology</span>
                  <span>AI Viral Hook & Title Creator</span>
                </div>
                <span className="text-[10px] text-text-muted">Powered by Smart Motion Typography</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Enter video topic (e.g. 5 Morning Habits, Tokyo Travel, Tech Review)..."
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerateHooks();
                  }}
                  className="flex-1 rounded border border-hairline bg-bg-app px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:border-accent-ai focus:outline-none"
                />

                <div className="flex items-center gap-1 shrink-0">
                  {(['viral', 'professional', 'cinematic', 'energetic'] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setAiTone(tone)}
                      className={`rounded px-2 py-1 text-[11px] font-medium capitalize transition-all ${
                        aiTone === tone
                          ? 'bg-accent-ai text-white'
                          : 'bg-bg-app text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleGenerateHooks}
                    className="flex items-center gap-1 rounded bg-accent-ai px-3 py-1 text-xs font-semibold text-white hover:opacity-90 transition-opacity ml-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">bolt</span>
                    Generate
                  </button>
                </div>
              </div>

              {/* Suggestions List */}
              {aiSuggestions.length > 0 && (
                <div className="grid grid-cols-1 gap-2 pt-1 border-t border-hairline/40">
                  {aiSuggestions.map((hook) => (
                    <div
                      key={hook.id}
                      className="flex items-center justify-between rounded border border-hairline bg-bg-card p-2 hover:border-accent-ai/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent-ai/15 text-accent-ai">
                          <span className="material-symbols-outlined text-[16px]">{hook.badgeIcon}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-text-primary truncate">
                            {hook.title}
                          </span>
                          <span className="text-[10px] text-text-muted truncate">
                            {hook.subtitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-accent-ai">
                          {hook.estimatedEngagement}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleAddHookToTimeline(hook)}
                          className="flex items-center gap-1 rounded bg-accent-ai/20 px-2 py-1 text-[11px] font-semibold text-accent-ai hover:bg-accent-ai hover:text-white transition-all"
                        >
                          <span className="material-symbols-outlined text-[13px]">add</span>
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 flex flex-col gap-4">
          {/* Quick Default Text Hero Cards */}
          {(filter === 'default' || filter === 'all') && !searchQuery && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
                Quick Text
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
                      Default Heading
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
                      Default Subtitle
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

          {/* Templates Grid */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
                Motion Graphics Templates ({filteredTemplates.length})
              </span>
              <span className="text-[10px] text-text-muted">Drag or click to insert at playhead</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filteredTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  draggable
                  onDragStart={(event) =>
                    beginTimelineDrag(event, [
                      {
                        kind: 'text',
                        presetId: tmpl.style.preset,
                        label: tmpl.primaryText,
                      },
                    ])
                  }
                  className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-button)] border border-hairline bg-bg-card p-2.5 transition-all duration-200 hover:border-accent-ai/50 hover:bg-bg-hover cursor-grab active:cursor-grabbing"
                >
                  {/* Preview Thumbnail Box */}
                  <div className="relative mb-2 flex h-28 w-full flex-col justify-center items-center overflow-hidden rounded bg-[#0b0d13] p-2 border border-hairline/40">
                    {/* Background grid texture */}
                    <div className="absolute inset-0 bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:12px_12px] opacity-40" />

                    {/* Simulated Text / Badge Placement */}
                    <div
                      className={`relative z-10 flex flex-col items-center justify-center px-2 py-1 rounded max-w-full text-center ${
                        tmpl.layout === 'badge_pill'
                          ? 'border border-white/10 shadow-lg'
                          : ''
                      }`}
                      style={{
                        backgroundColor: tmpl.style.box
                          ? tmpl.style.box.colorHex +
                            Math.round(tmpl.style.box.opacity * 255)
                              .toString(16)
                              .padStart(2, '0')
                          : undefined,
                        borderRadius: tmpl.style.box?.borderRadiusPx
                          ? `${Math.min(tmpl.style.box.borderRadiusPx, 20)}px`
                          : undefined,
                      }}
                    >
                      <div className="flex items-center gap-1.5 justify-center">
                        {tmpl.badgeIcon && (
                          <span
                            className="material-symbols-outlined text-[15px] shrink-0"
                            style={{ color: tmpl.style.colorHex }}
                          >
                            {tmpl.badgeIcon}
                          </span>
                        )}
                        <span
                          className="font-bold leading-tight tracking-tight text-[11px] truncate max-w-[180px]"
                          style={{
                            color: tmpl.style.colorHex,
                            fontFamily: tmpl.style.fontFamily ?? 'Inter',
                          }}
                        >
                          {tmpl.primaryText}
                        </span>
                      </div>

                      {tmpl.secondaryText && (
                        <span
                          className="text-[9px] font-medium leading-tight truncate max-w-[180px] mt-0.5"
                          style={{
                            color: tmpl.style.secondaryColorHex ?? 'rgba(255, 255, 255, 0.7)',
                          }}
                        >
                          {tmpl.secondaryText}
                        </span>
                      )}
                    </div>

                    {/* Animation indicator pill */}
                    {tmpl.compoundAnimation && (
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-accent-ai/20 border border-accent-ai/30 px-1 py-0.5 font-mono text-[8px] text-accent-ai flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[10px]">motion_photos_on</span>
                        {tmpl.compoundAnimation.inAnimation}
                      </span>
                    )}

                    {/* Duration indicator */}
                    <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] text-text-disabled">
                      {tmpl.durationSeconds}s
                    </span>
                  </div>

                  {/* Title & Category Info */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-primary tracking-tight truncate mr-2">
                      {tmpl.name}
                    </span>
                    <span className="text-[9px] font-mono text-text-disabled uppercase shrink-0">
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
        </div>
      </div>
    </div>
  );
}
