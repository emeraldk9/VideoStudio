import { useState } from 'react';

import {
  WHITEBOARD_DEFAULTS,
  WHITEBOARD_TRACE_DEFAULTS,
  resolveWhiteboardDrawSeconds,
  resolveWhiteboardInSeconds,
  resolveWhiteboardInFrame,
  resolveWhiteboardOutFrame,
  whiteboardEffectiveDrawFraction,
  whiteboardEffectiveInFraction,
  type WhiteboardSettings,
  type WhiteboardZone,
  type WhiteboardZoneType,
} from '@shared';

import { selectSelectedClip, useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl';
import { Switch } from '../../../shared/ui/Switch';

import { WhiteboardZoneEditorModal } from './WhiteboardZoneEditorModal';

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

  const [zoneEditorOpen, setZoneEditorOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<WhiteboardSettings>({
    ...WHITEBOARD_DEFAULTS,
    inFraction: 0,
    drawFraction: 0.85,
  });

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

                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!targetClip?.filePath}
                  className="w-full flex items-center justify-center gap-1.5 font-medium shadow-sm"
                  onClick={() => setZoneEditorOpen(true)}
                  title={!targetClip?.filePath ? 'Select a clip on the timeline to edit zones' : undefined}
                >
                  <span className="material-symbols-outlined text-[16px] text-accent-ai">crop_free</span>
                  <span>Open Zone Mask Editor…</span>
                </Button>

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
          </Card>

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
