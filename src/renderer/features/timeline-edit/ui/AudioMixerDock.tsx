import { useEffect, useMemo, useState } from 'react';

import {
  computeMasterStereoLevels,
  computeTrackStereoLevels,
  createInitialPeakHoldState,
  dbToMeterPercent,
  updatePeakHold,
  AUDIO_EQ_PRESETS,
  DEFAULT_AUDIO_EQ_SETTINGS,
  sampleEqCurvePoints,
  COMPRESSOR_PRESETS,
  DEFAULT_COMPRESSOR_SETTINGS,
  sampleCompressorCurvePoints,
  type CompressorPresetKey,
  type AudioCompressorSettings,
  type AudioEqPresetId,
  type AudioEqualizerSettings,
  type PeakHoldState,
  type StereoMeterLevels,
  BUS_DIALOGUE,
  BUS_MUSIC,
  BUS_SFX,
  BUS_MASTER,
  DEFAULT_SUBMIX_BUSES,
  createDefaultSubmixBusState,
  resolveTrackBus,
  computeSubmixBusLevels,
  computeMasterWithBuses,
} from '@shared';
import { useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Switch } from '../../../shared/ui/Switch';
import { useAudioMixerStore } from '../model/audioMixerStore';
import { LoudnessRadarModal } from './LoudnessRadarModal';

export function AudioMixerDock() {
  const isOpen = useAudioMixerStore((state) => state.isOpen);
  const setIsOpen = useAudioMixerStore((state) => state.setIsOpen);

  const document = useSequenceStore((state) => state.document);
  const isPlaying = useSequenceStore((state) => state.playing);
  const playheadFrame = useSequenceStore((state) => state.playheadFrame);
  const audioScrubEnabled = useSequenceStore((state) => state.audioScrubEnabled);
  const toggleAudioScrub = useSequenceStore((state) => state.toggleAudioScrub);
  const soloTrackIds = useSequenceStore((state) => state.soloTrackIds);

  const masterVolumeDb = useAudioMixerStore((state) => state.masterVolumeDb);
  const masterLimiter = useAudioMixerStore((state) => state.masterLimiter);
  const setMasterVolumeDb = useAudioMixerStore((state) => state.setMasterVolumeDb);
  const setMasterLimiter = useAudioMixerStore((state) => state.setMasterLimiter);

  const trackMixer = useAudioMixerStore((state) => state.trackMixer);
  const setTrackVolume = useAudioMixerStore((state) => state.setTrackVolume);
  const setTrackPan = useAudioMixerStore((state) => state.setTrackPan);
  const toggleTrackMute = useAudioMixerStore((state) => state.toggleTrackMute);
  const toggleTrackSolo = useAudioMixerStore((state) => state.toggleTrackSolo);
  const resetAllFaders = useAudioMixerStore((state) => state.resetAllFaders);

  const ducking = useAudioMixerStore((state) => state.ducking);
  const setDucking = useAudioMixerStore((state) => state.setDucking);
  const currentGainReductionDb = useAudioMixerStore((state) => state.currentGainReductionDb);
  const [showDuckingPanel, setShowDuckingPanel] = useState(false);

  // S35 — Track Equalizer Store Selectors
  const trackEq = useAudioMixerStore((state) => state.trackEq);
  const setTrackEq = useAudioMixerStore((state) => state.setTrackEq);
  const resetTrackEq = useAudioMixerStore((state) => state.resetTrackEq);
  const activeEqTrackId = useAudioMixerStore((state) => state.activeEqTrackId);
  const setActiveEqTrackId = useAudioMixerStore((state) => state.setActiveEqTrackId);

  // S36 — Track Dynamics / Compressor Store Selectors
  const trackCompressor = useAudioMixerStore((state) => state.trackCompressor);
  const setTrackCompressor = useAudioMixerStore((state) => state.setTrackCompressor);
  const resetTrackCompressor = useAudioMixerStore((state) => state.resetTrackCompressor);
  const activeDynTrackId = useAudioMixerStore((state) => state.activeDynTrackId);
  const setActiveDynTrackId = useAudioMixerStore((state) => state.setActiveDynTrackId);

  // S63 — Submix Auxiliary Buses & Track Routing Engine
  const trackBusRouting = useAudioMixerStore((state) => state.trackBusRouting);
  const setTrackBusRouting = useAudioMixerStore((state) => state.setTrackBusRouting);
  const submixBuses = useAudioMixerStore((state) => state.submixBuses);
  const setBusVolume = useAudioMixerStore((state) => state.setBusVolume);
  const setBusPan = useAudioMixerStore((state) => state.setBusPan);
  const toggleBusMute = useAudioMixerStore((state) => state.toggleBusMute);
  const toggleBusSolo = useAudioMixerStore((state) => state.toggleBusSolo);
  const setBusEq = useAudioMixerStore((state) => state.setBusEq);
  const resetBusEq = useAudioMixerStore((state) => state.resetBusEq);
  const activeBusEqId = useAudioMixerStore((state) => state.activeBusEqId);
  const setActiveBusEqId = useAudioMixerStore((state) => state.setActiveBusEqId);
  const setBusCompressor = useAudioMixerStore((state) => state.setBusCompressor);
  const resetBusCompressor = useAudioMixerStore((state) => state.resetBusCompressor);
  const activeBusDynId = useAudioMixerStore((state) => state.activeBusDynId);
  const setActiveBusDynId = useAudioMixerStore((state) => state.setActiveBusDynId);
  const masterCompressor = useAudioMixerStore((state) => state.masterCompressor);
  const setMasterCompressor = useAudioMixerStore((state) => state.setMasterCompressor);
  const resetMasterCompressor = useAudioMixerStore((state) => state.resetMasterCompressor);
  const showMasterCompressor = useAudioMixerStore((state) => state.showMasterCompressor);
  const setShowMasterCompressor = useAudioMixerStore((state) => state.setShowMasterCompressor);

  // Active solos check
  const mixerSolos = useMemo(
    () =>
      Object.entries(trackMixer)
        .filter(([_, s]) => s.solo)
        .map(([id]) => id),
    [trackMixer],
  );
  const effectiveSolos = mixerSolos.length > 0 ? mixerSolos : soloTrackIds;
  const isSoloEngaged = effectiveSolos.length > 0;

  // Real-time track stereo meter calculation
  const clips = useMemo(() => document?.clips ?? [], [document?.clips]);
  const tracks = useMemo(() => document?.tracks ?? [], [document?.tracks]);

  // S35 — Active Track or Submix Bus EQ
  const activeTrack = useMemo(
    () => tracks.find((t) => t.id === activeEqTrackId) ?? null,
    [tracks, activeEqTrackId],
  );
  const activeBusForEq = useMemo(
    () => DEFAULT_SUBMIX_BUSES.find((b) => b.id === activeBusEqId) ?? null,
    [activeBusEqId],
  );
  const currentEq: AudioEqualizerSettings = useMemo(() => {
    if (activeTrack) return trackEq[activeTrack.id] ?? DEFAULT_AUDIO_EQ_SETTINGS;
    if (activeBusForEq) return submixBuses[activeBusForEq.id]?.eq ?? { ...DEFAULT_AUDIO_EQ_SETTINGS, enabled: false };
    return DEFAULT_AUDIO_EQ_SETTINGS;
  }, [activeTrack, trackEq, activeBusForEq, submixBuses]);

  const eqCurve = useMemo(
    () => sampleEqCurvePoints(currentEq, 340, 80, 64, 18),
    [currentEq],
  );

  // S36 & S63 — Active Track, Submix Bus, or Master Dynamics
  const activeDynTrack = useMemo(
    () => tracks.find((t) => t.id === activeDynTrackId) ?? null,
    [tracks, activeDynTrackId],
  );
  const activeBusForDyn = useMemo(
    () => DEFAULT_SUBMIX_BUSES.find((b) => b.id === activeBusDynId) ?? null,
    [activeBusDynId],
  );
  const currentComp: AudioCompressorSettings = useMemo(() => {
    if (activeDynTrack) return trackCompressor[activeDynTrack.id] ?? DEFAULT_COMPRESSOR_SETTINGS;
    if (activeBusForDyn) return submixBuses[activeBusForDyn.id]?.compressor ?? { ...DEFAULT_COMPRESSOR_SETTINGS, enabled: false };
    if (showMasterCompressor) return masterCompressor;
    return DEFAULT_COMPRESSOR_SETTINGS;
  }, [activeDynTrack, trackCompressor, activeBusForDyn, submixBuses, showMasterCompressor, masterCompressor]);

  const compCurve = useMemo(
    () => sampleCompressorCurvePoints(currentComp, 150, 80, 40),
    [currentComp],
  );

  const trackLevels: Record<string, StereoMeterLevels> = useMemo(() => {
    if (!document) return {};
    const map: Record<string, StereoMeterLevels> = {};
    for (const track of tracks) {
      map[track.id] = computeTrackStereoLevels({
        track,
        clips,
        playheadFrame,
        trackMixerState: trackMixer[track.id],
        isSoloEngaged,
      });
    }
    return map;
  }, [document, tracks, clips, playheadFrame, trackMixer, isSoloEngaged]);

  // S63 — Submix Bus Levels & Master Summation
  const busLevels: Record<string, StereoMeterLevels> = useMemo(() => {
    if (!document) return {};
    return computeSubmixBusLevels({
      trackLevels,
      tracks,
      routingMap: trackBusRouting,
      busStates: submixBuses,
      buses: DEFAULT_SUBMIX_BUSES,
    });
  }, [document, trackLevels, tracks, trackBusRouting, submixBuses]);

  const { masterLevels, masterGainReductionDb } = useMemo(() => {
    const unrouted = tracks
      .filter((t) => resolveTrackBus(t, trackBusRouting) === BUS_MASTER)
      .map((t) => trackLevels[t.id])
      .filter(Boolean);

    const res = computeMasterWithBuses({
      busLevels,
      busStates: submixBuses,
      unroutedTrackLevels: unrouted,
      masterVolumeDb,
      masterLimiter,
      masterCompressor,
    });
    return {
      masterLevels: res.masterLevels,
      masterGainReductionDb: res.gainReductionDb,
    };
  }, [tracks, trackBusRouting, trackLevels, busLevels, submixBuses, masterVolumeDb, masterLimiter, masterCompressor]);

  // Peak hold state tracking for each track and master bus
  const [showLoudnessRadar, setShowLoudnessRadar] = useState(false);
  const [peakHolds, setPeakHolds] = useState<
    Record<string, { left: PeakHoldState; right: PeakHoldState }>
  >({});

  useEffect(() => {
    if (!isOpen) return;

    setPeakHolds((prev) => {
      const next: Record<string, { left: PeakHoldState; right: PeakHoldState }> = {};
      for (const track of tracks) {
        const lvl = trackLevels[track.id];
        const old = prev[track.id] ?? {
          left: createInitialPeakHoldState(),
          right: createInitialPeakHoldState(),
        };
        if (lvl) {
          next[track.id] = {
            left: updatePeakHold(lvl.leftDb, old.left),
            right: updatePeakHold(lvl.rightDb, old.right),
          };
        }
      }
      for (const bus of DEFAULT_SUBMIX_BUSES) {
        const lvl = busLevels[bus.id];
        const old = prev[bus.id] ?? {
          left: createInitialPeakHoldState(),
          right: createInitialPeakHoldState(),
        };
        if (lvl) {
          next[bus.id] = {
            left: updatePeakHold(lvl.leftDb, old.left),
            right: updatePeakHold(lvl.rightDb, old.right),
          };
        }
      }
      const oldMaster = prev.master ?? {
        left: createInitialPeakHoldState(),
        right: createInitialPeakHoldState(),
      };
      next.master = {
        left: updatePeakHold(masterLevels.leftDb, oldMaster.left),
        right: updatePeakHold(masterLevels.rightDb, oldMaster.right),
      };
      return next;
    });
  }, [isOpen, trackLevels, busLevels, masterLevels, tracks, isPlaying, playheadFrame]);

  const clearClipping = (channelId: string) => {
    setPeakHolds((prev) => {
      const current = prev[channelId];
      if (!current) return prev;
      return {
        ...prev,
        [channelId]: {
          left: { ...current.left, isClipping: false },
          right: { ...current.right, isClipping: false },
        },
      };
    });
  };

  if (!isOpen || !document) return null;

  return (
    <div className="flex min-h-56 h-auto max-h-[36rem] w-full flex-col border-t border-hairline bg-bg-app/95 backdrop-blur-md shadow-2xl transition-all select-none">
      {/* Console Top Header Bar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-hairline px-3 bg-bg-canvas/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[17px] text-accent-ai">equalizer</span>
          <span className="text-xs font-bold text-text-primary tracking-wide">Audio Console Mixer</span>
          <span className="rounded bg-hairline/80 px-1.5 py-0.2 font-mono text-[9px] text-text-disabled">
            {tracks.length} Channels · 48 kHz · Stereo VU
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio Scrubbing Toggle */}
          <Button
            variant={audioScrubEnabled ? 'secondary' : 'ghost'}
            size="sm"
            className={`h-5 px-2 text-[10px] font-mono flex items-center gap-1 ${
              audioScrubEnabled ? 'text-accent-ai border-accent-ai/40 bg-accent-ai/10' : 'text-text-disabled'
            }`}
            onClick={toggleAudioScrub}
            title="Toggle Audio Scrubbing on timeline gestures (Shift+S)"
          >
            <span className="material-symbols-outlined text-[13px]">volume_up</span>
            <span>Scrub: {audioScrubEnabled ? 'ON' : 'OFF'}</span>
          </Button>

          {/* S33 — Sidechain Auto-Ducking & Live Gain Reduction (GR) Meter */}
          <div className="flex items-center gap-1.5 bg-bg-app rounded px-1.5 py-0.5 border border-hairline">
            <button
              type="button"
              onClick={() => setDucking({ enabled: !ducking.enabled })}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium transition-colors ${
                ducking.enabled
                  ? 'bg-accent-ai/20 text-accent-ai border border-accent-ai/30'
                  : 'text-text-disabled hover:text-text-secondary'
              }`}
              title="Toggle automatic music ducking under dialogue"
            >
              <span className="material-symbols-outlined text-[13px]">hearing</span>
              <span>Duck: {ducking.enabled ? 'ON' : 'OFF'}</span>
            </button>

            {ducking.enabled && (
              <div
                className={`flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-mono transition-all ${
                  currentGainReductionDb < -0.5
                    ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold animate-pulse'
                    : 'text-text-disabled'
                }`}
                title={`Live Gain Reduction: ${currentGainReductionDb.toFixed(1)} dB`}
              >
                <span>GR</span>
                <span>{currentGainReductionDb < -0.1 ? `${currentGainReductionDb.toFixed(1)}dB` : '0dB'}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowDuckingPanel(!showDuckingPanel)}
              className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
                showDuckingPanel ? 'text-accent-ai bg-bg-hover' : 'text-text-disabled hover:text-text-primary'
              }`}
              title="Configure Sidechain Auto-Ducking parameters"
            >
              <span className="material-symbols-outlined text-[13px]">tune</span>
            </button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="h-5 px-2 text-[10px] font-mono flex items-center gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
            onClick={() => setShowLoudnessRadar(true)}
            title="Open EBU R128 Broadcast Loudness Radar & True Peak Meter"
          >
            <span className="material-symbols-outlined text-[13px]">radar</span>
            <span>Loudness Radar</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="h-5 px-2 text-[10px] font-mono"
            onClick={resetAllFaders}
            title="Reset master and all track faders to 0 dB unity and center pan"
          >
            Reset All
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-text-secondary">Master Limiter</span>
            <Switch
              checked={masterLimiter}
              label="Master limiter"
              onChange={() => setMasterLimiter(!masterLimiter)}
            />
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close audio mixer"
            className="flex h-5 w-5 items-center justify-center rounded text-text-disabled hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">close</span>
          </button>
        </div>
      </div>

      {/* S33 — Collapsible Sidechain Auto-Ducking Configuration Panel */}
      {showDuckingPanel && (
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-3 py-1.5 bg-bg-canvas/90 text-xs font-mono select-none">
          <div className="flex items-center gap-4">
            <span className="text-[11px] font-bold text-accent-ai font-sans uppercase tracking-wider">
              Auto-Ducking:
            </span>

            {/* Ducking Depth */}
            <label className="flex items-center gap-1.5 text-text-secondary text-[11px]">
              <span>Depth:</span>
              <input
                type="range"
                min={-30}
                max={-3}
                step={0.5}
                value={ducking.duckingDepthDb}
                onChange={(e) => setDucking({ duckingDepthDb: Number(e.target.value) })}
                className="w-16 accent-accent-ai h-1.5"
              />
              <span className="w-10 font-bold text-text-primary">{ducking.duckingDepthDb.toFixed(1)}dB</span>
            </label>

            {/* Sensitivity Threshold */}
            <label className="flex items-center gap-1.5 text-text-secondary text-[11px]">
              <span>Threshold:</span>
              <input
                type="range"
                min={-40}
                max={-10}
                step={1}
                value={ducking.thresholdDb}
                onChange={(e) => setDucking({ thresholdDb: Number(e.target.value) })}
                className="w-16 accent-accent-ai h-1.5"
              />
              <span className="w-10 font-bold text-text-primary">{ducking.thresholdDb.toFixed(0)}dB</span>
            </label>

            {/* Attack */}
            <label className="flex items-center gap-1.5 text-text-secondary text-[11px]">
              <span>Attack:</span>
              <input
                type="range"
                min={10}
                max={150}
                step={5}
                value={ducking.attackMs}
                onChange={(e) => setDucking({ attackMs: Number(e.target.value) })}
                className="w-14 accent-accent-ai h-1.5"
              />
              <span className="w-10 font-bold text-text-primary">{ducking.attackMs}ms</span>
            </label>

            {/* Release */}
            <label className="flex items-center gap-1.5 text-text-secondary text-[11px]">
              <span>Release:</span>
              <input
                type="range"
                min={100}
                max={1000}
                step={25}
                value={ducking.releaseMs}
                onChange={(e) => setDucking({ releaseMs: Number(e.target.value) })}
                className="w-16 accent-accent-ai h-1.5"
              />
              <span className="w-12 font-bold text-text-primary">{ducking.releaseMs}ms</span>
            </label>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1 text-[10px]">
            <button
              type="button"
              onClick={() => setDucking({ duckingDepthDb: -8, attackMs: 40, releaseMs: 350 })}
              className="rounded px-1.5 py-0.5 bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            >
              Subtle (-8dB)
            </button>
            <button
              type="button"
              onClick={() => setDucking({ duckingDepthDb: -12, attackMs: 30, releaseMs: 400 })}
              className="rounded px-1.5 py-0.5 bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            >
              Dialogue (-12dB)
            </button>
            <button
              type="button"
              onClick={() => setDucking({ duckingDepthDb: -18, attackMs: 20, releaseMs: 500 })}
              className="rounded px-1.5 py-0.5 bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            >
              Voiceover (-18dB)
            </button>
          </div>
        </div>
      )}

      {/* S35 — Collapsible 3-Band Parametric Equalizer Panel */}
      {(activeTrack || activeBusForEq) && (
        <div className="flex flex-col border-b border-hairline bg-bg-canvas/95 px-3 py-2 text-xs select-none">
          <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5 mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-accent-ai">graphic_eq</span>
              <span className="font-bold text-text-primary text-[11px]">
                {activeTrack ? `${activeTrack.name} — Parametric EQ` : `${activeBusForEq?.name} Submix Bus — Parametric EQ`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (activeTrack) setTrackEq(activeTrack.id, { enabled: !currentEq.enabled });
                  else if (activeBusForEq) setBusEq(activeBusForEq.id, { enabled: !currentEq.enabled });
                }}
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium transition-colors ${
                  currentEq.enabled
                    ? 'bg-accent-ai/20 text-accent-ai border border-accent-ai/30'
                    : 'bg-bg-app text-text-disabled border border-hairline'
                }`}
              >
                {currentEq.enabled ? 'EQ: ON' : 'EQ: BYPASS'}
              </button>
            </div>

            {/* Presets & Actions */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-disabled uppercase font-mono">Preset:</span>
              <div className="flex items-center gap-1">
                {(Object.keys(AUDIO_EQ_PRESETS) as AudioEqPresetId[]).map((presetKey) => {
                  const preset = AUDIO_EQ_PRESETS[presetKey];
                  return (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => {
                        if (activeTrack) setTrackEq(activeTrack.id, preset.settings);
                        else if (activeBusForEq) setBusEq(activeBusForEq.id, preset.settings);
                      }}
                      className="rounded px-1.5 py-0.5 text-[10px] bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                      title={preset.description}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (activeTrack) resetTrackEq(activeTrack.id);
                  else if (activeBusForEq) resetBusEq(activeBusForEq.id);
                }}
                className="text-[10px] font-mono text-text-disabled hover:text-text-primary px-1"
                title="Reset EQ to default flat"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveEqTrackId(null);
                  setActiveBusEqId(null);
                }}
                className="text-text-disabled hover:text-text-primary p-0.5"
                title="Close Equalizer panel"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>
          </div>

          {/* EQ Body: SVG Frequency Response Curve + 3 Band Sliders */}
          <div className="flex items-center gap-4">
            {/* Live Frequency Response Curve */}
            <div className="relative flex flex-col items-center">
              <svg
                width="340"
                height="80"
                viewBox="0 0 340 80"
                className="rounded border border-hairline bg-black/80 overflow-hidden"
              >
                <defs>
                  <linearGradient id="eqCurveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-ai, #6366f1)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="var(--accent-ai, #6366f1)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                {/* 0 dB Center line */}
                <line x1="0" y1="40" x2="340" y2="40" stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
                {/* +6 dB line */}
                <line x1="0" y1="24" x2="340" y2="24" stroke="rgba(255,255,255,0.08)" />
                {/* -6 dB line */}
                <line x1="0" y1="56" x2="340" y2="56" stroke="rgba(255,255,255,0.08)" />

                {/* Frequency Grid Lines (100Hz, 1kHz, 10kHz) */}
                <line x1="79" y1="0" x2="79" y2="80" stroke="rgba(255,255,255,0.08)" />
                <line x1="193" y1="0" x2="193" y2="80" stroke="rgba(255,255,255,0.08)" />
                <line x1="306" y1="0" x2="306" y2="80" stroke="rgba(255,255,255,0.08)" />

                <text x="79" y="76" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">100Hz</text>
                <text x="193" y="76" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">1kHz</text>
                <text x="306" y="76" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">10kHz</text>

                {/* Area under curve */}
                {currentEq.enabled && (
                  <path
                    d={`${eqCurve.pathData} L 340 80 L 0 80 Z`}
                    fill="url(#eqCurveGrad)"
                  />
                )}

                {/* Main Curve */}
                <path
                  d={eqCurve.pathData}
                  fill="none"
                  stroke={currentEq.enabled ? 'var(--accent-ai, #6366f1)' : '#64748b'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* 3-Band Control Sliders */}
            <div className="flex items-center gap-3 flex-1 font-mono text-[11px]">
              {/* Low Shelf (Bass) */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline flex-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-emerald-400">LOW (Bass)</span>
                  <span className="text-text-primary font-bold">
                    {currentEq.low.gainDb > 0 ? `+${currentEq.low.gainDb.toFixed(1)}` : currentEq.low.gainDb.toFixed(1)} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={currentEq.low.gainDb}
                  onChange={(e) => {
                    const patch = { low: { ...currentEq.low, gainDb: Number(e.target.value) } };
                    if (activeTrack) setTrackEq(activeTrack.id, patch);
                    else if (activeBusForEq) setBusEq(activeBusForEq.id, patch);
                  }}
                  className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                  title="Low shelf gain — double-click to reset"
                  onDoubleClick={() => {
                    const patch = { low: { ...currentEq.low, gainDb: 0 } };
                    if (activeTrack) setTrackEq(activeTrack.id, patch);
                    else if (activeBusForEq) setBusEq(activeBusForEq.id, patch);
                  }}
                />
                <div className="flex items-center justify-between text-[9px] text-text-disabled">
                  <span>Shelf</span>
                  <span>{currentEq.low.frequencyHz} Hz</span>
                </div>
              </div>

              {/* Mid Bell */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline flex-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-amber-400">MID (Voice)</span>
                  <span className="text-text-primary font-bold">
                    {currentEq.mid.gainDb > 0 ? `+${currentEq.mid.gainDb.toFixed(1)}` : currentEq.mid.gainDb.toFixed(1)} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={currentEq.mid.gainDb}
                  onChange={(e) => {
                    const patch = { mid: { ...currentEq.mid, gainDb: Number(e.target.value) } };
                    if (activeTrack) setTrackEq(activeTrack.id, patch);
                    else if (activeBusForEq) setBusEq(activeBusForEq.id, patch);
                  }}
                  className="w-full accent-amber-400 h-1.5 cursor-pointer"
                  title="Mid peaking gain — double-click to reset"
                  onDoubleClick={() => {
                    const patch = { mid: { ...currentEq.mid, gainDb: 0 } };
                    if (activeTrack) setTrackEq(activeTrack.id, patch);
                    else if (activeBusForEq) setBusEq(activeBusForEq.id, patch);
                  }}
                />
                <div className="flex items-center justify-between text-[9px] text-text-disabled">
                  <span>Q {currentEq.mid.q?.toFixed(1) ?? '1.0'}</span>
                  <span>{currentEq.mid.frequencyHz} Hz</span>
                </div>
              </div>

              {/* High Shelf (Treble) */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline flex-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-cyan-400">HIGH (Air)</span>
                  <span className="text-text-primary font-bold">
                    {currentEq.high.gainDb > 0 ? `+${currentEq.high.gainDb.toFixed(1)}` : currentEq.high.gainDb.toFixed(1)} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={currentEq.high.gainDb}
                  onChange={(e) => {
                    const patch = { high: { ...currentEq.high, gainDb: Number(e.target.value) } };
                    if (activeTrack) setTrackEq(activeTrack.id, patch);
                    else if (activeBusForEq) setBusEq(activeBusForEq.id, patch);
                  }}
                  className="w-full accent-cyan-400 h-1.5 cursor-pointer"
                  title="High shelf gain — double-click to reset"
                  onDoubleClick={() => {
                    const patch = { high: { ...currentEq.high, gainDb: 0 } };
                    if (activeTrack) setTrackEq(activeTrack.id, patch);
                    else if (activeBusForEq) setBusEq(activeBusForEq.id, patch);
                  }}
                />
                <div className="flex items-center justify-between text-[9px] text-text-disabled">
                  <span>Shelf</span>
                  <span>{(currentEq.high.frequencyHz / 1000).toFixed(0)} kHz</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* S36 & S63 — Collapsible Dynamics (Compressor & Limiter) Panel */}
      {(activeDynTrack || activeBusForDyn || showMasterCompressor) && (
        <div className="flex flex-col border-b border-hairline bg-bg-canvas/95 px-3 py-2 text-xs select-none">
          <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5 mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-amber-400">tune</span>
              <span className="font-bold text-text-primary text-[11px]">
                {activeDynTrack
                  ? `${activeDynTrack.name} — Dynamics (Compressor & Limiter)`
                  : activeBusForDyn
                    ? `${activeBusForDyn.name} Submix Bus — Dynamics Processor`
                    : 'Master Output Bus — Glue Compressor & Peak Limiter'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const patch = { enabled: !currentComp.enabled };
                  if (activeDynTrack) setTrackCompressor(activeDynTrack.id, patch);
                  else if (activeBusForDyn) setBusCompressor(activeBusForDyn.id, patch);
                  else if (showMasterCompressor) setMasterCompressor(patch);
                }}
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium transition-colors ${
                  currentComp.enabled
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    : 'bg-bg-app text-text-disabled border border-hairline'
                }`}
              >
                {currentComp.enabled ? 'DYN: ON' : 'DYN: BYPASS'}
              </button>

              {showMasterCompressor && currentComp.enabled && (
                <span className="rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[9px] text-amber-300 font-bold">
                  GR: {masterGainReductionDb < -0.1 ? `${masterGainReductionDb.toFixed(1)} dB` : '0.0 dB'}
                </span>
              )}
            </div>

            {/* Presets & Actions */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-disabled uppercase font-mono">Preset:</span>
              <div className="flex items-center gap-1">
                {(Object.keys(COMPRESSOR_PRESETS) as CompressorPresetKey[]).map((presetKey) => {
                  const preset = COMPRESSOR_PRESETS[presetKey];
                  return (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => {
                        if (activeDynTrack) setTrackCompressor(activeDynTrack.id, preset.settings);
                        else if (activeBusForDyn) setBusCompressor(activeBusForDyn.id, preset.settings);
                        else if (showMasterCompressor) setMasterCompressor(preset.settings);
                      }}
                      className="rounded px-1.5 py-0.5 text-[10px] bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                      title={preset.description}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (activeDynTrack) resetTrackCompressor(activeDynTrack.id);
                  else if (activeBusForDyn) resetBusCompressor(activeBusForDyn.id);
                  else if (showMasterCompressor) resetMasterCompressor();
                }}
                className="text-[10px] font-mono text-text-disabled hover:text-text-primary px-1"
                title="Reset dynamics to default"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveDynTrackId(null);
                  setActiveBusDynId(null);
                  setShowMasterCompressor(false);
                }}
                className="text-text-disabled hover:text-text-primary p-0.5"
                title="Close Dynamics panel"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>
          </div>

          {/* Dynamics Body: SVG Transfer Characteristic Curve + Sliders */}
          <div className="flex items-center gap-4">
            {/* SVG Transfer Characteristic Curve (Input dB vs Output dB) */}
            <div className="relative flex flex-col items-center">
              <svg
                width="150"
                height="80"
                viewBox="0 0 150 80"
                className="rounded border border-hairline bg-black/80 overflow-hidden"
              >
                {/* 1:1 Reference Diagonal (uncompressed line) */}
                <line x1="0" y1="80" x2="150" y2="0" stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />

                {/* Threshold Marker vertical line */}
                {currentComp.enabled && (
                  <line
                    x1={((currentComp.threshold - -60) / 60) * 150}
                    y1="0"
                    x2={((currentComp.threshold - -60) / 60) * 150}
                    y2="80"
                    stroke="rgba(251,191,36,0.3)"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Compression Transfer Curve */}
                <path
                  d={`M ${compCurve.map((p) => `${p.x},${p.y}`).join(' L ')}`}
                  fill="none"
                  stroke={currentComp.enabled ? '#fbbf24' : '#64748b'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                <text x="6" y="12" fill="#64748b" fontSize="8" fontFamily="monospace">0 dB</text>
                <text x="6" y="74" fill="#64748b" fontSize="8" fontFamily="monospace">-60 dB</text>
                <text x="144" y="74" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">In/Out</text>
              </svg>
              <span className="text-[9px] font-mono text-text-disabled mt-0.5">Transfer Curve</span>
            </div>

            {/* Dynamics Controls: Threshold, Ratio, Knee, Attack, Release, Makeup */}
            <div className="grid grid-cols-6 gap-2 flex-1 font-mono text-[11px]">
              {/* Threshold */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-amber-400">THRESH</span>
                  <span className="text-text-primary font-bold">{currentComp.threshold} dB</span>
                </div>
                <input
                  type="range"
                  min={-60}
                  max={0}
                  step={1}
                  value={currentComp.threshold}
                  onChange={(e) => {
                    const patch = { threshold: Number(e.target.value) };
                    if (activeDynTrack) setTrackCompressor(activeDynTrack.id, patch);
                    else if (activeBusForDyn) setBusCompressor(activeBusForDyn.id, patch);
                    else if (showMasterCompressor) setMasterCompressor(patch);
                  }}
                  className="w-full accent-amber-400 h-1.5 cursor-pointer"
                  title="Compression threshold"
                />
                <span className="text-[8px] text-text-disabled">Trigger level</span>
              </div>

              {/* Ratio */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-amber-400">RATIO</span>
                  <span className="text-text-primary font-bold">{currentComp.ratio}:1</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={currentComp.ratio}
                  onChange={(e) => {
                    const patch = { ratio: Number(e.target.value) };
                    if (activeDynTrack) setTrackCompressor(activeDynTrack.id, patch);
                    else if (activeBusForDyn) setBusCompressor(activeBusForDyn.id, patch);
                    else if (showMasterCompressor) setMasterCompressor(patch);
                  }}
                  className="w-full accent-amber-400 h-1.5 cursor-pointer"
                  title="Compression ratio"
                />
                <span className="text-[8px] text-text-disabled">Slope angle</span>
              </div>

              {/* Knee */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-amber-400">KNEE</span>
                  <span className="text-text-primary font-bold">{currentComp.knee} dB</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={currentComp.knee}
                  onChange={(e) => {
                    const patch = { knee: Number(e.target.value) };
                    if (activeDynTrack) setTrackCompressor(activeDynTrack.id, patch);
                    else if (activeBusForDyn) setBusCompressor(activeBusForDyn.id, patch);
                    else if (showMasterCompressor) setMasterCompressor(patch);
                  }}
                  className="w-full accent-amber-400 h-1.5 cursor-pointer"
                  title="Soft-knee curvature"
                />
                <span className="text-[8px] text-text-disabled">Soft transition</span>
              </div>

              {/* Attack */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-amber-400">ATTACK</span>
                  <span className="text-text-primary font-bold">{(currentComp.attack * 1000).toFixed(0)} ms</span>
                </div>
                <input
                  type="range"
                  min={0.001}
                  max={0.2}
                  step={0.005}
                  value={currentComp.attack}
                  onChange={(e) => {
                    const patch = { attack: Number(e.target.value) };
                    if (activeDynTrack) setTrackCompressor(activeDynTrack.id, patch);
                    else if (activeBusForDyn) setBusCompressor(activeBusForDyn.id, patch);
                    else if (showMasterCompressor) setMasterCompressor(patch);
                  }}
                  className="w-full accent-amber-400 h-1.5 cursor-pointer"
                  title="Attack time"
                />
                <span className="text-[8px] text-text-disabled">Response speed</span>
              </div>

              {/* Release */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-amber-400">RELEASE</span>
                  <span className="text-text-primary font-bold">{(currentComp.release * 1000).toFixed(0)} ms</span>
                </div>
                <input
                  type="range"
                  min={0.01}
                  max={1.0}
                  step={0.02}
                  value={currentComp.release}
                  onChange={(e) => {
                    const patch = { release: Number(e.target.value) };
                    if (activeDynTrack) setTrackCompressor(activeDynTrack.id, patch);
                    else if (activeBusForDyn) setBusCompressor(activeBusForDyn.id, patch);
                    else if (showMasterCompressor) setMasterCompressor(patch);
                  }}
                  className="w-full accent-amber-400 h-1.5 cursor-pointer"
                  title="Release time"
                />
                <span className="text-[8px] text-text-disabled">Recovery time</span>
              </div>

              {/* Makeup Gain */}
              <div className="flex flex-col gap-1 p-1.5 rounded bg-bg-app border border-hairline">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-amber-400">MAKEUP</span>
                  <span className="text-text-primary font-bold">+{currentComp.makeupGain.toFixed(1)} dB</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={0.5}
                  value={currentComp.makeupGain}
                  onChange={(e) => {
                    const patch = { makeupGain: Number(e.target.value) };
                    if (activeDynTrack) setTrackCompressor(activeDynTrack.id, patch);
                    else if (activeBusForDyn) setBusCompressor(activeBusForDyn.id, patch);
                    else if (showMasterCompressor) setMasterCompressor(patch);
                  }}
                  className="w-full accent-amber-400 h-1.5 cursor-pointer"
                  title="Makeup gain"
                />
                <span className="text-[8px] text-text-disabled">Output compensation</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mixer Channel Strips Container */}
      <div className="flex flex-1 overflow-x-auto p-2.5 gap-2">
        {tracks.map((track, idx) => {
          const state = trackMixer[track.id] ?? { volumeDb: 0, pan: 0, mute: false, solo: false };
          const isSpine = track.id === document.sequence.spineTrackId;
          const isAudio = track.kind === 'audio';
          const isText = track.role === 'text';

          const roleColor = isSpine
            ? 'bg-accent-ai text-text-on-accent'
            : isAudio
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : isText
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';

          const roleLabel = isSpine
            ? 'MAIN'
            : isAudio
              ? `A${idx}`
              : isText
                ? `T${idx}`
                : `V${idx}`;

          const meter = trackLevels[track.id] ?? {
            leftDb: -60,
            rightDb: -60,
            leftPct: 0,
            rightPct: 0,
            isAudible: false,
          };
          const peakHold = peakHolds[track.id] ?? {
            left: createInitialPeakHoldState(),
            right: createInitialPeakHoldState(),
          };
          const isClipping = peakHold.left.isClipping || peakHold.right.isClipping;
          const leftPeakHoldPct = dbToMeterPercent(peakHold.left.heldPeakDb);
          const rightPeakHoldPct = dbToMeterPercent(peakHold.right.heldPeakDb);

          const isDuckBed = track.role === 'music';
          const isDuckKey = track.role === 'narration';
          const isCurrentlyDucked = isDuckBed && ducking.enabled && currentGainReductionDb < -0.5;

          return (
            <div
              key={track.id}
              className={`flex w-28 shrink-0 flex-col rounded-lg border p-1.5 transition-all ${
                state.mute
                  ? 'border-hairline/40 bg-bg-canvas/30 opacity-60'
                  : state.solo
                    ? 'border-accent-ai bg-accent-ai/5 shadow-xs'
                    : isCurrentlyDucked
                      ? 'border-amber-500/50 bg-amber-500/5 shadow-xs'
                      : 'border-hairline bg-bg-canvas/80'
              }`}
            >
              {/* Channel Header */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${roleColor}`}>
                    {roleLabel}
                  </span>
                  {isDuckKey && (
                    <span
                      className="rounded bg-purple-500/20 px-1 py-0.2 font-mono text-[8px] font-bold text-purple-300 border border-purple-500/30"
                      title="Sidechain Key: Dialogue pushes background beds down"
                    >
                      KEY
                    </span>
                  )}
                  {isDuckBed && (
                    <span
                      className={`rounded px-1 py-0.2 font-mono text-[8px] font-bold transition-colors ${
                        isCurrentlyDucked
                          ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40 animate-pulse'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                      title={
                        isCurrentlyDucked
                          ? `Auto-ducked by ${currentGainReductionDb.toFixed(1)} dB`
                          : 'Sidechain Bed: Ducks under dialogue'
                      }
                    >
                      {isCurrentlyDucked ? `${currentGainReductionDb.toFixed(0)}dB` : 'BED'}
                    </span>
                  )}
                </div>
                <span className="truncate text-[10px] font-medium text-text-secondary" title={track.name}>
                  {track.name}
                </span>
              </div>

              {/* S63 — Track Bus Routing Selector */}
              <div className="flex items-center justify-between mt-1 mb-0.5 px-0.5 text-[8px] font-mono">
                <span className="text-text-disabled uppercase">BUS:</span>
                <select
                  value={resolveTrackBus(track, trackBusRouting)}
                  onChange={(e) => setTrackBusRouting(track.id, e.target.value)}
                  aria-label={`${track.name} Bus Routing`}
                  className="rounded border border-hairline/80 bg-bg-app px-1 py-0.2 text-[8px] font-mono text-text-secondary hover:text-text-primary focus:border-accent-ai focus:outline-hidden cursor-pointer"
                  title="Route track signal into Submix Bus or Master"
                >
                  <option value={BUS_DIALOGUE}>DIA (Bus 1)</option>
                  <option value={BUS_MUSIC}>MUS (Bus 2)</option>
                  <option value={BUS_SFX}>SFX (Bus 3)</option>
                  <option value={BUS_MASTER}>MASTER</option>
                </select>
              </div>

              {/* Fader & VU Meter Central Area */}
              <div className="flex flex-1 items-center justify-center gap-2 py-1.5">
                {/* Vertical Decibel Slider */}
                <div className="flex flex-col items-center justify-center h-full">
                  <input
                    type="range"
                    min={-60}
                    max={6}
                    step={1}
                    value={state.volumeDb}
                    aria-label={`${track.name} Volume Fader`}
                    title="Volume fader — double-click to reset to 0 dB"
                    className="h-20 w-1.5 accent-[var(--accent-ai)] cursor-pointer"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                    onChange={(e) => setTrackVolume(track.id, Number(e.target.value))}
                    onDoubleClick={() => setTrackVolume(track.id, 0)}
                  />
                  <span className="font-mono text-[9px] text-text-primary mt-1">
                    {state.volumeDb > 0 ? `+${state.volumeDb}` : state.volumeDb} dB
                  </span>
                </div>

                {/* Stereo Peak VU Meter with L/R channels and Peak Hold Indicator */}
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => clearClipping(track.id)}
                    title={isClipping ? 'Clipping overload! Click to reset' : 'Level headroom OK'}
                    className={`h-2.5 w-5 rounded-[2px] text-[7px] font-mono font-black flex items-center justify-center transition-colors ${
                      isClipping
                        ? 'bg-rose-600 text-white shadow-[0_0_6px_rgba(225,29,72,0.9)] animate-pulse cursor-pointer'
                        : 'bg-black/50 text-text-disabled border border-white/5'
                    }`}
                  >
                    CLIP
                  </button>
                  <div className="relative flex gap-0.5 h-20 w-4 rounded bg-black/90 p-0.5 border border-hairline/40 overflow-hidden items-end">
                    {/* Left Channel Bar */}
                    <div className="relative w-1/2 h-full flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                        style={{ height: `${meter.leftPct}%` }}
                      />
                      {/* Peak hold tick line */}
                      {leftPeakHoldPct > 0 && (
                        <div
                          className="absolute left-0 right-0 h-[1.5px] bg-white shadow-xs pointer-events-none"
                          style={{ bottom: `${leftPeakHoldPct}%` }}
                        />
                      )}
                    </div>
                    {/* Right Channel Bar */}
                    <div className="relative w-1/2 h-full flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                        style={{ height: `${meter.rightPct}%` }}
                      />
                      {/* Peak hold tick line */}
                      {rightPeakHoldPct > 0 && (
                        <div
                          className="absolute left-0 right-0 h-[1.5px] bg-white shadow-xs pointer-events-none"
                          style={{ bottom: `${rightPeakHoldPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Pan Control */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[8px] font-mono text-text-disabled">
                  <span>L</span>
                  <span>{state.pan === 0 ? 'C' : state.pan > 0 ? `R${state.pan}` : `L${Math.abs(state.pan)}`}</span>
                  <span>R</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={5}
                  value={state.pan}
                  aria-label={`${track.name} Pan Balance`}
                  title="Pan balance — double-click to center (0)"
                  className="h-1 w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) => setTrackPan(track.id, Number(e.target.value))}
                  onDoubleClick={() => setTrackPan(track.id, 0)}
                />
              </div>

              {/* Mute, Solo, EQ & Dynamics Buttons */}
              <div className="grid grid-cols-4 gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => toggleTrackMute(track.id)}
                  className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                    state.mute
                      ? 'bg-rose-500 text-white shadow-xs'
                      : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                  }`}
                  title="Mute track"
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => toggleTrackSolo(track.id)}
                  className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                    state.solo
                      ? 'bg-amber-400 text-black shadow-xs font-black'
                      : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                  }`}
                  title="Solo track"
                >
                  S
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEqTrackId(activeEqTrackId === track.id ? null : track.id)}
                  className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                    activeEqTrackId === track.id
                      ? 'bg-accent-ai text-text-on-accent shadow-xs'
                      : trackEq[track.id]?.enabled &&
                          (trackEq[track.id].low.gainDb !== 0 ||
                            trackEq[track.id].mid.gainDb !== 0 ||
                            trackEq[track.id].high.gainDb !== 0)
                        ? 'border border-accent-ai/50 bg-accent-ai/10 text-accent-ai'
                        : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                  }`}
                  title="Open 3-Band Parametric Equalizer"
                >
                  EQ
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDynTrackId(activeDynTrackId === track.id ? null : track.id)}
                  className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                    activeDynTrackId === track.id
                      ? 'bg-amber-400 text-black shadow-xs font-bold'
                      : trackCompressor[track.id]?.enabled
                        ? 'border border-amber-400/50 bg-amber-400/10 text-amber-300'
                        : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                  }`}
                  title="Open Dynamics Processor (Compressor & Limiter)"
                >
                  DYN
                </button>
              </div>
            </div>
          );
        })}

        {/* S63 — Submix Auxiliary Buses Section */}
        <div className="flex shrink-0 items-stretch gap-2 pl-2 border-l border-hairline/60">
          <div className="flex flex-col items-center justify-center px-0.5">
            <span className="[writing-mode:vertical-lr] rotate-180 font-mono text-[8px] font-bold tracking-widest text-text-disabled/70 uppercase select-none">
              SUBMIX BUSES
            </span>
          </div>

          {DEFAULT_SUBMIX_BUSES.map((bus) => {
            const busState = submixBuses[bus.id] ?? createDefaultSubmixBusState();
            const meter = busLevels[bus.id] ?? {
              leftDb: -60,
              rightDb: -60,
              leftPct: 0,
              rightPct: 0,
              isAudible: false,
            };
            const peakHold = peakHolds[bus.id] ?? {
              left: createInitialPeakHoldState(),
              right: createInitialPeakHoldState(),
            };
            const isClipping = peakHold.left.isClipping || peakHold.right.isClipping;
            const leftPeakHoldPct = dbToMeterPercent(peakHold.left.heldPeakDb);
            const rightPeakHoldPct = dbToMeterPercent(peakHold.right.heldPeakDb);

            const routedTrackCount = tracks.filter(
              (t) => resolveTrackBus(t, trackBusRouting) === bus.id,
            ).length;

            return (
              <div
                key={bus.id}
                className={`flex w-28 shrink-0 flex-col rounded-lg border p-1.5 transition-all ${
                  busState.mute
                    ? 'border-hairline/40 bg-bg-canvas/30 opacity-60'
                    : busState.solo
                      ? 'border-accent-ai bg-accent-ai/10 shadow-xs'
                      : 'border-hairline/80 bg-gradient-to-b ' + bus.color
                }`}
              >
                {/* Bus Header */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <span className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${bus.badgeColor}`}>
                      {bus.shortLabel}
                    </span>
                    <span className="rounded bg-black/40 px-1 py-0.2 font-mono text-[8px] text-text-disabled">
                      {routedTrackCount}T
                    </span>
                  </div>
                  <span className="truncate text-[10px] font-bold text-text-primary" title={bus.name}>
                    {bus.name}
                  </span>
                </div>

                {/* Fader & VU Meter Central Area */}
                <div className="flex flex-1 items-center justify-center gap-2 py-1.5">
                  <div className="flex flex-col items-center justify-center h-full">
                    <input
                      type="range"
                      min={-60}
                      max={6}
                      step={1}
                      value={busState.volumeDb}
                      aria-label={`${bus.name} Bus Fader`}
                      title="Bus fader — double-click to reset to 0 dB"
                      className="h-20 w-1.5 accent-[var(--accent-ai)] cursor-pointer"
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      onChange={(e) => setBusVolume(bus.id, Number(e.target.value))}
                      onDoubleClick={() => setBusVolume(bus.id, 0)}
                    />
                    <span className="font-mono text-[9px] text-text-primary mt-1">
                      {busState.volumeDb > 0 ? `+${busState.volumeDb}` : busState.volumeDb} dB
                    </span>
                  </div>

                  {/* Stereo Peak VU Meter with L/R channels and Peak Hold */}
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => clearClipping(bus.id)}
                      title={isClipping ? 'Bus clipping! Click to reset' : 'Bus headroom OK'}
                      className={`h-2.5 w-5 rounded-[2px] text-[7px] font-mono font-black flex items-center justify-center transition-colors ${
                        isClipping
                          ? 'bg-rose-600 text-white shadow-[0_0_6px_rgba(225,29,72,0.9)] animate-pulse cursor-pointer'
                          : 'bg-black/50 text-text-disabled border border-white/5'
                      }`}
                    >
                      CLIP
                    </button>
                    <div className="relative flex gap-0.5 h-20 w-4 rounded bg-black/90 p-0.5 border border-hairline/40 overflow-hidden items-end">
                      <div className="relative w-1/2 h-full flex items-end">
                        <div
                          className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                          style={{ height: `${meter.leftPct}%` }}
                        />
                        {leftPeakHoldPct > 0 && (
                          <div
                            className="absolute left-0 right-0 h-[1.5px] bg-white shadow-xs pointer-events-none"
                            style={{ bottom: `${leftPeakHoldPct}%` }}
                          />
                        )}
                      </div>
                      <div className="relative w-1/2 h-full flex items-end">
                        <div
                          className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                          style={{ height: `${meter.rightPct}%` }}
                        />
                        {rightPeakHoldPct > 0 && (
                          <div
                            className="absolute left-0 right-0 h-[1.5px] bg-white shadow-xs pointer-events-none"
                            style={{ bottom: `${rightPeakHoldPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pan Control */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[8px] font-mono text-text-disabled">
                    <span>L</span>
                    <span>{busState.pan === 0 ? 'C' : busState.pan > 0 ? `R${busState.pan}` : `L${Math.abs(busState.pan)}`}</span>
                    <span>R</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={5}
                    value={busState.pan}
                    aria-label={`${bus.name} Bus Pan`}
                    title="Bus pan balance — double-click to center (0)"
                    className="h-1 w-full accent-[var(--accent-ai)] cursor-pointer"
                    onChange={(e) => setBusPan(bus.id, Number(e.target.value))}
                    onDoubleClick={() => setBusPan(bus.id, 0)}
                  />
                </div>

                {/* Mute, Solo, EQ & Dynamics Buttons */}
                <div className="grid grid-cols-4 gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => toggleBusMute(bus.id)}
                    className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                      busState.mute
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                    }`}
                    title="Mute Submix Bus"
                  >
                    M
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleBusSolo(bus.id)}
                    className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                      busState.solo
                        ? 'bg-amber-400 text-black shadow-xs font-black'
                        : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                    }`}
                    title="Solo Submix Bus"
                  >
                    S
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveEqTrackId(null);
                      setActiveBusEqId(activeBusEqId === bus.id ? null : bus.id);
                    }}
                    className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                      activeBusEqId === bus.id
                        ? 'bg-accent-ai text-text-on-accent shadow-xs'
                        : busState.eq?.enabled
                          ? 'border border-accent-ai/50 bg-accent-ai/10 text-accent-ai'
                          : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                    }`}
                    title="Open Bus Parametric EQ"
                  >
                    EQ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDynTrackId(null);
                      setShowMasterCompressor(false);
                      setActiveBusDynId(activeBusDynId === bus.id ? null : bus.id);
                    }}
                    className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                      activeBusDynId === bus.id
                        ? 'bg-amber-400 text-black shadow-xs font-bold'
                        : busState.compressor?.enabled
                          ? 'border border-amber-400/50 bg-amber-400/10 text-amber-300'
                          : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                    }`}
                    title="Open Bus Dynamics Processor"
                  >
                    DYN
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Master Output Strip */}
        <div className="flex w-24 shrink-0 flex-col rounded-lg border border-hairline/80 bg-bg-canvas p-1.5 ml-auto shadow-md">
          <div className="flex items-center justify-between">
            <span className="rounded bg-accent-ai px-1.5 py-0.2 font-mono text-[9px] font-bold text-text-on-accent">
              MASTER
            </span>
            <span className="text-[9px] font-mono text-text-disabled">LR Out</span>
          </div>

          <div className="flex flex-1 items-center justify-center gap-2 py-1.5">
            <div className="flex flex-col items-center justify-center h-full">
              <input
                type="range"
                min={-60}
                max={6}
                step={1}
                value={masterVolumeDb}
                aria-label="Master Volume Fader"
                title="Master volume fader — double-click to reset to 0 dB"
                className="h-20 w-1.5 accent-[var(--accent-ai)] cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                onChange={(e) => setMasterVolumeDb(Number(e.target.value))}
                onDoubleClick={() => setMasterVolumeDb(0)}
              />
              <span className="font-mono text-[9px] font-bold text-text-primary mt-1">
                {masterVolumeDb > 0 ? `+${masterVolumeDb}` : masterVolumeDb} dB
              </span>
            </div>

            {/* Master Stereo Dual Bar with Peak Hold and Overload Clip indicator */}
            {(() => {
              const masterPeak = peakHolds.master ?? {
                left: createInitialPeakHoldState(),
                right: createInitialPeakHoldState(),
              };
              const isMasterClipping = masterPeak.left.isClipping || masterPeak.right.isClipping;
              const leftPeakPct = dbToMeterPercent(masterPeak.left.heldPeakDb);
              const rightPeakPct = dbToMeterPercent(masterPeak.right.heldPeakDb);

              return (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => clearClipping('master')}
                    title={isMasterClipping ? 'Master Clipping! Click to reset' : 'Master headroom OK'}
                    className={`h-2.5 w-6 rounded-[2px] text-[7.5px] font-mono font-black flex items-center justify-center transition-colors ${
                      isMasterClipping
                        ? 'bg-rose-600 text-white shadow-[0_0_8px_rgba(225,29,72,0.9)] animate-pulse cursor-pointer'
                        : 'bg-black/50 text-text-disabled border border-white/5'
                    }`}
                  >
                    CLIP
                  </button>
                  <div className="relative flex gap-0.5 h-20 w-5 rounded bg-black/90 p-0.5 border border-hairline/60 overflow-hidden items-end">
                    <div className="relative w-1/2 h-full flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                        style={{ height: `${masterLevels.leftPct}%` }}
                      />
                      {leftPeakPct > 0 && (
                        <div
                          className="absolute left-0 right-0 h-[2px] bg-white shadow-xs pointer-events-none"
                          style={{ bottom: `${leftPeakPct}%` }}
                        />
                      )}
                    </div>
                    <div className="relative w-1/2 h-full flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                        style={{ height: `${masterLevels.rightPct}%` }}
                      />
                      {rightPeakPct > 0 && (
                        <div
                          className="absolute left-0 right-0 h-[2px] bg-white shadow-xs pointer-events-none"
                          style={{ bottom: `${rightPeakPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-1 mt-auto">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 py-0.5 text-[9px] font-mono h-5 justify-center"
              onClick={() => setMasterVolumeDb(0)}
              title="Reset master volume to 0 dB unity"
            >
              0dB
            </Button>
            <button
              type="button"
              onClick={() => {
                setActiveDynTrackId(null);
                setActiveBusDynId(null);
                setShowMasterCompressor(!showMasterCompressor);
              }}
              className={`rounded px-1.5 py-0.5 text-center font-mono text-[9px] font-bold h-5 transition-all ${
                showMasterCompressor
                  ? 'bg-amber-400 text-black shadow-xs font-bold'
                  : masterCompressor.enabled
                    ? 'border border-amber-400/50 bg-amber-400/10 text-amber-300'
                    : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
              }`}
              title="Toggle Master Glue Compressor & Limiter Panel"
            >
              DYN
            </button>
            <button
              type="button"
              onClick={() => setShowLoudnessRadar(true)}
              className="rounded px-1.5 py-0.5 text-center font-mono text-[9px] font-bold h-5 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all"
              title="Open EBU R128 Broadcast Loudness Radar"
            >
              LUFS
            </button>
          </div>
        </div>
      </div>

      <LoudnessRadarModal open={showLoudnessRadar} onClose={() => setShowLoudnessRadar(false)} />
    </div>
  );
}
