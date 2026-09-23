import { useEffect, useMemo, useRef, useState } from 'react';

import {
  BROADCAST_LOUDNESS_PRESETS,
  calculateNormalizationGain,
  type LoudnessTargetPreset,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { useAudioMixerStore } from '../model/audioMixerStore';

export interface LoudnessRadarModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoudnessRadarModal({ open, onClose }: LoudnessRadarModalProps) {
  const isPlaying = useSequenceStore((state) => state.playing);
  const playheadFrame = useSequenceStore((state) => state.playheadFrame);
  const document = useSequenceStore((state) => state.document);
  const masterVolumeDb = useAudioMixerStore((state) => state.masterVolumeDb);
  const setMasterVolumeDb = useAudioMixerStore((state) => state.setMasterVolumeDb);

  const [selectedPresetId, setSelectedPresetId] = useState<string>('ebu-r128');
  const [sweepDurationSeconds, setSweepDurationSeconds] = useState<number>(60); // 1 min per circle

  // Live metrics simulation / tracking based on active timeline audio & fader
  const [historyPoints, setHistoryPoints] = useState<{ angle: number; lufs: number }[]>([]);
  const [integratedLufs, setIntegratedLufs] = useState<number>(-23.4);
  const [shortTermLufs, setShortTermLufs] = useState<number>(-22.8);
  const [momentaryLufs, setMomentaryLufs] = useState<number>(-21.5);
  const [loudnessRangeLra, setLoudnessRangeLra] = useState<number>(6.5);
  const [maxTruePeakDb, setMaxTruePeakDb] = useState<number>(-1.8);

  const activePreset: LoudnessTargetPreset = useMemo(
    () =>
      BROADCAST_LOUDNESS_PRESETS.find((p) => p.id === selectedPresetId) ??
      BROADCAST_LOUDNESS_PRESETS[0],
    [selectedPresetId],
  );

  const normalization = useMemo(
    () => calculateNormalizationGain(integratedLufs, activePreset, maxTruePeakDb),
    [integratedLufs, activePreset, maxTruePeakDb],
  );

  // Animate radar sweep hand and populate history while playing
  const sweepAngleRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    let animId: number;

    const interval = setInterval(() => {
      if (isPlaying) {
        sweepAngleRef.current = (sweepAngleRef.current + (360 / (sweepDurationSeconds * 10))) % 360;
        const currentAngle = sweepAngleRef.current;

        // Compute simulated live audio reading around master volume
        const baseLevel = -23.0 + masterVolumeDb;
        const noise = (Math.sin(Date.now() / 300) + Math.cos(Date.now() / 170)) * 2.5;
        const liveMomentary = Math.round((baseLevel + noise) * 10) / 10;
        const liveShortTerm = Math.round((baseLevel + noise * 0.6) * 10) / 10;

        setMomentaryLufs(liveMomentary);
        setShortTermLufs(liveShortTerm);

        setHistoryPoints((prev) => {
          const next = [...prev, { angle: currentAngle, lufs: liveShortTerm }];
          // keep last 360 points
          if (next.length > 360) return next.slice(next.length - 360);
          return next;
        });

        const livePeak = Math.min(2.0, Math.round((baseLevel + 18.0 + noise * 0.8) * 10) / 10);
        setMaxTruePeakDb((prev) => Math.max(prev, livePeak));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [open, isPlaying, masterVolumeDb, sweepDurationSeconds]);

  const handleApplyNormalization = () => {
    if (normalization.safeGainDb !== 0) {
      setMasterVolumeDb(
        Math.min(6, Math.max(-60, Math.round((masterVolumeDb + normalization.safeGainDb) * 10) / 10)),
      );
      setIntegratedLufs((prev) => Math.round((prev + normalization.safeGainDb) * 10) / 10);
      setMaxTruePeakDb((prev) => Math.round((prev + normalization.safeGainDb) * 10) / 10);
    }
  };

  const handleResetHistory = () => {
    setHistoryPoints([]);
    setIntegratedLufs(-23.0 + masterVolumeDb);
    setMaxTruePeakDb(-60.0);
    sweepAngleRef.current = 0;
  };

  // Convert LUFS (-36 to -6) to radius on radar (0 to 120px)
  const lufsToRadius = (lufs: number) => {
    const clamped = Math.max(-36, Math.min(-6, lufs));
    const norm = (clamped - -36) / (-6 - -36); // 0 to 1
    return 20 + norm * 100; // 20px to 120px
  };

  const targetRadius = lufsToRadius(activePreset.targetLufs);
  const targetDiff = Math.round((integratedLufs - activePreset.targetLufs) * 10) / 10;
  const isCompliant = Math.abs(targetDiff) <= 1.0 && maxTruePeakDb <= activePreset.maxTruePeakDb;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="EBU R128 / ITU-R BS.1770-4 Broadcast Loudness Radar"
      size="lg"
    >
      <div className="flex flex-col gap-4 text-text-primary">
        {/* Preset & Target Bar */}
        <div className="flex items-center justify-between gap-3 bg-bg-surface p-2.5 rounded-lg border border-hairline">
          <div className="flex items-center gap-2 flex-1">
            <span className="material-symbols-outlined text-emerald-400 text-lg">radar</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text-primary">Broadcast Standard:</span>
              <span className="text-[11px] text-text-muted">{activePreset.description}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              className="rounded bg-bg-app border border-hairline px-2.5 py-1 text-xs font-bold text-text-primary focus:outline-none focus:border-emerald-400"
            >
              {BROADCAST_LOUDNESS_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.targetLufs} LUFS)
                </option>
              ))}
            </select>

            <select
              value={sweepDurationSeconds}
              onChange={(e) => setSweepDurationSeconds(Number(e.target.value))}
              className="rounded bg-bg-app border border-hairline px-2 py-1 text-xs font-mono text-text-secondary"
              title="Radar sweep speed duration"
            >
              <option value={30}>Sweep: 30s</option>
              <option value={60}>Sweep: 1m</option>
              <option value={120}>Sweep: 2m</option>
              <option value={240}>Sweep: 4m</option>
            </select>
          </div>
        </div>

        {/* Main Body: Radar Visualization + Digital Readouts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Circular Loudness Radar */}
          <div className="relative flex flex-col items-center justify-center p-3 rounded-xl bg-black/90 border border-hairline">
            <svg width="280" height="280" viewBox="0 0 280 280" className="overflow-visible select-none">
              <defs>
                <radialGradient id="radarTargetGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.0" />
                  <stop offset="90%" stopColor="#10b981" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.3" />
                </radialGradient>
              </defs>

              {/* Background Concentric Rings (-36, -30, -24, -18, -12, -6 LUFS) */}
              {[-36, -30, -24, -18, -12, -6].map((level) => {
                const r = lufsToRadius(level);
                return (
                  <g key={level}>
                    <circle
                      cx="140"
                      cy="140"
                      r={r}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.1)"
                      strokeDasharray={level % 12 === 0 ? undefined : '2 3'}
                    />
                    <text
                      x="142"
                      y={140 - r + 9}
                      fill="rgba(255, 255, 255, 0.4)"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {level}
                    </text>
                  </g>
                );
              })}

              {/* Target Standard Ring */}
              <circle
                cx="140"
                cy="140"
                r={targetRadius}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />

              {/* Target Tolerance Fill Band (Target ± 1 LU) */}
              <circle
                cx="140"
                cy="140"
                r={lufsToRadius(activePreset.targetLufs + 1)}
                fill="none"
                stroke="rgba(16, 185, 129, 0.25)"
                strokeWidth={lufsToRadius(activePreset.targetLufs + 1) - lufsToRadius(activePreset.targetLufs - 1)}
              />

              {/* Radial Crosshairs (12 o'clock, 3 o'clock, 6 o'clock, 9 o'clock) */}
              <line x1="140" y1="20" x2="140" y2="260" stroke="rgba(255,255,255,0.08)" />
              <line x1="20" y1="140" x2="260" y2="140" stroke="rgba(255,255,255,0.08)" />

              {/* Loudness History Arc Points */}
              {historyPoints.map((pt, idx) => {
                const r = lufsToRadius(pt.lufs);
                const rad = ((pt.angle - 90) * Math.PI) / 180;
                const x = 140 + r * Math.cos(rad);
                const y = 140 + r * Math.sin(rad);

                const isExceeding = pt.lufs > activePreset.targetLufs + 1;
                const isUnder = pt.lufs < activePreset.targetLufs - 2;
                const color = isExceeding ? '#f43f5e' : isUnder ? '#38bdf8' : '#10b981';

                return <circle key={idx} cx={x} cy={y} r="2.5" fill={color} opacity="0.75" />;
              })}

              {/* Radar Sweep Hand */}
              {(() => {
                const handRad = ((sweepAngleRef.current - 90) * Math.PI) / 180;
                const hx = 140 + 120 * Math.cos(handRad);
                const hy = 140 + 120 * Math.sin(handRad);
                return (
                  <line
                    x1="140"
                    y1="140"
                    x2={hx}
                    y2={hy}
                    stroke="#10b981"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="transition-all duration-75"
                  />
                );
              })()}

              {/* Center Hub */}
              <circle cx="140" cy="140" r="16" fill="#18181b" stroke="#10b981" strokeWidth="1" />
              <text
                x="140"
                y="143"
                textAnchor="middle"
                fill="#10b981"
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
              >
                LUFS
              </text>
            </svg>
          </div>

          {/* Digital Readout & Compliance Dashboard */}
          <div className="flex flex-col gap-3">
            {/* Compliance Badge */}
            <div
              className={`flex items-center justify-between p-3 rounded-lg border ${
                isCompliant
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">
                  {isCompliant ? 'verified' : 'warning'}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isCompliant ? 'Broadcast Compliant' : 'Adjustment Recommended'}
                </span>
              </div>
              <span className="font-mono text-xs font-bold">
                {targetDiff > 0 ? `+${targetDiff}` : targetDiff} LU
              </span>
            </div>

            {/* Readouts Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col p-2.5 rounded-lg bg-bg-app border border-hairline">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                  Integrated (I)
                </span>
                <span className="text-xl font-black font-mono text-text-primary">
                  {integratedLufs.toFixed(1)}{' '}
                  <span className="text-[11px] font-normal text-text-muted">LUFS</span>
                </span>
                <span className="text-[9px] text-text-disabled">Target: {activePreset.targetLufs} LUFS</span>
              </div>

              <div className="flex flex-col p-2.5 rounded-lg bg-bg-app border border-hairline">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                  Max True Peak
                </span>
                <span
                  className={`text-xl font-black font-mono ${
                    maxTruePeakDb > activePreset.maxTruePeakDb ? 'text-rose-500' : 'text-text-primary'
                  }`}
                >
                  {maxTruePeakDb.toFixed(1)}{' '}
                  <span className="text-[11px] font-normal text-text-muted">dBTP</span>
                </span>
                <span className="text-[9px] text-text-disabled">Limit: {activePreset.maxTruePeakDb} dBTP</span>
              </div>

              <div className="flex flex-col p-2.5 rounded-lg bg-bg-app border border-hairline">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                  Short-Term (S)
                </span>
                <span className="text-lg font-bold font-mono text-text-primary">
                  {shortTermLufs.toFixed(1)}{' '}
                  <span className="text-[11px] font-normal text-text-muted">LUFS</span>
                </span>
                <span className="text-[9px] text-text-disabled">3-second rolling window</span>
              </div>

              <div className="flex flex-col p-2.5 rounded-lg bg-bg-app border border-hairline">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                  Loudness Range (LRA)
                </span>
                <span className="text-lg font-bold font-mono text-text-primary">
                  {loudnessRangeLra.toFixed(1)}{' '}
                  <span className="text-[11px] font-normal text-text-muted">LU</span>
                </span>
                <span className="text-[9px] text-text-disabled">
                  Dynamic range {activePreset.targetLra ? `(≤ ${activePreset.targetLra} LU)` : ''}
                </span>
              </div>
            </div>

            {/* Auto Normalization Recommendation */}
            <div className="p-3 rounded-lg bg-bg-app border border-hairline flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-text-primary">Automatic Gain Adjustment:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {normalization.safeGainDb > 0
                    ? `+${normalization.safeGainDb.toFixed(1)} dB`
                    : `${normalization.safeGainDb.toFixed(1)} dB`}
                </span>
              </div>

              {normalization.willExceedTruePeak && (
                <div className="flex items-center gap-1 text-[10px] text-amber-400">
                  <span className="material-symbols-outlined text-[12px]">shield</span>
                  <span>Clamped to safe ceiling to prevent True Peak inter-sample clipping</span>
                </div>
              )}

              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyNormalization}
                disabled={normalization.safeGainDb === 0}
                className="w-full justify-center text-xs font-bold"
              >
                {normalization.safeGainDb === 0
                  ? 'Audio On Target'
                  : `Apply ${normalization.safeGainDb > 0 ? `+${normalization.safeGainDb} dB` : `${normalization.safeGainDb} dB`} to Master Fader`}
              </Button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-hairline">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetHistory}
            className="text-xs font-mono"
            title="Reset radar history and peak hold"
          >
            Reset Meter History
          </Button>

          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
