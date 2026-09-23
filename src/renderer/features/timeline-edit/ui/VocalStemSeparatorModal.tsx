import { useState, useMemo } from 'react';

import {
  ALL_STEM_CHANNELS,
  STEM_DEFINITIONS,
  DEFAULT_VOCAL_STEM_SETTINGS,
  clampStemGain,
  calculateStemEnergyDistribution,
  decomposeClipInto4Stems,
  type StemChannelType,
  type VocalStemSeparationSettings,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { MODAL_IDS } from '../../../shared/config/modal-ids';
import { useModalStore } from '../../../shared/model/modalStore';
import { useToastStore } from '../../../shared/model/toastStore';
import { Modal } from '../../../shared/ui/Modal';

export function VocalStemSeparatorModal() {
  const activeModal = useModalStore((state) => state.activeModal);
  const closeModal = useModalStore((state) => state.closeModal);
  const pushToast = useToastStore((state) => state.pushToast);

  const document = useSequenceStore((state) => state.document);
  const selectedClipIds = useSequenceStore((state) => state.selectedClipIds);
  const patchClip = useSequenceStore((state) => state.patchClip);
  const addTrack = useSequenceStore((state) => state.addTrack);
  const commitClips = useSequenceStore((state) => state.commitClips);

  const isOpen = activeModal === MODAL_IDS.VOCAL_SEPARATOR;

  // Sound-carrying clips on timeline
  const audioClips = useMemo(() => {
    if (!document) return [];
    return document.clips.filter((c) => c.sourceKind === 'audio' || c.sourceKind === 'video');
  }, [document]);

  // Target clip
  const [targetClipId, setTargetClipId] = useState<string>('');
  const activeClip = useMemo(() => {
    if (targetClipId) {
      return audioClips.find((c) => c.id === targetClipId) ?? audioClips[0];
    }
    const foundSelected = audioClips.find((c) => selectedClipIds.includes(c.id));
    return foundSelected ?? audioClips[0];
  }, [audioClips, selectedClipIds, targetClipId]);

  // Working separation settings
  const [settings, setSettings] = useState<VocalStemSeparationSettings>(DEFAULT_VOCAL_STEM_SETTINGS);
  const [busy, setBusy] = useState(false);

  // Spectral energy meters simulation
  const energyDistribution = useMemo(() => {
    return calculateStemEnergyDistribution(0.75, true);
  }, []);

  if (!isOpen || !document) return null;

  const handleSelectMode = (mode: VocalStemSeparationSettings['mode']) => {
    if (mode === 'isolate_vocals') {
      setSettings((prev) => ({
        ...prev,
        enabled: true,
        mode: 'isolate_vocals',
        channels: {
          vocals: { stem: 'vocals', solo: true, mute: false, gainDb: 0, pan: 0 },
          drums: { stem: 'drums', solo: false, mute: true, gainDb: 0, pan: 0 },
          bass: { stem: 'bass', solo: false, mute: true, gainDb: 0, pan: 0 },
          instruments: { stem: 'instruments', solo: false, mute: true, gainDb: 0, pan: 0 },
        },
      }));
    } else if (mode === 'remove_vocals') {
      setSettings((prev) => ({
        ...prev,
        enabled: true,
        mode: 'remove_vocals',
        channels: {
          vocals: { stem: 'vocals', solo: false, mute: true, gainDb: 0, pan: 0 },
          drums: { stem: 'drums', solo: false, mute: false, gainDb: 0, pan: 0 },
          bass: { stem: 'bass', solo: false, mute: false, gainDb: 0, pan: 0 },
          instruments: { stem: 'instruments', solo: false, mute: false, gainDb: 0, pan: 0 },
        },
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        enabled: true,
        mode: 'custom_4_stem',
        channels: {
          vocals: { stem: 'vocals', solo: false, mute: false, gainDb: 0, pan: 0 },
          drums: { stem: 'drums', solo: false, mute: false, gainDb: 0, pan: 0 },
          bass: { stem: 'bass', solo: false, mute: false, gainDb: 0, pan: 0 },
          instruments: { stem: 'instruments', solo: false, mute: false, gainDb: 0, pan: 0 },
        },
      }));
    }
  };

  const handleToggleSolo = (stem: StemChannelType) => {
    setSettings((prev) => {
      const currentSolo = prev.channels[stem].solo;
      const nextChannels = { ...prev.channels };
      for (const k of ALL_STEM_CHANNELS) {
        nextChannels[k] = {
          ...nextChannels[k],
          solo: k === stem ? !currentSolo : false,
        };
      }
      return {
        ...prev,
        mode: 'custom_4_stem',
        channels: nextChannels,
      };
    });
  };

  const handleToggleMute = (stem: StemChannelType) => {
    setSettings((prev) => ({
      ...prev,
      mode: 'custom_4_stem',
      channels: {
        ...prev.channels,
        [stem]: {
          ...prev.channels[stem],
          mute: !prev.channels[stem].mute,
        },
      },
    }));
  };

  const handleGainChange = (stem: StemChannelType, gainDb: number) => {
    setSettings((prev) => ({
      ...prev,
      mode: 'custom_4_stem',
      channels: {
        ...prev.channels,
        [stem]: {
          ...prev.channels[stem],
          gainDb: clampStemGain(gainDb),
        },
      },
    }));
  };

  // 1. In-place filter application
  const handleApplyFilterToClip = () => {
    if (!activeClip) return;
    patchClip(activeClip.id, {
      effects: {
        ...activeClip.effects,
        vocalSeparation: {
          ...settings,
          enabled: true,
        },
      },
    });
    pushToast({
      message: 'AI Vocal Separation filter applied to clip',
      variant: 'success',
    });
    closeModal();
  };

  // 2. Multi-track 4-stem decomposition
  const handleDecomposeTracks = async () => {
    if (!activeClip) return;
    setBusy(true);

    try {
      // Create each stem track
      const trackIdMap: Partial<Record<StemChannelType, string>> = {};
      for (const stemType of ALL_STEM_CHANNELS) {
        const def = STEM_DEFINITIONS[stemType];
        const trackName = `${def.label} (${def.shortLabel})`;
        await addTrack('audio', trackName, stemType === 'vocals' ? 'narration' : 'music');
        const latestDoc = useSequenceStore.getState().document;
        const createdTrack =
          latestDoc?.tracks.find((t) => t.name === trackName) ??
          latestDoc?.tracks[latestDoc.tracks.length - 1];
        if (createdTrack) {
          trackIdMap[stemType] = createdTrack.id;
        }
      }

      const freshDoc = useSequenceStore.getState().document;
      if (!freshDoc) return;

      const maxOrder = freshDoc.tracks.reduce((max, t) => Math.max(max, t.orderIndex), 0);
      const { stemClips, updatedOriginalClip } = decomposeClipInto4Stems(
        activeClip,
        freshDoc.tracks,
        maxOrder + 1
      );

      // Reassign stem clips to their corresponding newly created track IDs
      const remappedStemClips = stemClips.map((clip) => {
        const stemType = clip.effects?.vocalSeparation?.targetStem;
        const trackId = stemType ? trackIdMap[stemType] : undefined;
        return trackId ? { ...clip, trackId } : clip;
      });

      // Update sequence clips
      const otherClips = freshDoc.clips.filter((c) => c.id !== activeClip.id);
      commitClips([...otherClips, updatedOriginalClip, ...remappedStemClips]);

      pushToast({
        message: 'Decomposed audio into 4 synchronized stem tracks',
        variant: 'success',
      });
      closeModal();
    } catch {
      pushToast({
        message: 'Failed to decompose audio into 4 stems',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={closeModal}
      title="AI Vocal Remover & 4-Stem Audio Separator"
      size="lg"
    >
      <div className="flex flex-col gap-4 text-text-primary select-none">
        {/* Header Description */}
        <p className="text-xs text-text-muted">
          Isolate clear speech and lead vocals, generate karaoke instrumental backing tracks, or
          decompose music into 4 discrete stems (Vocals, Drums, Bass, Instruments) with independent
          channel mixing.
        </p>

        {/* Clip Selector */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-hairline bg-bg-app p-2.5">
          <label className="text-[11px] font-semibold text-text-secondary flex items-center justify-between">
            <span>Target Audio Clip</span>
            <span className="font-mono text-[10px] text-text-disabled">
              {audioClips.length} sound clips found
            </span>
          </label>
          <select
            aria-label="Target audio clip"
            value={activeClip?.id ?? ''}
            onChange={(e) => setTargetClipId(e.target.value)}
            className="w-full rounded border border-hairline bg-bg-canvas px-2.5 py-1.5 text-xs text-text-primary focus:border-accent-ai focus:outline-none"
          >
            {audioClips.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || c.filePath || `Clip (${c.id.slice(0, 6)})`} [
                {(c.durationFrames / 30).toFixed(1)}s]
              </option>
            ))}
          </select>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleSelectMode('isolate_vocals')}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 transition-all ${
              settings.mode === 'isolate_vocals'
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-400 font-semibold'
                : 'border-hairline bg-bg-app text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">mic</span>
            <span className="text-xs">Isolate Vocals</span>
            <span className="text-[10px] text-text-muted">Acapella / Speech Only</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('remove_vocals')}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 transition-all ${
              settings.mode === 'remove_vocals'
                ? 'border-purple-500 bg-purple-500/15 text-purple-400 font-semibold'
                : 'border-hairline bg-bg-app text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">music_off</span>
            <span className="text-xs">Remove Vocals</span>
            <span className="text-[10px] text-text-muted">Karaoke / Instrumental</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('custom_4_stem')}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 transition-all ${
              settings.mode === 'custom_4_stem'
                ? 'border-accent-ai bg-accent-ai/15 text-accent-ai font-semibold'
                : 'border-hairline bg-bg-app text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
            <span className="text-xs">4-Stem Studio Mixer</span>
            <span className="text-[10px] text-text-muted">Multi-Track Control</span>
          </button>
        </div>

        {/* 4-Channel Stem Mixer Board */}
        <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-bg-card p-3">
          <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-accent-ai">graphic_eq</span>
              Multi-Stem Channel Strips
            </span>
            <span className="text-[10px] text-text-muted">Solo / Mute / Fader Gain</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
            {ALL_STEM_CHANNELS.map((stem) => {
              const def = STEM_DEFINITIONS[stem];
              const ch = settings.channels[stem];
              const energy = energyDistribution[stem];

              return (
                <div
                  key={stem}
                  className="flex flex-col gap-2 rounded-lg border border-hairline bg-bg-app p-2.5 transition-all"
                >
                  {/* Stem Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="material-symbols-outlined text-[17px]" style={{ color: def.colorHex }}>
                        {def.icon}
                      </span>
                      <span className="text-xs font-bold text-text-primary truncate">{def.shortLabel}</span>
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase"
                      style={{
                        backgroundColor: `${def.colorHex}22`,
                        color: def.colorHex,
                      }}
                    >
                      {stem}
                    </span>
                  </div>

                  <span className="text-[10px] text-text-disabled truncate">{def.frequencyRange}</span>

                  {/* Level Meter Bar */}
                  <div className="flex flex-col gap-0.5">
                    <div className="h-1.5 w-full rounded-full bg-bg-workspace overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: ch.mute ? '0%' : `${Math.round(energy * 100)}%`,
                          backgroundColor: def.colorHex,
                        }}
                      />
                    </div>
                    <span className="text-right font-mono text-[8px] text-text-disabled">
                      {ch.mute ? 'MUTED' : `${Math.round(energy * 100)}% SPL`}
                    </span>
                  </div>

                  {/* Solo & Mute Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleSolo(stem)}
                      className={`flex-1 rounded py-1 text-[10px] font-bold transition-all ${
                        ch.solo
                          ? 'bg-amber-500 text-black shadow-sm'
                          : 'bg-bg-workspace text-text-muted hover:text-text-primary'
                      }`}
                    >
                      SOLO
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleMute(stem)}
                      className={`flex-1 rounded py-1 text-[10px] font-bold transition-all ${
                        ch.mute
                          ? 'bg-rose-500 text-white shadow-sm'
                          : 'bg-bg-workspace text-text-muted hover:text-text-primary'
                      }`}
                    >
                      MUTE
                    </button>
                  </div>

                  {/* Fader Slider */}
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-text-muted">Gain</span>
                      <span className="font-mono text-text-primary">
                        {ch.gainDb > 0 ? `+${ch.gainDb}` : ch.gainDb} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-24}
                      max={12}
                      step={1}
                      value={ch.gainDb}
                      disabled={ch.mute}
                      onChange={(e) => handleGainChange(stem, Number(e.target.value))}
                      className="w-full accent-accent-ai"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Advanced Separation Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-hairline bg-bg-app p-3">
          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-secondary">Separation Sensitivity</span>
              <span className="font-mono text-text-primary">
                {Math.round(settings.sensitivity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={settings.sensitivity}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, sensitivity: Number(e.target.value) }))
              }
              className="accent-accent-ai"
            />
            <span className="text-[10px] text-text-disabled">
              Higher sensitivity sharpens isolation with tighter spectral masking.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-secondary">Bleed Reduction</span>
              <span className="font-mono text-text-primary">
                {Math.round(settings.bleedReduction * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={settings.bleedReduction}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, bleedReduction: Number(e.target.value) }))
              }
              className="accent-accent-ai"
            />
            <span className="text-[10px] text-text-disabled">
              Attenuates cross-talk leakage between adjacent frequency bands.
            </span>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-hairline">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !activeClip}
              onClick={handleApplyFilterToClip}
              className="rounded-md border border-accent-ai/40 bg-accent-ai/10 px-3 py-1.5 text-xs font-semibold text-accent-ai hover:bg-accent-ai/20 transition-all"
            >
              Apply Filter to Clip
            </button>

            <button
              type="button"
              disabled={busy || !activeClip}
              onClick={handleDecomposeTracks}
              className="flex items-center gap-1.5 rounded-md bg-accent-ai px-4 py-1.5 text-xs font-semibold text-white shadow hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">call_split</span>
              <span>Decompose to 4 Tracks</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
