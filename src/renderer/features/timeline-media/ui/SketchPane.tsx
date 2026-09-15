import { useState } from 'react';

import {
  WHITEBOARD_DEFAULTS,
  WHITEBOARD_TRACE_DEFAULTS,
  resolveWhiteboardDrawSeconds,
  whiteboardEffectiveDrawFraction,
  type WhiteboardSettings,
} from '@shared';

import { selectSelectedClip, useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl';
import { Switch } from '../../../shared/ui/Switch';

import { WhiteboardZoneEditorModal } from './WhiteboardZoneEditorModal';

/**
 * Beta S279 / Refactor S1 — the Sketch category: whiteboard animation and reveal.
 *
 * Always visible when the tab is active, providing an industry-standard,
 * clean, and aesthetic control panel whether a still image is selected or not.
 * When a still is selected, controls directly mutate the clip's whiteboard effect.
 * When no still is selected, controls remain interactive in a preview/default mode.
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
    drawFraction: 0.85,
  });

  const still = clip?.sourceKind === 'still' ? clip : null;
  const isApplied = Boolean(still?.effects?.whiteboard);
  const activeSettings: WhiteboardSettings = still?.effects?.whiteboard ?? draftSettings;

  const durationFrames = still?.durationFrames ?? fps * 4; // fallback 4s reference if no still

  const updateSettings = (next: WhiteboardSettings) => {
    setDraftSettings(next);
    if (still && isApplied) {
      patchClip(still.id, {
        effects: { ...still.effects, whiteboard: next },
      });
    }
  };

  const enable = () => {
    if (!still) return;
    patchClip(still.id, {
      motionPreset: 'none',
      effects: { ...still.effects, whiteboard: { ...activeSettings } },
    });
  };

  const disable = () => {
    if (!still) return;
    const rest = { ...still.effects };
    delete rest.whiteboard;
    patchClip(still.id, { effects: rest });
  };

  const drawSec = resolveWhiteboardDrawSeconds(activeSettings, durationFrames, fps);
  const drawPct = Math.round(
    whiteboardEffectiveDrawFraction(activeSettings, durationFrames, fps) * 100,
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3 text-xs">
      {/* Top Banner / Selection Context */}
      {!still ? (
        <div className="flex items-start gap-2.5 rounded-card border border-accent-ai/25 bg-accent-ai/5 p-2.5 text-text-secondary">
          <span className="material-symbols-outlined text-[18px] text-accent-ai shrink-0 mt-0.5">
            draw
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-text-primary text-[11px]">
              Default Sketch Mode
            </span>
            <p className="text-[11px] leading-relaxed text-text-secondary">
              No still image is selected on the timeline. Configure the animation below, then select any still clip to apply it.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-card border border-hairline bg-bg-sidebar/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-text-secondary">
              image
            </span>
            <span className="font-medium text-text-primary truncate max-w-[150px]">
              {still.label || 'Selected Still'}
            </span>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isApplied
                ? 'bg-accent-success/15 text-accent-success'
                : 'bg-bg-hover text-text-disabled'
            }`}
          >
            {isApplied ? 'Effect Active' : 'Not Applied'}
          </span>
        </div>
      )}

      {/* Hero Activation Card */}
      <Card className="flex flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-text-primary text-[12px]">
              Whiteboard Reveal
            </span>
            <span className="text-[11px] text-text-secondary">
              Hand-draw this frame with animated sketch strokes
            </span>
          </div>
          <Switch
            checked={still ? isApplied : true}
            label="Toggle Whiteboard Reveal"
            disabled={!still}
            onChange={() => (isApplied ? disable() : enable())}
          />
        </div>

        {still && !isApplied && (
          <Button
            size="sm"
            variant="primary"
            className="w-full mt-1 flex items-center justify-center gap-1.5"
            onClick={enable}
          >
            <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
            <span>Apply to Selected Clip</span>
          </Button>
        )}
      </Card>

      {/* Reveal Pattern Card */}
      <Card className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
            Reveal Pattern
          </span>
          <span className="text-[10px] text-text-disabled capitalize">
            {activeSettings.pattern}
          </span>
        </div>
        <SegmentedControl
          value={activeSettings.pattern}
          onChange={(pattern) => {
            let next: WhiteboardSettings = { ...activeSettings, pattern };
            if (pattern === 'trace') {
              next = {
                ...next,
                trace: activeSettings.trace ?? WHITEBOARD_TRACE_DEFAULTS,
                cadenceFps: activeSettings.cadenceFps ?? 12, // Hand-drawn default for sketch
              };
            } else if (pattern === 'serpentine' || pattern === 'wipe') {
              // Smooth default for geometric wipes/writing to prevent jagged masks
              delete next.cadenceFps;
            }
            updateSettings(next);
          }}
          options={[
            { value: 'serpentine', label: 'Writing' },
            { value: 'wipe', label: 'Wipe' },
            { value: 'zones', label: 'Zones' },
            { value: 'trace', label: 'Sketch' },
          ]}
          ariaLabel="Reveal pattern"
        />

        {/* Zones Configuration Sub-section */}
        {activeSettings.pattern === 'zones' && (
          <div className="mt-1 flex items-center justify-between rounded-md border border-hairline bg-bg-app/50 p-2">
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-text-primary">
                Custom Draw Regions
              </span>
              <span className="text-[10px] text-text-secondary">
                {activeSettings.zones?.length ?? 0} zone(s) configured
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!still?.filePath}
              onClick={() => setZoneEditorOpen(true)}
              title={!still?.filePath ? 'Select a still on the timeline to edit zones' : undefined}
            >
              Edit Zones…
            </Button>
          </div>
        )}

        {/* Trace / Sketch Parameters Sub-section */}
        {activeSettings.pattern === 'trace' && (
          <div className="mt-1 flex flex-col gap-2 rounded-md border border-hairline bg-bg-app/50 p-2.5">
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
          </div>
        )}
      </Card>

      {/* Draw Timing & Cadence */}
      <Card className="flex flex-col gap-3 p-3">
        <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
          Timing & Cadence
        </span>

        {/* Draw Time Range Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-secondary">Draw Duration</span>
            <span className="font-mono text-text-primary">
              {drawSec.toFixed(1)}s ({drawPct}%)
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={whiteboardEffectiveDrawFraction(activeSettings, durationFrames, fps)}
            aria-label="Draw duration fraction"
            className="w-full accent-[var(--accent-ai)] cursor-pointer"
            onChange={(event) => {
              const next = { ...activeSettings, drawFraction: Number(event.target.value) };
              delete next.drawSeconds;
              updateSettings(next);
            }}
          />
        </div>

        {/* Frame Cadence */}
        <div className="flex items-center justify-between pt-1 border-t border-hairline">
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

      {/* Aesthetics: Hand Style & Board Look */}
      <Card className="flex flex-col gap-3 p-3">
        <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
          Style & Appearance
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

        <div className="flex items-center justify-between pt-1 border-t border-hairline">
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

      {/* Pro Hint / Preview Note */}
      <div className="rounded-card border border-hairline bg-bg-app/40 p-2.5 text-[11px] text-text-disabled leading-relaxed">
        <span className="font-medium text-text-secondary block mb-1">Preview Notice</span>
        The sketch reveals live on the timeline monitor. Vector linework traces live strokes, and the board look (Pencil / Comic / Sketch) renders in full fidelity during export.
      </div>

      {/* Zone Editor Modal */}
      {zoneEditorOpen && still?.filePath && (
        <WhiteboardZoneEditorModal
          filePath={still.filePath}
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
