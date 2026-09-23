import React from 'react';
import {
  framesToSeconds,
  secondsToFrames,
  keyframesFor,
  valueAtFrame,
  AUDIO_EQ_PRESETS,
  DEFAULT_AUDIO_EQ_SETTINGS,
  sampleEqCurvePoints,
  type AudioEqPresetId,
  type AudioEqualizerSettings,
  COMPRESSOR_PRESETS,
  DEFAULT_COMPRESSOR_SETTINGS,
  sampleCompressorCurvePoints,
  type CompressorPresetKey,
  type AudioCompressorSettings,
  REVERB_SPACES,
  REVERB_PRESETS,
  DEFAULT_REVERB_SETTINGS,
  type ReverbSpaceType,
  type AudioReverbSettings,
  DEFAULT_NOISE_GATE_SETTINGS,
  NOISE_GATE_PRESETS,
  sampleGateCurvePoints,
  type ClipNoiseGateSettings,
  type NoiseGatePresetKey,
  DEFAULT_AUDIO_PITCH_SETTINGS,
  VOICE_EFFECT_PRESETS,
  type AudioPitchSettings,
  type VoiceEffectPresetKey,
  calculatePitchRatio,
  DEFAULT_AUDIO_PAN_SETTINGS,
  PAN_PRESETS,
  type AudioPanSettings,
  type PanLawType,
  type PanPresetKey,
  calculateEqualPowerPanGains,
  DEFAULT_AUDIO_ISOLATION_SETTINGS,
  AUDIO_ISOLATION_PRESETS,
  type AudioIsolationSettings,
  type AudioIsolationMode,
  type AudioIsolationPresetKey,
  DEFAULT_MULTIBAND_DENOISER_SETTINGS,
  MULTIBAND_DENOISER_PRESETS,
  type MultibandDenoiserSettings,
  type DeHumMode,
  type MultibandDenoiserPresetKey,
  type KeyframeProperty,
  type SequenceClip,
  type ClipOverridableField,
  type SequenceDocument,
  unlinkClips,
  isClipLinked,
  applyDualSystemAudioSync,
} from '@shared';
import { Section } from '../../../../shared/ui/Section';
import { Button } from '../../../../shared/ui/Button';
import { Switch } from '../../../../shared/ui/Switch';
import { Select } from '../../../../shared/ui/Select';
import { useSequenceStore } from '../../../../entities/sequence';
import { useToastStore } from '../../../../shared/model/toastStore';
import { BeatDetectionSection } from './BeatDetectionSection';

export interface AudioInspectorTabProps {
  clip: SequenceClip;
  document: SequenceDocument;
  fps: number;
  carriesSound: boolean;
  videoClip: boolean;
  sourceHasAudio: boolean | null;
  patchClip: (
    clipId: string,
    patch: Partial<SequenceClip>,
    overridableField?: ClipOverridableField,
  ) => void;
  addKeyframe?: (property: KeyframeProperty, value: number) => void;
  keyframeRows?: (property: KeyframeProperty, format: (value: number) => string) => React.ReactNode;
  clipRelativePlayhead?: () => number;
}

export const AudioInspectorTab = React.memo(function AudioInspectorTab({
  clip,
  document,
  fps,
  carriesSound,
  videoClip,
  sourceHasAudio,
  patchClip,
  addKeyframe,
  keyframeRows,
  clipRelativePlayhead,
}: AudioInspectorTabProps) {
  const currentTab = 'audio';
  if (!carriesSound) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* S76 — Dual-System Sound & A/V Clip Linking */}
      {(() => {
        const linkedClip = clip.linkedClipId
          ? document.clips.find((c) => c.id === clip.linkedClipId)
          : null;
        const linkedTrack = linkedClip
          ? document.tracks.find((t) => t.id === linkedClip.trackId)
          : null;

        return (
          <Section title="Dual-System Sound & Link">
            {linkedClip ? (
              <div className="flex flex-col gap-2.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-surface-base/80 border border-emerald-500/30">
                  <div className="flex flex-col">
                    <span className="font-semibold text-text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-emerald-400">link</span>
                      Linked to {linkedClip.label || 'Sibling Clip'}
                    </span>
                    <span className="text-[10px] text-text-secondary">
                      Track: {linkedTrack?.name || 'Timeline Track'} ({linkedClip.sourceKind})
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const allClips = useSequenceStore.getState().document?.clips ?? [];
                      const nextClips = unlinkClips(clip.id, allClips);
                      useSequenceStore.getState().commitClips(nextClips);
                      useToastStore.getState().pushToast({ message: 'Clips unlinked', variant: 'info' });
                    }}
                  >
                    Unlink
                  </Button>
                </div>

                <div className="flex items-center justify-between text-text-secondary text-[11px] px-1">
                  <span>Sync Alignment Offset</span>
                  <span className="font-mono text-text-primary">
                    {clip.syncOffsetFrames !== undefined
                      ? `${clip.syncOffsetFrames > 0 ? '+' : ''}${clip.syncOffsetFrames} frames (${((clip.syncOffsetFrames / fps) * 1000).toFixed(1)}ms)`
                      : 'Locked at 0 frames'}
                  </span>
                </div>

                {clip.sourceKind === 'video' && clip.sourceAudioEnabled === false ? (
                  <p className="text-[11px] text-emerald-400/90 bg-emerald-950/30 p-1.5 rounded border border-emerald-800/40">
                    Camera scratch audio is muted. Only the linked external audio track will play.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2 text-xs text-text-secondary">
                <p className="text-[11px] text-text-disabled">
                  This clip is not linked. Select an audio clip and video clip together on the timeline, then right-click to &ldquo;Auto-Sync Audio by Waveform&rdquo;.
                </p>
              </div>
            )}
          </Section>
        );
      })()}

      {/* Volume animation shortcut in audio tab */}
      {carriesSound && clip.sourceKind !== 'video' && addKeyframe && keyframeRows && clipRelativePlayhead ? (
        <Section title="Volume animation">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              addKeyframe(
                'volume',
                valueAtFrame(clip.keyframes, 'volume', clipRelativePlayhead(), clip.gainDb),
              )
            }
          >
            Add volume keyframe at playhead
          </Button>
          {keyframesFor(clip.keyframes, 'volume').length > 0 ? (
            <ul className="flex flex-col gap-1">
              {keyframeRows('volume', (value) => `${value > 0 ? '+' : ''}${value.toFixed(0)} dB`)}
            </ul>
          ) : (
            <p className="text-xs text-text-disabled">
              Keys record the Level slider’s value at the playhead — a hand-drawn duck.
            </p>
          )}
        </Section>
      ) : null}

      {currentTab === 'audio' && carriesSound ? (
        <Section title={videoClip ? 'Clip audio' : 'Level'}>
          {/*
            S181 — a video clip's own audio, on by default.

            Two states that look alike and must not read alike: the user
            silenced this clip, and the file has no audio stream to begin
            with. The probe already answers the second (`hasAudio` has been on
            `ClipProbe` since the TTS module), so a silent source says so
            plainly instead of offering a control that would do nothing.
          */}
          {videoClip ? (
            sourceHasAudio === false ? (
              <p className="text-xs text-text-disabled">
                This file has no audio track — nothing to mix.
              </p>
            ) : (
              <>
                <label className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                  <span>Use the clip&rsquo;s audio</span>
                  <Switch
                    checked={clip.sourceAudioEnabled !== false}
                    label="Use the clip's own audio"
                    onChange={() =>
                      patchClip(clip.id, {
                        sourceAudioEnabled: clip.sourceAudioEnabled === false,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                  <span title="Source dialogue should hold its level under narration, and push the music bed down the way narration does.">
                    Treat as dialogue
                  </span>
                  <Switch
                    checked={clip.duckExempt === true}
                    label="Treat this clip's audio as dialogue rather than a bed"
                    disabled={clip.sourceAudioEnabled === false}
                    onChange={() => patchClip(clip.id, { duckExempt: clip.duckExempt !== true })}
                  />
                </label>
                {/* S230 — the split edit: this clip's audio leads (J) or
                    lags (L) its picture cut. Export-only; the preview's
                    video element plays its own sound in place (ⓘ). */}
                <label className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="w-12 shrink-0" title="Negative: the audio starts before the picture cut (J cut). Positive: it runs past it (L cut).">
                    J / L
                  </span>
                  <input
                    type="range"
                    min={-48}
                    max={48}
                    step={1}
                    value={clip.audioOffsetFrames ?? 0}
                    aria-label="Split edit audio offset"
                    disabled={clip.sourceAudioEnabled === false}
                    className="flex-1 accent-[var(--accent-ai)] disabled:opacity-50"
                    onChange={(event) =>
                      patchClip(clip.id, { audioOffsetFrames: Number(event.target.value) })
                    }
                  />
                  <span className="w-14 shrink-0 text-right font-mono">
                    {(clip.audioOffsetFrames ?? 0) === 0
                      ? 'off'
                      : `${(clip.audioOffsetFrames ?? 0) > 0 ? '+' : ''}${clip.audioOffsetFrames}f`}
                  </span>
                </label>
              </>
            )
          ) : null}
          <label className="flex items-center gap-3 text-xs text-text-secondary">
            <input
              type="range"
              min={-24}
              max={12}
              step={1}
              value={clip.gainDb}
              aria-label="Gain in decibels"
              disabled={videoClip && (clip.sourceAudioEnabled === false || sourceHasAudio === false)}
              className="flex-1 accent-[var(--accent-ai)] disabled:opacity-50"
              onChange={(event) => patchClip(clip.id, { gainDb: Number(event.target.value) })}
            />
            <span className="w-14 shrink-0 text-right font-mono">
              {clip.gainDb > 0 ? '+' : ''}
              {clip.gainDb} dB
            </span>
          </label>

          {/*
            Beta S151 (F3). The fade columns have existed since migration 060
            and round-tripped through the repository without a control that
            could set them or a render pass that read them; both ends are
            connected now. Capped at the clip's own length so a fade cannot be
            longer than the sound it shapes.
          */}
          {(['fadeInFrames', 'fadeOutFrames'] as const).map((field) => (
            <label key={field} className="flex items-center gap-3 text-xs text-text-secondary">
              <span className="w-12 shrink-0">{field === 'fadeInFrames' ? 'Fade in' : 'Fade out'}</span>
              <input
                type="range"
                min={0}
                max={Math.min(clip.durationFrames, secondsToFrames(5, fps))}
                step={1}
                value={clip[field]}
                aria-label={field === 'fadeInFrames' ? 'Fade in seconds' : 'Fade out seconds'}
                className="flex-1 accent-[var(--accent-ai)]"
                onChange={(event) => patchClip(clip.id, { [field]: Number(event.target.value) })}
              />
              <span className="w-14 shrink-0 text-right font-mono">
                {framesToSeconds(clip[field], fps).toFixed(1)}s
              </span>
            </label>
          ))}
        </Section>
      ) : null}

      {/* S35 — Clip 3-Band Parametric Equalizer (EQ) */}
      {currentTab === 'audio' && carriesSound ? (
        <Section title="Equalizer (EQ)">
          {(() => {
            const eq = clip.effects?.equalizer ?? DEFAULT_AUDIO_EQ_SETTINGS;
            const patchEq = (patch: Partial<AudioEqualizerSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  equalizer: {
                    ...eq,
                    ...patch,
                  },
                },
              });
            };
            const curve = sampleEqCurvePoints(eq, 260, 60, 48, 18);

            return (
              <div className="flex flex-col gap-2.5">
                {/* Enable Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={eq.enabled}
                      label="Enable Parametric EQ"
                      onChange={() => patchEq({ enabled: !eq.enabled })}
                    />
                    <span className="font-medium">{eq.enabled ? 'EQ Active' : 'EQ Bypassed'}</span>
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-text-disabled hover:text-text-primary px-1.5"
                    onClick={() => patchEq(DEFAULT_AUDIO_EQ_SETTINGS)}
                  >
                    Reset
                  </Button>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {(Object.keys(AUDIO_EQ_PRESETS) as AudioEqPresetId[]).map((pKey) => {
                    const preset = AUDIO_EQ_PRESETS[pKey];
                    return (
                      <button
                        key={pKey}
                        type="button"
                        onClick={() => patchEq(preset.settings)}
                        className="rounded px-1.5 py-0.5 bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                        title={preset.description}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Mini SVG Curve Display */}
                <div className="flex flex-col items-center">
                  <svg
                    width="260"
                    height="60"
                    viewBox="0 0 260 60"
                    className="rounded border border-hairline bg-black/80 overflow-hidden w-full"
                  >
                    <defs>
                      <linearGradient id={`clipEqGrad-${clip.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-ai, #6366f1)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--accent-ai, #6366f1)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    <line x1="0" y1="30" x2="260" y2="30" stroke="rgba(255,255,255,0.2)" strokeDasharray="2 2" />
                    <line x1="60" y1="0" x2="60" y2="60" stroke="rgba(255,255,255,0.06)" />
                    <line x1="147" y1="0" x2="147" y2="60" stroke="rgba(255,255,255,0.06)" />
                    <line x1="234" y1="0" x2="234" y2="60" stroke="rgba(255,255,255,0.06)" />

                    <text x="60" y="56" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="middle">100Hz</text>
                    <text x="147" y="56" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="middle">1kHz</text>
                    <text x="234" y="56" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="middle">10kHz</text>

                    {eq.enabled && (
                      <path
                        d={`${curve.pathData} L 260 60 L 0 60 Z`}
                        fill={`url(#clipEqGrad-${clip.id})`}
                      />
                    )}
                    <path
                      d={curve.pathData}
                      fill="none"
                      stroke={eq.enabled ? 'var(--accent-ai, #6366f1)' : '#64748b'}
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                {/* 3 Band Sliders */}
                <div className="flex flex-col gap-2 pt-1 font-mono text-xs">
                  {/* Low */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-14 shrink-0 font-bold text-emerald-400">Low (Bass)</span>
                    <input
                      type="range"
                      min={-15}
                      max={15}
                      step={0.5}
                      value={eq.low.gainDb}
                      disabled={!eq.enabled}
                      onChange={(e) =>
                        patchEq({
                          low: { ...eq.low, gainDb: Number(e.target.value) },
                        })
                      }
                      className="flex-1 accent-emerald-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {eq.low.gainDb > 0 ? `+${eq.low.gainDb.toFixed(1)}` : eq.low.gainDb.toFixed(1)}dB
                    </span>
                  </label>

                  {/* Mid */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-14 shrink-0 font-bold text-amber-400">Mid (Voice)</span>
                    <input
                      type="range"
                      min={-15}
                      max={15}
                      step={0.5}
                      value={eq.mid.gainDb}
                      disabled={!eq.enabled}
                      onChange={(e) =>
                        patchEq({
                          mid: { ...eq.mid, gainDb: Number(e.target.value) },
                        })
                      }
                      className="flex-1 accent-amber-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {eq.mid.gainDb > 0 ? `+${eq.mid.gainDb.toFixed(1)}` : eq.mid.gainDb.toFixed(1)}dB
                    </span>
                  </label>

                  {/* High */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-14 shrink-0 font-bold text-cyan-400">High (Air)</span>
                    <input
                      type="range"
                      min={-15}
                      max={15}
                      step={0.5}
                      value={eq.high.gainDb}
                      disabled={!eq.enabled}
                      onChange={(e) =>
                        patchEq({
                          high: { ...eq.high, gainDb: Number(e.target.value) },
                        })
                      }
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {eq.high.gainDb > 0 ? `+${eq.high.gainDb.toFixed(1)}` : eq.high.gainDb.toFixed(1)}dB
                    </span>
                  </label>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S36 — Clip Dynamics (Compressor & Limiter) */}
      {currentTab === 'audio' && carriesSound ? (
        <Section title="Dynamics (Compressor & Limiter)">
          {(() => {
            const comp = clip.effects?.compressor ?? DEFAULT_COMPRESSOR_SETTINGS;
            const patchComp = (patch: Partial<AudioCompressorSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  compressor: {
                    ...comp,
                    ...patch,
                  },
                },
              });
            };
            const curve = sampleCompressorCurvePoints(comp, 260, 60, 30);

            return (
              <div className="flex flex-col gap-2.5">
                {/* Enable Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={comp.enabled}
                      label="Enable Dynamics Compressor"
                      onChange={() => patchComp({ enabled: !comp.enabled })}
                    />
                    <span className="font-medium">{comp.enabled ? 'Compressor Active' : 'Bypassed'}</span>
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-text-disabled hover:text-text-primary px-1.5"
                    onClick={() => patchComp(DEFAULT_COMPRESSOR_SETTINGS)}
                  >
                    Reset
                  </Button>
                </div>

                {/* Studio Presets */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono text-text-disabled uppercase">Studio Presets</span>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(COMPRESSOR_PRESETS) as CompressorPresetKey[]).map((key) => {
                      const p = COMPRESSOR_PRESETS[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => patchComp(p.settings)}
                          className="rounded px-1.5 py-0.5 text-[10px] bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors font-mono"
                          title={p.description}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mini SVG Transfer Characteristic Curve */}
                <div className="flex flex-col items-center pt-1">
                  <svg
                    width="260"
                    height="60"
                    viewBox="0 0 260 60"
                    className="rounded border border-hairline bg-black/80 overflow-hidden"
                  >
                    <line x1="0" y1="60" x2="260" y2="0" stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                    {comp.enabled && (
                      <line
                        x1={((comp.threshold - -60) / 60) * 260}
                        y1="0"
                        x2={((comp.threshold - -60) / 60) * 260}
                        y2="60"
                        stroke="rgba(251,191,36,0.3)"
                        strokeDasharray="2 2"
                      />
                    )}
                    <path
                      d={`M ${curve.map((p) => `${p.x},${p.y}`).join(' L ')}`}
                      fill="none"
                      stroke={comp.enabled ? '#fbbf24' : '#64748b'}
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                    <text x="6" y="12" fill="#64748b" fontSize="7" fontFamily="monospace">0 dB</text>
                    <text x="6" y="54" fill="#64748b" fontSize="7" fontFamily="monospace">-60 dB</text>
                    <text x="254" y="54" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="end">In/Out</text>
                  </svg>
                </div>

                {/* Compressor Sliders */}
                <div className="flex flex-col gap-2 pt-1 font-mono text-xs">
                  {/* Threshold */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-amber-400">Threshold</span>
                    <input
                      type="range"
                      min={-60}
                      max={0}
                      step={1}
                      value={comp.threshold}
                      disabled={!comp.enabled}
                      onChange={(e) => patchComp({ threshold: Number(e.target.value) })}
                      className="flex-1 accent-amber-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">{comp.threshold} dB</span>
                  </label>

                  {/* Ratio */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-amber-400">Ratio</span>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={0.5}
                      value={comp.ratio}
                      disabled={!comp.enabled}
                      onChange={(e) => patchComp({ ratio: Number(e.target.value) })}
                      className="flex-1 accent-amber-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">{comp.ratio}:1</span>
                  </label>

                  {/* Makeup Gain */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-amber-400">Makeup</span>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={0.5}
                      value={comp.makeupGain}
                      disabled={!comp.enabled}
                      onChange={(e) => patchComp({ makeupGain: Number(e.target.value) })}
                      className="flex-1 accent-amber-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">+{comp.makeupGain.toFixed(1)} dB</span>
                  </label>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S41 — Spatial Acoustics & Reverb */}
      {currentTab === 'audio' && carriesSound ? (
        <Section title="Spatial Acoustics & Reverb">
          {(() => {
            const reverb = clip.effects?.reverb ?? DEFAULT_REVERB_SETTINGS;
            const patchReverb = (patch: Partial<AudioReverbSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  reverb: {
                    ...reverb,
                    ...patch,
                  },
                },
              });
            };

            return (
              <div className="flex flex-col gap-2.5">
                {/* Enable Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={reverb.enabled}
                      label="Enable Spatial Reverb"
                      onChange={() => patchReverb({ enabled: !reverb.enabled })}
                    />
                    <span className="font-medium">
                      {reverb.enabled ? 'Reverb Active' : 'Reverb Bypassed'}
                    </span>
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-text-disabled hover:text-text-primary px-1.5"
                    onClick={() => patchReverb(DEFAULT_REVERB_SETTINGS)}
                  >
                    Reset
                  </Button>
                </div>

                {/* Reverb Presets */}
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {Object.entries(REVERB_PRESETS).map(([pKey, preset]) => (
                    <button
                      key={pKey}
                      type="button"
                      onClick={() => patchReverb(preset.settings)}
                      className="rounded px-1.5 py-0.5 bg-bg-app border border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                      title={preset.description}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                {/* Space Selector */}
                <div className="flex flex-col gap-1 text-xs text-text-secondary">
                  <span className="font-medium text-text-disabled">Acoustic Space</span>
                  <Select
                    aria-label="Acoustic space"
                    value={reverb.space}
                    disabled={!reverb.enabled}
                    onChange={(val) => {
                      const sp = val as ReverbSpaceType;
                      const def = REVERB_SPACES.find((s) => s.space === sp);
                      patchReverb({
                        space: sp,
                        decaySeconds: def?.defaultDecay ?? reverb.decaySeconds,
                      });
                    }}
                    options={REVERB_SPACES.map((s) => ({
                      value: s.space,
                      label: `${s.label} (${s.category})`,
                    }))}
                  />
                  <span className="text-[10px] text-text-disabled italic">
                    {REVERB_SPACES.find((s) => s.space === reverb.space)?.description}
                  </span>
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-2 pt-1 font-mono text-xs">
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-cyan-400">Wet Mix</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={reverb.wetLevel}
                      disabled={!reverb.enabled}
                      onChange={(e) => patchReverb({ wetLevel: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {Math.round(reverb.wetLevel * 100)}%
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-cyan-400">Dry Signal</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={reverb.dryLevel}
                      disabled={!reverb.enabled}
                      onChange={(e) => patchReverb({ dryLevel: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {Math.round(reverb.dryLevel * 100)}%
                    </span>
                  </label>

                  {/* Decay Time */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-cyan-400">Decay</span>
                    <input
                      type="range"
                      min={0.2}
                      max={8.0}
                      step={0.1}
                      value={reverb.decaySeconds}
                      disabled={!reverb.enabled}
                      onChange={(e) => patchReverb({ decaySeconds: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {reverb.decaySeconds.toFixed(1)}s
                    </span>
                  </label>

                  {/* Pre-Delay */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-cyan-400">Pre-Delay</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={reverb.preDelayMs}
                      disabled={!reverb.enabled}
                      onChange={(e) => patchReverb({ preDelayMs: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {reverb.preDelayMs}ms
                    </span>
                  </label>

                  {/* High Damping */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-cyan-400">Damping</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={reverb.highDamping}
                      disabled={!reverb.enabled}
                      onChange={(e) => patchReverb({ highDamping: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {Math.round(reverb.highDamping * 100)}%
                    </span>
                  </label>

                  {/* For delay space: Echo delay time and feedback */}
                  {reverb.space === 'delay' && (
                    <>
                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 font-bold text-amber-400">Echo Delay</span>
                        <input
                          type="range"
                          min={20}
                          max={800}
                          step={10}
                          value={reverb.echoDelayMs ?? 250}
                          disabled={!reverb.enabled}
                          onChange={(e) => patchReverb({ echoDelayMs: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer disabled:opacity-50"
                        />
                        <span className="w-12 text-right text-text-primary">
                          {reverb.echoDelayMs ?? 250}ms
                        </span>
                      </label>

                      <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                        <span className="w-16 shrink-0 font-bold text-amber-400">Feedback</span>
                        <input
                          type="range"
                          min={0}
                          max={0.85}
                          step={0.05}
                          value={reverb.echoFeedback ?? 0.35}
                          disabled={!reverb.enabled}
                          onChange={(e) => patchReverb({ echoFeedback: Number(e.target.value) })}
                          className="flex-1 accent-amber-400 h-1.5 cursor-pointer disabled:opacity-50"
                        />
                        <span className="w-12 text-right text-text-primary">
                          {Math.round((reverb.echoFeedback ?? 0.35) * 100)}%
                        </span>
                      </label>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S45 — Audio Noise Gate & Dialogue Cleaning */}
      {currentTab === 'audio' && carriesSound ? (
        <Section title="Noise Gate & Dialogue Cleaning">
          {(() => {
            const gate = clip.effects?.noiseGate ?? DEFAULT_NOISE_GATE_SETTINGS;
            const patchGate = (patch: Partial<ClipNoiseGateSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  noiseGate: {
                    ...gate,
                    ...patch,
                  },
                },
              });
            };
            const curve = sampleGateCurvePoints(gate, 260, 60);

            return (
              <div className="flex flex-col gap-2.5">
                {/* Enable Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={gate.enabled}
                      label="Enable Noise Gate"
                      onChange={() => patchGate({ enabled: !gate.enabled })}
                    />
                    <span className="font-medium">
                      {gate.enabled ? 'Gate Active' : 'Gate Bypassed'}
                    </span>
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-text-disabled hover:text-text-primary px-1.5"
                    onClick={() => patchGate(DEFAULT_NOISE_GATE_SETTINGS)}
                  >
                    Reset
                  </Button>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  {(Object.keys(NOISE_GATE_PRESETS) as NoiseGatePresetKey[]).map((pKey) => {
                    const preset = NOISE_GATE_PRESETS[pKey];
                    return (
                      <button
                        key={pKey}
                        type="button"
                        onClick={() => patchGate({ ...preset.settings, enabled: true })}
                        title={preset.description}
                        className="px-2 py-0.5 rounded border border-hairline bg-bg-app text-text-secondary hover:text-text-primary hover:border-amber-400/50 transition-colors"
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* SVG Visualizer Curve */}
                <div className="relative w-full h-[60px] bg-bg-app rounded border border-hairline overflow-hidden select-none">
                  <svg viewBox="0 0 260 60" className="w-full h-full">
                    {/* Grid lines */}
                    <line x1="0" y1="30" x2="260" y2="30" stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" />
                    <line x1="130" y1="0" x2="130" y2="60" stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" />

                    {/* Linear unity reference (diagonal) */}
                    <line x1="0" y1="60" x2="260" y2="0" stroke="#475569" strokeWidth="0.75" strokeDasharray="3 3" />

                    {/* Threshold vertical line */}
                    {gate.enabled && (
                      <line
                        x1={((gate.threshold - -60) / 60) * 260}
                        y1="0"
                        x2={((gate.threshold - -60) / 60) * 260}
                        y2="60"
                        stroke="rgba(245,158,11,0.4)"
                        strokeDasharray="2 2"
                      />
                    )}

                    {/* Gate Transfer Curve */}
                    <path
                      d={`M ${curve.map((p) => `${p.x},${p.y}`).join(' L ')}`}
                      fill="none"
                      stroke={gate.enabled ? '#f59e0b' : '#64748b'}
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                    <text x="6" y="12" fill="#64748b" fontSize="7" fontFamily="monospace">0 dB</text>
                    <text x="6" y="54" fill="#64748b" fontSize="7" fontFamily="monospace">-60 dB</text>
                    <text x="254" y="54" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="end">In/Out</text>
                  </svg>
                </div>

                {/* Gate Primary Sliders */}
                <div className="flex flex-col gap-2 pt-1 font-mono text-xs">
                  {/* Threshold */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-amber-500">Threshold</span>
                    <input
                      type="range"
                      min={-60}
                      max={0}
                      step={1}
                      value={gate.threshold}
                      disabled={!gate.enabled}
                      onChange={(e) => patchGate({ threshold: Number(e.target.value) })}
                      className="flex-1 accent-amber-500 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">{gate.threshold} dB</span>
                  </label>

                  {/* Ratio / Steepness */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-amber-500">Ratio</span>
                    <input
                      type="range"
                      min={1}
                      max={16}
                      step={0.5}
                      value={gate.ratio}
                      disabled={!gate.enabled}
                      onChange={(e) => patchGate({ ratio: Number(e.target.value) })}
                      className="flex-1 accent-amber-500 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">
                      {gate.ratio >= 12 ? 'Hard' : `${gate.ratio}:1`}
                    </span>
                  </label>

                  {/* Range / Attenuation Floor */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-amber-500">Floor</span>
                    <input
                      type="range"
                      min={-80}
                      max={-6}
                      step={2}
                      value={gate.rangeDb}
                      disabled={!gate.enabled}
                      onChange={(e) => patchGate({ rangeDb: Number(e.target.value) })}
                      className="flex-1 accent-amber-500 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">{gate.rangeDb} dB</span>
                  </label>

                  {/* Attack Time */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-amber-500">Attack</span>
                    <input
                      type="range"
                      min={0.5}
                      max={30}
                      step={0.5}
                      value={gate.attackMs}
                      disabled={!gate.enabled}
                      onChange={(e) => patchGate({ attackMs: Number(e.target.value) })}
                      className="flex-1 accent-amber-500 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">{gate.attackMs}ms</span>
                  </label>

                  {/* Release Time */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 font-bold text-amber-500">Release</span>
                    <input
                      type="range"
                      min={20}
                      max={600}
                      step={10}
                      value={gate.releaseMs}
                      disabled={!gate.enabled}
                      onChange={(e) => patchGate({ releaseMs: Number(e.target.value) })}
                      className="flex-1 accent-amber-500 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-12 text-right text-text-primary">{gate.releaseMs}ms</span>
                  </label>
                </div>

                {/* De-Esser & De-Hummer Advanced Tools */}
                <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gate.deEsserEnabled}
                        disabled={!gate.enabled}
                        onChange={(e) => patchGate({ deEsserEnabled: e.target.checked })}
                        className="accent-amber-500"
                      />
                      <span>Vocal De-Esser</span>
                    </label>

                    {gate.deEsserEnabled && (
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-text-disabled">Cut:</span>
                        <span className="text-amber-400">-{gate.deEsserAmount} dB</span>
                      </div>
                    )}
                  </div>

                  {gate.deEsserEnabled && (
                    <label className="flex items-center gap-2 text-text-secondary text-[11px] font-mono">
                      <span className="w-16 shrink-0 text-text-disabled">Freq</span>
                      <input
                        type="range"
                        min={4000}
                        max={9000}
                        step={250}
                        value={gate.deEsserFreq}
                        disabled={!gate.enabled}
                        onChange={(e) => patchGate({ deEsserFreq: Number(e.target.value) })}
                        className="flex-1 accent-amber-500 h-1.5 cursor-pointer"
                      />
                      <span className="w-12 text-right text-text-primary">{gate.deEsserFreq}Hz</span>
                    </label>
                  )}

                  {/* Mains De-Hummer */}
                  <div className="flex items-center justify-between text-xs text-text-secondary pt-1">
                    <span>AC Mains De-Hummer</span>
                    <div className="flex items-center gap-1 text-[10px]">
                      {(['off', '50hz', '60hz'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          disabled={!gate.enabled}
                          onClick={() => patchGate({ deHummerMode: mode })}
                          className={`px-2 py-0.5 rounded border transition-all ${
                            gate.deHummerMode === mode
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                              : 'bg-bg-app text-text-disabled border-hairline hover:text-text-primary'
                          } disabled:opacity-40`}
                        >
                          {mode === 'off' ? 'Off' : mode.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S44 — Audio Beat & Rhythm Transient Detection */}
      {currentTab === 'audio' && carriesSound ? (
        <BeatDetectionSection clip={clip} document={document} fps={fps} />
      ) : null}

      {/* S49 — Clip Pitch Shifter & Voice Effects */}
      {currentTab === 'audio' && carriesSound ? (
        <Section title="Pitch Shifter & Voice Effects">
          {(() => {
            const pitch = clip.effects?.pitch ?? DEFAULT_AUDIO_PITCH_SETTINGS;
            const patchPitch = (patch: Partial<AudioPitchSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  pitch: {
                    ...pitch,
                    ...patch,
                  },
                },
              });
            };

            const ratio = calculatePitchRatio(pitch.semitones, pitch.cents);

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={pitch.enabled}
                      label="Enable Pitch Shifter"
                      onChange={() => patchPitch({ enabled: !pitch.enabled })}
                    />
                    <span className="font-medium">
                      {pitch.enabled ? 'Pitch Shift Active' : 'Pitch Bypassed'}
                    </span>
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-text-disabled hover:text-text-primary px-1.5"
                    onClick={() => patchPitch(DEFAULT_AUDIO_PITCH_SETTINGS)}
                  >
                    Reset
                  </Button>
                </div>

                {/* Creative Voice Presets */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider">
                    Creative Voice Presets
                  </span>
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    {(Object.keys(VOICE_EFFECT_PRESETS) as VoiceEffectPresetKey[]).map((pKey) => {
                      const preset = VOICE_EFFECT_PRESETS[pKey];
                      const isSelected = pitch.preset === pKey;
                      return (
                        <button
                          key={pKey}
                          type="button"
                          onClick={() => patchPitch(preset.settings)}
                          className={`rounded px-2 py-1 border transition-colors ${
                            isSelected
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 font-bold'
                              : 'bg-bg-app border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                          }`}
                          title={preset.description}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pitch Knobs & Readouts */}
                <div className="flex flex-col gap-2 pt-1 font-mono text-xs">
                  {/* Semitones */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-18 shrink-0 text-text-disabled">Semitones</span>
                    <input
                      type="range"
                      min={-24}
                      max={24}
                      step={1}
                      value={pitch.semitones}
                      disabled={!pitch.enabled}
                      onChange={(e) => patchPitch({ semitones: Number(e.target.value) })}
                      className="flex-1 accent-purple-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-14 text-right text-text-primary">
                      {pitch.semitones > 0 ? `+${pitch.semitones}` : pitch.semitones} st
                    </span>
                  </label>

                  {/* Cents Fine Tune */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-18 shrink-0 text-text-disabled">Fine Tune</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      value={pitch.cents}
                      disabled={!pitch.enabled}
                      onChange={(e) => patchPitch({ cents: Number(e.target.value) })}
                      className="flex-1 accent-purple-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-14 text-right text-text-primary">
                      {pitch.cents > 0 ? `+${pitch.cents}` : pitch.cents} ct
                    </span>
                  </label>

                  {/* Ratio Readout */}
                  <div className="flex items-center justify-between text-[11px] text-text-secondary pt-0.5">
                    <span className="text-text-disabled">Pitch Ratio</span>
                    <span className="font-mono text-purple-300">
                      {ratio.toFixed(4)}x ({((ratio - 1) * 100 > 0 ? '+' : '') + ((ratio - 1) * 100).toFixed(1)}%)
                    </span>
                  </div>

                  {/* Formant Preservation Toggle */}
                  <div className="flex items-center justify-between pt-1 border-t border-hairline/40 text-xs">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pitch.preserveFormants}
                        disabled={!pitch.enabled}
                        onChange={(e) => patchPitch({ preserveFormants: e.target.checked })}
                        className="accent-purple-400"
                      />
                      <span>Preserve Vocal Formants</span>
                    </label>
                    <span className="text-[10px] text-text-disabled">
                      {pitch.preserveFormants ? 'Natural Speech' : 'Chipmunk / Giant'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S50 — Stereo Audio Panner & 3D Spatial Audio */}
      {currentTab === 'audio' && carriesSound ? (
        <Section title="Stereo Panner & 3D Spatial Audio">
          {(() => {
            const panSettings = clip.effects?.pan ?? DEFAULT_AUDIO_PAN_SETTINGS;
            const patchPan = (patch: Partial<AudioPanSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  pan: {
                    ...panSettings,
                    ...patch,
                  },
                },
              });
            };

            const patchSpatial = (patch: Partial<typeof panSettings.spatial3d>) => {
              patchPan({ spatial3d: { ...panSettings.spatial3d, ...patch } });
            };

            const gains = calculateEqualPowerPanGains(panSettings.pan, panSettings.law);

            // 2D/3D Radar puck coordinate calculation
            const radarW = 200;
            const radarH = 120;
            const centerX = radarW / 2;
            const centerY = radarH / 2;
            const radius = 45;

            // When in 3D mode, derive puck from azimuth and distance
            // When in stereo mode, derive puck from horizontal pan
            let puckX = centerX + panSettings.pan * radius;
            let puckY = centerY;

            if (panSettings.spatial3d.enabled) {
              const azRad = (panSettings.spatial3d.azimuthDeg * Math.PI) / 180;
              const distScale = Math.min(1.0, panSettings.spatial3d.distance / 2.5);
              puckX = centerX + Math.sin(azRad) * (radius * distScale);
              puckY = centerY - Math.cos(azRad) * (radius * distScale);
            }

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={panSettings.enabled}
                      label="Enable Audio Panner"
                      onChange={() => patchPan({ enabled: !panSettings.enabled })}
                    />
                    <span className="font-medium">
                      {panSettings.enabled ? 'Panner Active' : 'Panner Bypassed'}
                    </span>
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-text-disabled hover:text-text-primary px-1.5"
                    onClick={() => patchPan(DEFAULT_AUDIO_PAN_SETTINGS)}
                  >
                    Reset
                  </Button>
                </div>

                {/* Spatial Presets */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider">
                    Spatial Presets
                  </span>
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    {(Object.keys(PAN_PRESETS) as PanPresetKey[]).map((pKey) => {
                      const preset = PAN_PRESETS[pKey];
                      const isSelected = panSettings.preset === pKey;
                      return (
                        <button
                          key={pKey}
                          type="button"
                          onClick={() => patchPan(preset.settings)}
                          className={`rounded px-2 py-1 border transition-colors ${
                            isSelected
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                              : 'bg-bg-app border-hairline text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                          }`}
                          title={preset.description}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Circular Radar HUD Visualizer */}
                <div className="flex flex-col items-center">
                  <svg
                    width={radarW}
                    height={radarH}
                    viewBox={`0 0 ${radarW} ${radarH}`}
                    className="rounded border border-hairline bg-black/80 overflow-hidden w-full"
                  >
                    {/* Concentric distance rings */}
                    <circle cx={centerX} cy={centerY} r={radius * 0.33} stroke="rgba(255,255,255,0.06)" fill="none" />
                    <circle cx={centerX} cy={centerY} r={radius * 0.66} stroke="rgba(255,255,255,0.08)" fill="none" />
                    <circle cx={centerX} cy={centerY} r={radius} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" fill="none" />

                    {/* Crosshair Axes */}
                    <line x1={centerX - radius} y1={centerY} x2={centerX + radius} y2={centerY} stroke="rgba(255,255,255,0.12)" />
                    <line x1={centerX} y1={centerY - radius} x2={centerX} y2={centerY + radius} stroke="rgba(255,255,255,0.12)" />

                    {/* Head / Listener Icon at center */}
                    <circle cx={centerX} cy={centerY} r="5" fill="#334155" stroke="#64748b" strokeWidth="1.5" />
                    <polygon
                      points={`${centerX},${centerY - 8} ${centerX - 3},${centerY - 3} ${centerX + 3},${centerY - 3}`}
                      fill="#64748b"
                    />

                    {/* Left & Right Labels */}
                    <text x={centerX - radius - 8} y={centerY + 3} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">L</text>
                    <text x={centerX + radius + 8} y={centerY + 3} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="start">R</text>
                    <text x={centerX} y={centerY - radius - 5} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">FRONT</text>

                    {/* Active Sound Puck */}
                    {panSettings.enabled && (
                      <>
                        <line
                          x1={centerX}
                          y1={centerY}
                          x2={puckX}
                          y2={puckY}
                          stroke="#22d3ee"
                          strokeWidth="1.5"
                          strokeDasharray="2 2"
                        />
                        <circle
                          cx={puckX}
                          cy={puckY}
                          r="6.5"
                          fill="#06b6d4"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          className="shadow-sm transition-all"
                        />
                      </>
                    )}
                  </svg>
                </div>

                {/* Stereo Pan Slider */}
                <div className="flex flex-col gap-2 font-mono text-xs">
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-16 shrink-0 text-text-disabled">Stereo Pan</span>
                    <input
                      type="range"
                      min={-1.0}
                      max={1.0}
                      step={0.05}
                      value={panSettings.pan}
                      disabled={!panSettings.enabled}
                      onChange={(e) => patchPan({ pan: Number(e.target.value) })}
                      className="flex-1 accent-cyan-400 h-1.5 cursor-pointer disabled:opacity-50"
                    />
                    <span className="w-16 text-right text-text-primary">
                      {panSettings.pan === 0
                        ? 'Center'
                        : panSettings.pan < 0
                          ? `L${Math.round(Math.abs(panSettings.pan) * 100)}`
                          : `R${Math.round(panSettings.pan * 100)}`}
                    </span>
                  </label>

                  {/* Equal-power Gain Coefficients */}
                  <div className="flex items-center justify-between text-[11px] text-text-secondary px-1">
                    <span className="text-text-disabled">Channel Energy</span>
                    <span className="font-mono text-cyan-300">
                      L: {Math.round(gains.gainL * 100)}% · R: {Math.round(gains.gainR * 100)}%
                    </span>
                  </div>

                  {/* Pan Law Selection */}
                  <div className="flex items-center justify-between text-[11px] text-text-secondary pt-1 border-t border-hairline/40">
                    <span className="text-text-disabled">Pan Law</span>
                    <select
                      value={panSettings.law}
                      disabled={!panSettings.enabled}
                      onChange={(e) => patchPan({ law: e.target.value as PanLawType })}
                      className="bg-bg-surface border border-hairline rounded px-1.5 py-0.5 text-[10px] text-text-primary"
                    >
                      <option value="equal_power_3db">Equal Power (-3.0 dB)</option>
                      <option value="equal_power_4_5db">Equal Power (-4.5 dB)</option>
                      <option value="linear_6db">Linear (-6.0 dB)</option>
                    </select>
                  </div>

                  {/* 3D Spatial Audio Sub-Section */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-hairline/40">
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={panSettings.spatial3d.enabled}
                          disabled={!panSettings.enabled}
                          onChange={(e) => patchSpatial({ enabled: e.target.checked })}
                          className="accent-cyan-400"
                        />
                        <span className="font-semibold text-text-primary">Binaural 3D Spatializer</span>
                      </label>
                      {panSettings.spatial3d.enabled && (
                        <span className="text-[10px] font-mono text-cyan-400">
                          {panSettings.spatial3d.azimuthDeg}° / {panSettings.spatial3d.elevationDeg}°
                        </span>
                      )}
                    </div>

                    {panSettings.spatial3d.enabled && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        {/* Azimuth */}
                        <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                          <span className="w-16 shrink-0 text-text-disabled">Azimuth</span>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            step={5}
                            value={panSettings.spatial3d.azimuthDeg}
                            disabled={!panSettings.enabled}
                            onChange={(e) => patchSpatial({ azimuthDeg: Number(e.target.value) })}
                            className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                          />
                          <span className="w-14 text-right text-text-primary">
                            {panSettings.spatial3d.azimuthDeg}°
                          </span>
                        </label>

                        {/* Elevation */}
                        <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                          <span className="w-16 shrink-0 text-text-disabled">Elevation</span>
                          <input
                            type="range"
                            min={-90}
                            max={90}
                            step={5}
                            value={panSettings.spatial3d.elevationDeg}
                            disabled={!panSettings.enabled}
                            onChange={(e) => patchSpatial({ elevationDeg: Number(e.target.value) })}
                            className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                          />
                          <span className="w-14 text-right text-text-primary">
                            {panSettings.spatial3d.elevationDeg > 0 ? `+${panSettings.spatial3d.elevationDeg}°` : `${panSettings.spatial3d.elevationDeg}°`}
                          </span>
                        </label>

                        {/* Distance */}
                        <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                          <span className="w-16 shrink-0 text-text-disabled">Distance</span>
                          <input
                            type="range"
                            min={0.2}
                            max={6.0}
                            step={0.1}
                            value={panSettings.spatial3d.distance}
                            disabled={!panSettings.enabled}
                            onChange={(e) => patchSpatial({ distance: Number(e.target.value) })}
                            className="flex-1 accent-cyan-400 h-1.5 cursor-pointer"
                          />
                          <span className="w-14 text-right text-text-primary">
                            {panSettings.spatial3d.distance.toFixed(1)}m
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S53 — AI Audio Vocal Isolation & Dialogue Enhancer */}
      {currentTab === 'audio' && carriesSound ? (
        <Section title="AI Vocal Isolation & Dialogue Enhancer">
          {(() => {
            const isolation = clip.effects?.audioIsolation ?? DEFAULT_AUDIO_ISOLATION_SETTINGS;
            const patchIsolation = (patch: Partial<AudioIsolationSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  audioIsolation: {
                    ...isolation,
                    ...patch,
                  },
                },
              });
            };

            const applyPreset = (key: AudioIsolationPresetKey) => {
              const preset = AUDIO_ISOLATION_PRESETS[key];
              if (!preset) return;
              patchIsolation({
                ...preset.settings,
                enabled: true,
                preset: key,
              });
            };

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={isolation.enabled}
                      label="Enable Vocal Isolation"
                      onChange={() => patchIsolation({ enabled: !isolation.enabled })}
                    />
                    <span className="font-medium">
                      {isolation.enabled ? 'Isolation Active' : 'Isolation Bypassed'}
                    </span>
                  </label>

                  {isolation.enabled && (
                    <button
                      type="button"
                      onClick={() => patchClip(clip.id, { effects: { ...clip.effects, audioIsolation: undefined } })}
                      className="text-[11px] text-text-disabled hover:text-text-primary"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Studio Presets */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-secondary font-medium">Studio Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(AUDIO_ISOLATION_PRESETS) as AudioIsolationPresetKey[]).map((key) => {
                      const p = AUDIO_ISOLATION_PRESETS[key];
                      const active = isolation.preset === key && isolation.enabled;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(key)}
                          className={`rounded px-2 py-1 text-left text-[11px] border transition-colors ${
                            active
                              ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-medium'
                              : 'bg-bg-surface border-hairline hover:border-hairline-strong text-text-secondary hover:text-text-primary'
                          }`}
                          title={p.description}
                        >
                          <div className="truncate font-semibold">{p.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Isolation Mode */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-text-secondary font-medium">Processing Mode</span>
                    <span className="text-[10px] font-mono text-teal-400 capitalize">{isolation.mode.replace('_', ' ')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(['dialogue_enhance', 'vocal_isolate', 'instrumental_isolate', 'de_reverb'] as AudioIsolationMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => patchIsolation({ mode })}
                        disabled={!isolation.enabled}
                        className={`rounded px-1.5 py-1 text-center text-[10px] font-medium border transition-colors capitalize ${
                          isolation.mode === mode
                            ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                            : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                        } ${!isolation.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40 font-mono text-xs">
                  {/* Isolation Strength */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Strength</span>
                    <input
                      type="range"
                      min={0}
                      max={1.0}
                      step={0.05}
                      value={isolation.isolationStrength}
                      disabled={!isolation.enabled}
                      onChange={(e) => patchIsolation({ isolationStrength: Number(e.target.value) })}
                      className="flex-1 accent-teal-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {Math.round(isolation.isolationStrength * 100)}%
                    </span>
                  </label>

                  {/* Speech Clarity */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">Clarity</span>
                    <input
                      type="range"
                      min={0}
                      max={1.0}
                      step={0.05}
                      value={isolation.speechClarity}
                      disabled={!isolation.enabled}
                      onChange={(e) => patchIsolation({ speechClarity: Number(e.target.value) })}
                      className="flex-1 accent-teal-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {Math.round(isolation.speechClarity * 100)}%
                    </span>
                  </label>

                  {/* De-Reverb Amount */}
                  <label className="flex items-center gap-2 text-text-secondary text-[11px]">
                    <span className="w-20 shrink-0 text-text-disabled">De-Reverb</span>
                    <input
                      type="range"
                      min={0}
                      max={1.0}
                      step={0.05}
                      value={isolation.deReverbAmount}
                      disabled={!isolation.enabled}
                      onChange={(e) => patchIsolation({ deReverbAmount: Number(e.target.value) })}
                      className="flex-1 accent-teal-400 h-1.5 cursor-pointer"
                    />
                    <span className="w-10 text-right text-text-primary">
                      {Math.round(isolation.deReverbAmount * 100)}%
                    </span>
                  </label>

                  {/* Dialogue Leveler */}
                  <div className="flex items-center justify-between pt-1 border-t border-hairline/40 text-xs">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isolation.levelerEnabled}
                        disabled={!isolation.enabled}
                        onChange={(e) => patchIsolation({ levelerEnabled: e.target.checked })}
                        className="accent-teal-400"
                      />
                      <span className="font-semibold text-text-primary">Auto Dialogue Leveler</span>
                    </label>
                    {isolation.levelerEnabled && (
                      <span className="text-[10px] font-mono text-teal-300">
                        Target {isolation.targetLufs} LUFS
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}

      {/* S56 — Multiband Audio Denoiser, De-Clicker & Hum Removal */}
      {currentTab === 'audio' && carriesSound ? (
        <Section title="Multiband Audio Denoiser & De-Clicker">
          {(() => {
            const denoiser = clip.effects?.multibandDenoiser ?? DEFAULT_MULTIBAND_DENOISER_SETTINGS;
            const patchDenoiser = (patch: Partial<MultibandDenoiserSettings>) => {
              patchClip(clip.id, {
                effects: {
                  ...clip.effects,
                  multibandDenoiser: {
                    ...denoiser,
                    ...patch,
                  },
                },
              });
            };

            const applyPreset = (key: MultibandDenoiserPresetKey) => {
              const preset = MULTIBAND_DENOISER_PRESETS[key];
              if (!preset) return;
              patchDenoiser({
                ...preset.settings,
                enabled: true,
                preset: key,
              });
            };

            return (
              <div className="flex flex-col gap-3">
                {/* Master Switch & Reset */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <Switch
                      checked={denoiser.enabled}
                      label="Enable Multiband Denoiser"
                      onChange={() => patchDenoiser({ enabled: !denoiser.enabled })}
                    />
                    <span className="font-medium">
                      {denoiser.enabled ? 'Denoiser Active' : 'Denoiser Bypassed'}
                    </span>
                  </label>
                  {denoiser.enabled && (
                    <button
                      type="button"
                      onClick={() => patchClip(clip.id, { effects: { ...clip.effects, multibandDenoiser: undefined } })}
                      className="text-[11px] text-text-disabled hover:text-text-primary"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Studio Presets */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-secondary font-medium">Restoration Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(MULTIBAND_DENOISER_PRESETS) as MultibandDenoiserPresetKey[]).map((key) => {
                      const p = MULTIBAND_DENOISER_PRESETS[key];
                      const active = denoiser.preset === key && denoiser.enabled;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPreset(key)}
                          className={`rounded px-2 py-1 text-left text-[11px] border transition-colors ${
                            active
                              ? 'bg-accent-primary/15 border-accent-primary text-accent-primary font-medium'
                              : 'bg-bg-surface border-hairline hover:border-hairline-strong text-text-secondary hover:text-text-primary'
                          }`}
                          title={p.description}
                        >
                          <div className="truncate font-semibold">{p.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4-Band Spectral Faders */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40">
                  <span className="text-[11px] text-text-secondary font-medium">4-Band Spectral Reduction</span>
                  <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-[10px]">
                    {/* Low Band */}
                    <div className="flex flex-col items-center gap-1 bg-bg-surface p-1.5 rounded border border-hairline">
                      <span className="text-text-disabled">Low (&lt;250)</span>
                      <span className="text-emerald-400 font-semibold">{denoiser.lowBandReductionDb} dB</span>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={1}
                        value={denoiser.lowBandReductionDb}
                        disabled={!denoiser.enabled}
                        onChange={(e) => patchDenoiser({ lowBandReductionDb: Number(e.target.value) })}
                        className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                      />
                    </div>

                    {/* Low-Mid Band */}
                    <div className="flex flex-col items-center gap-1 bg-bg-surface p-1.5 rounded border border-hairline">
                      <span className="text-text-disabled">Lo-Mid (1k)</span>
                      <span className="text-emerald-400 font-semibold">{denoiser.lowMidBandReductionDb} dB</span>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={1}
                        value={denoiser.lowMidBandReductionDb}
                        disabled={!denoiser.enabled}
                        onChange={(e) => patchDenoiser({ lowMidBandReductionDb: Number(e.target.value) })}
                        className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                      />
                    </div>

                    {/* High-Mid Band */}
                    <div className="flex flex-col items-center gap-1 bg-bg-surface p-1.5 rounded border border-hairline">
                      <span className="text-text-disabled">Hi-Mid (4k)</span>
                      <span className="text-emerald-400 font-semibold">{denoiser.highMidBandReductionDb} dB</span>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={1}
                        value={denoiser.highMidBandReductionDb}
                        disabled={!denoiser.enabled}
                        onChange={(e) => patchDenoiser({ highMidBandReductionDb: Number(e.target.value) })}
                        className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                      />
                    </div>

                    {/* High Band */}
                    <div className="flex flex-col items-center gap-1 bg-bg-surface p-1.5 rounded border border-hairline">
                      <span className="text-text-disabled">High (&gt;4k)</span>
                      <span className="text-emerald-400 font-semibold">{denoiser.highBandReductionDb} dB</span>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={1}
                        value={denoiser.highBandReductionDb}
                        disabled={!denoiser.enabled}
                        onChange={(e) => patchDenoiser({ highBandReductionDb: Number(e.target.value) })}
                        className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* De-Clicker & De-Hummer Controls */}
                <div className="flex flex-col gap-2 pt-1 border-t border-hairline/40 text-xs">
                  {/* De-Clicker Toggle & Sensitivity */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={denoiser.deClickEnabled}
                        disabled={!denoiser.enabled}
                        onChange={(e) => patchDenoiser({ deClickEnabled: e.target.checked })}
                        className="accent-emerald-400"
                      />
                      <span className="font-semibold text-text-primary">Transient De-Clicker / De-Popper</span>
                    </label>
                    {denoiser.deClickEnabled && (
                      <span className="text-[10px] font-mono text-emerald-300">
                        Sens: {denoiser.deClickSensitivity}/10
                      </span>
                    )}
                  </div>

                  {denoiser.deClickEnabled && (
                    <label className="flex items-center gap-2 text-text-secondary text-[11px] font-mono">
                      <span className="w-20 shrink-0 text-text-disabled">Sensitivity</span>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={denoiser.deClickSensitivity}
                        disabled={!denoiser.enabled}
                        onChange={(e) => patchDenoiser({ deClickSensitivity: Number(e.target.value) })}
                        className="flex-1 accent-emerald-400 h-1.5 cursor-pointer"
                      />
                      <span className="w-8 text-right text-text-primary">
                        {denoiser.deClickSensitivity}
                      </span>
                    </label>
                  )}

                  {/* Harmonic Mains De-Hummer */}
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-hairline/40">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] text-text-secondary font-medium">Mains Ground De-Hummer</span>
                      <span className="text-[10px] font-mono text-emerald-400 uppercase">{denoiser.deHumMode.replace('_', ' ')}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['off', '50hz_mains', '60hz_mains'] as DeHumMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => patchDenoiser({ deHumMode: mode })}
                          disabled={!denoiser.enabled}
                          className={`rounded px-1.5 py-1 text-center text-[10px] font-medium border transition-colors ${
                            denoiser.deHumMode === mode
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                              : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                          } ${!denoiser.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {mode === 'off' ? 'Off' : mode === '50hz_mains' ? '50Hz (EU/UK)' : '60Hz (US)'}
                        </button>
                      ))}
                    </div>

                    {denoiser.deHumMode !== 'off' && (
                      <label className="flex items-center gap-2 text-text-secondary text-[11px] font-mono pt-1">
                        <span className="w-20 shrink-0 text-text-disabled">Harmonics</span>
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={1}
                          value={denoiser.deHumHarmonics}
                          disabled={!denoiser.enabled}
                          onChange={(e) => patchDenoiser({ deHumHarmonics: Number(e.target.value) })}
                          className="flex-1 accent-emerald-400 h-1.5 cursor-pointer"
                        />
                        <span className="w-8 text-right text-text-primary">
                          {denoiser.deHumHarmonics}x
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      ) : null}


    </div>
  );
});
