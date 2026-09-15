import { useEffect, useState } from 'react';

import { useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Switch } from '../../../shared/ui/Switch';
import { useAudioMixerStore } from '../model/audioMixerStore';

export function AudioMixerDock() {
  const isOpen = useAudioMixerStore((state) => state.isOpen);
  const setIsOpen = useAudioMixerStore((state) => state.setIsOpen);

  const document = useSequenceStore((state) => state.document);
  const isPlaying = useSequenceStore((state) => state.playing);

  const masterVolumeDb = useAudioMixerStore((state) => state.masterVolumeDb);
  const masterLimiter = useAudioMixerStore((state) => state.masterLimiter);
  const setMasterVolumeDb = useAudioMixerStore((state) => state.setMasterVolumeDb);
  const setMasterLimiter = useAudioMixerStore((state) => state.setMasterLimiter);

  const trackMixer = useAudioMixerStore((state) => state.trackMixer);
  const setTrackVolume = useAudioMixerStore((state) => state.setTrackVolume);
  const setTrackPan = useAudioMixerStore((state) => state.setTrackPan);
  const toggleTrackMute = useAudioMixerStore((state) => state.toggleTrackMute);
  const toggleTrackSolo = useAudioMixerStore((state) => state.toggleTrackSolo);

  // Animated VU meters simulation during timeline playback
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!isOpen || !isPlaying) {
      setPulse(0);
      return;
    }
    const interval = setInterval(() => {
      setPulse(Math.random());
    }, 90);
    return () => clearInterval(interval);
  }, [isOpen, isPlaying]);

  if (!isOpen || !document) return null;

  const tracks = document.tracks;

  return (
    <div className="flex h-56 w-full flex-col border-t border-hairline bg-bg-app/95 backdrop-blur-md shadow-2xl transition-all select-none">
      {/* Console Top Header Bar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-hairline px-3 bg-bg-canvas/50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[17px] text-accent-ai">equalizer</span>
          <span className="text-xs font-bold text-text-primary tracking-wide">Audio Console Mixer</span>
          <span className="rounded bg-hairline/80 px-1.5 py-0.2 font-mono text-[9px] text-text-disabled">
            {tracks.length} Channels · 48 kHz
          </span>
        </div>

        <div className="flex items-center gap-3">
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

          // VU Meter Height Calculation
          const baseDb = state.volumeDb;
          const activity = isPlaying && !state.mute ? Math.max(0.05, pulse * (1 + baseDb / 40)) : 0;
          const vuHeightPct = Math.min(100, Math.max(0, activity * 85));

          return (
            <div
              key={track.id}
              className={`flex w-24 shrink-0 flex-col rounded-lg border p-1.5 transition-all ${
                state.mute
                  ? 'border-hairline/40 bg-bg-canvas/30 opacity-60'
                  : state.solo
                    ? 'border-accent-ai bg-accent-ai/5 shadow-xs'
                    : 'border-hairline bg-bg-canvas/80'
              }`}
            >
              {/* Channel Header */}
              <div className="flex items-center justify-between gap-1">
                <span className={`rounded px-1 py-0.2 font-mono text-[9px] font-bold ${roleColor}`}>
                  {roleLabel}
                </span>
                <span className="truncate text-[10px] font-medium text-text-secondary" title={track.name}>
                  {track.name}
                </span>
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
                    className="h-20 w-1.5 accent-[var(--accent-ai)] cursor-pointer"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                    onChange={(e) => setTrackVolume(track.id, Number(e.target.value))}
                  />
                  <span className="font-mono text-[9px] text-text-primary mt-1">
                    {state.volumeDb > 0 ? `+${state.volumeDb}` : state.volumeDb} dB
                  </span>
                </div>

                {/* Stereo Peak VU Meter */}
                <div className="flex gap-0.5 h-20 w-3 rounded bg-black/60 p-0.5 border border-hairline/40 overflow-hidden items-end">
                  <div
                    className="w-full bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                    style={{ height: `${vuHeightPct}%` }}
                  />
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
                  className="h-1 w-full accent-[var(--accent-ai)] cursor-pointer"
                  onChange={(e) => setTrackPan(track.id, Number(e.target.value))}
                />
              </div>

              {/* Mute & Solo Buttons */}
              <div className="grid grid-cols-2 gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => toggleTrackMute(track.id)}
                  className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                    state.mute
                      ? 'bg-rose-500 text-white shadow-xs'
                      : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => toggleTrackSolo(track.id)}
                  className={`rounded py-0.5 text-center font-mono text-[9px] font-bold transition-all ${
                    state.solo
                      ? 'bg-amber-400 text-black shadow-xs'
                      : 'border border-hairline bg-bg-app text-text-disabled hover:text-text-primary'
                  }`}
                >
                  S
                </button>
              </div>
            </div>
          );
        })}

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
                className="h-20 w-1.5 accent-[var(--accent-ai)] cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                onChange={(e) => setMasterVolumeDb(Number(e.target.value))}
              />
              <span className="font-mono text-[9px] font-bold text-text-primary mt-1">
                {masterVolumeDb > 0 ? `+${masterVolumeDb}` : masterVolumeDb} dB
              </span>
            </div>

            {/* Master Stereo Dual Bar */}
            <div className="flex gap-0.5 h-20 w-4 rounded bg-black/80 p-0.5 border border-hairline/40 overflow-hidden items-end">
              <div
                className="w-1/2 bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                style={{ height: `${isPlaying ? Math.min(100, Math.max(5, pulse * 90)) : 0}%` }}
              />
              <div
                className="w-1/2 bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 rounded-xs transition-all duration-75"
                style={{ height: `${isPlaying ? Math.min(100, Math.max(5, pulse * 86)) : 0}%` }}
              />
            </div>
          </div>

          <div className="mt-auto">
            <Button
              variant="secondary"
              size="sm"
              className="w-full py-0.5 text-[9px] font-mono h-5 justify-center"
              onClick={() => setMasterVolumeDb(0)}
            >
              Unity 0dB
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
