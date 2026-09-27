import { useRef, useState } from 'react';

import {
  WHITEBOARD_DEFAULTS,
  WHITEBOARD_PRESETS,
  WHITEBOARD_TRACE_DEFAULTS,
  autoAlignWhiteboardToAudioPeaks,
  exportWhiteboardAnnotation,
  importWhiteboardAnnotation,
  resolveWhiteboardDrawSeconds,
  resolveWhiteboardInSeconds,
  resolveWhiteboardInFrame,
  resolveWhiteboardOutFrame,
  whiteboardEffectiveDrawFraction,
  whiteboardEffectiveInFraction,
  type WhiteboardPreset,
  type WhiteboardSettings,
  type WhiteboardZone,
  type WhiteboardZoneType,
  type StoryboardPackageOptions,
  type SmudgeToolMode,
  type ToolSwapTransitionType,
  type DraftingGuideMode,
  type GuideMaterialType,
  type LensApertureFStop,
  type DuetPartitionMode,
  type NeonPalettePreset,
  type LightboardLedPreset,
  type LaserColorPreset,
  type PerspectiveGridMode,
  type PaletteDockStyle,
  type PaletteColorPreset,
  type StickyNoteColorPreset,
  type StickyPinStyle,
  type StencilShape,
  type CalloutBadgeStyle,
  type HighlighterColorPreset,
  type HighlighterCompositeMode,
} from '@shared';

import { selectSelectedClip, useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl';
import { Switch } from '../../../shared/ui/Switch';

import { WhiteboardZoneEditorModal } from './WhiteboardZoneEditorModal';
import { WhiteboardFoleyEngine } from '../lib/whiteboard-foley';

type RevealPatternCategory = 'serpentine' | 'wipe' | 'zones' | 'trace';

interface PatternCategoryItem {
  id: RevealPatternCategory;
  label: string;
  icon: string;
  description: string;
}

const REVEAL_PATTERN_CATEGORIES: readonly PatternCategoryItem[] = [
  { id: 'serpentine', label: 'Writing', icon: 'edit_note', description: 'Multi-line handwriting or reading sweep' },
  { id: 'wipe', label: 'Wipe', icon: 'swipe', description: 'Directional edge wipe reveal' },
  { id: 'zones', label: 'Custom Zones', icon: 'crop_free', description: 'Region-by-region sequenced reveal' },
  { id: 'trace', label: 'Line-Art Sketch', icon: 'draw', description: 'Content-aware vector linework' },
];

/**
 * Beta S279 / S6 — Refactored Sketches Pane.
 *
 * Designed for 100% UI consistency with EffectsPane and TransitionsPane:
 * - Left Category Rail: Direct Reveal Pattern Selector (Writing, Wipe, Custom Zones, Line-Art Sketch).
 * - Right Content Stage: Clean 3-Card structure tailored specifically to the selected pattern.
 *   - Card 1: Pattern Specific Parameters (Rows for writing, Direction for wipe, Zone cards for zones, Detail for trace).
 *   - Card 2: Universal Timing & In/Out Keyframes.
 *   - Card 3: Universal Hand Stylus & Artistic Board Look.
 */
export function SketchPane() {
  const clip = useSequenceStore(selectSelectedClip);
  const fps = useSequenceStore((state) => state.document?.sequence.fps ?? 30);
  const frameWidth = useSequenceStore((state) => state.document?.sequence.width ?? 1920);
  const frameHeight = useSequenceStore((state) => state.document?.sequence.height ?? 1080);
  const patchClip = useSequenceStore((state) => state.patchClip);
  const tracks = useSequenceStore((state) => state.document?.tracks ?? []);
  const allClips = useSequenceStore((state) => state.document?.clips ?? []);

  const [zoneEditorOpen, setZoneEditorOpen] = useState(false);
  const [isSyncingAudio, setIsSyncingAudio] = useState(false);
  const [isStreamingInk, setIsStreamingInk] = useState(false);
  const [draftSettings, setDraftSettings] = useState<WhiteboardSettings>({
    ...WHITEBOARD_DEFAULTS,
    inFraction: 0,
    drawFraction: 0.85,
  });

  const handleSyncToAudio = async () => {
    if (!targetClip) return;
    setIsSyncingAudio(true);
    try {
      const audioTracks = tracks.filter((t) => t.kind === 'audio');
      const audioClips = allClips.filter(
        (c) => audioTracks.some((t) => t.id === c.trackId) && c.filePath,
      );
      const audioSource =
        audioClips[0]?.filePath ??
        (targetClip.sourceKind === 'video' && targetClip.filePath ? targetClip.filePath : null);

      if (!audioSource) return;

      const peaks = await window.api.sequence.getPeaks(audioSource);
      if (!peaks || peaks.length === 0) return;

      const aligned = autoAlignWhiteboardToAudioPeaks(peaks, activeSettings.zones);
      const next: WhiteboardSettings = {
        ...activeSettings,
        inFraction: aligned.inFraction,
        drawFraction: aligned.drawFraction,
        ...(aligned.zones ? { zones: aligned.zones } : {}),
      };
      delete next.inSeconds;
      delete next.drawSeconds;
      updateSettings(next);
    } catch (err) {
      console.error('Failed to auto-align whiteboard to audio:', err);
    } finally {
      setIsSyncingAudio(false);
    }
  };

  const targetClip = clip?.sourceKind === 'still' || clip?.sourceKind === 'video' ? clip : null;
  const isApplied = Boolean(targetClip?.effects?.whiteboard);
  const activeSettings: WhiteboardSettings = targetClip?.effects?.whiteboard ?? draftSettings;

  const durationFrames = targetClip?.durationFrames ?? fps * 4; // fallback 4s reference

  const updateSettings = (next: WhiteboardSettings) => {
    setDraftSettings(next);
    if (targetClip && isApplied) {
      patchClip(targetClip.id, {
        effects: { ...targetClip.effects, whiteboard: next },
      });
    }
  };

  const handleSelectPattern = (pattern: RevealPatternCategory) => {
    let next: WhiteboardSettings = { ...activeSettings, pattern };
    if (pattern === 'trace') {
      next = {
        ...next,
        trace: activeSettings.trace ?? WHITEBOARD_TRACE_DEFAULTS,
        cadenceFps: activeSettings.cadenceFps ?? 12,
      };
    } else if (pattern === 'serpentine' || pattern === 'wipe') {
      delete next.cadenceFps;
    }
    updateSettings(next);
  };

  const handleApplyPreset = (preset: WhiteboardPreset) => {
    let next: WhiteboardSettings = {
      ...activeSettings,
      pattern: preset.pattern,
      look: preset.look,
      hand: preset.hand,
      cadenceFps: preset.cadenceFps,
      drawFraction: preset.drawFraction ?? activeSettings.drawFraction ?? 0.85,
    };
    if (preset.rows) {
      next.rows = preset.rows;
    }
    if (preset.pattern === 'trace') {
      next.trace = activeSettings.trace ?? WHITEBOARD_TRACE_DEFAULTS;
    }
    updateSettings(next);
  };


  const enable = () => {
    if (!targetClip) return;
    patchClip(targetClip.id, {
      motionPreset: 'none',
      effects: { ...targetClip.effects, whiteboard: { ...activeSettings } },
    });
  };

  const disable = () => {
    if (!targetClip) return;
    const rest = { ...targetClip.effects };
    delete rest.whiteboard;
    patchClip(targetClip.id, { effects: rest });
  };

  const inSec = resolveWhiteboardInSeconds(activeSettings, durationFrames, fps);
  const inPct = Math.round(
    whiteboardEffectiveInFraction(activeSettings, durationFrames, fps) * 100,
  );
  const inFrame = resolveWhiteboardInFrame(activeSettings, durationFrames, fps);

  const drawSec = resolveWhiteboardDrawSeconds(activeSettings, durationFrames, fps);
  const drawPct = Math.round(
    whiteboardEffectiveDrawFraction(activeSettings, durationFrames, fps) * 100,
  );
  const outFrame = resolveWhiteboardOutFrame(activeSettings, durationFrames, fps);

  // Active pattern is determined directly by activeSettings.pattern
  const selectedPattern = activeSettings.pattern;

  // Helpers for custom zones manipulation directly in the settings stage
  const handleUpdateZone = (zoneIndex: number, patch: Partial<WhiteboardZone>) => {
    if (!activeSettings.zones) return;
    const updated = activeSettings.zones.map((z, idx) =>
      idx === zoneIndex ? { ...z, ...patch } : z,
    );
    updateSettings({ ...activeSettings, zones: updated });
  };

  const handleDeleteZone = (zoneIndex: number) => {
    if (!activeSettings.zones) return;
    const filtered = activeSettings.zones.filter((_, idx) => idx !== zoneIndex);
    const next: WhiteboardSettings =
      filtered.length > 0
        ? { ...activeSettings, zones: filtered }
        : (() => {
            const rest = { ...activeSettings };
            delete rest.zones;
            return rest;
          })();
    updateSettings(next);
  };

  const paneFileInputRef = useRef<HTMLInputElement>(null);

  const handlePaneExportAnnotation = () => {
    if (!activeSettings.zones || activeSettings.zones.length === 0) return;
    const payload = exportWhiteboardAnnotation(activeSettings.zones, frameWidth, frameHeight);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${targetClip?.label || 'scene'}.annotation.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePaneImportAnnotation = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        const importedZones = importWhiteboardAnnotation(parsed, frameWidth, frameHeight);
        if (importedZones.length > 0) {
          updateSettings({ ...activeSettings, pattern: 'zones', zones: importedZones });
        }
      } catch (err) {
        console.error('Failed to import annotation in SketchPane:', err);
      }
    };
    reader.readAsText(file);
    if (paneFileInputRef.current) {
      paneFileInputRef.current.value = '';
    }
  };

  const handleExportStoryboard = () => {
    const sceneId = targetClip?.id || 'scene_01';
    const pkg: StoryboardPackageOptions = {
      packageId: `package_${Date.now()}`,
      title: targetClip?.label || 'Whiteboard Presentation',
      fps,
      scenes: [
        {
          sceneId,
          title: targetClip?.label || 'Main Scene',
          imagePath: targetClip?.filePath || '',
          durationSec: durationFrames / fps,
          handStylus: activeSettings.hand,
          drawFraction: activeSettings.drawFraction ?? 0.80,
          eraseOut: activeSettings.eraseOut ?? false,
          erasePattern: activeSettings.erasePattern ?? 'zigzag',
          eraseFraction: activeSettings.eraseFraction ?? 0.20,
          foleyEnabled: activeSettings.foleyEnabled ?? true,
          foleyVolume: activeSettings.foleyVolume ?? 0.60,
        },
      ],
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${targetClip?.label || 'storyboard'}.storyboard.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-canvas text-text-primary select-none">
      {/* Left Vertical Category Sub-Sidebar (100% consistent with EffectsPane / TransitionsPane) */}
      <div className="flex w-36 shrink-0 flex-col gap-1 border-r border-hairline/60 bg-bg-sidebar/40 p-2 select-none overflow-y-auto">
        <span className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-disabled">
          Reveal Patterns
        </span>
        {REVEAL_PATTERN_CATEGORIES.map((cat) => {
          const active = selectedPattern === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleSelectPattern(cat.id)}
              className={`flex items-center gap-2 rounded-button px-2 py-2 text-xs transition-all text-left ${
                active
                  ? 'bg-accent-ai/15 font-semibold text-accent-ai shadow-sm ring-1 ring-accent-ai/30'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
              title={cat.description}
            >
              <span
                className={`material-symbols-outlined text-[17px] shrink-0 ${
                  active ? 'text-accent-ai' : 'text-text-disabled'
                }`}
              >
                {cat.icon}
              </span>
              <span className="truncate">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right Main Settings Stage (Tailored to Selected Pattern) */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden bg-bg-canvas">
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3 text-xs">
          {/* Top Selection Context & Master Switch */}
          <div className="flex items-center justify-between rounded-card border border-hairline bg-bg-app/50 p-2.5 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="material-symbols-outlined text-[20px] text-accent-ai shrink-0">
                {selectedPattern === 'zones'
                  ? 'crop_free'
                  : selectedPattern === 'wipe'
                    ? 'swipe'
                    : selectedPattern === 'trace'
                      ? 'draw'
                      : 'edit_note'}
              </span>
              <div className="flex flex-col truncate">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-text-primary text-[12px] truncate">
                    {targetClip
                      ? targetClip.label ||
                        (targetClip.sourceKind === 'video' ? 'Selected Video' : 'Selected Still')
                      : 'Whiteboard Animation'}
                  </span>
                  <span className="rounded bg-accent-ai/10 px-1 py-0.2 text-[9px] font-mono text-accent-ai uppercase">
                    {selectedPattern === 'zones'
                      ? 'Zones'
                      : selectedPattern === 'wipe'
                        ? 'Wipe'
                        : selectedPattern === 'trace'
                          ? 'Sketch'
                          : 'Writing'}
                  </span>
                </div>
                <span className="text-[10px] text-text-secondary">
                  {targetClip
                    ? isApplied
                      ? 'Whiteboard active on clip'
                      : 'Not applied to clip'
                    : 'Configure default effect'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {targetClip && !isApplied && (
                <Button size="sm" variant="primary" onClick={enable} className="text-xs">
                  Apply
                </Button>
              )}
              <Switch
                checked={targetClip ? isApplied : true}
                label="Toggle Whiteboard Reveal"
                disabled={!targetClip}
                onChange={() => (isApplied ? disable() : enable())}
              />
            </div>
          </div>

          {/* Quick Style Presets Carousel */}
          <div className="flex flex-col gap-2 rounded-card border border-hairline bg-bg-app/40 p-2.5 shadow-sm">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-text-secondary uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-accent-ai">palette</span>
                <span>Aesthetic Style Presets</span>
              </span>
              <span className="text-[10px] text-text-disabled">1-Click Apply</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
              {WHITEBOARD_PRESETS.map((preset) => {
                const isCurrent =
                  activeSettings.look === preset.look &&
                  activeSettings.pattern === preset.pattern &&
                  activeSettings.hand === preset.hand &&
                  (activeSettings.cadenceFps ?? 12) === preset.cadenceFps;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                      isCurrent
                        ? 'border-accent-ai bg-accent-ai/15 text-accent-ai ring-1 ring-accent-ai/40'
                        : 'border-hairline bg-bg-app hover:border-hairline/80 hover:bg-bg-hover text-text-primary'
                    }`}
                    title={preset.description}
                  >
                    <div
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold shadow-sm"
                      style={{ backgroundColor: preset.paperColor, color: preset.textColor }}
                    >
                      <span className="material-symbols-outlined text-[13px]">{preset.icon}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold leading-tight">{preset.name}</span>
                      <span className="text-[9px] text-text-disabled leading-tight">
                        {preset.cadenceFps} FPS · {preset.look}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CARD 1: Pattern Specific Parameters */}
          <Card className="flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
                Pattern Settings: {REVEAL_PATTERN_CATEGORIES.find((c) => c.id === selectedPattern)?.label}
              </span>
              <span className="text-[10px] font-mono text-text-disabled uppercase">
                {selectedPattern}
              </span>
            </div>

            {/* Writing (Serpentine) Settings */}
            {selectedPattern === 'serpentine' && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Writing Rows</span>
                  <span className="font-mono text-text-primary font-medium">
                    {activeSettings.rows ?? 8} lines
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={16}
                  step={1}
                  value={activeSettings.rows ?? 8}
                  aria-label="Writing Rows"
                  className="w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) =>
                    updateSettings({ ...activeSettings, rows: Number(e.target.value) })
                  }
                />
                <p className="text-[10px] text-text-disabled leading-relaxed">
                  The stylus sweeps left-to-right across {activeSettings.rows ?? 8} horizontal
                  reading lines with natural carriage returns.
                </p>

                {/* Milestone S105: Kinetic Typography & Handwriting Cadence */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-accent-ai">text_fields</span>
                        Kinetic Handwriting Flow
                      </span>
                      <span className="text-[10px] text-text-disabled">
                        Letter-by-letter organic handwriting cadence
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeSettings.kineticTypography?.enabled ?? false}
                      aria-label="Kinetic Handwriting Flow"
                      className="accent-[var(--accent-ai)] cursor-pointer h-4 w-4"
                      onChange={(e) =>
                        updateSettings({
                          ...activeSettings,
                          kineticTypography: {
                            ...(activeSettings.kineticTypography ?? {}),
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                  </div>

                  {activeSettings.kineticTypography?.enabled && (
                    <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Letter Cadence</span>
                        <span className="font-mono text-text-primary text-[10px]">
                          {activeSettings.kineticTypography?.letterCadenceMs ?? 150} ms/char
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={400}
                        step={10}
                        value={activeSettings.kineticTypography?.letterCadenceMs ?? 150}
                        aria-label="Letter Cadence"
                        className="w-full accent-[var(--accent-ai)] cursor-pointer"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            kineticTypography: {
                              ...(activeSettings.kineticTypography ?? {}),
                              letterCadenceMs: Number(e.target.value),
                            },
                          })
                        }
                      />

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Punctuation Pause</span>
                        <span className="font-mono text-text-primary text-[10px]">
                          {activeSettings.kineticTypography?.punctuationPauseMs ?? 320} ms
                        </span>
                      </div>
                      <input
                        type="range"
                        min={100}
                        max={800}
                        step={20}
                        value={activeSettings.kineticTypography?.punctuationPauseMs ?? 320}
                        aria-label="Punctuation Pause"
                        className="w-full accent-[var(--accent-ai)] cursor-pointer"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            kineticTypography: {
                              ...(activeSettings.kineticTypography ?? {}),
                              punctuationPauseMs: Number(e.target.value),
                            },
                          })
                        }
                      />

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Cursive Ligatures</span>
                        <input
                          type="checkbox"
                          checked={activeSettings.kineticTypography?.cursiveLigatures ?? false}
                          aria-label="Cursive Ligatures"
                          className="accent-[var(--accent-ai)] cursor-pointer h-3.5 w-3.5"
                          onChange={(e) =>
                            updateSettings({
                              ...activeSettings,
                              kineticTypography: {
                                ...(activeSettings.kineticTypography ?? {}),
                                cursiveLigatures: e.target.checked,
                              },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Motor Tremor (Jitter)</span>
                        <span className="font-mono text-text-primary text-[10px]">
                          {((activeSettings.kineticTypography?.handwritingJitter ?? 0.15) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.02}
                        value={activeSettings.kineticTypography?.handwritingJitter ?? 0.15}
                        aria-label="Handwriting Jitter"
                        className="w-full accent-[var(--accent-ai)] cursor-pointer"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            kineticTypography: {
                              ...(activeSettings.kineticTypography ?? {}),
                              handwritingJitter: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Milestone S106: Script Direction & Bidirectional Writing */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-accent-ai">format_textdirection_r_to_l</span>
                        Script Direction
                      </span>
                      <span className="text-[10px] text-text-disabled">
                        LTR / RTL (Arabic, Hebrew) & carriage returns
                      </span>
                    </div>
                    <SegmentedControl
                      value={activeSettings.bidiWriting?.direction ?? 'auto'}
                      onChange={(dir) =>
                        updateSettings({
                          ...activeSettings,
                          bidiWriting: {
                            ...(activeSettings.bidiWriting ?? {}),
                            direction: dir as 'auto' | 'ltr' | 'rtl' | 'vertical',
                          },
                        })
                      }
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'ltr', label: 'LTR' },
                        { value: 'rtl', label: 'RTL' },
                      ]}
                      ariaLabel="Script direction"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <div className="flex flex-col">
                      <span className="text-text-secondary">Two-Pass Cursive Diacritics</span>
                      <span className="text-[10px] text-text-disabled">Write word skeleton first, then dots/vowels</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeSettings.bidiWriting?.deferDiacritics ?? true}
                      aria-label="Two-Pass Cursive Diacritics"
                      className="accent-[var(--accent-ai)] cursor-pointer h-4 w-4"
                      onChange={(e) =>
                        updateSettings({
                          ...activeSettings,
                          bidiWriting: {
                            ...(activeSettings.bidiWriting ?? {}),
                            deferDiacritics: e.target.checked,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Wipe Settings */}
            {selectedPattern === 'wipe' && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Wipe Direction</span>
                  <span className="font-mono text-text-primary text-[10px]">
                    {activeSettings.rows === 1 ? 'Straight Edge' : 'Directional'}
                  </span>
                </div>
                <SegmentedControl
                  value={activeSettings.rows === 1 ? 'lr' : 'lr'}
                  onChange={() => {
                    updateSettings({ ...activeSettings, rows: 1 });
                  }}
                  options={[
                    { value: 'lr', label: 'Left to Right' },
                  ]}
                  ariaLabel="Wipe direction"
                />
                <p className="text-[10px] text-text-disabled leading-relaxed">
                  Clean continuous edge sweep revealing the full image without row breaks.
                </p>
              </div>
            )}

            {/* Custom Zones Settings */}
            {selectedPattern === 'zones' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-secondary">Region-by-Region Masks</span>
                  <span className="rounded bg-accent-ai/15 px-1.5 py-0.5 text-[10px] font-mono font-bold text-accent-ai">
                    {activeSettings.zones?.length ?? 0} zone(s)
                  </span>
                </div>

                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Partition the image into sequenced regions so each section is fully drawn before
                  moving to the next. The timeline lane shows visual thumbnails for each zone.
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!targetClip?.filePath}
                    className="flex-1 flex items-center justify-center gap-1.5 font-medium shadow-sm"
                    onClick={() => setZoneEditorOpen(true)}
                    title={!targetClip?.filePath ? 'Select a clip on the timeline to edit zones' : undefined}
                  >
                    <span className="material-symbols-outlined text-[16px] text-accent-ai">crop_free</span>
                    <span>Zone Editor…</span>
                  </Button>
                  <input
                    ref={paneFileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handlePaneImportAnnotation}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => paneFileInputRef.current?.click()}
                    title="Import annotation JSON"
                    className="px-2.5 flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">file_upload</span>
                    <span className="text-[11px]">Import</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!activeSettings.zones || activeSettings.zones.length === 0}
                    onClick={handlePaneExportAnnotation}
                    title="Export annotation JSON"
                    className="px-2.5 flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">file_download</span>
                    <span className="text-[11px]">Export</span>
                  </Button>
                </div>

                {/* Zone Cards List */}
                {activeSettings.zones && activeSettings.zones.length > 0 ? (
                  <div className="flex flex-col gap-2 pt-1 border-t border-hairline/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-disabled">
                      Configured Zones
                    </span>
                    {activeSettings.zones.map((zone, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-1.5 rounded-md border border-hairline bg-bg-app/60 p-2 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-black/60 px-1 py-0.2 font-mono font-bold text-[9px] text-accent-ai border border-accent-ai/30">
                              Z{idx + 1}
                            </span>
                            <span className="font-semibold text-text-primary">
                              Zone {idx + 1}
                            </span>
                          </div>
                          <button
                            type="button"
                            title="Delete Zone"
                            onClick={() => handleDeleteZone(idx)}
                            className="flex h-5 w-5 items-center justify-center rounded text-text-disabled hover:bg-accent-warning/20 hover:text-accent-warning transition-colors"
                          >
                            <span className="material-symbols-outlined text-[13px]">delete</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[10px] text-text-secondary">Type</span>
                          <SegmentedControl
                            value={zone.type ?? 'sketch'}
                            onChange={(val) =>
                              handleUpdateZone(idx, { type: val as WhiteboardZoneType })
                            }
                            options={[
                              { value: 'sketch', label: 'Contour' },
                              { value: 'writing', label: 'Lines' },
                              { value: 'scribble', label: 'Zigzag' },
                              { value: 'wipe', label: 'Sweep' },
                            ]}
                            ariaLabel={`Zone ${idx + 1} Type`}
                          />
                        </div>

                        {zone.type === 'scribble' && (
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-hairline/50">
                            <span className="text-[10px] text-text-secondary">Angle & Cross</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono text-text-disabled">{zone.hatchAngle ?? 45}°</span>
                              <input
                                type="range"
                                min={0}
                                max={180}
                                step={15}
                                value={zone.hatchAngle ?? 45}
                                aria-label="Hatch Angle"
                                className="w-16 accent-[var(--accent-ai)] cursor-pointer"
                                onChange={(e) => handleUpdateZone(idx, { hatchAngle: Number(e.target.value) })}
                              />
                              <button
                                type="button"
                                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                                  zone.crossHatch ? 'bg-accent-ai text-white' : 'bg-bg-hover text-text-secondary'
                                }`}
                                onClick={() => handleUpdateZone(idx, { crossHatch: !zone.crossHatch })}
                                title="Toggle two-pass orthogonal cross-hatching"
                              >
                                ✕ Cross
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[10px] text-text-secondary">Duration Weight</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={0.5}
                              max={3}
                              step={0.5}
                              value={zone.weight ?? 1}
                              aria-label={`Zone ${idx + 1} Weight`}
                              className="w-20 accent-[var(--accent-ai)] cursor-pointer"
                              onChange={(e) =>
                                handleUpdateZone(idx, { weight: Number(e.target.value) })
                              }
                            />
                            <span className="font-mono text-[10px] text-text-primary w-6 text-right">
                              {(zone.weight ?? 1).toFixed(1)}x
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-hairline p-3 text-center text-text-disabled">
                    <span className="material-symbols-outlined text-[20px] opacity-60">
                      draw_abstract
                    </span>
                    <span className="text-[10px]">
                      No custom zones drawn yet. Click above to open the mask editor.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Line-Art Sketch (Trace) Settings */}
            {selectedPattern === 'trace' && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-secondary">Line Detail</span>
                  <SegmentedControl
                    value={activeSettings.trace?.detail ?? WHITEBOARD_TRACE_DEFAULTS.detail}
                    onChange={(detail) => {
                      if (detail !== 'low' && detail !== 'medium' && detail !== 'high') return;
                      updateSettings({
                        ...activeSettings,
                        trace: {
                          ...(activeSettings.trace ?? WHITEBOARD_TRACE_DEFAULTS),
                          detail,
                        },
                      });
                    }}
                    options={[
                      { value: 'low', label: 'Bold' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'Fine' },
                    ]}
                    ariaLabel="Sketch detail"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-secondary">Stroke Order</span>
                  <SegmentedControl
                    value={activeSettings.trace?.order ?? WHITEBOARD_TRACE_DEFAULTS.order}
                    onChange={(order) => {
                      if (order !== 'reading' && order !== 'nearest') return;
                      updateSettings({
                        ...activeSettings,
                        trace: {
                          ...(activeSettings.trace ?? WHITEBOARD_TRACE_DEFAULTS),
                          order,
                        },
                      });
                    }}
                    options={[
                      { value: 'nearest', label: 'Flowing' },
                      { value: 'reading', label: 'Reading' },
                    ]}
                    ariaLabel="Stroke order"
                  />
                </div>

                {/* Milestone S98: Stroke Saliency Clustering & Contour Prioritization */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-text-secondary">Contour Clustering</span>
                    <span className="text-[10px] text-text-disabled">Silhouette-first component grouping</span>
                  </div>
                  <SegmentedControl
                    value={activeSettings.clusteringMode ?? 'hierarchical'}
                    onChange={(mode) =>
                      updateSettings({
                        ...activeSettings,
                        clusteringMode: mode as 'none' | 'proximity' | 'saliency' | 'hierarchical',
                      })
                    }
                    options={[
                      { value: 'hierarchical', label: 'Smart' },
                      { value: 'saliency', label: 'Outlines' },
                      { value: 'proximity', label: 'Clusters' },
                      { value: 'none', label: 'Raw' },
                    ]}
                    ariaLabel="Contour clustering mode"
                  />
                </div>

                {/* Milestone S94: Stroke Smoothing & RDP Decimation */}
                <div className="flex items-center justify-between pt-2 border-t border-hairline">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-text-secondary">Stroke Smoothing</span>
                    <span className="text-[10px] text-text-disabled">Catmull-Rom Bézier spline</span>
                  </div>
                  <SegmentedControl
                    value={activeSettings.strokeSmoothing ?? 'smooth'}
                    onChange={(val) =>
                      updateSettings({
                        ...activeSettings,
                        strokeSmoothing: val as 'none' | 'subtle' | 'smooth' | 'high',
                      })
                    }
                    options={[
                      { value: 'none', label: 'Raw' },
                      { value: 'subtle', label: 'Subtle' },
                      { value: 'smooth', label: 'Smooth' },
                      { value: 'high', label: 'Ultra' },
                    ]}
                    ariaLabel="Stroke smoothing profile"
                  />
                </div>

                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Corner Precision</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.simplifyTolerance ?? 1.2).toFixed(1)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={2.5}
                    step={0.1}
                    value={activeSettings.simplifyTolerance ?? 1.2}
                    aria-label="Stroke Decimation Tolerance"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        simplifyTolerance: Number(e.target.value),
                      })
                    }
                  />
                </div>

                {/* Milestone S95: Vector Path Dynamic Morphing */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-accent-ai">transform</span>
                        Continuous Vector Morphing
                      </span>
                      <span className="text-[10px] text-text-disabled">
                        Smooth shape tweening into next scene outline
                      </span>
                    </div>
                    <Switch
                      checked={activeSettings.morphTransition?.enabled === true}
                      onChange={() => {
                        const current = activeSettings.morphTransition?.enabled ?? false;
                        updateSettings({
                          ...activeSettings,
                          morphTransition: {
                            ...activeSettings.morphTransition,
                            enabled: !current,
                            easing: activeSettings.morphTransition?.easing ?? 'ease-in-out',
                            durationSeconds: activeSettings.morphTransition?.durationSeconds ?? 1.0,
                          },
                        });
                      }}
                      label="Toggle vector morphing"
                    />
                  </div>

                  {activeSettings.morphTransition?.enabled && (
                    <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Morph Easing</span>
                        <SegmentedControl
                          value={activeSettings.morphTransition?.easing ?? 'ease-in-out'}
                          onChange={(val) =>
                            updateSettings({
                              ...activeSettings,
                              morphTransition: {
                                ...activeSettings.morphTransition,
                                easing: val as 'linear' | 'ease-in-out' | 'elastic',
                              },
                            })
                          }
                          options={[
                            { value: 'ease-in-out', label: 'Smooth' },
                            { value: 'linear', label: 'Linear' },
                            { value: 'elastic', label: 'Elastic' },
                          ]}
                          ariaLabel="Morph easing"
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Morph Duration</span>
                        <span className="font-mono text-text-primary text-[10px]">
                          {(activeSettings.morphTransition?.durationSeconds ?? 1.0).toFixed(1)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.3}
                        max={3.0}
                        step={0.1}
                        value={activeSettings.morphTransition?.durationSeconds ?? 1.0}
                        aria-label="Morph Duration"
                        className="w-full accent-[var(--accent-ai)] cursor-pointer"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            morphTransition: {
                              ...activeSettings.morphTransition,
                              durationSeconds: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Milestone S96: Shading Texture & Cross-Hatching */}
                <div className="flex items-center justify-between pt-2 border-t border-hairline">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-text-secondary">Shading Style</span>
                    <span className="text-[10px] text-text-disabled">Interior region fill texture</span>
                  </div>
                  <SegmentedControl
                    value={activeSettings.shadingStyle ?? 'bloom'}
                    onChange={(val) =>
                      updateSettings({
                        ...activeSettings,
                        shadingStyle: val as 'bloom' | 'hatch' | 'crosshatch',
                      })
                    }
                    options={[
                      { value: 'bloom', label: 'Bloom' },
                      { value: 'hatch', label: 'Hatch' },
                      { value: 'crosshatch', label: 'Cross' },
                    ]}
                    ariaLabel="Shading Style"
                  />
                </div>

                {/* Milestone S104: AI Bitmap Vectorization & Contour Auto-Trace */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-accent-ai">auto_fix_high</span>
                        Contour Auto-Trace
                      </span>
                      <span className="text-[10px] text-text-disabled">
                        Resolution-independent vector outline extraction
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeSettings.autoTrace?.enabled ?? false}
                      aria-label="Contour Auto-Trace"
                      className="accent-[var(--accent-ai)] cursor-pointer h-4 w-4"
                      onChange={(e) =>
                        updateSettings({
                          ...activeSettings,
                          autoTrace: {
                            ...(activeSettings.autoTrace ?? {}),
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                  </div>

                  {activeSettings.autoTrace?.enabled && (
                    <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Trace Binarization</span>
                        <span className="font-mono text-text-primary text-[10px]">
                          {(activeSettings.autoTrace?.threshold ?? 0) === 0
                            ? 'Auto-Otsu'
                            : `${activeSettings.autoTrace?.threshold}`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={255}
                        step={1}
                        value={activeSettings.autoTrace?.threshold ?? 0}
                        aria-label="Trace Binarization Threshold"
                        className="w-full accent-[var(--accent-ai)] cursor-pointer"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            autoTrace: {
                              ...(activeSettings.autoTrace ?? {}),
                              threshold: Number(e.target.value),
                            },
                          })
                        }
                      />

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Corner Tolerance</span>
                        <span className="font-mono text-text-primary text-[10px]">
                          {(activeSettings.autoTrace?.cornerTolerance ?? 1.2).toFixed(1)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={5.0}
                        step={0.1}
                        value={activeSettings.autoTrace?.cornerTolerance ?? 1.2}
                        aria-label="Trace Corner Tolerance"
                        className="w-full accent-[var(--accent-ai)] cursor-pointer"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            autoTrace: {
                              ...(activeSettings.autoTrace ?? {}),
                              cornerTolerance: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-text-disabled leading-relaxed">
                  Vector edge detector traces structural contours first, then smoothly transitions
                  into the final picture.
                </p>
              </div>
            )}
          </Card>

          {/* CARD 2: Universal Timing & In/Out Keyframes */}
          <Card className="flex flex-col gap-3 p-3">
            <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
              Timing & Keyframes
            </span>

            {/* Keyframe In (Start Point) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-text-secondary">
                  <span className="text-accent-warning">◆</span> Keyframe In (Start Delay)
                </span>
                <span className="font-mono text-text-primary text-[11px]">
                  {inSec.toFixed(2)}s ({inPct}%) • {inFrame}f
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, (activeSettings.drawFraction ?? 0.85) - 0.05)}
                step={0.02}
                value={whiteboardEffectiveInFraction(activeSettings, durationFrames, fps)}
                aria-label="Sketch In Keyframe"
                className="w-full accent-[var(--accent-warning)] cursor-pointer"
                onChange={(event) => {
                  const next = { ...activeSettings, inFraction: Number(event.target.value) };
                  delete next.inSeconds;
                  updateSettings(next);
                }}
              />
            </div>

            {/* Keyframe Out (End Point) */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-text-secondary">
                  <span className="text-accent-ai">◆</span> Keyframe Out (Draw Complete)
                </span>
                <span className="font-mono text-text-primary text-[11px]">
                  {drawSec.toFixed(2)}s ({drawPct}%) • {outFrame}f
                </span>
              </div>
              <input
                type="range"
                min={Math.min(1, (activeSettings.inFraction ?? 0) + 0.05)}
                max={1}
                step={0.02}
                value={whiteboardEffectiveDrawFraction(activeSettings, durationFrames, fps)}
                aria-label="Sketch Out Keyframe"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(event) => {
                  const next = { ...activeSettings, drawFraction: Number(event.target.value) };
                  delete next.drawSeconds;
                  updateSettings(next);
                }}
              />
            </div>

            {/* Animation Cadence */}
            <div className="flex items-center justify-between pt-2 border-t border-hairline">
              <div className="flex flex-col">
                <span className="text-[11px] text-text-secondary">Animation Cadence</span>
                <span className="text-[10px] text-text-disabled">
                  {activeSettings.cadenceFps ? 'Hand-drawn (12 fps)' : 'Fluid (full frame rate)'}
                </span>
              </div>
              <SegmentedControl
                value={activeSettings.cadenceFps ? '12' : 'smooth'}
                onChange={(value) => {
                  const next = { ...activeSettings };
                  if (value === 'smooth') {
                    delete next.cadenceFps;
                  } else {
                    next.cadenceFps = 12;
                  }
                  updateSettings(next);
                }}
                options={[
                  { value: 'smooth', label: 'Fluid' },
                  { value: '12', label: 'Hand-Drawn' },
                ]}
                ariaLabel="Draw cadence"
              />
            </div>

            {/* Speech Cadence Auto-Sync */}
            <div className="flex items-center justify-between pt-2 border-t border-hairline">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-accent-ai">graphic_eq</span>
                  Speech Cadence Sync
                </span>
                <span className="text-[10px] text-text-disabled">
                  Align keyframes & zone weights to voiceover audio
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={isSyncingAudio || !targetClip}
                className="flex items-center gap-1 px-2.5 text-[11px] font-semibold"
                onClick={handleSyncToAudio}
                title="Scan overlapping narration audio and snap drawing timeline to speech boundaries"
              >
                <span className={`material-symbols-outlined text-[14px] text-accent-ai ${isSyncingAudio ? 'animate-spin' : ''}`}>
                  {isSyncingAudio ? 'sync' : 'auto_fix_high'}
                </span>
                <span>{isSyncingAudio ? 'Syncing…' : 'Auto-Align'}</span>
              </Button>
            </div>

            {/* Milestone S93: Board Clearing / Erase Out Transition */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">cleaning_services</span>
                    Erase Out (Board Clearing)
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Actively scrub board clean before next clip
                  </span>
                </div>
                <Switch
                  checked={activeSettings.eraseOut === true}
                  label="Erase Out toggle"
                  onChange={() => {
                    const next = { ...activeSettings, eraseOut: !activeSettings.eraseOut };
                    updateSettings(next);
                  }}
                />
              </div>

              {activeSettings.eraseOut && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Erase Duration</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {((activeSettings.eraseFraction ?? 0.20) * 100).toFixed(0)}% ({(((activeSettings.eraseFraction ?? 0.20) * durationFrames) / fps).toFixed(2)}s)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.40}
                    step={0.05}
                    value={activeSettings.eraseFraction ?? 0.20}
                    aria-label="Erase Out Fraction"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({ ...activeSettings, eraseFraction: Number(e.target.value) })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Erase Style</span>
                    <SegmentedControl
                      value={activeSettings.erasePattern ?? 'zigzag'}
                      onChange={(pattern) =>
                        updateSettings({ ...activeSettings, erasePattern: pattern as 'zigzag' | 'wipe' })
                      }
                      options={[
                        { value: 'zigzag', label: 'Zigzag Scrub' },
                        { value: 'wipe', label: 'Linear Wipe' },
                      ]}
                      ariaLabel="Erase pattern style"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* CARD 3: Universal Hand Stylus & Artistic Board Look */}
          <Card className="flex flex-col gap-3 p-3">
            <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
              Stylus & Board Look
            </span>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-secondary">Hand Stylus</span>
              <SegmentedControl
                value={activeSettings.hand}
                onChange={(hand) => updateSettings({ ...activeSettings, hand })}
                options={[
                  { value: 'pen', label: 'Pen' },
                  { value: 'marker', label: 'Marker' },
                  { value: 'pencil', label: 'Pencil' },
                  { value: 'chalk', label: 'Chalk' },
                  { value: 'none', label: 'None' },
                ]}
                ariaLabel="Hand style"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-hairline">
              <span className="text-[11px] text-text-secondary">Artistic Look</span>
              <SegmentedControl
                value={activeSettings.look}
                onChange={(look) => updateSettings({ ...activeSettings, look })}
                options={[
                  { value: 'none', label: 'Original' },
                  { value: 'sketch', label: 'Sketch' },
                  { value: 'pencil', label: 'Pencil' },
                  { value: 'comic', label: 'Comic' },
                ]}
                ariaLabel="Board look"
              />
            </div>

            {/* Milestone S97: Dynamic Calligraphy & Variable-Width Brush */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">brush</span>
                    Calligraphy & Brush Dynamics
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Speed pressure tapering & anisotropic chisel nib
                  </span>
                </div>
                <Switch
                  checked={activeSettings.brushDynamics?.taper ?? true}
                  onChange={() => {
                    const currentTaper = activeSettings.brushDynamics?.taper ?? true;
                    updateSettings({
                      ...activeSettings,
                      brushDynamics: {
                        ...activeSettings.brushDynamics,
                        taper: !currentTaper,
                      },
                    });
                  }}
                  label="Toggle stroke tapering"
                />
              </div>

              {(activeSettings.brushDynamics?.taper ?? true) && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-secondary">Chisel-Tip Nib</span>
                    <Switch
                      checked={activeSettings.brushDynamics?.chiselNib ?? false}
                      onChange={() => {
                        const currentChisel = activeSettings.brushDynamics?.chiselNib ?? false;
                        updateSettings({
                          ...activeSettings,
                          brushDynamics: {
                            ...activeSettings.brushDynamics,
                            chiselNib: !currentChisel,
                          },
                        });
                      }}
                      label="Toggle chisel nib"
                    />
                  </div>

                  {activeSettings.brushDynamics?.chiselNib && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-text-secondary">Nib Angle</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-text-primary text-[10px]">
                          {activeSettings.brushDynamics?.nibAngleDeg ?? 45}°
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={180}
                          step={15}
                          value={activeSettings.brushDynamics?.nibAngleDeg ?? 45}
                          aria-label="Chisel Nib Angle"
                          className="w-20 accent-[var(--accent-ai)] cursor-pointer"
                          onChange={(e) =>
                            updateSettings({
                              ...activeSettings,
                              brushDynamics: {
                                ...activeSettings.brushDynamics,
                                nibAngleDeg: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawing Foley Audio SFX */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">volume_up</span>
                    Drawing Foley SFX
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Contact scratch & friction sound synchronized to pen movement
                  </span>
                </div>
                <Switch
                  checked={activeSettings.foleyEnabled ?? true}
                  onChange={() =>
                    updateSettings({
                      ...activeSettings,
                      foleyEnabled: !(activeSettings.foleyEnabled ?? true),
                    })
                  }
                  label="Toggle whiteboard foley audio"
                />
              </div>

              {(activeSettings.foleyEnabled ?? true) && (
                <div className="flex items-center gap-2 pl-1 pt-1">
                  <span className="text-[10px] text-text-disabled w-12 shrink-0">Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={activeSettings.foleyVolume ?? 0.6}
                    aria-label="Foley volume"
                    className="flex-1 accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({ ...activeSettings, foleyVolume: Number(e.target.value) })
                    }
                  />
                  <span className="font-mono text-[10px] text-text-secondary w-8 text-right">
                    {Math.round((activeSettings.foleyVolume ?? 0.6) * 100)}%
                  </span>
                  <button
                    type="button"
                    title="Test Foley Audio Sample"
                    className="flex h-5 w-5 items-center justify-center rounded text-text-disabled hover:bg-bg-hover hover:text-accent-ai transition-colors"
                    onClick={() => {
                      WhiteboardFoleyEngine.getInstance().previewSample(
                        activeSettings.hand,
                        0.7,
                        activeSettings.foleyVolume ?? 0.6,
                      );
                    }}
                  >
                    <span className="material-symbols-outlined text-[13px]">play_circle</span>
                  </button>
                </div>
              )}
            </div>

            {/* Milestone S100: Dynamic Viewport Camera & Hand Shadow */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">videocam</span>
                    Inertial Camera Follower
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Dynamic zoom & smooth tracking of drawing action
                  </span>
                </div>
                <Switch
                  checked={activeSettings.cameraFollower?.enabled === true}
                  onChange={() => {
                    const current = activeSettings.cameraFollower?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      cameraFollower: {
                        ...activeSettings.cameraFollower,
                        enabled: !current,
                        zoom: activeSettings.cameraFollower?.zoom ?? 1.35,
                        smoothness: activeSettings.cameraFollower?.smoothness ?? 0.85,
                        showHandShadow: activeSettings.cameraFollower?.showHandShadow ?? true,
                        shadowAngleDeg: activeSettings.cameraFollower?.shadowAngleDeg ?? 315,
                      },
                    });
                  }}
                  label="Toggle inertial camera follower"
                />
              </div>

              {activeSettings.cameraFollower?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Follower Zoom</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.cameraFollower?.zoom ?? 1.35).toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.1}
                    max={2.5}
                    step={0.05}
                    value={activeSettings.cameraFollower?.zoom ?? 1.35}
                    aria-label="Camera Follower Zoom"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        cameraFollower: {
                          ...activeSettings.cameraFollower,
                          zoom: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Hand Drop Shadow</span>
                    <Switch
                      checked={activeSettings.cameraFollower?.showHandShadow ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          cameraFollower: {
                            ...activeSettings.cameraFollower,
                            showHandShadow: !(activeSettings.cameraFollower?.showHandShadow ?? true),
                          },
                        })
                      }
                      label="Toggle hand drop shadow"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S101: Ink Physics, Wet-Edge Pooling & Chalk Dust */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">water_drop</span>
                    Ink Bleed & Wet Pooling
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Velocity-sensitive pooling & subtractive glazes
                  </span>
                </div>
                <Switch
                  checked={(activeSettings.inkPhysics?.poolingFactor ?? 0.35) > 0}
                  onChange={() => {
                    const currentPooling = activeSettings.inkPhysics?.poolingFactor ?? 0.35;
                    updateSettings({
                      ...activeSettings,
                      inkPhysics: {
                        ...activeSettings.inkPhysics,
                        poolingFactor: currentPooling > 0 ? 0 : 0.35,
                        subtractiveBlend: activeSettings.inkPhysics?.subtractiveBlend ?? true,
                        dustParticles: activeSettings.inkPhysics?.dustParticles ?? (activeSettings.hand === 'chalk'),
                      },
                    });
                  }}
                  label="Toggle ink bleed and wet pooling"
                />
              </div>

              {(activeSettings.inkPhysics?.poolingFactor ?? 0.35) > 0 && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Pooling Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.inkPhysics?.poolingFactor ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.8}
                    step={0.05}
                    value={activeSettings.inkPhysics?.poolingFactor ?? 0.35}
                    aria-label="Ink Pooling Intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        inkPhysics: {
                          ...activeSettings.inkPhysics,
                          poolingFactor: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Subtractive Glaze</span>
                    <Switch
                      checked={activeSettings.inkPhysics?.subtractiveBlend ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          inkPhysics: {
                            ...activeSettings.inkPhysics,
                            subtractiveBlend: !(activeSettings.inkPhysics?.subtractiveBlend ?? true),
                          },
                        })
                      }
                      label="Toggle subtractive glaze blending"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S103: Custom Hand Asset Calibration & Dynamic Tilt */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">front_hand</span>
                    Dynamic Stylus Pose & Tilt
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Velocity-responsive forearm lean & contact pivot
                  </span>
                </div>
                <Switch
                  checked={activeSettings.customHand?.dynamicTilt ?? true}
                  onChange={() => {
                    const currentTilt = activeSettings.customHand?.dynamicTilt ?? true;
                    updateSettings({
                      ...activeSettings,
                      customHand: {
                        ...activeSettings.customHand,
                        dynamicTilt: !currentTilt,
                        tiltIntensity: activeSettings.customHand?.tiltIntensity ?? 0.35,
                      },
                    });
                  }}
                  label="Toggle dynamic stylus tilt"
                />
              </div>

              {(activeSettings.customHand?.dynamicTilt ?? true) && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Tilt Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.customHand?.tiltIntensity ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={activeSettings.customHand?.tiltIntensity ?? 0.35}
                    aria-label="Hand Tilt Intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        customHand: {
                          ...activeSettings.customHand,
                          tiltIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S107: Stylus Pressure Dynamics & Variable Ribbons */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">gesture</span>
                    Stylus Pressure Dynamics
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Non-linear pressure response curves & tilt ribbon mesh
                  </span>
                </div>
                <Switch
                  checked={activeSettings.stylusPressure?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.stylusPressure?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      stylusPressure: {
                        ...activeSettings.stylusPressure,
                        enabled: !current,
                        curve: activeSettings.stylusPressure?.curve ?? 'sigmoid',
                        sensitivity: activeSettings.stylusPressure?.sensitivity ?? 1.0,
                        minWidthPct: activeSettings.stylusPressure?.minWidthPct ?? 0.25,
                        tiltDeformation: activeSettings.stylusPressure?.tiltDeformation ?? true,
                      },
                    });
                  }}
                  label="Toggle stylus pressure dynamics"
                />
              </div>

              {activeSettings.stylusPressure?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Pressure Curve</span>
                    <SegmentedControl
                      value={activeSettings.stylusPressure?.curve ?? 'sigmoid'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          stylusPressure: {
                            ...activeSettings.stylusPressure,
                            curve: val as 'linear' | 'exponential' | 'sigmoid' | 'calligraphic',
                          },
                        })
                      }
                      options={[
                        { value: 'sigmoid', label: 'S-Curve' },
                        { value: 'calligraphic', label: 'Callig' },
                        { value: 'exponential', label: 'Firm' },
                        { value: 'linear', label: 'Linear' },
                      ]}
                      ariaLabel="Pressure response curve"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Sensitivity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.stylusPressure?.sensitivity ?? 1.0).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={2.5}
                    step={0.1}
                    value={activeSettings.stylusPressure?.sensitivity ?? 1.0}
                    aria-label="Stylus Pressure Sensitivity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        stylusPressure: {
                          ...activeSettings.stylusPressure,
                          sensitivity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Tilt Contact Footprint</span>
                    <Switch
                      checked={activeSettings.stylusPressure?.tiltDeformation ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          stylusPressure: {
                            ...activeSettings.stylusPressure,
                            tiltDeformation: !(activeSettings.stylusPressure?.tiltDeformation ?? true),
                          },
                        })
                      }
                      label="Toggle tilt contact footprint"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S108: Granular Surface Friction & Nib Wear */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">texture</span>
                    Surface Friction & Nib Wear
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Substrate tooth drag & asymptotic tip flattening
                  </span>
                </div>
                <Switch
                  checked={activeSettings.surfaceFriction?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.surfaceFriction?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      surfaceFriction: {
                        ...activeSettings.surfaceFriction,
                        enabled: !current,
                        surfaceType: activeSettings.surfaceFriction?.surfaceType ?? 'whiteboard',
                        grainScale: activeSettings.surfaceFriction?.grainScale ?? 1.0,
                        nibWearRate: activeSettings.surfaceFriction?.nibWearRate ?? 0.25,
                        toothRoughness: activeSettings.surfaceFriction?.toothRoughness ?? 0.3,
                      },
                    });
                  }}
                  label="Toggle surface friction and nib wear"
                />
              </div>

              {activeSettings.surfaceFriction?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Substrate Texture</span>
                    <SegmentedControl
                      value={activeSettings.surfaceFriction?.surfaceType ?? 'whiteboard'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          surfaceFriction: {
                            ...activeSettings.surfaceFriction,
                            surfaceType: val as 'whiteboard' | 'paper' | 'slate' | 'canvas',
                          },
                        })
                      }
                      options={[
                        { value: 'whiteboard', label: 'Board' },
                        { value: 'paper', label: 'Paper' },
                        { value: 'slate', label: 'Slate' },
                        { value: 'canvas', label: 'Canvas' },
                      ]}
                      ariaLabel="Surface substrate texture"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Tooth Drag</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.surfaceFriction?.toothRoughness ?? 0.3) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.8}
                    step={0.05}
                    value={activeSettings.surfaceFriction?.toothRoughness ?? 0.3}
                    aria-label="Surface Tooth Roughness"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        surfaceFriction: {
                          ...activeSettings.surfaceFriction,
                          toothRoughness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Nib Wear Rate</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.surfaceFriction?.nibWearRate ?? 0.25) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.8}
                    step={0.05}
                    value={activeSettings.surfaceFriction?.nibWearRate ?? 0.25}
                    aria-label="Nib Wear Rate"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        surfaceFriction: {
                          ...activeSettings.surfaceFriction,
                          nibWearRate: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S109: Smudge, Finger-Blending & Graphite Eraser Highlights */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">brush</span>
                    Smudge & Finger Blending
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Pigment advection & kneaded eraser highlights
                  </span>
                </div>
                <Switch
                  checked={activeSettings.smudgeBlend?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.smudgeBlend?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      smudgeBlend: {
                        ...activeSettings.smudgeBlend,
                        enabled: !current,
                        mode: activeSettings.smudgeBlend?.mode ?? 'finger',
                        radiusPx: activeSettings.smudgeBlend?.radiusPx ?? 25,
                        strength: activeSettings.smudgeBlend?.strength ?? 0.6,
                        liftHighlights: activeSettings.smudgeBlend?.liftHighlights ?? true,
                      },
                    });
                  }}
                  label="Toggle smudge blending and eraser highlights"
                />
              </div>

              {activeSettings.smudgeBlend?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Smudge Tool</span>
                    <SegmentedControl
                      value={activeSettings.smudgeBlend?.mode ?? 'finger'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          smudgeBlend: {
                            ...activeSettings.smudgeBlend,
                            mode: val as SmudgeToolMode,
                          },
                        })
                      }
                      options={[
                        { value: 'finger', label: 'Finger' },
                        { value: 'stump', label: 'Stump' },
                        { value: 'towel', label: 'Towel' },
                        { value: 'kneaded_eraser', label: 'Eraser' },
                      ]}
                      ariaLabel="Smudge tool mode"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.smudgeBlend?.radiusPx ?? 25)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={activeSettings.smudgeBlend?.radiusPx ?? 25}
                    aria-label="Smudge radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        smudgeBlend: {
                          ...activeSettings.smudgeBlend,
                          radiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Strength</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.smudgeBlend?.strength ?? 0.6) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.smudgeBlend?.strength ?? 0.6}
                    aria-label="Smudge strength"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        smudgeBlend: {
                          ...activeSettings.smudgeBlend,
                          strength: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S110: Multi-Tool Hot-Swapping & Eraser Cap Flip */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">sync_alt</span>
                    Multi-Tool Swap & Stylus Flip
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    180° eraser cap flip & holster dock carousel
                  </span>
                </div>
                <Switch
                  checked={activeSettings.toolSwap?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.toolSwap?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      toolSwap: {
                        ...activeSettings.toolSwap,
                        enabled: !current,
                        defaultTransition: activeSettings.toolSwap?.defaultTransition ?? 'flip',
                        durationSec: activeSettings.toolSwap?.durationSec ?? 0.5,
                        foleyAudioCues: activeSettings.toolSwap?.foleyAudioCues ?? true,
                      },
                    });
                  }}
                  label="Toggle multi-tool swapping and stylus flip"
                />
              </div>

              {activeSettings.toolSwap?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Swap Kinematics</span>
                    <SegmentedControl
                      value={activeSettings.toolSwap?.defaultTransition ?? 'flip'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          toolSwap: {
                            ...activeSettings.toolSwap,
                            defaultTransition: val as ToolSwapTransitionType,
                          },
                        })
                      }
                      options={[
                        { value: 'flip', label: '180° Flip' },
                        { value: 'dock', label: 'Dock Swap' },
                        { value: 'instant', label: 'Instant' },
                      ]}
                      ariaLabel="Tool swap kinematics"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Transition Duration</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.toolSwap?.durationSec ?? 0.5).toFixed(2)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1.5}
                    step={0.05}
                    value={activeSettings.toolSwap?.durationSec ?? 0.5}
                    aria-label="Tool transition duration"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        toolSwap: {
                          ...activeSettings.toolSwap,
                          durationSec: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Foley Audio Snap Cues</span>
                    <Switch
                      checked={activeSettings.toolSwap?.foleyAudioCues ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          toolSwap: {
                            ...activeSettings.toolSwap,
                            foleyAudioCues: !(activeSettings.toolSwap?.foleyAudioCues ?? true),
                          },
                        })
                      }
                      label="Toggle foley audio snap cues"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S111: Attention Lighting & Dynamic Vignetting */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">highlight</span>
                    Attention Lighting & Vignette
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Pen tip spotlight & perimeter focus vignetting
                  </span>
                </div>
                <Switch
                  checked={activeSettings.attentionLighting?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.attentionLighting?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      attentionLighting: {
                        ...activeSettings.attentionLighting,
                        enabled: !current,
                        spotlightRadiusPx: activeSettings.attentionLighting?.spotlightRadiusPx ?? 350,
                        spotlightIntensity: activeSettings.attentionLighting?.spotlightIntensity ?? 0.15,
                        vignetteStrength: activeSettings.attentionLighting?.vignetteStrength ?? 0.20,
                        inertia: activeSettings.attentionLighting?.inertia ?? 0.85,
                      },
                    });
                  }}
                  label="Toggle attention lighting and vignetting"
                />
              </div>

              {activeSettings.attentionLighting?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Spotlight Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.attentionLighting?.spotlightRadiusPx ?? 350)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={700}
                    step={25}
                    value={activeSettings.attentionLighting?.spotlightRadiusPx ?? 350}
                    aria-label="Spotlight radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        attentionLighting: {
                          ...activeSettings.attentionLighting,
                          spotlightRadiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Spotlight Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.attentionLighting?.spotlightIntensity ?? 0.15) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.35}
                    step={0.05}
                    value={activeSettings.attentionLighting?.spotlightIntensity ?? 0.15}
                    aria-label="Spotlight intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        attentionLighting: {
                          ...activeSettings.attentionLighting,
                          spotlightIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Perimeter Vignette</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.attentionLighting?.vignetteStrength ?? 0.20) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.45}
                    step={0.05}
                    value={activeSettings.attentionLighting?.vignetteStrength ?? 0.20}
                    aria-label="Perimeter vignette strength"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        attentionLighting: {
                          ...activeSettings.attentionLighting,
                          vignetteStrength: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S112: Vector Ruler, Compass & Geometric Drafting Guides */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">straighten</span>
                    Geometric Drafting Guides
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Straightedge ruler slide & compass circle sweep
                  </span>
                </div>
                <Switch
                  checked={activeSettings.draftingGuide?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.draftingGuide?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      draftingGuide: {
                        ...activeSettings.draftingGuide,
                        enabled: !current,
                        mode: activeSettings.draftingGuide?.mode ?? 'auto',
                        material: activeSettings.draftingGuide?.material ?? 'acrylic',
                        minLineLengthPx: activeSettings.draftingGuide?.minLineLengthPx ?? 100,
                        slideAudioCue: activeSettings.draftingGuide?.slideAudioCue ?? true,
                        showGraduations: activeSettings.draftingGuide?.showGraduations ?? true,
                      },
                    });
                  }}
                  label="Toggle geometric drafting guides"
                />
              </div>

              {activeSettings.draftingGuide?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Guide Mode</span>
                    <SegmentedControl
                      value={activeSettings.draftingGuide?.mode ?? 'auto'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          draftingGuide: {
                            ...activeSettings.draftingGuide,
                            mode: val as DraftingGuideMode,
                          },
                        })
                      }
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'ruler', label: 'Ruler' },
                        { value: 'compass', label: 'Compass' },
                      ]}
                      ariaLabel="Drafting guide mode"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Instrument Material</span>
                    <SegmentedControl
                      value={activeSettings.draftingGuide?.material ?? 'acrylic'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          draftingGuide: {
                            ...activeSettings.draftingGuide,
                            material: val as GuideMaterialType,
                          },
                        })
                      }
                      options={[
                        { value: 'acrylic', label: 'Acrylic' },
                        { value: 'wood', label: 'Wood' },
                        { value: 'metal', label: 'Metal' },
                      ]}
                      ariaLabel="Guide material type"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Min Ruler Stroke</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.draftingGuide?.minLineLengthPx ?? 100)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={250}
                    step={10}
                    value={activeSettings.draftingGuide?.minLineLengthPx ?? 100}
                    aria-label="Minimum line length for ruler alignment"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        draftingGuide: {
                          ...activeSettings.draftingGuide,
                          minLineLengthPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Slide & Pivot Foley</span>
                    <Switch
                      checked={activeSettings.draftingGuide?.slideAudioCue ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          draftingGuide: {
                            ...activeSettings.draftingGuide,
                            slideAudioCue: !(activeSettings.draftingGuide?.slideAudioCue ?? true),
                          },
                        })
                      }
                      label="Toggle drafting slide and pivot foley"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S113: Optical Depth-of-Field & Bokeh Hand Blur */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">lens_blur</span>
                    Depth of Field & Bokeh
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Pen tip focal plane & forearm defocus blur
                  </span>
                </div>
                <Switch
                  checked={activeSettings.depthOfField?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.depthOfField?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      depthOfField: {
                        ...activeSettings.depthOfField,
                        enabled: !current,
                        aperture: activeSettings.depthOfField?.aperture ?? 'f2.8',
                        maxBlurPx: activeSettings.depthOfField?.maxBlurPx ?? 18,
                        tipLiftDefocus: activeSettings.depthOfField?.tipLiftDefocus ?? true,
                        wristElevationMm: activeSettings.depthOfField?.wristElevationMm ?? 140,
                      },
                    });
                  }}
                  label="Toggle depth of field and bokeh"
                />
              </div>

              {activeSettings.depthOfField?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Lens Aperture</span>
                    <SegmentedControl
                      value={activeSettings.depthOfField?.aperture ?? 'f2.8'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          depthOfField: {
                            ...activeSettings.depthOfField,
                            aperture: val as LensApertureFStop,
                          },
                        })
                      }
                      options={[
                        { value: 'f1.8', label: 'f/1.8' },
                        { value: 'f2.8', label: 'f/2.8' },
                        { value: 'f5.6', label: 'f/5.6' },
                      ]}
                      ariaLabel="Lens aperture f-stop"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Max Forearm Defocus</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.depthOfField?.maxBlurPx ?? 18)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={30}
                    step={2}
                    value={activeSettings.depthOfField?.maxBlurPx ?? 18}
                    aria-label="Maximum forearm defocus blur"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        depthOfField: {
                          ...activeSettings.depthOfField,
                          maxBlurPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Z-Lift Defocus Dynamics</span>
                    <Switch
                      checked={activeSettings.depthOfField?.tipLiftDefocus ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          depthOfField: {
                            ...activeSettings.depthOfField,
                            tipLiftDefocus: !(activeSettings.depthOfField?.tipLiftDefocus ?? true),
                          },
                        })
                      }
                      label="Toggle pen tip lift defocus"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S114: Multi-Hand Simultaneous Duet Collaboration */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">group</span>
                    Dual-Hand Duet Collaboration
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Simultaneous dual presenters & collision avoidance
                  </span>
                </div>
                <Switch
                  checked={activeSettings.dualHandDuet?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.dualHandDuet?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      dualHandDuet: {
                        ...activeSettings.dualHandDuet,
                        enabled: !current,
                        partitionMode: activeSettings.dualHandDuet?.partitionMode ?? 'spatial',
                        minSeparationPx: activeSettings.dualHandDuet?.minSeparationPx ?? 160,
                        collisionLiftPx: activeSettings.dualHandDuet?.collisionLiftPx ?? 90,
                        stereoFoleyPanning: activeSettings.dualHandDuet?.stereoFoleyPanning ?? true,
                      },
                    });
                  }}
                  label="Toggle dual-hand duet collaboration"
                />
              </div>

              {activeSettings.dualHandDuet?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Partition Mode</span>
                    <SegmentedControl
                      value={activeSettings.dualHandDuet?.partitionMode ?? 'spatial'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          dualHandDuet: {
                            ...activeSettings.dualHandDuet,
                            partitionMode: val as DuetPartitionMode,
                          },
                        })
                      }
                      options={[
                        { value: 'spatial', label: 'Left/Right' },
                        { value: 'interleaved', label: 'Alternate' },
                        { value: 'sync', label: 'Sync' },
                      ]}
                      ariaLabel="Dual-hand partition mode"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Collision Avoidance Lift</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.dualHandDuet?.collisionLiftPx ?? 90)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={150}
                    step={10}
                    value={activeSettings.dualHandDuet?.collisionLiftPx ?? 90}
                    aria-label="Collision avoidance elevation lift"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        dualHandDuet: {
                          ...activeSettings.dualHandDuet,
                          collisionLiftPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Stereo Foley Panning</span>
                    <Switch
                      checked={activeSettings.dualHandDuet?.stereoFoleyPanning ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          dualHandDuet: {
                            ...activeSettings.dualHandDuet,
                            stereoFoleyPanning: !(activeSettings.dualHandDuet?.stereoFoleyPanning ?? true),
                          },
                        })
                      }
                      label="Toggle dual hand stereo foley panning"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S115: Whiteboard Chroma Chalk & Neon UV Blacklight Luminescence */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">wb_iridescent</span>
                    Neon UV Chalk & Luminescence
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Fluorescent blacklight bloom & chromatic fringe
                  </span>
                </div>
                <Switch
                  checked={activeSettings.chromaChalk?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.chromaChalk?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      chromaChalk: {
                        ...activeSettings.chromaChalk,
                        enabled: !current,
                        palette: activeSettings.chromaChalk?.palette ?? 'cyber',
                        bloomRadiusPx: activeSettings.chromaChalk?.bloomRadiusPx ?? 14,
                        bloomIntensity: activeSettings.chromaChalk?.bloomIntensity ?? 0.7,
                        chromaticAberrationPx: activeSettings.chromaChalk?.chromaticAberrationPx ?? 2.0,
                        darkSlateBackground: activeSettings.chromaChalk?.darkSlateBackground ?? true,
                      },
                    });
                  }}
                  label="Toggle neon UV chalk and luminescence"
                />
              </div>

              {activeSettings.chromaChalk?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Fluorescent Palette</span>
                    <SegmentedControl
                      value={activeSettings.chromaChalk?.palette ?? 'cyber'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          chromaChalk: {
                            ...activeSettings.chromaChalk,
                            palette: val as NeonPalettePreset,
                          },
                        })
                      }
                      options={[
                        { value: 'cyber', label: 'Cyber' },
                        { value: 'pastels', label: 'Pastel' },
                        { value: 'arcade', label: 'Arcade' },
                      ]}
                      ariaLabel="Fluorescent neon palette"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Bloom Halo Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.chromaChalk?.bloomRadiusPx ?? 14)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={30}
                    step={1}
                    value={activeSettings.chromaChalk?.bloomRadiusPx ?? 14}
                    aria-label="Neon bloom radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chromaChalk: {
                          ...activeSettings.chromaChalk,
                          bloomRadiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Bloom Emission Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.chromaChalk?.bloomIntensity ?? 0.7) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.5}
                    step={0.05}
                    value={activeSettings.chromaChalk?.bloomIntensity ?? 0.7}
                    aria-label="Neon bloom intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chromaChalk: {
                          ...activeSettings.chromaChalk,
                          bloomIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Chromatic Aberration</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.chromaChalk?.chromaticAberrationPx ?? 2.0).toFixed(1)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.5}
                    value={activeSettings.chromaChalk?.chromaticAberrationPx ?? 2.0}
                    aria-label="Chromatic aberration fringe"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chromaChalk: {
                          ...activeSettings.chromaChalk,
                          chromaticAberrationPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Dark Slate Blackboard</span>
                    <Switch
                      checked={activeSettings.chromaChalk?.darkSlateBackground ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          chromaChalk: {
                            ...activeSettings.chromaChalk,
                            darkSlateBackground: !(activeSettings.chromaChalk?.darkSlateBackground ?? true),
                          },
                        })
                      }
                      label="Toggle dark slate blackboard background"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S116: Wet Sponge Evaporation & Moisture Condensation */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">water_drop</span>
                    Wet Sponge & Evaporation
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Damp board sheen drying & capillary ink dilution
                  </span>
                </div>
                <Switch
                  checked={activeSettings.wetSponge?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.wetSponge?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      wetSponge: {
                        ...activeSettings.wetSponge,
                        enabled: !current,
                        initialWetness: activeSettings.wetSponge?.initialWetness ?? 0.8,
                        dryingTimeSec: activeSettings.wetSponge?.dryingTimeSec ?? 4.0,
                        dilutionFactor: activeSettings.wetSponge?.dilutionFactor ?? 0.6,
                        gravityDrip: activeSettings.wetSponge?.gravityDrip ?? false,
                      },
                    });
                  }}
                  label="Toggle wet sponge evaporation physics"
                />
              </div>

              {activeSettings.wetSponge?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Initial Moisture Wetness</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.wetSponge?.initialWetness ?? 0.8) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.wetSponge?.initialWetness ?? 0.8}
                    aria-label="Initial moisture wetness"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        wetSponge: {
                          ...activeSettings.wetSponge,
                          initialWetness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Evaporation Drying Time</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.wetSponge?.dryingTimeSec ?? 4.0).toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={15.0}
                    step={0.5}
                    value={activeSettings.wetSponge?.dryingTimeSec ?? 4.0}
                    aria-label="Evaporation drying duration"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        wetSponge: {
                          ...activeSettings.wetSponge,
                          dryingTimeSec: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Capillary Ink Dilution</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.wetSponge?.dilutionFactor ?? 0.6) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={activeSettings.wetSponge?.dilutionFactor ?? 0.6}
                    aria-label="Capillary ink dilution factor"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        wetSponge: {
                          ...activeSettings.wetSponge,
                          dilutionFactor: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Gravity Droplet Drip</span>
                    <Switch
                      checked={activeSettings.wetSponge?.gravityDrip ?? false}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          wetSponge: {
                            ...activeSettings.wetSponge,
                            gravityDrip: !(activeSettings.wetSponge?.gravityDrip ?? false),
                          },
                        })
                      }
                      label="Toggle gravity droplet drip"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S117: Optical Glass Lightboard & Edge-Lit Luminescence */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">flip</span>
                    Optical Glass Lightboard
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Internal TIR edge-lit LEDs & audience mirror flip
                  </span>
                </div>
                <Switch
                  checked={activeSettings.lightboard?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.lightboard?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      lightboard: {
                        ...activeSettings.lightboard,
                        enabled: !current,
                        mirrorHorizontal: activeSettings.lightboard?.mirrorHorizontal ?? true,
                        ledPreset: activeSettings.lightboard?.ledPreset ?? 'cyan',
                        ledIntensity: activeSettings.lightboard?.ledIntensity ?? 1.2,
                        glassThicknessPx: activeSettings.lightboard?.glassThicknessPx ?? 6.0,
                        ghostReflectionOpacity: activeSettings.lightboard?.ghostReflectionOpacity ?? 0.08,
                      },
                    });
                  }}
                  label="Toggle optical glass lightboard mode"
                />
              </div>

              {activeSettings.lightboard?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Audience Mirror Flip (X' = W - X)</span>
                    <Switch
                      checked={activeSettings.lightboard?.mirrorHorizontal ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          lightboard: {
                            ...activeSettings.lightboard,
                            mirrorHorizontal: !(activeSettings.lightboard?.mirrorHorizontal ?? true),
                          },
                        })
                      }
                      label="Toggle audience horizontal mirror flip"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Edge-Lit LED Color</span>
                    <SegmentedControl
                      value={activeSettings.lightboard?.ledPreset ?? 'cyan'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          lightboard: {
                            ...activeSettings.lightboard,
                            ledPreset: val as LightboardLedPreset,
                          },
                        })
                      }
                      options={[
                        { value: 'cyan', label: 'Cyan' },
                        { value: 'emerald', label: 'Emerald' },
                        { value: 'amber', label: 'Amber' },
                        { value: 'white', label: 'White' },
                      ]}
                      ariaLabel="Edge-lit LED color preset"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">LED Illumination Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.lightboard?.ledIntensity ?? 1.2) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.1}
                    value={activeSettings.lightboard?.ledIntensity ?? 1.2}
                    aria-label="LED illumination intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        lightboard: {
                          ...activeSettings.lightboard,
                          ledIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Glass Pane Thickness (Ghosting)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.lightboard?.glassThicknessPx ?? 6.0)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={14}
                    step={1}
                    value={activeSettings.lightboard?.glassThicknessPx ?? 6.0}
                    aria-label="Glass thickness ghost offset"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        lightboard: {
                          ...activeSettings.lightboard,
                          glassThicknessPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Internal Ghost Reflection Opacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.lightboard?.ghostReflectionOpacity ?? 0.08) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.20}
                    step={0.02}
                    value={activeSettings.lightboard?.ghostReflectionOpacity ?? 0.08}
                    aria-label="Internal ghost reflection opacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        lightboard: {
                          ...activeSettings.lightboard,
                          ghostReflectionOpacity: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S118: Smart Geometric Shape Recognition & Regularization */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">category</span>
                    Smart Shape Regularization
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Auto-snap wobbly circles, rectangles, triangles & lines
                  </span>
                </div>
                <Switch
                  checked={activeSettings.shapeRecognition?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.shapeRecognition?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      shapeRecognition: {
                        ...activeSettings.shapeRecognition,
                        enabled: !current,
                        snapTolerance: activeSettings.shapeRecognition?.snapTolerance ?? 0.20,
                        angleSnap: activeSettings.shapeRecognition?.angleSnap ?? true,
                        morphDurationSec: activeSettings.shapeRecognition?.morphDurationSec ?? 0.30,
                      },
                    });
                  }}
                  label="Toggle smart geometric shape recognition"
                />
              </div>

              {activeSettings.shapeRecognition?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Recognition Tolerance</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.shapeRecognition?.snapTolerance ?? 0.20) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={0.40}
                    step={0.05}
                    value={activeSettings.shapeRecognition?.snapTolerance ?? 0.20}
                    aria-label="Shape recognition tolerance"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        shapeRecognition: {
                          ...activeSettings.shapeRecognition,
                          snapTolerance: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Straight Line Angle Snapping (15° / 45° / 90°)</span>
                    <Switch
                      checked={activeSettings.shapeRecognition?.angleSnap ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          shapeRecognition: {
                            ...activeSettings.shapeRecognition,
                            angleSnap: !(activeSettings.shapeRecognition?.angleSnap ?? true),
                          },
                        })
                      }
                      label="Toggle straight line angle snapping"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Morph Transition Duration</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.shapeRecognition?.morphDurationSec ?? 0.30).toFixed(2)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.shapeRecognition?.morphDurationSec ?? 0.30}
                    aria-label="Morph transition duration"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        shapeRecognition: {
                          ...activeSettings.shapeRecognition,
                          morphDurationSec: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S119: Whiteboard Laser Pointer & Phosphor Afterglow */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">flare</span>
                    Laser Pointer & Phosphor Afterglow
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Monochromatic spot bloom & decaying trail persistence
                  </span>
                </div>
                <Switch
                  checked={activeSettings.laserPointer?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.laserPointer?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      laserPointer: {
                        ...activeSettings.laserPointer,
                        enabled: !current,
                        colorPreset: activeSettings.laserPointer?.colorPreset ?? 'emerald',
                        coreRadiusPx: activeSettings.laserPointer?.coreRadiusPx ?? 3.5,
                        haloRadiusPx: activeSettings.laserPointer?.haloRadiusPx ?? 16.0,
                        persistenceSec: activeSettings.laserPointer?.persistenceSec ?? 0.80,
                        trailIntensity: activeSettings.laserPointer?.trailIntensity ?? 0.90,
                      },
                    });
                  }}
                  label="Toggle laser pointer and phosphor afterglow"
                />
              </div>

              {activeSettings.laserPointer?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Wavelength Color</span>
                    <SegmentedControl
                      value={activeSettings.laserPointer?.colorPreset ?? 'emerald'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          laserPointer: {
                            ...activeSettings.laserPointer,
                            colorPreset: val as LaserColorPreset,
                          },
                        })
                      }
                      options={[
                        { value: 'emerald', label: 'Emerald' },
                        { value: 'ruby', label: 'Ruby' },
                        { value: 'violet', label: 'Violet' },
                      ]}
                      ariaLabel="Laser beam color"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Pointer Core Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.laserPointer?.coreRadiusPx ?? 3.5).toFixed(1)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.5}
                    max={8.0}
                    step={0.5}
                    value={activeSettings.laserPointer?.coreRadiusPx ?? 3.5}
                    aria-label="Laser core spot radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        laserPointer: {
                          ...activeSettings.laserPointer,
                          coreRadiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Afterglow Persistence</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.laserPointer?.persistenceSec ?? 0.80).toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={2.5}
                    step={0.1}
                    value={activeSettings.laserPointer?.persistenceSec ?? 0.80}
                    aria-label="Phosphor afterglow persistence half-life"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        laserPointer: {
                          ...activeSettings.laserPointer,
                          persistenceSec: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Trail Halo Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.laserPointer?.trailIntensity ?? 0.90) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    value={activeSettings.laserPointer?.trailIntensity ?? 0.90}
                    aria-label="Laser trail bloom intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        laserPointer: {
                          ...activeSettings.laserPointer,
                          trailIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S120: Whiteboard Magnetic Grid, Isometric Guidelines & Perspective Drafting */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">grid_4x4</span>
                    Magnetic Grid & Perspective
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Isometric, Cartesian & 3D vanishing perspective snapping
                  </span>
                </div>
                <Switch
                  checked={activeSettings.gridSubstrate?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.gridSubstrate?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      gridSubstrate: {
                        ...activeSettings.gridSubstrate,
                        enabled: !current,
                        mode: activeSettings.gridSubstrate?.mode ?? 'isometric',
                        spacingPx: activeSettings.gridSubstrate?.spacingPx ?? 40,
                        snapRadiusPx: activeSettings.gridSubstrate?.snapRadiusPx ?? 12,
                        horizonYPct: activeSettings.gridSubstrate?.horizonYPct ?? 0.40,
                        opacity: activeSettings.gridSubstrate?.opacity ?? 0.20,
                      },
                    });
                  }}
                  label="Toggle magnetic grid and perspective drafting substrate"
                />
              </div>

              {activeSettings.gridSubstrate?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Grid Substrate Mode</span>
                    <SegmentedControl
                      value={activeSettings.gridSubstrate?.mode ?? 'isometric'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          gridSubstrate: {
                            ...activeSettings.gridSubstrate,
                            mode: val as PerspectiveGridMode,
                          },
                        })
                      }
                      options={[
                        { value: 'isometric', label: 'Iso 3D' },
                        { value: 'cartesian', label: 'Cartesian' },
                        { value: 'perspective', label: 'Horizon' },
                        { value: 'dots', label: 'Dots' },
                      ]}
                      ariaLabel="Grid substrate mode"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Lattice Spacing</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.gridSubstrate?.spacingPx ?? 40)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={100}
                    step={5}
                    value={activeSettings.gridSubstrate?.spacingPx ?? 40}
                    aria-label="Grid lattice node spacing"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        gridSubstrate: {
                          ...activeSettings.gridSubstrate,
                          spacingPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Magnetic Snap Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.gridSubstrate?.snapRadiusPx ?? 12)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={30}
                    step={2}
                    value={activeSettings.gridSubstrate?.snapRadiusPx ?? 12}
                    aria-label="Magnetic snap capture radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        gridSubstrate: {
                          ...activeSettings.gridSubstrate,
                          snapRadiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  {activeSettings.gridSubstrate?.mode === 'perspective' && (
                    <>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Horizon Line Position</span>
                        <span className="font-mono text-text-primary text-[10px]">
                          {Math.round((activeSettings.gridSubstrate?.horizonYPct ?? 0.40) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.15}
                        max={0.85}
                        step={0.05}
                        value={activeSettings.gridSubstrate?.horizonYPct ?? 0.40}
                        aria-label="Perspective horizon line position"
                        className="w-full accent-[var(--accent-ai)] cursor-pointer"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            gridSubstrate: {
                              ...activeSettings.gridSubstrate,
                              horizonYPct: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </>
                  )}

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Guide Line Opacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.gridSubstrate?.opacity ?? 0.20) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.50}
                    step={0.05}
                    value={activeSettings.gridSubstrate?.opacity ?? 0.20}
                    aria-label="Visual grid line opacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        gridSubstrate: {
                          ...activeSettings.gridSubstrate,
                          opacity: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S121: Whiteboard Hand Contact Shadows & Ambient Occlusion */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">wb_shade</span>
                    Hand Contact Shadows (AO)
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Dynamic umbra, diffuse penumbra & pen-lift dissipation
                  </span>
                </div>
                <Switch
                  checked={activeSettings.contactShadow?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.contactShadow?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      contactShadow: {
                        ...activeSettings.contactShadow,
                        enabled: !current,
                        lightAngleDeg: activeSettings.contactShadow?.lightAngleDeg ?? 315,
                        shadowOpacity: activeSettings.contactShadow?.shadowOpacity ?? 0.35,
                        blurRadiusPx: activeSettings.contactShadow?.blurRadiusPx ?? 14,
                        offsetDistancePx: activeSettings.contactShadow?.offsetDistancePx ?? 12,
                        liftDissipation: activeSettings.contactShadow?.liftDissipation ?? 0.60,
                      },
                    });
                  }}
                  label="Toggle hand contact shadows and ambient occlusion"
                />
              </div>

              {activeSettings.contactShadow?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Key Light Angle</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.contactShadow?.lightAngleDeg ?? 315)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={activeSettings.contactShadow?.lightAngleDeg ?? 315}
                    aria-label="Directional key light angle"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        contactShadow: {
                          ...activeSettings.contactShadow,
                          lightAngleDeg: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Shadow Umbra Opacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.contactShadow?.shadowOpacity ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={0.70}
                    step={0.05}
                    value={activeSettings.contactShadow?.shadowOpacity ?? 0.35}
                    aria-label="Contact shadow opacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        contactShadow: {
                          ...activeSettings.contactShadow,
                          shadowOpacity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Penumbra Diffusion Softness</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.contactShadow?.blurRadiusPx ?? 14)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={32}
                    step={2}
                    value={activeSettings.contactShadow?.blurRadiusPx ?? 14}
                    aria-label="Penumbra blur radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        contactShadow: {
                          ...activeSettings.contactShadow,
                          blurRadiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Tip-Lift Dissipation Rate</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.contactShadow?.liftDissipation ?? 0.60) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.20}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.contactShadow?.liftDissipation ?? 0.60}
                    aria-label="Tip lift shadow dissipation rate"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        contactShadow: {
                          ...activeSettings.contactShadow,
                          liftDissipation: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S122: Whiteboard Marker Ink Depletion & Chalk Micro-Chatter */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">format_paint</span>
                    Ink Depletion & Chalk Chatter
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Felt dry-out striations & stick-slip friction micro-skips
                  </span>
                </div>
                <Switch
                  checked={activeSettings.inkDepletion?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.inkDepletion?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      inkDepletion: {
                        ...activeSettings.inkDepletion,
                        enabled: !current,
                        depletionRate: activeSettings.inkDepletion?.depletionRate ?? 0.002,
                        minSaturation: activeSettings.inkDepletion?.minSaturation ?? 0.35,
                        streakCount: activeSettings.inkDepletion?.streakCount ?? 5,
                        rechargeRate: activeSettings.inkDepletion?.rechargeRate ?? 0.25,
                        chatterFrequency: activeSettings.inkDepletion?.chatterFrequency ?? 0.15,
                        enableChalkChatter: activeSettings.inkDepletion?.enableChalkChatter ?? false,
                      },
                    });
                  }}
                  label="Toggle ink depletion and chalk micro-chatter"
                />
              </div>

              {activeSettings.inkDepletion?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Depletion Rate (Drain / Px)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {((activeSettings.inkDepletion?.depletionRate ?? 0.002) * 1000).toFixed(1)}‰
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0005}
                    max={0.006}
                    step={0.0005}
                    value={activeSettings.inkDepletion?.depletionRate ?? 0.002}
                    aria-label="Ink depletion rate"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        inkDepletion: {
                          ...activeSettings.inkDepletion,
                          depletionRate: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Minimum Dry Saturation</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.inkDepletion?.minSaturation ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={0.70}
                    step={0.05}
                    value={activeSettings.inkDepletion?.minSaturation ?? 0.35}
                    aria-label="Minimum dry pigment saturation"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        inkDepletion: {
                          ...activeSettings.inkDepletion,
                          minSaturation: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Felt Fiber Striations</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.inkDepletion?.streakCount ?? 5} lines
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={8}
                    step={1}
                    value={activeSettings.inkDepletion?.streakCount ?? 5}
                    aria-label="Felt fiber striation streak count"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        inkDepletion: {
                          ...activeSettings.inkDepletion,
                          streakCount: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Chalk Micro-Chatter (Friction Skips)</span>
                    <Switch
                      checked={activeSettings.inkDepletion?.enableChalkChatter ?? false}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          inkDepletion: {
                            ...activeSettings.inkDepletion,
                            enableChalkChatter: !(activeSettings.inkDepletion?.enableChalkChatter ?? false),
                          },
                        })
                      }
                      label="Toggle chalk stick-slip micro chatter"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S123: Whiteboard Dynamic Tool Auto-Invocation & Staging Carousel */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">handyman</span>
                    Dynamic Tool Auto-Invocation
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Gesture-driven auto ruler, laser hover & tray staging
                  </span>
                </div>
                <Switch
                  checked={activeSettings.toolOrchestrator?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.toolOrchestrator?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      toolOrchestrator: {
                        ...activeSettings.toolOrchestrator,
                        enabled: !current,
                        autoRulerThresholdPx: activeSettings.toolOrchestrator?.autoRulerThresholdPx ?? 80.0,
                        autoLaserHoldSec: activeSettings.toolOrchestrator?.autoLaserHoldSec ?? 0.40,
                        toolEnterDurationSec: activeSettings.toolOrchestrator?.toolEnterDurationSec ?? 0.25,
                        toolDismissTimeoutSec: activeSettings.toolOrchestrator?.toolDismissTimeoutSec ?? 0.60,
                        trayPosition: activeSettings.toolOrchestrator?.trayPosition ?? 'bottom-right',
                      },
                    });
                  }}
                  label="Toggle dynamic tool auto-invocation and staging carousel"
                />
              </div>

              {activeSettings.toolOrchestrator?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Auto-Ruler Straight Line Trigger</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.toolOrchestrator?.autoRulerThresholdPx ?? 80)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={160}
                    step={10}
                    value={activeSettings.toolOrchestrator?.autoRulerThresholdPx ?? 80}
                    aria-label="Auto-ruler gesture line length threshold"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        toolOrchestrator: {
                          ...activeSettings.toolOrchestrator,
                          autoRulerThresholdPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Laser Hover Hesitation Threshold</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.toolOrchestrator?.autoLaserHoldSec ?? 0.40).toFixed(2)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.toolOrchestrator?.autoLaserHoldSec ?? 0.40}
                    aria-label="Laser hover hesitation threshold duration"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        toolOrchestrator: {
                          ...activeSettings.toolOrchestrator,
                          autoLaserHoldSec: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Tool Staging Speed</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.toolOrchestrator?.toolEnterDurationSec ?? 0.25).toFixed(2)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={0.60}
                    step={0.05}
                    value={activeSettings.toolOrchestrator?.toolEnterDurationSec ?? 0.25}
                    aria-label="Tool staging entrance transition duration"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        toolOrchestrator: {
                          ...activeSettings.toolOrchestrator,
                          toolEnterDurationSec: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Auto-Dismiss Retraction Delay</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.toolOrchestrator?.toolDismissTimeoutSec ?? 0.60).toFixed(2)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.20}
                    max={1.50}
                    step={0.10}
                    value={activeSettings.toolOrchestrator?.toolDismissTimeoutSec ?? 0.60}
                    aria-label="Auto-dismiss idle retraction delay"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        toolOrchestrator: {
                          ...activeSettings.toolOrchestrator,
                          toolDismissTimeoutSec: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S124: Whiteboard Multi-Color Palette Carousel & Pen Dock */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">palette</span>
                    Multi-Color Palette Dock
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Rotating ring dock, desk caddy & 4-in-1 click-pen
                  </span>
                </div>
                <Switch
                  checked={activeSettings.paletteDock?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.paletteDock?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      paletteDock: {
                        ...activeSettings.paletteDock,
                        enabled: !current,
                        dockStyle: activeSettings.paletteDock?.dockStyle ?? 'caddy',
                        activeColorIdx: activeSettings.paletteDock?.activeColorIdx ?? 0,
                        palettePreset: activeSettings.paletteDock?.palettePreset ?? 'standard',
                        rotationDurationSec: activeSettings.paletteDock?.rotationDurationSec ?? 0.20,
                        clickFoleyVolume: activeSettings.paletteDock?.clickFoleyVolume ?? 0.70,
                      },
                    });
                  }}
                  label="Toggle multi-color palette dock"
                />
              </div>

              {activeSettings.paletteDock?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Dock Mechanism</span>
                    <SegmentedControl
                      value={activeSettings.paletteDock?.dockStyle ?? 'caddy'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          paletteDock: {
                            ...activeSettings.paletteDock,
                            dockStyle: val as PaletteDockStyle,
                          },
                        })
                      }
                      options={[
                        { value: 'caddy', label: 'Caddy' },
                        { value: 'ring_dock', label: 'Ring Dock' },
                        { value: 'multipen_click', label: '4-in-1 Pen' },
                      ]}
                      ariaLabel="Palette dock mechanism"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Palette Preset</span>
                    <SegmentedControl
                      value={activeSettings.paletteDock?.palettePreset ?? 'standard'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          paletteDock: {
                            ...activeSettings.paletteDock,
                            palettePreset: val as PaletteColorPreset,
                          },
                        })
                      }
                      options={[
                        { value: 'standard', label: 'Standard' },
                        { value: 'neon', label: 'Neon' },
                        { value: 'earth', label: 'Earth' },
                      ]}
                      ariaLabel="Color palette preset"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Active Pen Slot</span>
                    <SegmentedControl
                      value={String(activeSettings.paletteDock?.activeColorIdx ?? 0)}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          paletteDock: {
                            ...activeSettings.paletteDock,
                            activeColorIdx: Number(val),
                          },
                        })
                      }
                      options={[
                        { value: '0', label: 'Black' },
                        { value: '1', label: 'Red' },
                        { value: '2', label: 'Blue' },
                        { value: '3', label: 'Green' },
                      ]}
                      ariaLabel="Active pen color slot"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Click Foley Sound Level</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.paletteDock?.clickFoleyVolume ?? 0.70) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.paletteDock?.clickFoleyVolume ?? 0.70}
                    aria-label="Mechanical click foley sound volume"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        paletteDock: {
                          ...activeSettings.paletteDock,
                          clickFoleyVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S125: Stylus Tip Pressure Audio & Squeak Resonance */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">graphic_eq</span>
                    Pressure Audio & Squeak Resonance
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Tip pressure-to-pitch shift, stick-slip friction squeaks & haptic thumps
                  </span>
                </div>
                <Switch
                  checked={activeSettings.pressureAudio?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.pressureAudio?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      pressureAudio: {
                        ...activeSettings.pressureAudio,
                        enabled: !current,
                        baseFreqHz: activeSettings.pressureAudio?.baseFreqHz ?? 800,
                        pitchSensitivity: activeSettings.pressureAudio?.pitchSensitivity ?? 0.35,
                        squeakThresholdPressure: activeSettings.pressureAudio?.squeakThresholdPressure ?? 0.65,
                        squeakThresholdVelocity: activeSettings.pressureAudio?.squeakThresholdVelocity ?? 250,
                        squeakBaseFreqHz: activeSettings.pressureAudio?.squeakBaseFreqHz ?? 2400,
                        squeakVolume: activeSettings.pressureAudio?.squeakVolume ?? 0.50,
                        hapticThumpVolume: activeSettings.pressureAudio?.hapticThumpVolume ?? 0.60,
                        hapticRumbleGain: activeSettings.pressureAudio?.hapticRumbleGain ?? 0.40,
                      },
                    });
                  }}
                  label="Toggle pressure audio and squeak resonance"
                />
              </div>

              {activeSettings.pressureAudio?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Pitch Drag Sensitivity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.pressureAudio?.pitchSensitivity ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.pressureAudio?.pitchSensitivity ?? 0.35}
                    aria-label="Pressure pitch drag sensitivity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        pressureAudio: {
                          ...activeSettings.pressureAudio,
                          pitchSensitivity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Stick-Slip Squeak Threshold</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.pressureAudio?.squeakThresholdPressure ?? 0.65) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.30}
                    max={0.95}
                    step={0.05}
                    value={activeSettings.pressureAudio?.squeakThresholdPressure ?? 0.65}
                    aria-label="Friction squeak pressure threshold"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        pressureAudio: {
                          ...activeSettings.pressureAudio,
                          squeakThresholdPressure: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Squeak Resonance Volume</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.pressureAudio?.squeakVolume ?? 0.50) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.pressureAudio?.squeakVolume ?? 0.50}
                    aria-label="Squeak resonance audio volume"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        pressureAudio: {
                          ...activeSettings.pressureAudio,
                          squeakVolume: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Touchdown Haptic Thump</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.pressureAudio?.hapticThumpVolume ?? 0.60) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.pressureAudio?.hapticThumpVolume ?? 0.60}
                    aria-label="Touchdown haptic thump audio volume"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        pressureAudio: {
                          ...activeSettings.pressureAudio,
                          hapticThumpVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S126: Whiteboard Sticky Notes & Stencil Masking */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">sticky_note_2</span>
                    Sticky Notes & Stencil Masking
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Stationery paper notes, corner peel drop shadow & aperture stencil clipping
                  </span>
                </div>
                <Switch
                  checked={activeSettings.stickyNote?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.stickyNote?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      stickyNote: {
                        ...activeSettings.stickyNote,
                        enabled: !current,
                        colorPreset: activeSettings.stickyNote?.colorPreset ?? 'canary',
                        posX: activeSettings.stickyNote?.posX ?? 250,
                        posY: activeSettings.stickyNote?.posY ?? 250,
                        width: activeSettings.stickyNote?.width ?? 220,
                        height: activeSettings.stickyNote?.height ?? 220,
                        rotationDeg: activeSettings.stickyNote?.rotationDeg ?? -3.5,
                        peelElevationPx: activeSettings.stickyNote?.peelElevationPx ?? 12,
                        pinStyle: activeSettings.stickyNote?.pinStyle ?? 'magnet',
                      },
                    });
                  }}
                  label="Toggle whiteboard sticky note"
                />
              </div>

              {activeSettings.stickyNote?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Stationery Color</span>
                    <SegmentedControl
                      value={activeSettings.stickyNote?.colorPreset ?? 'canary'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          stickyNote: {
                            ...activeSettings.stickyNote,
                            colorPreset: val as StickyNoteColorPreset,
                          },
                        })
                      }
                      options={[
                        { value: 'canary', label: 'Canary' },
                        { value: 'pink', label: 'Pink' },
                        { value: 'cyan', label: 'Cyan' },
                        { value: 'mint', label: 'Mint' },
                        { value: 'orange', label: 'Orange' },
                      ]}
                      ariaLabel="Sticky note color preset"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Note Tilt Angle</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.stickyNote?.rotationDeg ?? -3.5).toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-15}
                    max={15}
                    step={0.5}
                    value={activeSettings.stickyNote?.rotationDeg ?? -3.5}
                    aria-label="Sticky note tilt rotation"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        stickyNote: {
                          ...activeSettings.stickyNote,
                          rotationDeg: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Corner Peel Elevation</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.stickyNote?.peelElevationPx ?? 12)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={2}
                    value={activeSettings.stickyNote?.peelElevationPx ?? 12}
                    aria-label="Corner peel drop shadow elevation"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        stickyNote: {
                          ...activeSettings.stickyNote,
                          peelElevationPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Anchor Fastener</span>
                    <SegmentedControl
                      value={activeSettings.stickyNote?.pinStyle ?? 'magnet'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          stickyNote: {
                            ...activeSettings.stickyNote,
                            pinStyle: val as StickyPinStyle,
                          },
                        })
                      }
                      options={[
                        { value: 'magnet', label: 'Magnet' },
                        { value: 'pushpin', label: 'Pushpin' },
                        { value: 'tape', label: 'Tape' },
                        { value: 'none', label: 'None' },
                      ]}
                      ariaLabel="Sticky note anchor pin style"
                    />
                  </div>

                  {/* Stencil Sub-section */}
                  <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
                    <span className="text-[11px] text-text-secondary">Aperture Stencil Clipping</span>
                    <Switch
                      checked={activeSettings.stencilMask?.enabled ?? false}
                      onChange={() => {
                        const cur = activeSettings.stencilMask?.enabled ?? false;
                        updateSettings({
                          ...activeSettings,
                          stencilMask: {
                            ...activeSettings.stencilMask,
                            enabled: !cur,
                            shape: activeSettings.stencilMask?.shape ?? 'rectangle',
                            invertMask: activeSettings.stencilMask?.invertMask ?? false,
                          },
                        });
                      }}
                      label="Toggle stencil clipping"
                    />
                  </div>

                  {activeSettings.stencilMask?.enabled && (
                    <>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Stencil Shape</span>
                        <SegmentedControl
                          value={activeSettings.stencilMask?.shape ?? 'rectangle'}
                          onChange={(val) =>
                            updateSettings({
                              ...activeSettings,
                              stencilMask: {
                                ...activeSettings.stencilMask,
                                shape: val as StencilShape,
                              },
                            })
                          }
                          options={[
                            { value: 'rectangle', label: 'Card' },
                            { value: 'circle', label: 'Circle' },
                            { value: 'speech_bubble', label: 'Bubble' },
                          ]}
                          ariaLabel="Stencil mask shape"
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-secondary">Invert Mask (Negative Space)</span>
                        <Switch
                          checked={activeSettings.stencilMask?.invertMask ?? false}
                          onChange={() =>
                            updateSettings({
                              ...activeSettings,
                              stencilMask: {
                                ...activeSettings.stencilMask,
                                invertMask: !(activeSettings.stencilMask?.invertMask ?? false),
                              },
                            })
                          }
                          label="Toggle invert stencil mask"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Milestone S127: Lasso Encirclement & Auto-Callout Badge */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">adjust</span>
                    Lasso Callout Badges & Pulsing
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Encircle diagrams or text to invoke focus beacons & numbered badges
                  </span>
                </div>
                <Switch
                  checked={activeSettings.lassoCallout?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.lassoCallout?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      lassoCallout: {
                        ...activeSettings.lassoCallout,
                        enabled: !current,
                        calloutStyle: activeSettings.lassoCallout?.calloutStyle ?? 'pulse_beacon',
                        badgeLabel: activeSettings.lassoCallout?.badgeLabel ?? '1',
                        pulseFrequencyHz: activeSettings.lassoCallout?.pulseFrequencyHz ?? 1.2,
                        closureThresholdRatio: activeSettings.lassoCallout?.closureThresholdRatio ?? 0.25,
                        minEnclosedArea: activeSettings.lassoCallout?.minEnclosedArea ?? 500,
                        glowColorHex: activeSettings.lassoCallout?.glowColorHex ?? '#ffdc33',
                      },
                    });
                  }}
                  label="Toggle lasso callout badge"
                />
              </div>

              {activeSettings.lassoCallout?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Callout Style</span>
                    <SegmentedControl
                      value={activeSettings.lassoCallout?.calloutStyle ?? 'pulse_beacon'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          lassoCallout: {
                            ...activeSettings.lassoCallout,
                            calloutStyle: val as CalloutBadgeStyle,
                          },
                        })
                      }
                      options={[
                        { value: 'pulse_beacon', label: 'Pulse' },
                        { value: 'badge_pin', label: 'Pin Badge' },
                        { value: 'magnifier_loupe', label: 'Magnifier' },
                      ]}
                      ariaLabel="Lasso callout visual style"
                    />
                  </div>

                  {activeSettings.lassoCallout?.calloutStyle === 'badge_pin' && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-text-secondary">Badge Label</span>
                      <input
                        type="text"
                        maxLength={4}
                        value={activeSettings.lassoCallout?.badgeLabel ?? '1'}
                        aria-label="Badge pin label"
                        className="w-16 px-1.5 py-0.5 text-center text-[10px] bg-bg-surface border border-hairline rounded text-text-primary focus:border-accent-ai outline-none font-mono"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            lassoCallout: {
                              ...activeSettings.lassoCallout,
                              badgeLabel: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Pulse Frequency</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.lassoCallout?.pulseFrequencyHz ?? 1.2).toFixed(1)}Hz
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={3.0}
                    step={0.1}
                    value={activeSettings.lassoCallout?.pulseFrequencyHz ?? 1.2}
                    aria-label="Breathing pulse frequency"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        lassoCallout: {
                          ...activeSettings.lassoCallout,
                          pulseFrequencyHz: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Closure Gap Tolerance</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.lassoCallout?.closureThresholdRatio ?? 0.25) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={0.45}
                    step={0.05}
                    value={activeSettings.lassoCallout?.closureThresholdRatio ?? 0.25}
                    aria-label="Loop closure gap tolerance"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        lassoCallout: {
                          ...activeSettings.lassoCallout,
                          closureThresholdRatio: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S128: Fluorescent Highlighter Sub-Layer */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">border_color</span>
                    Fluorescent Highlighter
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Broad chisel-tip dye stroke with optical subtractive text preservation
                  </span>
                </div>
                <Switch
                  checked={activeSettings.highlighter?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.highlighter?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      highlighter: {
                        ...activeSettings.highlighter,
                        enabled: !current,
                        colorPreset: activeSettings.highlighter?.colorPreset ?? 'yellow',
                        nibWidthPx: activeSettings.highlighter?.nibWidthPx ?? 24,
                        nibAngleDeg: activeSettings.highlighter?.nibAngleDeg ?? 15,
                        opacity: activeSettings.highlighter?.opacity ?? 0.45,
                        compositeMode: activeSettings.highlighter?.compositeMode ?? 'subtractive_multiply',
                      },
                    });
                  }}
                  label="Toggle fluorescent highlighter"
                />
              </div>

              {activeSettings.highlighter?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Fluorescent Tone</span>
                    <SegmentedControl
                      value={activeSettings.highlighter?.colorPreset ?? 'yellow'}
                      onChange={(val) =>
                        updateSettings({
                          ...activeSettings,
                          highlighter: {
                            ...activeSettings.highlighter,
                            colorPreset: val as HighlighterColorPreset,
                          },
                        })
                      }
                      options={[
                        { value: 'yellow', label: 'Yellow' },
                        { value: 'green', label: 'Green' },
                        { value: 'pink', label: 'Pink' },
                        { value: 'cyan', label: 'Cyan' },
                        { value: 'orange', label: 'Orange' },
                      ]}
                      ariaLabel="Highlighter color preset"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Chisel Nib Width</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.highlighter?.nibWidthPx ?? 24)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={45}
                    step={1}
                    value={activeSettings.highlighter?.nibWidthPx ?? 24}
                    aria-label="Highlighter chisel nib width"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        highlighter: {
                          ...activeSettings.highlighter,
                          nibWidthPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Chisel Tilt Angle</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.highlighter?.nibAngleDeg ?? 15)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={5}
                    value={activeSettings.highlighter?.nibAngleDeg ?? 15}
                    aria-label="Highlighter chisel contact angle"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        highlighter: {
                          ...activeSettings.highlighter,
                          nibAngleDeg: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Dye Density Opacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.highlighter?.opacity ?? 0.45) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={0.85}
                    step={0.05}
                    value={activeSettings.highlighter?.opacity ?? 0.45}
                    aria-label="Highlighter dye ink opacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        highlighter: {
                          ...activeSettings.highlighter,
                          opacity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Subtractive Multiply (Text Preservation)</span>
                    <Switch
                      checked={activeSettings.highlighter?.compositeMode !== 'under_ink'}
                      onChange={() => {
                        const current = activeSettings.highlighter?.compositeMode ?? 'subtractive_multiply';
                        updateSettings({
                          ...activeSettings,
                          highlighter: {
                            ...activeSettings.highlighter,
                            compositeMode: current === 'subtractive_multiply' ? 'under_ink' : 'subtractive_multiply',
                          },
                        });
                      }}
                      label="Toggle subtractive multiply blending"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S129: Whiteboard Multi-Source Hand Lighting & Dual-Penumbra Contact Shadows */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">wb_twilight</span>
                    Multi-Source Hand Lighting
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Key + Fill studio dual penumbra, inverse-square falloff & contact AO
                  </span>
                </div>
                <Switch
                  checked={activeSettings.multiSourceLighting?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.multiSourceLighting?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      multiSourceLighting: {
                        ...activeSettings.multiSourceLighting,
                        enabled: !current,
                        keyLight: {
                          angleDeg: activeSettings.multiSourceLighting?.keyLight?.angleDeg ?? 315,
                          intensity: activeSettings.multiSourceLighting?.keyLight?.intensity ?? 0.75,
                          distancePx: activeSettings.multiSourceLighting?.keyLight?.distancePx ?? 14,
                          blurRadiusPx: activeSettings.multiSourceLighting?.keyLight?.blurRadiusPx ?? 10,
                        },
                        fillLight: {
                          angleDeg: activeSettings.multiSourceLighting?.fillLight?.angleDeg ?? 45,
                          intensity: activeSettings.multiSourceLighting?.fillLight?.intensity ?? 0.35,
                          distancePx: activeSettings.multiSourceLighting?.fillLight?.distancePx ?? 22,
                          blurRadiusPx: activeSettings.multiSourceLighting?.fillLight?.blurRadiusPx ?? 20,
                        },
                        ambientOcclusionIntensity: activeSettings.multiSourceLighting?.ambientOcclusionIntensity ?? 0.35,
                        inverseSquareFalloff: activeSettings.multiSourceLighting?.inverseSquareFalloff ?? true,
                      },
                    });
                  }}
                  label="Toggle multi-source hand lighting"
                />
              </div>

              {activeSettings.multiSourceLighting?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Key Light Angle (Primary)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.multiSourceLighting?.keyLight?.angleDeg ?? 315)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={activeSettings.multiSourceLighting?.keyLight?.angleDeg ?? 315}
                    aria-label="Key light compass angle"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        multiSourceLighting: {
                          ...activeSettings.multiSourceLighting,
                          keyLight: {
                            ...activeSettings.multiSourceLighting?.keyLight,
                            angleDeg: Number(e.target.value),
                          },
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Key Light Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.multiSourceLighting?.keyLight?.intensity ?? 0.75) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.multiSourceLighting?.keyLight?.intensity ?? 0.75}
                    aria-label="Key light radiant intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        multiSourceLighting: {
                          ...activeSettings.multiSourceLighting,
                          keyLight: {
                            ...activeSettings.multiSourceLighting?.keyLight,
                            intensity: Number(e.target.value),
                          },
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Fill Light Angle (Secondary)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.multiSourceLighting?.fillLight?.angleDeg ?? 45)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={activeSettings.multiSourceLighting?.fillLight?.angleDeg ?? 45}
                    aria-label="Fill light compass angle"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        multiSourceLighting: {
                          ...activeSettings.multiSourceLighting,
                          fillLight: {
                            ...activeSettings.multiSourceLighting?.fillLight,
                            angleDeg: Number(e.target.value),
                          },
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Fill Light Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.multiSourceLighting?.fillLight?.intensity ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.multiSourceLighting?.fillLight?.intensity ?? 0.35}
                    aria-label="Fill light radiant intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        multiSourceLighting: {
                          ...activeSettings.multiSourceLighting,
                          fillLight: {
                            ...activeSettings.multiSourceLighting?.fillLight,
                            intensity: Number(e.target.value),
                          },
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Contact Ambient Occlusion</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.multiSourceLighting?.ambientOcclusionIntensity ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.multiSourceLighting?.ambientOcclusionIntensity ?? 0.35}
                    aria-label="Micro-contact AO intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        multiSourceLighting: {
                          ...activeSettings.multiSourceLighting,
                          ambientOcclusionIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Inverse-Square Elevation Falloff</span>
                    <Switch
                      checked={activeSettings.multiSourceLighting?.inverseSquareFalloff ?? true}
                      onChange={() =>
                        updateSettings({
                          ...activeSettings,
                          multiSourceLighting: {
                            ...activeSettings.multiSourceLighting,
                            inverseSquareFalloff: !(activeSettings.multiSourceLighting?.inverseSquareFalloff ?? true),
                          },
                        })
                      }
                      label="Toggle inverse square elevation falloff"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S130: Whiteboard Chalk Dust Settling & Gravitational Blackboard Particle Physics */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">grain</span>
                    Chalk Dust Settling & Tray
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Gravitational downward drift, air flutter & bottom ledge sedimentation
                  </span>
                </div>
                <Switch
                  checked={activeSettings.chalkDustSettling?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.chalkDustSettling?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      chalkDustSettling: {
                        ...activeSettings.chalkDustSettling,
                        enabled: !current,
                        gravitySpeed: activeSettings.chalkDustSettling?.gravitySpeed ?? 80,
                        terminalVelocity: activeSettings.chalkDustSettling?.terminalVelocity ?? 50,
                        turbulenceAmplitude: activeSettings.chalkDustSettling?.turbulenceAmplitude ?? 2.5,
                        trayYPercent: activeSettings.chalkDustSettling?.trayYPercent ?? 0.93,
                        trayDepthPx: activeSettings.chalkDustSettling?.trayDepthPx ?? 18,
                        reposeSigma: activeSettings.chalkDustSettling?.reposeSigma ?? 5.0,
                        accumulationGain: activeSettings.chalkDustSettling?.accumulationGain ?? 25.0,
                        chalkColorHex: activeSettings.chalkDustSettling?.chalkColorHex ?? '#f0f0f0',
                      },
                    });
                  }}
                  label="Toggle chalk dust settling and tray physics"
                />
              </div>

              {activeSettings.chalkDustSettling?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Gravity Drift Speed</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.chalkDustSettling?.gravitySpeed ?? 80)} px/s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={150}
                    step={5}
                    value={activeSettings.chalkDustSettling?.gravitySpeed ?? 80}
                    aria-label="Chalk dust gravitational drift speed"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkDustSettling: {
                          ...activeSettings.chalkDustSettling,
                          gravitySpeed: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Terminal Fall Speed</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.chalkDustSettling?.terminalVelocity ?? 50)} px/s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={120}
                    step={5}
                    value={activeSettings.chalkDustSettling?.terminalVelocity ?? 50}
                    aria-label="Terminal falling velocity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkDustSettling: {
                          ...activeSettings.chalkDustSettling,
                          terminalVelocity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Air Flutter / Turbulence</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.chalkDustSettling?.turbulenceAmplitude ?? 2.5).toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={6.0}
                    step={0.5}
                    value={activeSettings.chalkDustSettling?.turbulenceAmplitude ?? 2.5}
                    aria-label="Air turbulence and horizontal flutter"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkDustSettling: {
                          ...activeSettings.chalkDustSettling,
                          turbulenceAmplitude: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Bottom Tray Elevation</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.chalkDustSettling?.trayYPercent ?? 0.93) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.75}
                    max={0.98}
                    step={0.01}
                    value={activeSettings.chalkDustSettling?.trayYPercent ?? 0.93}
                    aria-label="Bottom shelf position percentage"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkDustSettling: {
                          ...activeSettings.chalkDustSettling,
                          trayYPercent: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Sediment Berm Height</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.chalkDustSettling?.trayDepthPx ?? 18)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={36}
                    step={2}
                    value={activeSettings.chalkDustSettling?.trayDepthPx ?? 18}
                    aria-label="Accumulated sediment berm depth"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkDustSettling: {
                          ...activeSettings.chalkDustSettling,
                          trayDepthPx: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S131: Whiteboard Hand Shadow Soft-Penumbra Contact AO with Hand Geometry Silhouette Tracing */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">front_hand</span>
                    Perspective Hand Silhouette Shadow
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Contour ray projection, wrist elongation & graduated penumbra AO
                  </span>
                </div>
                <Switch
                  checked={activeSettings.handSilhouettePenumbra?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.handSilhouettePenumbra?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      handSilhouettePenumbra: {
                        ...activeSettings.handSilhouettePenumbra,
                        enabled: !current,
                        lightElevationMm: activeSettings.handSilhouettePenumbra?.lightElevationMm ?? 700,
                        wristElevationMm: activeSettings.handSilhouettePenumbra?.wristElevationMm ?? 65,
                        umbraOpacity: activeSettings.handSilhouettePenumbra?.umbraOpacity ?? 0.52,
                        maxPenumbraBlurPx: activeSettings.handSilhouettePenumbra?.maxPenumbraBlurPx ?? 24,
                        minUmbraBlurPx: activeSettings.handSilhouettePenumbra?.minUmbraBlurPx ?? 3.0,
                        aoIntensity: activeSettings.handSilhouettePenumbra?.aoIntensity ?? 0.40,
                      },
                    });
                  }}
                  label="Toggle perspective hand silhouette shadow"
                />
              </div>

              {activeSettings.handSilhouettePenumbra?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Key Light 3D Elevation</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.handSilhouettePenumbra?.lightElevationMm ?? 700)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={1500}
                    step={50}
                    value={activeSettings.handSilhouettePenumbra?.lightElevationMm ?? 700}
                    aria-label="Light source 3D elevation height"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        handSilhouettePenumbra: {
                          ...activeSettings.handSilhouettePenumbra,
                          lightElevationMm: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Forearm Wrist Elevation</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.handSilhouettePenumbra?.wristElevationMm ?? 65)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={120}
                    step={5}
                    value={activeSettings.handSilhouettePenumbra?.wristElevationMm ?? 65}
                    aria-label="Forearm wrist elevation above whiteboard"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        handSilhouettePenumbra: {
                          ...activeSettings.handSilhouettePenumbra,
                          wristElevationMm: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Forearm Penumbra Diffusion</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.handSilhouettePenumbra?.maxPenumbraBlurPx ?? 24)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={48}
                    step={2}
                    value={activeSettings.handSilhouettePenumbra?.maxPenumbraBlurPx ?? 24}
                    aria-label="Maximum forearm penumbra blur radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        handSilhouettePenumbra: {
                          ...activeSettings.handSilhouettePenumbra,
                          maxPenumbraBlurPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Umbra Shadow Density</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.handSilhouettePenumbra?.umbraOpacity ?? 0.52) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.20}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.handSilhouettePenumbra?.umbraOpacity ?? 0.52}
                    aria-label="Umbra core shadow density"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        handSilhouettePenumbra: {
                          ...activeSettings.handSilhouettePenumbra,
                          umbraOpacity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Contact Ambient Occlusion</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.handSilhouettePenumbra?.aoIntensity ?? 0.40) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.handSilhouettePenumbra?.aoIntensity ?? 0.40}
                    aria-label="Contact micro-shadow AO intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        handSilhouettePenumbra: {
                          ...activeSettings.handSilhouettePenumbra,
                          aoIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S132: Whiteboard Marker Cap Snap & Pressure Vacuum Click Foley Acoustics with Magnetic Dock Snapping */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">volume_up</span>
                    Cap Snap & Vacuum Foley Acoustics
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Pneumatic suction pop, plastic detent snap & magnetic dock pull
                  </span>
                </div>
                <Switch
                  checked={activeSettings.capSnapFoley?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.capSnapFoley?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      capSnapFoley: {
                        ...activeSettings.capSnapFoley,
                        enabled: !current,
                        volume: activeSettings.capSnapFoley?.volume ?? 0.75,
                        snapSharpness: activeSettings.capSnapFoley?.snapSharpness ?? 0.80,
                        suctionDepth: activeSettings.capSnapFoley?.suctionDepth ?? 0.65,
                        magneticSnapDistancePx: activeSettings.capSnapFoley?.magneticSnapDistancePx ?? 35.0,
                        autoFoleyOnToolSwap: activeSettings.capSnapFoley?.autoFoleyOnToolSwap ?? true,
                      },
                    });
                  }}
                  label="Toggle marker cap snap foley acoustics"
                />
              </div>

              {activeSettings.capSnapFoley?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Foley Volume</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.capSnapFoley?.volume ?? 0.75) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.capSnapFoley?.volume ?? 0.75}
                    aria-label="Cap snap foley volume"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        capSnapFoley: {
                          ...activeSettings.capSnapFoley,
                          volume: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Cap Detent Snap Sharpness</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.capSnapFoley?.snapSharpness ?? 0.80) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.20}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.capSnapFoley?.snapSharpness ?? 0.80}
                    aria-label="Mechanical detent snap sharpness"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        capSnapFoley: {
                          ...activeSettings.capSnapFoley,
                          snapSharpness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Vacuum Suction Pop Depth</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.capSnapFoley?.suctionDepth ?? 0.65) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.capSnapFoley?.suctionDepth ?? 0.65}
                    aria-label="Vacuum suction pop cavitation depth"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        capSnapFoley: {
                          ...activeSettings.capSnapFoley,
                          suctionDepth: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Magnetic Snap Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.capSnapFoley?.magneticSnapDistancePx ?? 35.0)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={5}
                    value={activeSettings.capSnapFoley?.magneticSnapDistancePx ?? 35.0}
                    aria-label="Magnetic dock capture radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        capSnapFoley: {
                          ...activeSettings.capSnapFoley,
                          magneticSnapDistancePx: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S133: Whiteboard Multi-Color Pen Ribbon Blending & Gradient Transition Wash */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">gradient</span>
                    Ribbon Blending & Gradient Wash
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Porous nib pigment wash, OKLab perceptual blending & chromatic transition
                  </span>
                </div>
                <Switch
                  checked={activeSettings.gradientWash?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.gradientWash?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      gradientWash: {
                        ...activeSettings.gradientWash,
                        enabled: !current,
                        washLengthPx: activeSettings.gradientWash?.washLengthPx ?? 45.0,
                        useOklab: activeSettings.gradientWash?.useOklab ?? true,
                        secondaryColorHex: activeSettings.gradientWash?.secondaryColorHex ?? '#E11D48',
                        ditherNoise: activeSettings.gradientWash?.ditherNoise ?? 0.05,
                      },
                    });
                  }}
                  label="Toggle ribbon blending and gradient wash"
                />
              </div>

              {activeSettings.gradientWash?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Wash Transition Length</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.gradientWash?.washLengthPx ?? 45.0)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={150}
                    step={5}
                    value={activeSettings.gradientWash?.washLengthPx ?? 45.0}
                    aria-label="Pigment wash transition distance"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        gradientWash: {
                          ...activeSettings.gradientWash,
                          washLengthPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Secondary Accent Pigment</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={activeSettings.gradientWash?.secondaryColorHex ?? '#E11D48'}
                        aria-label="Secondary transition pigment color"
                        className="w-5 h-5 rounded cursor-pointer border border-hairline bg-transparent"
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            gradientWash: {
                              ...activeSettings.gradientWash,
                              secondaryColorHex: e.target.value,
                            },
                          })
                        }
                      />
                      <span className="font-mono text-[10px] text-text-primary">
                        {(activeSettings.gradientWash?.secondaryColorHex ?? '#E11D48').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Perceptual OKLab Blending</span>
                    <Switch
                      checked={activeSettings.gradientWash?.useOklab ?? true}
                      onChange={() => {
                        const current = activeSettings.gradientWash?.useOklab ?? true;
                        updateSettings({
                          ...activeSettings,
                          gradientWash: {
                            ...activeSettings.gradientWash,
                            useOklab: !current,
                          },
                        });
                      }}
                      label="Toggle OKLab perceptual color blending"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Fiber Grain Micro-Dither</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.gradientWash?.ditherNoise ?? 0.05) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.20}
                    step={0.01}
                    value={activeSettings.gradientWash?.ditherNoise ?? 0.05}
                    aria-label="Micro-dither fiber grain noise amplitude"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        gradientWash: {
                          ...activeSettings.gradientWash,
                          ditherNoise: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S134: Whiteboard Felt-Tip Marker Nib Splay & Directional Fiber Compression Dynamics */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">brush</span>
                    Felt Nib Splay & Fiber Compression
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Hookean spring elasticity, directional drag deflection & mushrooming
                  </span>
                </div>
                <Switch
                  checked={activeSettings.nibSplay?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.nibSplay?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      nibSplay: {
                        ...activeSettings.nibSplay,
                        enabled: !current,
                        splayGain: activeSettings.nibSplay?.splayGain ?? 1.2,
                        fiberStiffness: activeSettings.nibSplay?.fiberStiffness ?? 0.65,
                        dragDeflection: activeSettings.nibSplay?.dragDeflection ?? 0.40,
                      },
                    });
                  }}
                  label="Toggle felt nib splay and fiber compression"
                />
              </div>

              {activeSettings.nibSplay?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Splay Expansion Gain</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.nibSplay?.splayGain ?? 1.2).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={2.5}
                    step={0.1}
                    value={activeSettings.nibSplay?.splayGain ?? 1.2}
                    aria-label="Fiber lateral splay expansion gain"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        nibSplay: {
                          ...activeSettings.nibSplay,
                          splayGain: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Fiber Spring Stiffness</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.nibSplay?.fiberStiffness ?? 0.65) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={0.95}
                    step={0.05}
                    value={activeSettings.nibSplay?.fiberStiffness ?? 0.65}
                    aria-label="Fiber compression resistance stiffness"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        nibSplay: {
                          ...activeSettings.nibSplay,
                          fiberStiffness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Friction Drag Deflection</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.nibSplay?.dragDeflection ?? 0.40) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.nibSplay?.dragDeflection ?? 0.40}
                    aria-label="Directional friction drag deflection"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        nibSplay: {
                          ...activeSettings.nibSplay,
                          dragDeflection: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S135: Whiteboard Wet-on-Wet Capillary Bleed & Pigment Diffusion at Stroke Intersections */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">water_drop</span>
                    Wet Capillary Bleed & Diffusion
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Solvent pooling, core dilution & dendritic feathering at line intersections
                  </span>
                </div>
                <Switch
                  checked={activeSettings.capillaryBleed?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.capillaryBleed?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      capillaryBleed: {
                        ...activeSettings.capillaryBleed,
                        enabled: !current,
                        dryingTimeSec: activeSettings.capillaryBleed?.dryingTimeSec ?? 2.0,
                        bleedBloomRadiusPx: activeSettings.capillaryBleed?.bleedBloomRadiusPx ?? 6.0,
                        solventDilution: activeSettings.capillaryBleed?.solventDilution ?? 0.35,
                        featherSpikes: activeSettings.capillaryBleed?.featherSpikes ?? 6,
                      },
                    });
                  }}
                  label="Toggle wet-on-wet capillary bleed"
                />
              </div>

              {activeSettings.capillaryBleed?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Wet Drying Window</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.capillaryBleed?.dryingTimeSec ?? 2.0).toFixed(1)} s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={5.0}
                    step={0.5}
                    value={activeSettings.capillaryBleed?.dryingTimeSec ?? 2.0}
                    aria-label="Liquid solvent drying duration window"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        capillaryBleed: {
                          ...activeSettings.capillaryBleed,
                          dryingTimeSec: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Capillary Bloom Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.capillaryBleed?.bleedBloomRadiusPx ?? 6.0)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    step={1}
                    value={activeSettings.capillaryBleed?.bleedBloomRadiusPx ?? 6.0}
                    aria-label="Capillary bloom feathering radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        capillaryBleed: {
                          ...activeSettings.capillaryBleed,
                          bleedBloomRadiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Solvent Core Dilution</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.capillaryBleed?.solventDilution ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.70}
                    step={0.05}
                    value={activeSettings.capillaryBleed?.solventDilution ?? 0.35}
                    aria-label="Solvent pooling core dilution percentage"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        capillaryBleed: {
                          ...activeSettings.capillaryBleed,
                          solventDilution: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Dendritic Tendril Spikes</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.capillaryBleed?.featherSpikes ?? 6)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={12}
                    step={1}
                    value={activeSettings.capillaryBleed?.featherSpikes ?? 6}
                    aria-label="Dendritic micro-tendril spike count"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        capillaryBleed: {
                          ...activeSettings.capillaryBleed,
                          featherSpikes: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S136: Whiteboard Dry-Erase Felt Eraser Swipe Smear & Ghosting Residuals */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">cleaning_services</span>
                    Felt Eraser Smear & Ghosting Residuals
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Pad saturation, wiper smear streaks & multi-pass residual memory
                  </span>
                </div>
                <Switch
                  checked={activeSettings.eraserGhosting?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.eraserGhosting?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      eraserGhosting: {
                        ...activeSettings.eraserGhosting,
                        enabled: !current,
                        feltSaturationRate: activeSettings.eraserGhosting?.feltSaturationRate ?? 0.08,
                        smearOpacity: activeSettings.eraserGhosting?.smearOpacity ?? 0.06,
                        ghostPersistence: activeSettings.eraserGhosting?.ghostPersistence ?? 0.05,
                        cleaningDecayRate: activeSettings.eraserGhosting?.cleaningDecayRate ?? 0.40,
                      },
                    });
                  }}
                  label="Toggle dry-erase felt smear and ghosting residuals"
                />
              </div>

              {activeSettings.eraserGhosting?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Felt Saturation Rate</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.eraserGhosting?.feltSaturationRate ?? 0.08) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={0.25}
                    step={0.01}
                    value={activeSettings.eraserGhosting?.feltSaturationRate ?? 0.08}
                    aria-label="Felt eraser pad saturation accumulation rate"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        eraserGhosting: {
                          ...activeSettings.eraserGhosting,
                          feltSaturationRate: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Wiper Smear Opacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.eraserGhosting?.smearOpacity ?? 0.06) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={0.20}
                    step={0.01}
                    value={activeSettings.eraserGhosting?.smearOpacity ?? 0.06}
                    aria-label="Eraser swipe trail smear opacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        eraserGhosting: {
                          ...activeSettings.eraserGhosting,
                          smearOpacity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Ghost Persistence</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.eraserGhosting?.ghostPersistence ?? 0.05) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={0.15}
                    step={0.01}
                    value={activeSettings.eraserGhosting?.ghostPersistence ?? 0.05}
                    aria-label="Chemical ghosting residual initial persistence opacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        eraserGhosting: {
                          ...activeSettings.eraserGhosting,
                          ghostPersistence: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Wiping Decay Rate</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.eraserGhosting?.cleaningDecayRate ?? 0.40) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.10}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.eraserGhosting?.cleaningDecayRate ?? 0.40}
                    aria-label="Ghost residual cleaning decay rate per pass"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        eraserGhosting: {
                          ...activeSettings.eraserGhosting,
                          cleaningDecayRate: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S137: Whiteboard Dual-Layer Tempered Glass Specular Glare & Parallax Reflection */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">flare</span>
                    Tempered Glass Glare & Parallax
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Dual Fresnel reflections, refractive parallax shadow & overhead luminaire streak
                  </span>
                </div>
                <Switch
                  checked={activeSettings.glassParallax?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.glassParallax?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      glassParallax: {
                        ...activeSettings.glassParallax,
                        enabled: !current,
                        glassThickness: activeSettings.glassParallax?.glassThickness ?? 8.0,
                        fresnelGlareIntensity: activeSettings.glassParallax?.fresnelGlareIntensity ?? 0.20,
                        parallaxGhostOpacity: activeSettings.glassParallax?.parallaxGhostOpacity ?? 0.10,
                        glarePosX: activeSettings.glassParallax?.glarePosX ?? 0.50,
                        glarePosY: activeSettings.glassParallax?.glarePosY ?? 0.15,
                      },
                    });
                  }}
                  label="Toggle tempered glass specular glare and parallax reflection"
                />
              </div>

              {activeSettings.glassParallax?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Glass Plate Thickness</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.glassParallax?.glassThickness ?? 8} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={25}
                    step={1}
                    value={activeSettings.glassParallax?.glassThickness ?? 8}
                    aria-label="Tempered glass plate thickness in pixels"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        glassParallax: {
                          ...activeSettings.glassParallax,
                          glassThickness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Fresnel Glare Sheen</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.glassParallax?.fresnelGlareIntensity ?? 0.20) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.60}
                    step={0.05}
                    value={activeSettings.glassParallax?.fresnelGlareIntensity ?? 0.20}
                    aria-label="Fresnel specular glare sheen intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        glassParallax: {
                          ...activeSettings.glassParallax,
                          fresnelGlareIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Parallax Shadow Opacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.glassParallax?.parallaxGhostOpacity ?? 0.10) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={0.25}
                    step={0.01}
                    value={activeSettings.glassParallax?.parallaxGhostOpacity ?? 0.10}
                    aria-label="Secondary refractive parallax shadow opacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        glassParallax: {
                          ...activeSettings.glassParallax,
                          parallaxGhostOpacity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Overhead Glare X Position</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.glassParallax?.glarePosX ?? 0.50) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.glassParallax?.glarePosX ?? 0.50}
                    aria-label="Overhead luminaire specular glare horizontal position"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        glassParallax: {
                          ...activeSettings.glassParallax,
                          glarePosX: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Overhead Glare Y Elevation</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.glassParallax?.glarePosY ?? 0.15) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.60}
                    step={0.05}
                    value={activeSettings.glassParallax?.glarePosY ?? 0.15}
                    aria-label="Overhead luminaire specular glare vertical position"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        glassParallax: {
                          ...activeSettings.glassParallax,
                          glarePosY: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S138: Whiteboard Graphite Sheen Reflection & Textured Paper Grain Bump Mapping */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">texture</span>
                    Graphite Sheen & Paper Grain
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Paper tooth micro-texture, pressure pore penetration & metallic sheen
                  </span>
                </div>
                <Switch
                  checked={activeSettings.graphiteGrain?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.graphiteGrain?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      graphiteGrain: {
                        ...activeSettings.graphiteGrain,
                        enabled: !current,
                        grainRoughness: activeSettings.graphiteGrain?.grainRoughness ?? 0.35,
                        graphiteSheenIntensity: activeSettings.graphiteGrain?.graphiteSheenIntensity ?? 0.25,
                        sheenShininess: activeSettings.graphiteGrain?.sheenShininess ?? 32,
                        lightAzimuthDeg: activeSettings.graphiteGrain?.lightAzimuthDeg ?? 45,
                      },
                    });
                  }}
                  label="Toggle graphite metallic sheen and textured paper grain"
                />
              </div>

              {activeSettings.graphiteGrain?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Paper Grain Roughness</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.graphiteGrain?.grainRoughness ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.graphiteGrain?.grainRoughness ?? 0.35}
                    aria-label="Paper tooth micro-relief roughness"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        graphiteGrain: {
                          ...activeSettings.graphiteGrain,
                          grainRoughness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Graphite Metallic Sheen</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.graphiteGrain?.graphiteSheenIntensity ?? 0.25) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.80}
                    step={0.05}
                    value={activeSettings.graphiteGrain?.graphiteSheenIntensity ?? 0.25}
                    aria-label="Graphite crystalline metallic specular sheen intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        graphiteGrain: {
                          ...activeSettings.graphiteGrain,
                          graphiteSheenIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Specular Shininess</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.graphiteGrain?.sheenShininess ?? 32}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={64}
                    step={4}
                    value={activeSettings.graphiteGrain?.sheenShininess ?? 32}
                    aria-label="Blinn-Phong specular shininess exponent"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        graphiteGrain: {
                          ...activeSettings.graphiteGrain,
                          sheenShininess: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Incident Light Azimuth</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.graphiteGrain?.lightAzimuthDeg ?? 45}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={activeSettings.graphiteGrain?.lightAzimuthDeg ?? 45}
                    aria-label="Incident light azimuth angle in degrees"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        graphiteGrain: {
                          ...activeSettings.graphiteGrain,
                          lightAzimuthDeg: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S139: Whiteboard Solvent Vapor Shimmer & Ambient Thermal Convection */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-accent-ai">air</span>
                    Solvent Vapor Shimmer & Convection
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Volatile solvent evaporation, buoyant convection & heat mirage shimmer
                  </span>
                </div>
                <Switch
                  checked={activeSettings.vaporShimmer?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.vaporShimmer?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      vaporShimmer: {
                        ...activeSettings.vaporShimmer,
                        enabled: !current,
                        shimmerAmplitudePx: activeSettings.vaporShimmer?.shimmerAmplitudePx ?? 2.5,
                        solventEvapHalfLife: activeSettings.vaporShimmer?.solventEvapHalfLife ?? 1.0,
                        convectionSpeed: activeSettings.vaporShimmer?.convectionSpeed ?? 40,
                        buoyancyPlumeHeightPx: activeSettings.vaporShimmer?.buoyancyPlumeHeightPx ?? 35,
                      },
                    });
                  }}
                  label="Toggle volatile solvent evaporative shimmer and convective plume"
                />
              </div>

              {activeSettings.vaporShimmer?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Shimmer Ripple Amplitude</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.vaporShimmer?.shimmerAmplitudePx ?? 2.5).toFixed(1)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={6.0}
                    step={0.5}
                    value={activeSettings.vaporShimmer?.shimmerAmplitudePx ?? 2.5}
                    aria-label="Vapor shimmer optical refraction displacement amplitude"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        vaporShimmer: {
                          ...activeSettings.vaporShimmer,
                          shimmerAmplitudePx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Evaporative Half-Life</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.vaporShimmer?.solventEvapHalfLife ?? 1.0).toFixed(1)} s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={3.0}
                    step={0.1}
                    value={activeSettings.vaporShimmer?.solventEvapHalfLife ?? 1.0}
                    aria-label="Solvent evaporation half-life drying duration"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        vaporShimmer: {
                          ...activeSettings.vaporShimmer,
                          solventEvapHalfLife: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Upward Convection Speed</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.vaporShimmer?.convectionSpeed ?? 40} px/s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={5}
                    value={activeSettings.vaporShimmer?.convectionSpeed ?? 40}
                    aria-label="Buoyant upward convection velocity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        vaporShimmer: {
                          ...activeSettings.vaporShimmer,
                          convectionSpeed: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Buoyant Plume Height</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.vaporShimmer?.buoyancyPlumeHeightPx ?? 35} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={80}
                    step={5}
                    value={activeSettings.vaporShimmer?.buoyancyPlumeHeightPx ?? 35}
                    aria-label="Vertical height of buoyant convection plume above stroke"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        vaporShimmer: {
                          ...activeSettings.vaporShimmer,
                          buoyancyPlumeHeightPx: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}

              {/* Milestone S141: Whiteboard Live Audio-Visual Reactive Ink Pulsing */}
              <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">graphic_eq</span>
                    <span>Audio-Reactive Ink Pulsing</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Vocal loudness pulsing, F0 pitch harmonic ripple & plosive shockwaves
                  </span>
                </div>
                <Switch
                  checked={activeSettings.audioReactiveInk?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.audioReactiveInk?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      audioReactiveInk: {
                        ...activeSettings.audioReactiveInk,
                        enabled: !current,
                        energyGain: activeSettings.audioReactiveInk?.energyGain ?? 1.2,
                        energyGamma: activeSettings.audioReactiveInk?.energyGamma ?? 1.0,
                        attackMs: activeSettings.audioReactiveInk?.attackMs ?? 10,
                        releaseMs: activeSettings.audioReactiveInk?.releaseMs ?? 80,
                        pitchRippleAmp: activeSettings.audioReactiveInk?.pitchRippleAmp ?? 2.0,
                        transientBurstRadius: activeSettings.audioReactiveInk?.transientBurstRadius ?? 8.0,
                        syncOffsetMs: activeSettings.audioReactiveInk?.syncOffsetMs ?? 0,
                      },
                    });
                  }}
                  label="Toggle live speech audio-reactive ink pulsing and transient shockwaves"
                />
              </div>

              {activeSettings.audioReactiveInk?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Speech Energy Width Gain</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.audioReactiveInk?.energyGain ?? 1.2).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={3.0}
                    step={0.1}
                    value={activeSettings.audioReactiveInk?.energyGain ?? 1.2}
                    aria-label="Stroke width expansion gain driven by speech volume envelope"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        audioReactiveInk: {
                          ...activeSettings.audioReactiveInk,
                          energyGain: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Ballistic Response (Attack / Release)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.audioReactiveInk?.attackMs ?? 10} ms / {activeSettings.audioReactiveInk?.releaseMs ?? 80} ms
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="range"
                      min={2}
                      max={40}
                      step={1}
                      value={activeSettings.audioReactiveInk?.attackMs ?? 10}
                      aria-label="Envelope follower attack time in milliseconds"
                      className="w-full accent-[var(--accent-ai)] cursor-pointer"
                      onChange={(e) =>
                        updateSettings({
                          ...activeSettings,
                          audioReactiveInk: {
                            ...activeSettings.audioReactiveInk,
                            attackMs: Number(e.target.value),
                          },
                        })
                      }
                    />
                    <input
                      type="range"
                      min={20}
                      max={250}
                      step={5}
                      value={activeSettings.audioReactiveInk?.releaseMs ?? 80}
                      aria-label="Envelope follower release decay time in milliseconds"
                      className="w-full accent-[var(--accent-ai)] cursor-pointer"
                      onChange={(e) =>
                        updateSettings({
                          ...activeSettings,
                          audioReactiveInk: {
                            ...activeSettings.audioReactiveInk,
                            releaseMs: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Pitch Ripple Amplitude</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.audioReactiveInk?.pitchRippleAmp ?? 2.0).toFixed(1)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={6.0}
                    step={0.2}
                    value={activeSettings.audioReactiveInk?.pitchRippleAmp ?? 2.0}
                    aria-label="Harmonic edge ripple amplitude modulated by vocal pitch"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        audioReactiveInk: {
                          ...activeSettings.audioReactiveInk,
                          pitchRippleAmp: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Plosive Transient Burst Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.audioReactiveInk?.transientBurstRadius ?? 8.0).toFixed(1)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={activeSettings.audioReactiveInk?.transientBurstRadius ?? 8.0}
                    aria-label="Radius of pigment shockwave burst rings on vocal plosives"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        audioReactiveInk: {
                          ...activeSettings.audioReactiveInk,
                          transientBurstRadius: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Audio-Visual Sync Offset</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.audioReactiveInk?.syncOffsetMs ?? 0} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-80}
                    max={80}
                    step={5}
                    value={activeSettings.audioReactiveInk?.syncOffsetMs ?? 0}
                    aria-label="Latency compensation offset between audio and stroke pulsing"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        audioReactiveInk: {
                          ...activeSettings.audioReactiveInk,
                          syncOffsetMs: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}

              {/* Milestone S142: Hand Palm Occlusion & Natural Smudging Physics */}
              <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">pan_tool</span>
                    <span>Palm Occlusion & Natural Smudging</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Resting palm heel touchdown, wet ink pickup & directional smear drag
                  </span>
                </div>
                <Switch
                  checked={activeSettings.palmSmudge?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.palmSmudge?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      palmSmudge: {
                        ...activeSettings.palmSmudge,
                        enabled: !current,
                        touchdownElevationMm: activeSettings.palmSmudge?.touchdownElevationMm ?? 8.0,
                        palmRadiusPx: activeSettings.palmSmudge?.palmRadiusPx ?? 35.0,
                        smudgeIntensity: activeSettings.palmSmudge?.smudgeIntensity ?? 0.40,
                        smudgeDecayPx: activeSettings.palmSmudge?.smudgeDecayPx ?? 60.0,
                        wetTimeWindowSec: activeSettings.palmSmudge?.wetTimeWindowSec ?? 2.0,
                        shadowOpacity: activeSettings.palmSmudge?.shadowOpacity ?? 0.35,
                      },
                    });
                  }}
                  label="Toggle hand palm occlusion and directional wet ink smudging physics"
                />
              </div>

              {activeSettings.palmSmudge?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Smudge Pickup Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.palmSmudge?.smudgeIntensity ?? 0.40) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.palmSmudge?.smudgeIntensity ?? 0.40}
                    aria-label="Fraction of wet ink transferred and dragged by palm heel"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        palmSmudge: {
                          ...activeSettings.palmSmudge,
                          smudgeIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Smudge Drag Decay Length</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.palmSmudge?.smudgeDecayPx ?? 60} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={150}
                    step={5}
                    value={activeSettings.palmSmudge?.smudgeDecayPx ?? 60}
                    aria-label="Characteristic exponential depletion length of dragged ink smear"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        palmSmudge: {
                          ...activeSettings.palmSmudge,
                          smudgeDecayPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Palm Contact Heel Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.palmSmudge?.palmRadiusPx ?? 35} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={75}
                    step={2}
                    value={activeSettings.palmSmudge?.palmRadiusPx ?? 35}
                    aria-label="Geometric size of palm heel contact footprint"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        palmSmudge: {
                          ...activeSettings.palmSmudge,
                          palmRadiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Touchdown Elevation Threshold</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.palmSmudge?.touchdownElevationMm ?? 8.0).toFixed(1)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2.0}
                    max={18.0}
                    step={0.5}
                    value={activeSettings.palmSmudge?.touchdownElevationMm ?? 8.0}
                    aria-label="Hand elevation threshold below which palm rests against board"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        palmSmudge: {
                          ...activeSettings.palmSmudge,
                          touchdownElevationMm: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Palm Contact Shadow Opacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.palmSmudge?.shadowOpacity ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.7}
                    step={0.05}
                    value={activeSettings.palmSmudge?.shadowOpacity ?? 0.35}
                    aria-label="Ambient contact occlusion shadow under resting palm heel"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        palmSmudge: {
                          ...activeSettings.palmSmudge,
                          shadowOpacity: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}

              {/* Milestone S143: Multi-Resolution Spatial Tile Caching & Vector QuadTree Acceleration */}
              <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">grid_view</span>
                    <span>Spatial QuadTree & Tile Caching</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Hierarchical frustum culling & multi-scale raster pyramid caching
                  </span>
                </div>
                <Switch
                  checked={activeSettings.quadtreeTileCache?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.quadtreeTileCache?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      quadtreeTileCache: {
                        ...activeSettings.quadtreeTileCache,
                        enabled: !current,
                        maxDepth: activeSettings.quadtreeTileCache?.maxDepth ?? 6,
                        maxItemsPerNode: activeSettings.quadtreeTileCache?.maxItemsPerNode ?? 8,
                        tileSize: activeSettings.quadtreeTileCache?.tileSize ?? 256,
                        mipLevels: activeSettings.quadtreeTileCache?.mipLevels ?? 3,
                        cullingMarginPx: activeSettings.quadtreeTileCache?.cullingMarginPx ?? 30,
                      },
                    });
                  }}
                  label="Toggle spatial quadtree indexing and multi-resolution tile caching"
                />
              </div>

              {activeSettings.quadtreeTileCache?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Raster Tile Size</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.quadtreeTileCache?.tileSize ?? 256} px
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[128, 256, 512].map((size) => {
                      const isSel = (activeSettings.quadtreeTileCache?.tileSize ?? 256) === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          className={`text-[10px] py-1 rounded border transition-colors ${
                            isSel
                              ? 'bg-accent-ai text-bg-app border-accent-ai font-medium'
                              : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                          }`}
                          onClick={() =>
                            updateSettings({
                              ...activeSettings,
                              quadtreeTileCache: {
                                ...activeSettings.quadtreeTileCache,
                                tileSize: size as 128 | 256 | 512,
                              },
                            })
                          }
                        >
                          {size}px
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Max QuadTree Tree Depth</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      Level {activeSettings.quadtreeTileCache?.maxDepth ?? 6}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={8}
                    step={1}
                    value={activeSettings.quadtreeTileCache?.maxDepth ?? 6}
                    aria-label="Maximum spatial subdivision depth for quadtree indexing"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        quadtreeTileCache: {
                          ...activeSettings.quadtreeTileCache,
                          maxDepth: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Multi-Resolution Pyramid Mip Levels</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.quadtreeTileCache?.mipLevels ?? 3} Mips
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={activeSettings.quadtreeTileCache?.mipLevels ?? 3}
                    aria-label="Number of downsampled raster tile cache levels"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        quadtreeTileCache: {
                          ...activeSettings.quadtreeTileCache,
                          mipLevels: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Frustum Culling Safety Margin</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.quadtreeTileCache?.cullingMarginPx ?? 30} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={activeSettings.quadtreeTileCache?.cullingMarginPx ?? 30}
                    aria-label="Extra padding around camera viewport before strokes are culled"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        quadtreeTileCache: {
                          ...activeSettings.quadtreeTileCache,
                          cullingMarginPx: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}

              {/* Milestone S144: Whiteboard Chalk Breakage & Variable Angle Edge Chatters */}
              <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">draw</span>
                    <span>Chalk Breakage & Edge Chatters</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Stick-slip friction resonance & downforce shear breakage
                  </span>
                </div>
                <Switch
                  checked={activeSettings.chalkBreakage?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.chalkBreakage?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      chalkBreakage: {
                        ...activeSettings.chalkBreakage,
                        enabled: !current,
                        slantAngleDeg: activeSettings.chalkBreakage?.slantAngleDeg ?? 40.0,
                        chatterFrequencyHz: activeSettings.chalkBreakage?.chatterFrequencyHz ?? 140.0,
                        skipThreshold: activeSettings.chalkBreakage?.skipThreshold ?? 0.35,
                        breakagePressureThreshold: activeSettings.chalkBreakage?.breakagePressureThreshold ?? 0.88,
                        facetWidthMultiplier: activeSettings.chalkBreakage?.facetWidthMultiplier ?? 2.2,
                        dustBurstCount: activeSettings.chalkBreakage?.dustBurstCount ?? 12,
                      },
                    });
                  }}
                  label="Toggle chalk stick-slip chatter skipping and structural breakage dynamics"
                />
              </div>

              {activeSettings.chalkBreakage?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Chalk Stick Slant Angle</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.chalkBreakage?.slantAngleDeg ?? 40}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={75}
                    step={1}
                    value={activeSettings.chalkBreakage?.slantAngleDeg ?? 40}
                    aria-label="Grazing angle between chalk stick and board surface"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkBreakage: {
                          ...activeSettings.chalkBreakage,
                          slantAngleDeg: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Stick-Slip Chatter Frequency</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.chalkBreakage?.chatterFrequencyHz ?? 140} Hz
                    </span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={240}
                    step={10}
                    value={activeSettings.chalkBreakage?.chatterFrequencyHz ?? 140}
                    aria-label="Stick-slip mechanical resonance frequency"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkBreakage: {
                          ...activeSettings.chalkBreakage,
                          chatterFrequencyHz: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Skip Void Duty Threshold</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.chalkBreakage?.skipThreshold ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.7}
                    step={0.05}
                    value={activeSettings.chalkBreakage?.skipThreshold ?? 0.35}
                    aria-label="Proportion of chatter wave cycle rendered as hollow void gaps"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkBreakage: {
                          ...activeSettings.chalkBreakage,
                          skipThreshold: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Breakage Pressure Threshold</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.chalkBreakage?.breakagePressureThreshold ?? 0.88) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={0.98}
                    step={0.02}
                    value={activeSettings.chalkBreakage?.breakagePressureThreshold ?? 0.88}
                    aria-label="Critical stylus pressure threshold causing chalk stick to snap"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkBreakage: {
                          ...activeSettings.chalkBreakage,
                          breakagePressureThreshold: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Broken Wedge Facet Multiplier</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.chalkBreakage?.facetWidthMultiplier ?? 2.2}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.5}
                    max={3.5}
                    step={0.1}
                    value={activeSettings.chalkBreakage?.facetWidthMultiplier ?? 2.2}
                    aria-label="Stroke width multiplier after chalk breakage"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkBreakage: {
                          ...activeSettings.chalkBreakage,
                          facetWidthMultiplier: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Snap Debris Shard Count</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.chalkBreakage?.dustBurstCount ?? 12} Shards
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={2}
                    value={activeSettings.chalkBreakage?.dustBurstCount ?? 12}
                    aria-label="Number of radial chalk dust debris particles emitted upon snap"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        chalkBreakage: {
                          ...activeSettings.chalkBreakage,
                          dustBurstCount: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}

              {/* Milestone S145: Real-Time WebGL/WebGPU Stroke Fragment Shader Pipeline */}
              <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">bolt</span>
                    <span>WebGL / GPU Stroke Fragment Shader</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Analytic SDF rasterization & Blinn-Phong specular glint
                  </span>
                </div>
                <Switch
                  checked={activeSettings.strokeShader?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.strokeShader?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      strokeShader: {
                        ...activeSettings.strokeShader,
                        enabled: !current,
                        substrateRoughness: activeSettings.strokeShader?.substrateRoughness ?? 0.35,
                        edgeFeathering: activeSettings.strokeShader?.edgeFeathering ?? 1.2,
                        specularIntensity: activeSettings.strokeShader?.specularIntensity ?? 0.4,
                        specularRoughness: activeSettings.strokeShader?.specularRoughness ?? 0.25,
                        fresnelStrength: activeSettings.strokeShader?.fresnelStrength ?? 0.5,
                        shadowOpacity: activeSettings.strokeShader?.shadowOpacity ?? 0.25,
                      },
                    });
                  }}
                  label="Toggle WebGL GPU stroke fragment shader pipeline"
                />
              </div>

              {activeSettings.strokeShader?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Substrate Tooth Roughness</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.strokeShader?.substrateRoughness ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.strokeShader?.substrateRoughness ?? 0.35}
                    aria-label="Procedural micro-tooth noise modulating ink absorption"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        strokeShader: {
                          ...activeSettings.strokeShader,
                          substrateRoughness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Edge Smoothstep Feathering</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.strokeShader?.edgeFeathering ?? 1.2).toFixed(1)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={4.0}
                    step={0.1}
                    value={activeSettings.strokeShader?.edgeFeathering ?? 1.2}
                    aria-label="Sub-pixel Hermite smoothstep antialiasing radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        strokeShader: {
                          ...activeSettings.strokeShader,
                          edgeFeathering: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Wet Ink Specular Glint</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.strokeShader?.specularIntensity ?? 0.4) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.strokeShader?.specularIntensity ?? 0.4}
                    aria-label="Blinn-Phong specular glint intensity on wet stroke core"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        strokeShader: {
                          ...activeSettings.strokeShader,
                          specularIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Specular Roughness Exponent</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.strokeShader?.specularRoughness ?? 0.25).toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.8}
                    step={0.05}
                    value={activeSettings.strokeShader?.specularRoughness ?? 0.25}
                    aria-label="Specular highlight sharpness and surface smoothness"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        strokeShader: {
                          ...activeSettings.strokeShader,
                          specularRoughness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Schlick-Fresnel Grazing Sheen</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.strokeShader?.fresnelStrength ?? 0.5) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.strokeShader?.fresnelStrength ?? 0.5}
                    aria-label="Fresnel reflectance enhancement at steep grazing angles"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        strokeShader: {
                          ...activeSettings.strokeShader,
                          fresnelStrength: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Contact Ambient Shadow</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.strokeShader?.shadowOpacity ?? 0.25) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.strokeShader?.shadowOpacity ?? 0.25}
                    aria-label="Underlying stroke contact shadow opacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        strokeShader: {
                          ...activeSettings.strokeShader,
                          shadowOpacity: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}

              {/* Milestone S146: Charcoal & Conte Crayon Powder Smearing with Tortillon Stump Blending */}
              <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">texture</span>
                    <span>Charcoal & Tortillon Stump Blending</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Friable powder deposition & paper stump burnishing
                  </span>
                </div>
                <Switch
                  checked={activeSettings.charcoalTortillon?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.charcoalTortillon?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      charcoalTortillon: {
                        ...activeSettings.charcoalTortillon,
                        enabled: !current,
                        mediaType: activeSettings.charcoalTortillon?.mediaType ?? 'vine_charcoal',
                        powderFriability: activeSettings.charcoalTortillon?.powderFriability ?? 0.75,
                        stumpHardness: activeSettings.charcoalTortillon?.stumpHardness ?? 0.5,
                        blendRadiusPx: activeSettings.charcoalTortillon?.blendRadiusPx ?? 12.0,
                        burnishDepth: activeSettings.charcoalTortillon?.burnishDepth ?? 0.65,
                      },
                    });
                  }}
                  label="Toggle charcoal powder mechanics and tortillon stump blending"
                />
              </div>

              {activeSettings.charcoalTortillon?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Dry Carbon Media Type</span>
                    <span className="font-mono text-text-primary text-[10px] capitalize">
                      {(activeSettings.charcoalTortillon?.mediaType ?? 'vine_charcoal').replace('_', ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'vine_charcoal', label: 'Vine' },
                      { id: 'compressed_charcoal', label: 'Compressed' },
                      { id: 'conte_crayon', label: 'Conte' },
                    ].map((m) => {
                      const isSel = (activeSettings.charcoalTortillon?.mediaType ?? 'vine_charcoal') === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`text-[10px] py-1 rounded border transition-colors ${
                            isSel
                              ? 'bg-accent-ai text-bg-app border-accent-ai font-medium'
                              : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                          }`}
                          onClick={() =>
                            updateSettings({
                              ...activeSettings,
                              charcoalTortillon: {
                                ...activeSettings.charcoalTortillon,
                                mediaType: m.id as any,
                              },
                            })
                          }
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Media Powder Friability</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.charcoalTortillon?.powderFriability ?? 0.75) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.charcoalTortillon?.powderFriability ?? 0.75}
                    aria-label="Looseness and flake rate of dry carbon particles"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        charcoalTortillon: {
                          ...activeSettings.charcoalTortillon,
                          powderFriability: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Tortillon Stump Hardness</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.charcoalTortillon?.stumpHardness ?? 0.5) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={activeSettings.charcoalTortillon?.stumpHardness ?? 0.5}
                    aria-label="Rigidity of rolled paper blending stump"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        charcoalTortillon: {
                          ...activeSettings.charcoalTortillon,
                          stumpHardness: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Stump Blending Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.charcoalTortillon?.blendRadiusPx ?? 12)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={25}
                    step={1}
                    value={activeSettings.charcoalTortillon?.blendRadiusPx ?? 12}
                    aria-label="Contact footprint radius of the blending stump"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        charcoalTortillon: {
                          ...activeSettings.charcoalTortillon,
                          blendRadiusPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Tooth Valley Burnish Depth</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.charcoalTortillon?.burnishDepth ?? 0.65) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.charcoalTortillon?.burnishDepth ?? 0.65}
                    aria-label="Degree of powder penetration and burnishing into tooth valleys"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        charcoalTortillon: {
                          ...activeSettings.charcoalTortillon,
                          burnishDepth: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}

              {/* Milestone S147: Multi-Layer Animation Onion Skinning & Light Table Backlighting */}
              <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">layers</span>
                    <span>Onion Skinning & Light Table</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Translucent frame ghosting & frosted glass backlighting
                  </span>
                </div>
                <Switch
                  checked={activeSettings.onionSkinLightTable?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.onionSkinLightTable?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      onionSkinLightTable: {
                        ...activeSettings.onionSkinLightTable,
                        enabled: !current,
                        pastFramesCount: activeSettings.onionSkinLightTable?.pastFramesCount ?? 3,
                        futureFramesCount: activeSettings.onionSkinLightTable?.futureFramesCount ?? 3,
                        baseOpacity: activeSettings.onionSkinLightTable?.baseOpacity ?? 0.45,
                        opacityFalloffGamma: activeSettings.onionSkinLightTable?.opacityFalloffGamma ?? 0.65,
                        lightTableIntensity: activeSettings.onionSkinLightTable?.lightTableIntensity ?? 0.65,
                        pegBarEnabled: activeSettings.onionSkinLightTable?.pegBarEnabled ?? true,
                      },
                    });
                  }}
                  label="Toggle multi-layer animation onion skinning and light table backlighting"
                />
              </div>

              {activeSettings.onionSkinLightTable?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Past Frames Window (Cool Cyan)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.onionSkinLightTable?.pastFramesCount ?? 3} Frames
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={activeSettings.onionSkinLightTable?.pastFramesCount ?? 3}
                    aria-label="Number of preceding keyframes visible with cyan tint"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        onionSkinLightTable: {
                          ...activeSettings.onionSkinLightTable,
                          pastFramesCount: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Future Frames Window (Warm Amber)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.onionSkinLightTable?.futureFramesCount ?? 3} Frames
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={activeSettings.onionSkinLightTable?.futureFramesCount ?? 3}
                    aria-label="Number of subsequent keyframes visible with amber tint"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        onionSkinLightTable: {
                          ...activeSettings.onionSkinLightTable,
                          futureFramesCount: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Base Ghost Opacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.onionSkinLightTable?.baseOpacity ?? 0.45) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.8}
                    step={0.05}
                    value={activeSettings.onionSkinLightTable?.baseOpacity ?? 0.45}
                    aria-label="Initial opacity of direct adjacent onion skin frames"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        onionSkinLightTable: {
                          ...activeSettings.onionSkinLightTable,
                          baseOpacity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Distance Falloff Gamma</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.onionSkinLightTable?.opacityFalloffGamma ?? 0.65) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={0.9}
                    step={0.05}
                    value={activeSettings.onionSkinLightTable?.opacityFalloffGamma ?? 0.65}
                    aria-label="Exponential attenuation rate per frame step"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        onionSkinLightTable: {
                          ...activeSettings.onionSkinLightTable,
                          opacityFalloffGamma: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Light Table Backlight Intensity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.onionSkinLightTable?.lightTableIntensity ?? 0.65) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.onionSkinLightTable?.lightTableIntensity ?? 0.65}
                    aria-label="Luminance of backlit frosted glass light table substrate"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        onionSkinLightTable: {
                          ...activeSettings.onionSkinLightTable,
                          lightTableIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Acme Peg Bar Registration Pins</span>
                    <Switch
                      checked={activeSettings.onionSkinLightTable?.pegBarEnabled ?? true}
                      onChange={() => {
                        const current = activeSettings.onionSkinLightTable?.pegBarEnabled ?? true;
                        updateSettings({
                          ...activeSettings,
                          onionSkinLightTable: {
                            ...activeSettings.onionSkinLightTable,
                            pegBarEnabled: !current,
                          },
                        });
                      }}
                      label="Toggle Acme standard animation peg bar registration pins"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S148: Whiteboard Drafting Pantograph Mechanical Linkage & Magnetic Arc Pivot */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">architecture</span>
                    <span>Pantograph Mechanical Linkage</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Articulated 4-bar scissor scaling & magnetic arc pivot
                  </span>
                </div>
                <Switch
                  checked={activeSettings.pantographPivot?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.pantographPivot?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      pantographPivot: {
                        ...activeSettings.pantographPivot,
                        enabled: !current,
                        scaleRatio: activeSettings.pantographPivot?.scaleRatio ?? 2.0,
                        magneticSnapEnabled: activeSettings.pantographPivot?.magneticSnapEnabled ?? true,
                        magneticSnapRadius: activeSettings.pantographPivot?.magneticSnapRadius ?? 20,
                        arcSnapStep: activeSettings.pantographPivot?.arcSnapStep ?? 50,
                        elasticFlexDamping: activeSettings.pantographPivot?.elasticFlexDamping ?? 0.05,
                        renderOverlayEnabled: activeSettings.pantographPivot?.renderOverlayEnabled ?? true,
                      },
                    });
                  }}
                  label="Toggle whiteboard drafting pantograph mechanical linkage and magnetic arc pivot"
                />
              </div>

              {activeSettings.pantographPivot?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Kinematic Scale Ratio (R)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.pantographPivot?.scaleRatio ?? 2.0).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={4.0}
                    step={0.1}
                    value={activeSettings.pantographPivot?.scaleRatio ?? 2.0}
                    aria-label="Pantograph scissor arm drawing scale ratio"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        pantographPivot: {
                          ...activeSettings.pantographPivot,
                          scaleRatio: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Magnetic Snap Radius</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.pantographPivot?.magneticSnapRadius ?? 20)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={1}
                    value={activeSettings.pantographPivot?.magneticSnapRadius ?? 20}
                    aria-label="Magnetic polar arc elastic attraction radius"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        pantographPivot: {
                          ...activeSettings.pantographPivot,
                          magneticSnapRadius: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Concentric Guide Step</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.pantographPivot?.arcSnapStep ?? 50)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={5}
                    value={activeSettings.pantographPivot?.arcSnapStep ?? 50}
                    aria-label="Concentric circular guide ring spacing"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        pantographPivot: {
                          ...activeSettings.pantographPivot,
                          arcSnapStep: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Linkage Arm Flexibility</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.pantographPivot?.elasticFlexDamping ?? 0.05) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.2}
                    step={0.01}
                    value={activeSettings.pantographPivot?.elasticFlexDamping ?? 0.05}
                    aria-label="Linkage inertia strain and elastic flex damping"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        pantographPivot: {
                          ...activeSettings.pantographPivot,
                          elasticFlexDamping: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Magnetic Polar Arc Snapping</span>
                    <Switch
                      checked={activeSettings.pantographPivot?.magneticSnapEnabled ?? true}
                      onChange={() => {
                        const current = activeSettings.pantographPivot?.magneticSnapEnabled ?? true;
                        updateSettings({
                          ...activeSettings,
                          pantographPivot: {
                            ...activeSettings.pantographPivot,
                            magneticSnapEnabled: !current,
                          },
                        });
                      }}
                      label="Toggle magnetic polar arc snapping"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Render Brass Linkage Overlay</span>
                    <Switch
                      checked={activeSettings.pantographPivot?.renderOverlayEnabled ?? true}
                      onChange={() => {
                        const current = activeSettings.pantographPivot?.renderOverlayEnabled ?? true;
                        updateSettings({
                          ...activeSettings,
                          pantographPivot: {
                            ...activeSettings.pantographPivot,
                            renderOverlayEnabled: !current,
                          },
                        });
                      }}
                      label="Toggle brass linkage bars and magnetic pivot overlay rendering"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S149: Calligraphic Dip Pen Flexible Nib Tine Splitting & Meniscus Railroading */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">history_edu</span>
                    <span>Flexible Dip Nib & Railroading</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Tine splay swell & capillary meniscus railroading
                  </span>
                </div>
                <Switch
                  checked={activeSettings.flexNib?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.flexNib?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      flexNib: {
                        ...activeSettings.flexNib,
                        enabled: !current,
                        hairlineWidth: activeSettings.flexNib?.hairlineWidth ?? 1.2,
                        maxSwellWidth: activeSettings.flexNib?.maxSwellWidth ?? 14.0,
                        flexSensitivity: activeSettings.flexNib?.flexSensitivity ?? 1.4,
                        meniscusRuptureWidth: activeSettings.flexNib?.meniscusRuptureWidth ?? 9.5,
                        meniscusReconnectWidth: activeSettings.flexNib?.meniscusReconnectWidth ?? 6.0,
                        reservoirCapacityPx: activeSettings.flexNib?.reservoirCapacityPx ?? 1200.0,
                        paperScratchResonance: activeSettings.flexNib?.paperScratchResonance ?? 0.8,
                      },
                    });
                  }}
                  label="Toggle calligraphic dip pen flexible nib tine splitting and meniscus railroading"
                />
              </div>

              {activeSettings.flexNib?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Max Swell Width</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.flexNib?.maxSwellWidth ?? 14)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={25}
                    step={1}
                    value={activeSettings.flexNib?.maxSwellWidth ?? 14}
                    aria-label="Maximum expanded calligraphy stroke swell width"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        flexNib: {
                          ...activeSettings.flexNib,
                          maxSwellWidth: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Meniscus Rupture Threshold</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.flexNib?.meniscusRuptureWidth ?? 9.5).toFixed(1)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4.0}
                    max={20.0}
                    step={0.5}
                    value={activeSettings.flexNib?.meniscusRuptureWidth ?? 9.5}
                    aria-label="Stroke width where ink meniscus ruptures into twin railroad tracks"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        flexNib: {
                          ...activeSettings.flexNib,
                          meniscusRuptureWidth: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Spring Steel Elasticity (Gamma)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.flexNib?.flexSensitivity ?? 1.4).toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={2.5}
                    step={0.1}
                    value={activeSettings.flexNib?.flexSensitivity ?? 1.4}
                    aria-label="Nonlinear spring cantilever bending exponent"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        flexNib: {
                          ...activeSettings.flexNib,
                          flexSensitivity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Dip Reservoir Capacity</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.flexNib?.reservoirCapacityPx ?? 1200)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={3000}
                    step={100}
                    value={activeSettings.flexNib?.reservoirCapacityPx ?? 1200}
                    aria-label="Dip ink droplet continuous drawing arc length capacity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        flexNib: {
                          ...activeSettings.flexNib,
                          reservoirCapacityPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Metallic Scratch Foley Resonance</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.flexNib?.paperScratchResonance ?? 0.8) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.5}
                    step={0.05}
                    value={activeSettings.flexNib?.paperScratchResonance ?? 0.8}
                    aria-label="Acoustic high-frequency metallic scratch intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        flexNib: {
                          ...activeSettings.flexNib,
                          paperScratchResonance: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full text-xs font-medium flex items-center justify-center gap-1.5"
                      onClick={() => {
                        updateSettings({
                          ...activeSettings,
                          flexNib: {
                            ...activeSettings.flexNib,
                            reservoirCapacityPx: activeSettings.flexNib?.reservoirCapacityPx ?? 1200.0,
                          },
                        });
                      }}
                    >
                      <span className="material-symbols-outlined text-[14px] text-accent-ai">water_drop</span>
                      <span>Re-Dip in Inkwell</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S150: Multi-Client Whiteboard Live Stream Sync Protocol & Jitter Buffer */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">wifi_tethering</span>
                    <span>Live Stream Sync & Jitter Buffer</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Binary network protocol & adaptive jitter playout
                  </span>
                </div>
                <Switch
                  checked={activeSettings.liveStreamSync?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.liveStreamSync?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      liveStreamSync: {
                        ...activeSettings.liveStreamSync,
                        enabled: !current,
                        minDelayMs: activeSettings.liveStreamSync?.minDelayMs ?? 20.0,
                        maxDelayMs: activeSettings.liveStreamSync?.maxDelayMs ?? 300.0,
                        targetDelayMs: activeSettings.liveStreamSync?.targetDelayMs ?? 60.0,
                        smoothingAlpha: activeSettings.liveStreamSync?.smoothingAlpha ?? 0.1,
                        plcEnabled: activeSettings.liveStreamSync?.plcEnabled ?? true,
                        showCursorPresence: activeSettings.liveStreamSync?.showCursorPresence ?? true,
                      },
                    });
                  }}
                  label="Toggle multi-client whiteboard live stream sync protocol and jitter buffer"
                />
              </div>

              {activeSettings.liveStreamSync?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Target Playout Delay</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.liveStreamSync?.targetDelayMs ?? 60)}ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={200}
                    step={5}
                    value={activeSettings.liveStreamSync?.targetDelayMs ?? 60}
                    aria-label="Target monotonic jitter buffer playout delay"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        liveStreamSync: {
                          ...activeSettings.liveStreamSync,
                          targetDelayMs: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Max Buffer Latency Ceiling</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.liveStreamSync?.maxDelayMs ?? 300)}ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={500}
                    step={10}
                    value={activeSettings.liveStreamSync?.maxDelayMs ?? 300}
                    aria-label="Maximum allowable playout buffer latency ceiling"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        liveStreamSync: {
                          ...activeSettings.liveStreamSync,
                          maxDelayMs: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Jitter Adaptation Rate (Alpha)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.liveStreamSync?.smoothingAlpha ?? 0.1).toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.02}
                    max={0.3}
                    step={0.01}
                    value={activeSettings.liveStreamSync?.smoothingAlpha ?? 0.1}
                    aria-label="Exponential moving average filter factor for jitter estimation"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        liveStreamSync: {
                          ...activeSettings.liveStreamSync,
                          smoothingAlpha: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Hermite Packet Loss Concealment (PLC)</span>
                    <Switch
                      checked={activeSettings.liveStreamSync?.plcEnabled ?? true}
                      onChange={() => {
                        const current = activeSettings.liveStreamSync?.plcEnabled ?? true;
                        updateSettings({
                          ...activeSettings,
                          liveStreamSync: {
                            ...activeSettings.liveStreamSync,
                            plcEnabled: !current,
                          },
                        });
                      }}
                      label="Toggle Hermite cubic spline packet loss concealment"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Remote Cursor Presence</span>
                    <Switch
                      checked={activeSettings.liveStreamSync?.showCursorPresence ?? true}
                      onChange={() => {
                        const current = activeSettings.liveStreamSync?.showCursorPresence ?? true;
                        updateSettings({
                          ...activeSettings,
                          liveStreamSync: {
                            ...activeSettings.liveStreamSync,
                            showCursorPresence: !current,
                          },
                        });
                      }}
                      label="Toggle remote collaborator cursor presence avatars"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S151: Procedural Stippling & Pointillism Ink Shading Engine */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">grain</span>
                    <span>Procedural Stippling & Pointillism</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Poisson-disk ink dots & spatial repulsion relaxation
                  </span>
                </div>
                <Switch
                  checked={activeSettings.proceduralStippling?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.proceduralStippling?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      proceduralStippling: {
                        ...activeSettings.proceduralStippling,
                        enabled: !current,
                        minDotRadius: activeSettings.proceduralStippling?.minDotRadius ?? 0.8,
                        maxDotRadius: activeSettings.proceduralStippling?.maxDotRadius ?? 2.4,
                        densityScale: activeSettings.proceduralStippling?.densityScale ?? 1.0,
                        relaxationIterations: activeSettings.proceduralStippling?.relaxationIterations ?? 3,
                        dotGainFactor: activeSettings.proceduralStippling?.dotGainFactor ?? 0.25,
                        paperBleedPx: activeSettings.proceduralStippling?.paperBleedPx ?? 0.35,
                        stippleColorHex: activeSettings.proceduralStippling?.stippleColorHex ?? '#161414',
                        foleyTapVolume: activeSettings.proceduralStippling?.foleyTapVolume ?? 0.75,
                      },
                    });
                  }}
                  label="Toggle procedural stippling and pointillism ink shading engine"
                />
              </div>

              {activeSettings.proceduralStippling?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Density Multiplier</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.proceduralStippling?.densityScale ?? 1.0).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={3.0}
                    step={0.1}
                    value={activeSettings.proceduralStippling?.densityScale ?? 1.0}
                    aria-label="Stippling dot density budget scale"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        proceduralStippling: {
                          ...activeSettings.proceduralStippling,
                          densityScale: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Min Dot Radius (Highlights)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.proceduralStippling?.minDotRadius ?? 0.8).toFixed(1)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={2.5}
                    step={0.1}
                    value={activeSettings.proceduralStippling?.minDotRadius ?? 0.8}
                    aria-label="Minimum dot radius in highlights"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        proceduralStippling: {
                          ...activeSettings.proceduralStippling,
                          minDotRadius: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Max Dot Radius (Shadows)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.proceduralStippling?.maxDotRadius ?? 2.4).toFixed(1)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={6.0}
                    step={0.2}
                    value={activeSettings.proceduralStippling?.maxDotRadius ?? 2.4}
                    aria-label="Maximum dot radius in shadows"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        proceduralStippling: {
                          ...activeSettings.proceduralStippling,
                          maxDotRadius: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Repulsion Relaxation Passes</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.proceduralStippling?.relaxationIterations ?? 3} passes
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={1}
                    value={activeSettings.proceduralStippling?.relaxationIterations ?? 3}
                    aria-label="Spatial repulsion relaxation iterations"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        proceduralStippling: {
                          ...activeSettings.proceduralStippling,
                          relaxationIterations: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Nib Dot Gain & Paper Bleed</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.proceduralStippling?.dotGainFactor ?? 0.25) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={0.8}
                    step={0.05}
                    value={activeSettings.proceduralStippling?.dotGainFactor ?? 0.25}
                    aria-label="Capillary paper bleed dot gain factor"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        proceduralStippling: {
                          ...activeSettings.proceduralStippling,
                          dotGainFactor: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Stylus Tap Foley Volume</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.proceduralStippling?.foleyTapVolume ?? 0.75) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.proceduralStippling?.foleyTapVolume ?? 0.75}
                    aria-label="Fineliner nib tap-tap acoustic transient volume"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        proceduralStippling: {
                          ...activeSettings.proceduralStippling,
                          foleyTapVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S152: Metallic Foil Embossing & Hot Stamp Shimmer Shader Pipeline */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">flare</span>
                    <span>Metallic Foil & Hot Stamp Emboss</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Raised 3D bevel & specular holographic shimmer
                  </span>
                </div>
                <Switch
                  checked={activeSettings.metallicFoil?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.metallicFoil?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      metallicFoil: {
                        ...activeSettings.metallicFoil,
                        enabled: !current,
                        preset: activeSettings.metallicFoil?.preset ?? 'gold',
                        embossHeightPx: activeSettings.metallicFoil?.embossHeightPx ?? 2.5,
                        bevelWidthPx: activeSettings.metallicFoil?.bevelWidthPx ?? 3.0,
                        specularShininess: activeSettings.metallicFoil?.specularShininess ?? 32.0,
                        lightAngleDeg: activeSettings.metallicFoil?.lightAngleDeg ?? 45.0,
                        lightElevationDeg: activeSettings.metallicFoil?.lightElevationDeg ?? 60.0,
                        shimmerSpeed: activeSettings.metallicFoil?.shimmerSpeed ?? 1.0,
                        sparkleIntensity: activeSettings.metallicFoil?.sparkleIntensity ?? 0.35,
                        foleyPressVolume: activeSettings.metallicFoil?.foleyPressVolume ?? 0.70,
                      },
                    });
                  }}
                  label="Toggle metallic foil embossing and hot stamp shimmer shader"
                />
              </div>

              {activeSettings.metallicFoil?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-text-secondary">Foil Material Preset</span>
                    <div className="grid grid-cols-3 gap-1">
                      {(['gold', 'silver', 'rose_gold', 'copper', 'holographic'] as const).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`px-2 py-1 text-[10px] rounded font-medium transition-colors ${
                            (activeSettings.metallicFoil?.preset ?? 'gold') === preset
                              ? 'bg-accent-ai text-text-inverse font-semibold'
                              : 'bg-bg-app border border-hairline text-text-secondary hover:text-text-primary'
                          }`}
                          onClick={() =>
                            updateSettings({
                              ...activeSettings,
                              metallicFoil: {
                                ...activeSettings.metallicFoil,
                                preset,
                              },
                            })
                          }
                        >
                          {preset === 'rose_gold' ? 'Rose Gold' : preset.charAt(0).toUpperCase() + preset.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Emboss Relief Height</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.metallicFoil?.embossHeightPx ?? 2.5).toFixed(1)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={8.0}
                    step={0.5}
                    value={activeSettings.metallicFoil?.embossHeightPx ?? 2.5}
                    aria-label="Emboss 3D bevel relief height"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        metallicFoil: {
                          ...activeSettings.metallicFoil,
                          embossHeightPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Bevel Transition Width</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.metallicFoil?.bevelWidthPx ?? 3.0).toFixed(1)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={8.0}
                    step={0.5}
                    value={activeSettings.metallicFoil?.bevelWidthPx ?? 3.0}
                    aria-label="Edge bevel transition slope width"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        metallicFoil: {
                          ...activeSettings.metallicFoil,
                          bevelWidthPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Specular Shininess</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.metallicFoil?.specularShininess ?? 32)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={128}
                    step={4}
                    value={activeSettings.metallicFoil?.specularShininess ?? 32}
                    aria-label="Specular reflection highlight exponent"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        metallicFoil: {
                          ...activeSettings.metallicFoil,
                          specularShininess: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Light Azimuth Angle</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.metallicFoil?.lightAngleDeg ?? 45)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={activeSettings.metallicFoil?.lightAngleDeg ?? 45}
                    aria-label="Key light directional azimuth angle"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        metallicFoil: {
                          ...activeSettings.metallicFoil,
                          lightAngleDeg: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Shimmer Sweep Rate</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.metallicFoil?.shimmerSpeed ?? 1.0).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={3.0}
                    step={0.2}
                    value={activeSettings.metallicFoil?.shimmerSpeed ?? 1.0}
                    aria-label="Light sweep and holographic shimmer speed"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        metallicFoil: {
                          ...activeSettings.metallicFoil,
                          shimmerSpeed: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Flake Sparkle Glint</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.metallicFoil?.sparkleIntensity ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.metallicFoil?.sparkleIntensity ?? 0.35}
                    aria-label="Micro-glint cellular noise sparkle intensity"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        metallicFoil: {
                          ...activeSettings.metallicFoil,
                          sparkleIntensity: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Hot Stamp Foley Volume</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.metallicFoil?.foleyPressVolume ?? 0.70) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.metallicFoil?.foleyPressVolume ?? 0.70}
                    aria-label="Heat press compression and foil peel audio volume"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        metallicFoil: {
                          ...activeSettings.metallicFoil,
                          foleyPressVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>

            {/* Milestone S153: Whiteboard Drafting Compass & Mechanical Divider Caliper Geometry */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">change_history</span>
                    <span>Drafting Compass & Divider Caliper</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Kinematic articulated legs, chord stepping & thumbscrew ratchet
                  </span>
                </div>
                <Switch
                  checked={activeSettings.draftingCompass?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.draftingCompass?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      draftingCompass: {
                        ...activeSettings.draftingCompass,
                        enabled: !current,
                        armLengthPx: activeSettings.draftingCompass?.armLengthPx ?? 160.0,
                        needleFriction: activeSettings.draftingCompass?.needleFriction ?? 0.30,
                        thumbscrewPitchPx: activeSettings.draftingCompass?.thumbscrewPitchPx ?? 2.0,
                        showCompassOverlay: activeSettings.draftingCompass?.showCompassOverlay ?? true,
                        foleyRatchetVolume: activeSettings.draftingCompass?.foleyRatchetVolume ?? 0.70,
                      },
                    });
                  }}
                  label="Toggle whiteboard drafting compass and mechanical divider caliper"
                />
              </div>

              {activeSettings.draftingCompass?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Compass Leg Length</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round(activeSettings.draftingCompass?.armLengthPx ?? 160)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={300}
                    step={10}
                    value={activeSettings.draftingCompass?.armLengthPx ?? 160}
                    aria-label="Mechanical compass leg length in pixels"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        draftingCompass: {
                          ...activeSettings.draftingCompass,
                          armLengthPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Needle Pivot Friction</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.draftingCompass?.needleFriction ?? 0.30) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.draftingCompass?.needleFriction ?? 0.30}
                    aria-label="Center needle rotational friction drag torque"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        draftingCompass: {
                          ...activeSettings.draftingCompass,
                          needleFriction: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Thumbscrew Spindle Pitch</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.draftingCompass?.thumbscrewPitchPx ?? 2.0).toFixed(1)}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={5.0}
                    step={0.5}
                    value={activeSettings.draftingCompass?.thumbscrewPitchPx ?? 2.0}
                    aria-label="Center micrometer screw thread pitch for clicks"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        draftingCompass: {
                          ...activeSettings.draftingCompass,
                          thumbscrewPitchPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Ratchet Click Foley Volume</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {Math.round((activeSettings.draftingCompass?.foleyRatchetVolume ?? 0.70) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={activeSettings.draftingCompass?.foleyRatchetVolume ?? 0.70}
                    aria-label="Acoustic spindle ratchet clicks volume"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        draftingCompass: {
                          ...activeSettings.draftingCompass,
                          foleyRatchetVolume: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Render Brass Compass Overlay</span>
                    <Switch
                      checked={activeSettings.draftingCompass?.showCompassOverlay ?? true}
                      onChange={() => {
                        const current = activeSettings.draftingCompass?.showCompassOverlay ?? true;
                        updateSettings({
                          ...activeSettings,
                          draftingCompass: {
                            ...activeSettings.draftingCompass,
                            showCompassOverlay: !current,
                          },
                        });
                      }}
                      label="Toggle visual brass compass articulated legs overlay"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S154: Collaborative Spatial Locking & Optimistic CRDT Stroke Merging Engine */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">hub</span>
                    <span>Collaborative CRDT & Spatial Locks</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    Lamport order convergence & AABB conflict locks
                  </span>
                </div>
                <Switch
                  checked={activeSettings.collaborativeCRDT?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.collaborativeCRDT?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      collaborativeCRDT: {
                        ...activeSettings.collaborativeCRDT,
                        enabled: !current,
                        clientId: activeSettings.collaborativeCRDT?.clientId ?? 'local_user',
                        spatialLeaseTtlMs: activeSettings.collaborativeCRDT?.spatialLeaseTtlMs ?? 2000,
                        lockPaddingPx: activeSettings.collaborativeCRDT?.lockPaddingPx ?? 10,
                        optimisticBufferLimit: activeSettings.collaborativeCRDT?.optimisticBufferLimit ?? 100,
                        enableSelectiveUndo: activeSettings.collaborativeCRDT?.enableSelectiveUndo ?? true,
                      },
                    });
                  }}
                  label="Toggle collaborative CRDT and spatial locking engine"
                />
              </div>

              {activeSettings.collaborativeCRDT?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Spatial Lease Lock TTL</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.collaborativeCRDT?.spatialLeaseTtlMs ?? 2000}ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={500}
                    max={5000}
                    step={250}
                    value={activeSettings.collaborativeCRDT?.spatialLeaseTtlMs ?? 2000}
                    aria-label="Spatial lease reservation time-to-live in milliseconds"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        collaborativeCRDT: {
                          ...activeSettings.collaborativeCRDT,
                          spatialLeaseTtlMs: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Lock Boundary Padding</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.collaborativeCRDT?.lockPaddingPx ?? 10}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={5}
                    value={activeSettings.collaborativeCRDT?.lockPaddingPx ?? 10}
                    aria-label="Spatial bounding-box mutual exclusion padding margin"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        collaborativeCRDT: {
                          ...activeSettings.collaborativeCRDT,
                          lockPaddingPx: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Optimistic Action Buffer Limit</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.collaborativeCRDT?.optimisticBufferLimit ?? 100} ops
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={300}
                    step={10}
                    value={activeSettings.collaborativeCRDT?.optimisticBufferLimit ?? 100}
                    aria-label="Local pending unconfirmed stroke operations limit"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        collaborativeCRDT: {
                          ...activeSettings.collaborativeCRDT,
                          optimisticBufferLimit: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Selective Causal Peer Undo</span>
                    <Switch
                      checked={activeSettings.collaborativeCRDT?.enableSelectiveUndo ?? true}
                      onChange={() => {
                        const current = activeSettings.collaborativeCRDT?.enableSelectiveUndo ?? true;
                        updateSettings({
                          ...activeSettings,
                          collaborativeCRDT: {
                            ...activeSettings.collaborativeCRDT,
                            enableSelectiveUndo: !current,
                          },
                        });
                      }}
                      label="Toggle selective causal tombstone undo without affecting concurrent peers"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Milestone S155: Multi-Track Whiteboard Master Sequence Audio Stems & Dolby Atmos Spatial Panning */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-accent-ai">surround_sound</span>
                    <span>Dolby Atmos & Spatial Stems</span>
                  </span>
                  <span className="text-[10px] text-text-disabled">
                    3D binaural HRTF panning & 7.1.4 stem bus mastering
                  </span>
                </div>
                <Switch
                  checked={activeSettings.spatialAudio?.enabled ?? false}
                  onChange={() => {
                    const current = activeSettings.spatialAudio?.enabled ?? false;
                    updateSettings({
                      ...activeSettings,
                      spatialAudio: {
                        ...activeSettings.spatialAudio,
                        enabled: !current,
                        roomWidthM: activeSettings.spatialAudio?.roomWidthM ?? 10.0,
                        roomDepthM: activeSettings.spatialAudio?.roomDepthM ?? 8.0,
                        roomHeightM: activeSettings.spatialAudio?.roomHeightM ?? 3.5,
                        listenerPos: activeSettings.spatialAudio?.listenerPos ?? [0.0, 0.0, 1.2],
                        distanceFalloffExponent: activeSettings.spatialAudio?.distanceFalloffExponent ?? 1.0,
                        referenceDistanceM: activeSettings.spatialAudio?.referenceDistanceM ?? 1.0,
                        airAbsorptionCoeff: activeSettings.spatialAudio?.airAbsorptionCoeff ?? 0.001,
                        headRadiusM: activeSettings.spatialAudio?.headRadiusM ?? 0.0875,
                        speedOfSoundMps: activeSettings.spatialAudio?.speedOfSoundMps ?? 343.0,
                        hrtfBinauralEnabled: activeSettings.spatialAudio?.hrtfBinauralEnabled ?? true,
                        masterFormat: activeSettings.spatialAudio?.masterFormat ?? 'Atmos714',
                      },
                    });
                  }}
                  label="Toggle Dolby Atmos 3D spatial panning and stem bus mastering"
                />
              </div>

              {activeSettings.spatialAudio?.enabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold">
                      Master Format Delivery
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      {(
                        [
                          { id: 'Atmos714', label: '7.1.4 Atmos Bed' },
                          { id: 'StereoBinaural', label: 'Binaural 3D' },
                          { id: 'Surround51', label: '5.1 Surround' },
                          { id: 'ADM_BWF', label: 'ADM BWF XML' },
                        ] as const
                      ).map(({ id, label }) => {
                        const active = (activeSettings.spatialAudio?.masterFormat ?? 'Atmos714') === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              updateSettings({
                                ...activeSettings,
                                spatialAudio: {
                                  ...activeSettings.spatialAudio,
                                  masterFormat: id,
                                },
                              })
                            }
                            className={`py-1 px-1.5 text-[10px] rounded border transition-colors ${
                              active
                                ? 'bg-accent-ai/20 border-accent-ai text-accent-ai font-semibold'
                                : 'border-hairline text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Distance Falloff Exponent (γ)</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {(activeSettings.spatialAudio?.distanceFalloffExponent ?? 1.0).toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={activeSettings.spatialAudio?.distanceFalloffExponent ?? 1.0}
                    aria-label="Distance acoustic geometric attenuation falloff exponent"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        spatialAudio: {
                          ...activeSettings.spatialAudio,
                          distanceFalloffExponent: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Soundstage Room Depth</span>
                    <span className="font-mono text-text-primary text-[10px]">
                      {activeSettings.spatialAudio?.roomDepthM ?? 8.0}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4.0}
                    max={16.0}
                    step={1.0}
                    value={activeSettings.spatialAudio?.roomDepthM ?? 8.0}
                    aria-label="Acoustic soundstage room depth in meters"
                    className="w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) =>
                      updateSettings({
                        ...activeSettings,
                        spatialAudio: {
                          ...activeSettings.spatialAudio,
                          roomDepthM: Number(e.target.value),
                        },
                      })
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-secondary">Binaural HRTF Headphone Model</span>
                    <Switch
                      checked={activeSettings.spatialAudio?.hrtfBinauralEnabled ?? true}
                      onChange={() => {
                        const current = activeSettings.spatialAudio?.hrtfBinauralEnabled ?? true;
                        updateSettings({
                          ...activeSettings,
                          spatialAudio: {
                            ...activeSettings.spatialAudio,
                            hrtfBinauralEnabled: !current,
                          },
                        });
                      }}
                      label="Toggle Woodworth-Schlosser ITD and ILD binaural head modeling"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Milestone S99: Storyboard Sequence Packaging & Export */}
          <div className="rounded-card border border-hairline bg-bg-app/40 p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text-secondary uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-accent-ai">auto_stories</span>
                <span>Storyboard Packaging</span>
              </span>
              <span className="text-[10px] text-text-disabled">Multi-Scene Sequence</span>
            </div>
            <p className="text-[11px] text-text-disabled leading-relaxed">
              Export current clip and scene settings as a multi-scene whiteboard storyboard package for Python batch rendering or cross-project timeline assembly.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="flex items-center justify-center gap-1.5 text-xs font-medium"
              onClick={handleExportStoryboard}
            >
              <span className="material-symbols-outlined text-[15px] text-accent-ai">file_download</span>
              <span>Export Storyboard Project JSON</span>
            </Button>

            {/* Milestone S140: Multi-Track Storyboard Master Mixdown & 4K ProRes/H.265 Export */}
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline mt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text-secondary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-accent-ai">movie_creation</span>
                  Master Delivery Encoding & Foley Mixdown
                </span>
                <span className="text-[10px] text-text-disabled">EBU R128 (-23 LUFS)</span>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                {(['prores_422_hq', 'hevc_4k', 'h264_web'] as const).map((fmt) => {
                  const active = (activeSettings.storyboardMasterExport?.preset ?? 'prores_422_hq') === fmt;
                  const label =
                    fmt === 'prores_422_hq'
                      ? 'ProRes 422 4K'
                      : fmt === 'hevc_4k'
                        ? 'HEVC 4K'
                        : 'H.264 Web';
                  return (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() =>
                        updateSettings({
                          ...activeSettings,
                          storyboardMasterExport: {
                            ...activeSettings.storyboardMasterExport,
                            preset: fmt,
                          },
                        })
                      }
                      className={`flex-1 py-1 px-1.5 text-[10px] rounded border transition-colors ${
                        active
                          ? 'bg-accent-ai/20 border-accent-ai text-accent-ai font-semibold'
                          : 'border-hairline text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1">
                <span className="text-text-secondary">Loudness Target</span>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        ...activeSettings,
                        storyboardMasterExport: {
                          ...activeSettings.storyboardMasterExport,
                          ebuTargetLufs: -23.0,
                        },
                      })
                    }
                    className={`px-1.5 py-0.5 rounded ${
                      (activeSettings.storyboardMasterExport?.ebuTargetLufs ?? -23.0) === -23.0
                        ? 'bg-accent-ai/25 text-accent-ai font-semibold'
                        : 'text-text-disabled hover:text-text-secondary'
                    }`}
                  >
                    -23 LUFS (Broadcast)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        ...activeSettings,
                        storyboardMasterExport: {
                          ...activeSettings.storyboardMasterExport,
                          ebuTargetLufs: -14.0,
                        },
                      })
                    }
                    className={`px-1.5 py-0.5 rounded ${
                      activeSettings.storyboardMasterExport?.ebuTargetLufs === -14.0
                        ? 'bg-accent-ai/25 text-accent-ai font-semibold'
                        : 'text-text-disabled hover:text-text-secondary'
                    }`}
                  >
                    -14 LUFS (Web)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Speech Narration Ducking</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {activeSettings.storyboardMasterExport?.speechDuckingAttenuationDb ?? -9} dB
                </span>
              </div>
              <input
                type="range"
                min={-24}
                max={0}
                step={1}
                value={activeSettings.storyboardMasterExport?.speechDuckingAttenuationDb ?? -9}
                aria-label="Speech narration foley ducking attenuation in decibels"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    storyboardMasterExport: {
                      ...activeSettings.storyboardMasterExport,
                      speechDuckingAttenuationDb: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          </div>

          {/* Milestone S102: Live Ink Stream Broadcast Bridge */}
          <div className="rounded-card border border-hairline bg-bg-app/40 p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text-secondary uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-accent-ai">rss_feed</span>
                <span>Live Ink Stream Bridge</span>
              </span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-mono font-medium text-emerald-400 border border-emerald-500/30">
                ws://127.0.0.1:8765
              </span>
            </div>
            <p className="text-[11px] text-text-disabled leading-relaxed">
              Broadcasts low-latency drawing touchdown/lift packets to Python headless renderers or remote teleprompter displays.
            </p>
            <div className="flex items-center justify-between pt-1 border-t border-hairline">
              <span className="text-[11px] text-text-secondary">Stream Vector Ink</span>
              <Switch
                checked={isStreamingInk}
                onChange={() => setIsStreamingInk(!isStreamingInk)}
                label="Toggle live ink streaming"
              />
            </div>
          </div>

          {/* Preview Notice */}
          <div className="rounded-card border border-hairline bg-bg-app/40 p-2.5 text-[11px] text-text-disabled leading-relaxed">
            <span className="font-medium text-text-secondary block mb-1">Preview Notice</span>
            Live sketch linework and zone reveals render real-time in the studio monitor; artistic
            board shaders (Pencil / Comic / Sketch) bake at full export resolution.
          </div>
        </div>
      </div>

      {/* Zone Editor Modal */}
      {zoneEditorOpen && targetClip?.filePath && (
        <WhiteboardZoneEditorModal
          filePath={targetClip.filePath}
          sequenceWidth={frameWidth}
          sequenceHeight={frameHeight}
          zones={activeSettings.zones}
          onSave={(zones) => {
            const next: WhiteboardSettings =
              zones.length > 0
                ? { ...activeSettings, zones }
                : (() => {
                    const rest = { ...activeSettings };
                    delete rest.zones;
                    return rest;
                  })();
            updateSettings(next);
          }}
          onClose={() => setZoneEditorOpen(false)}
        />
      )}
    </div>
  );
}
