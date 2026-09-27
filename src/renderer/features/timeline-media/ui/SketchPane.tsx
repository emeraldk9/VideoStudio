import { useRef, useState } from 'react';
import {
  WHITEBOARD_DEFAULTS,
  WHITEBOARD_PRESETS,
  WHITEBOARD_TRACE_DEFAULTS,
  autoAlignWhiteboardToAudioPeaks,
  exportWhiteboardAnnotation,
  importWhiteboardAnnotation,
  type WhiteboardPreset,
  type WhiteboardSettings,
} from '@shared';

import { selectSelectedClip, useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Switch } from '../../../shared/ui/Switch';

import { Card1PatternParams } from './sketch/Card1PatternParams';
import { Card2TimingKeyframes } from './sketch/Card2TimingKeyframes';
import { Card3StylusLookCore } from './sketch/Card3StylusLookCore';
import { WhiteboardPhysicsSettings } from './sketch/WhiteboardPhysicsSettings';
import { WhiteboardLightingOpticsSettings } from './sketch/WhiteboardLightingOpticsSettings';
import { WhiteboardStudioToolsSettings } from './sketch/WhiteboardStudioToolsSettings';
import { WhiteboardArtisticShadersSettings } from './sketch/WhiteboardArtisticShadersSettings';
import { WhiteboardAudioAtmosSettings } from './sketch/WhiteboardAudioAtmosSettings';
import { WhiteboardCollabStreamSettings } from './sketch/WhiteboardCollabStreamSettings';
import { WhiteboardStoryboardMasterCard } from './sketch/WhiteboardStoryboardMasterCard';
import { REVEAL_PATTERN_CATEGORIES, type RevealPatternCategory } from './sketch/types';
import { WhiteboardZoneEditorModal } from './WhiteboardZoneEditorModal';

/**
 * SketchPane — Whiteboard Animation & Vector Sketch Reveal Inspector
 * Modular orchestrator delegating pattern parameters, timing, look, physics, optics,
 * studio tools, shaders, audio, and collaboration to specialized sub-components.
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

  const targetClip = clip?.sourceKind === 'still' || clip?.sourceKind === 'video' ? clip : null;
  const isApplied = Boolean(targetClip?.effects?.whiteboard);
  const activeSettings: WhiteboardSettings = targetClip?.effects?.whiteboard ?? draftSettings;
  const durationFrames = targetClip?.durationFrames ?? fps * 4;
  const selectedPattern = activeSettings.pattern;
  const paneFileInputRef = useRef<HTMLInputElement>(null);

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
    const next: WhiteboardSettings = {
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

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-canvas text-text-primary select-none">
      {/* Left Vertical Category Sub-Sidebar */}
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

      {/* Right Main Settings Stage */}
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
          <Card1PatternParams
            activeSettings={activeSettings}
            updateSettings={updateSettings}
            targetClip={targetClip}
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            setZoneEditorOpen={setZoneEditorOpen}
            paneFileInputRef={paneFileInputRef}
            handlePaneImportAnnotation={handlePaneImportAnnotation}
            handlePaneExportAnnotation={handlePaneExportAnnotation}
          />

          {/* CARD 2: Universal Timing & In/Out Keyframes */}
          <Card2TimingKeyframes
            activeSettings={activeSettings}
            updateSettings={updateSettings}
            targetClip={targetClip}
            durationFrames={durationFrames}
            fps={fps}
            handleSyncToAudio={handleSyncToAudio}
            isSyncingAudio={isSyncingAudio}
          />

          {/* CARD 3: Universal Hand Stylus & Artistic Board Look */}
          <Card3StylusLookCore
            activeSettings={activeSettings}
            updateSettings={updateSettings}
          />

          {/* Whiteboard Physics & Particle Mechanics */}
          <WhiteboardPhysicsSettings
            activeSettings={activeSettings}
            updateSettings={updateSettings}
          />

          {/* Whiteboard Lighting, Optics & Shadows */}
          <WhiteboardLightingOpticsSettings
            activeSettings={activeSettings}
            updateSettings={updateSettings}
          />

          {/* Whiteboard Studio Tools & Drafting Geometry */}
          <WhiteboardStudioToolsSettings
            activeSettings={activeSettings}
            updateSettings={updateSettings}
          />

          {/* Whiteboard Artistic Shaders & Substrate FX */}
          <WhiteboardArtisticShadersSettings
            activeSettings={activeSettings}
            updateSettings={updateSettings}
          />

          {/* Whiteboard Foley Acoustics & Spatial Audio */}
          <WhiteboardAudioAtmosSettings
            activeSettings={activeSettings}
            updateSettings={updateSettings}
          />

          {/* Whiteboard Collaboration & Live Stream Protocols */}
          <WhiteboardCollabStreamSettings
            activeSettings={activeSettings}
            updateSettings={updateSettings}
            isStreamingInk={isStreamingInk}
            onStreamingInkChange={setIsStreamingInk}
          />

          {/* Whiteboard Storyboard Master Sequence Encoding */}
          <WhiteboardStoryboardMasterCard
            activeSettings={activeSettings}
            updateSettings={updateSettings}
            targetClip={targetClip}
            fps={fps}
            durationFrames={durationFrames}
          />

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
