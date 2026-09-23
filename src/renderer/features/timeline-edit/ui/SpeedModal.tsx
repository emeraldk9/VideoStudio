import { useEffect, useMemo, useState } from 'react';

import {
  clipSpeed,
  formatTimecode,
  framesToSeconds,
  MAX_CLIP_SPEED,
  MIN_CLIP_SPEED,
  type SequenceClip,
  type SequenceDocument,
  SPEED_RAMP_PRESETS,
  DEFAULT_SPEED_RAMP_SETTINGS,
  sampleSpeedRampSvgPoints,
  calculateRampAverageSpeed,
  calculateRampedDuration,
  applyClipSpeedRamp,
  type SpeedRampSettings,
  type SpeedRampPresetKey,
} from '@shared';

import { applyClipSpeed, calculateSpeedDuration } from '../../../../shared/utils/timeline/speed-ops';
import { useSequenceStore } from '../../../entities/sequence';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Switch } from '../../../shared/ui/Switch';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl';

export interface SpeedModalProps {
  open: boolean;
  clip: SequenceClip | null;
  document: SequenceDocument;
  fps: number;
  onClose: () => void;
}

const CONSTANT_SPEED_PRESETS = [
  { label: '0.25×', value: 0.25, sub: 'Quarter' },
  { label: '0.5×', value: 0.5, sub: 'Half / Slow' },
  { label: '0.75×', value: 0.75, sub: 'Smooth' },
  { label: '1.0×', value: 1.0, sub: 'Normal' },
  { label: '1.25×', value: 1.25, sub: 'Brisk' },
  { label: '1.5×', value: 1.5, sub: 'Fast' },
  { label: '2.0×', value: 2.0, sub: 'Double' },
  { label: '4.0×', value: 4.0, sub: 'Timelapse' },
];

export function SpeedModal({ open, clip, document, fps, onClose }: SpeedModalProps) {
  const commitClips = useSequenceStore((state) => state.commitClips);

  const [mode, setMode] = useState<'constant' | 'curve'>('constant');

  const initialSpeed = clip ? clipSpeed(clip.effects) : 1;
  const [speed, setSpeed] = useState<number>(initialSpeed);
  const [rippleSequence, setRippleSequence] = useState<boolean>(true);

  // Speed Curve (Ramping) State
  const [speedRamp, setSpeedRamp] = useState<SpeedRampSettings>(
    clip?.effects?.speedRamp ?? DEFAULT_SPEED_RAMP_SETTINGS
  );
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(1);

  // Sync with clip when opened
  useEffect(() => {
    if (clip && open) {
      const hasCurve = Boolean(clip.effects?.speedRamp?.enabled);
      setMode(hasCurve ? 'curve' : 'constant');
      setSpeed(clipSpeed(clip.effects));
      setSpeedRamp(
        clip.effects?.speedRamp ?? {
          ...DEFAULT_SPEED_RAMP_SETTINGS,
          enabled: true,
        }
      );
      setRippleSequence(true);
      setSelectedPointIndex(1);
    }
  }, [clip, open]);

  const oldSpeed = clip ? clipSpeed(clip.effects) : 1;
  const originalDurationFrames = clip ? clip.durationFrames : 0;

  // Constant speed calculation
  const newDurationFramesConstant = useMemo(() => {
    if (!clip) return 0;
    if (!rippleSequence) return originalDurationFrames;
    return calculateSpeedDuration(originalDurationFrames, oldSpeed, speed);
  }, [clip, rippleSequence, originalDurationFrames, oldSpeed, speed]);

  // Curve average speed & duration calculation
  const avgRampSpeed = useMemo(() => {
    return calculateRampAverageSpeed(speedRamp);
  }, [speedRamp]);

  const newDurationFramesCurve = useMemo(() => {
    if (!clip) return 0;
    if (!rippleSequence) return originalDurationFrames;
    return calculateRampedDuration(originalDurationFrames, speedRamp);
  }, [clip, rippleSequence, originalDurationFrames, speedRamp]);

  const activeNewDuration = mode === 'constant' ? newDurationFramesConstant : newDurationFramesCurve;
  const deltaSeconds = framesToSeconds(activeNewDuration - originalDurationFrames, fps);

  // SVG Curve generation (width: 440, height: 100)
  const curveGeometry = useMemo(() => {
    return sampleSpeedRampSvgPoints(speedRamp, 440, 100, 80, 0.1, 5.0);
  }, [speedRamp]);

  const handleApply = () => {
    if (!clip || !document) return;

    if (mode === 'constant') {
      // Clear speedRamp and set constant speed
      const withoutRamp = document.clips.map((c) =>
        c.id === clip.id
          ? {
              ...c,
              effects: {
                ...c.effects,
                speedRamp: undefined,
              },
            }
          : c
      );
      const next = applyClipSpeed(withoutRamp, document.tracks, clip.id, speed, {
        rippleSequence,
      });
      commitClips(next);
    } else {
      // Apply speed ramp
      const next = applyClipSpeedRamp(document.clips, document.tracks, clip.id, {
        ...speedRamp,
        enabled: true,
        rippleSequence,
      });
      commitClips(next);
    }
    onClose();
  };

  const handlePresetSelect = (val: number) => {
    setSpeed(val);
  };

  const handleRampPresetSelect = (key: SpeedRampPresetKey) => {
    const preset = SPEED_RAMP_PRESETS[key];
    setSpeedRamp({
      enabled: true,
      points: preset.points,
      rippleSequence,
    });
    setSelectedPointIndex(Math.min(1, preset.points.length - 1));
  };

  const selectedPoint = speedRamp.points[selectedPointIndex] ?? speedRamp.points[0];

  const updateSelectedPointSpeed = (newSpeedVal: number) => {
    if (!selectedPoint) return;
    const clamped = Math.max(0.1, Math.min(5.0, newSpeedVal));
    const nextPoints = speedRamp.points.map((pt, idx) =>
      idx === selectedPointIndex ? { ...pt, speed: clamped } : pt
    );
    setSpeedRamp({
      ...speedRamp,
      points: nextPoints,
    });
  };

  if (!clip) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ai text-[20px]">speed</span>
          <span>Clip Speed & Retiming</span>
        </div>
      }
      subtitle={`Configure playback rate and velocity curves for ${clip.sourceKind} clip`}
    >
      <div className="flex flex-col gap-4 select-none">
        {/* Mode Switch: Constant Speed vs Speed Curve (Ramp) */}
        <SegmentedControl
          ariaLabel="Speed Mode"
          value={mode}
          onChange={(val) => setMode(val as 'constant' | 'curve')}
          options={[
            { value: 'constant', label: 'Constant Speed' },
            { value: 'curve', label: 'Speed Curve (Ramping)' },
          ]}
        />

        {mode === 'constant' ? (
          <>
            {/* Speed Multiplier HUD Display */}
            <div className="flex items-center justify-between rounded-xl border border-hairline bg-bg-app p-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block">
                  Speed Multiplier
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="font-mono text-3xl font-bold text-accent-ai">
                    {speed.toFixed(2)}×
                  </span>
                  <span className="text-xs text-text-secondary">
                    ({Math.round(speed * 100)}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSpeed(1.0)}
                  disabled={speed === 1.0}
                  className="rounded-md border border-hairline bg-bg-canvas px-2.5 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
                >
                  Reset 1×
                </button>
              </div>
            </div>

            {/* Continuous Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] text-text-secondary font-medium">
                <span>Slower ({MIN_CLIP_SPEED}×)</span>
                <span>Normal (1×)</span>
                <span>Faster ({MAX_CLIP_SPEED}×)</span>
              </div>
              <input
                type="range"
                min={MIN_CLIP_SPEED}
                max={MAX_CLIP_SPEED}
                step={0.05}
                value={speed}
                aria-label="Speed multiplier"
                className="w-full accent-accent-ai cursor-ew-resize"
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
              />
            </div>

            {/* Quick Speed Preset Chips */}
            <div>
              <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block mb-1.5">
                Quick Presets
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {CONSTANT_SPEED_PRESETS.map((preset) => {
                  const active = Math.abs(speed - preset.value) < 0.01;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => handlePresetSelect(preset.value)}
                      className={`flex flex-col items-center justify-center rounded-lg border p-1.5 transition-all ${
                        active
                          ? 'border-accent-ai bg-accent-ai/15 text-accent-ai font-bold shadow-xs'
                          : 'border-hairline bg-bg-app text-text-secondary hover:border-text-disabled hover:text-text-primary'
                      }`}
                    >
                      <span className="text-xs">{preset.label}</span>
                      <span className="text-[9px] text-text-disabled opacity-80">{preset.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Speed Curve HUD Display */}
            <div className="flex items-center justify-between rounded-xl border border-hairline bg-bg-app p-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block">
                  Average Velocity & Range
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="font-mono text-3xl font-bold text-amber-400">
                    {avgRampSpeed.toFixed(2)}×
                  </span>
                  <span className="text-xs text-text-secondary">
                    (Variable Retime Curve)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRampPresetSelect('constant')}
                  className="rounded-md border border-hairline bg-bg-canvas px-2.5 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
                >
                  Flatten (1×)
                </button>
              </div>
            </div>

            {/* Retime Preset Chips */}
            <div>
              <span className="text-[10px] uppercase font-bold text-text-disabled tracking-wider block mb-1.5">
                Studio Retime Presets
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(SPEED_RAMP_PRESETS) as SpeedRampPresetKey[]).map((key) => {
                  const p = SPEED_RAMP_PRESETS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleRampPresetSelect(key)}
                      className="flex flex-col items-start p-2 rounded-lg border border-hairline bg-bg-app hover:border-accent-ai/50 hover:bg-bg-hover transition-all text-left"
                      title={p.description}
                    >
                      <span className="text-xs font-bold text-text-primary">{p.name}</span>
                      <span className="text-[9px] text-text-disabled truncate w-full">{p.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive SVG Velocity Graph */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] text-text-secondary">
                <span>Velocity Curve (0.1× to 5.0×)</span>
                <span>Click a node to sculpt speed</span>
              </div>
              <div className="relative rounded-xl border border-hairline bg-black/80 overflow-hidden p-2">
                <svg
                  width="100%"
                  height="110"
                  viewBox="0 0 440 100"
                  className="w-full overflow-visible"
                >
                  <defs>
                    <linearGradient id="speedCurveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Gridlines */}
                  {/* 4.0x */}
                  <line x1="0" y1="20" x2="440" y2="20" stroke="rgba(255,255,255,0.06)" />
                  <text x="4" y="24" fill="#64748b" fontSize="8" fontFamily="monospace">4.0×</text>

                  {/* 2.0x */}
                  <line x1="0" y1="61" x2="440" y2="61" stroke="rgba(255,255,255,0.06)" />
                  <text x="4" y="65" fill="#64748b" fontSize="8" fontFamily="monospace">2.0×</text>

                  {/* 1.0x Normal Speed Baseline */}
                  <line x1="0" y1="81.6" x2="440" y2="81.6" stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                  <text x="4" y="85" fill="#f8fafc" fontSize="8" fontFamily="monospace">1.0×</text>

                  {/* Area fill */}
                  <path
                    d={`${curveGeometry.pathData} L 440 100 L 0 100 Z`}
                    fill="url(#speedCurveGrad)"
                  />

                  {/* Velocity Curve */}
                  <path
                    d={curveGeometry.pathData}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Interactive Nodes */}
                  {speedRamp.points.map((pt, idx) => {
                    const x = pt.timePct * 440;
                    const speedFraction = Math.max(0, Math.min(1, (pt.speed - 0.1) / 4.9));
                    const y = 100 - speedFraction * 100;
                    const isSelected = idx === selectedPointIndex;

                    return (
                      <g key={pt.id || idx} className="cursor-pointer" onClick={() => setSelectedPointIndex(idx)}>
                        <circle
                          cx={x}
                          cy={y}
                          r={isSelected ? 6 : 4.5}
                          fill={isSelected ? '#fbbf24' : '#1e293b'}
                          stroke={isSelected ? '#ffffff' : '#fbbf24'}
                          strokeWidth={isSelected ? 2 : 1.5}
                          className="transition-all hover:scale-125"
                        />
                        <text
                          x={x}
                          y={y - 8}
                          fill={isSelected ? '#ffffff' : '#94a3b8'}
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight={isSelected ? 'bold' : 'normal'}
                          textAnchor="middle"
                        >
                          {pt.speed.toFixed(1)}×
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Selected Node Speed Slider */}
            {selectedPoint && (
              <div className="flex items-center gap-3 rounded-xl border border-hairline bg-bg-app p-2.5">
                <span className="text-xs font-bold text-amber-400 font-mono w-24 shrink-0">
                  Node #{selectedPointIndex + 1} ({Math.round(selectedPoint.timePct * 100)}%)
                </span>
                <input
                  type="range"
                  min={0.1}
                  max={5.0}
                  step={0.05}
                  value={selectedPoint.speed}
                  aria-label="Node speed"
                  className="flex-1 accent-amber-400 cursor-pointer h-1.5"
                  onChange={(e) => updateSelectedPointSpeed(parseFloat(e.target.value))}
                />
                <span className="font-mono text-xs font-bold text-text-primary w-12 text-right">
                  {selectedPoint.speed.toFixed(2)}×
                </span>
              </div>
            )}
          </>
        )}

        {/* Ripple Sequence Duration Switch */}
        <div className="flex items-center justify-between rounded-xl border border-hairline bg-bg-app p-3">
          <div className="pr-2">
            <span className="text-xs font-semibold text-text-primary block">
              Ripple Sequence Duration
            </span>
            <span className="text-[11px] text-text-secondary block mt-0.5">
              Scale timeline duration to match playback speed and shift downstream clips.
            </span>
          </div>
          <Switch
            checked={rippleSequence}
            label="Ripple sequence duration"
            onChange={() => setRippleSequence(!rippleSequence)}
          />
        </div>

        {/* Duration Comparison Readout */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-hairline/60 bg-bg-canvas p-3">
          <div>
            <span className="text-[10px] uppercase font-semibold text-text-disabled block">
              Original Duration
            </span>
            <span className="font-mono text-xs font-semibold text-text-secondary block mt-0.5">
              {formatTimecode(originalDurationFrames, fps)} ({originalDurationFrames}f)
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-accent-ai block">
              Resulting Duration
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-xs font-bold text-text-primary">
                {formatTimecode(activeNewDuration, fps)} ({activeNewDuration}f)
              </span>
              {rippleSequence && deltaSeconds !== 0 && (
                <span
                  className={`font-mono text-[10px] font-semibold px-1 rounded ${
                    deltaSeconds < 0 ? 'text-accent-success bg-accent-success/15' : 'text-accent-warning bg-accent-warning/15'
                  }`}
                >
                  {deltaSeconds > 0 ? `+${deltaSeconds.toFixed(1)}s` : `${deltaSeconds.toFixed(1)}s`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleApply}>
            Apply Speed
          </Button>
        </div>
      </div>
    </Modal>
  );
}
