/**
 * S166 — 4-Band Parametric EQ Interactive SVG Editor.
 *
 * Provides a studio-grade draggable frequency response visualization:
 * - Low Shelf (80 Hz) — emerald
 * - Low-Mid Bell (250 Hz) — amber
 * - High-Mid Bell (2.5 kHz) — rose
 * - High Shelf (10 kHz) — cyan
 *
 * Each band has a draggable node controlling gain (Y-axis, ±18 dB)
 * and frequency (X-axis, log 20 Hz–20 kHz). Scroll-wheel adjusts Q factor
 * for peaking bell bands. Double-click resets the node to 0 dB.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import {
  type AudioEqualizerBand,
  type AudioEqualizerSettings,
  EQ_GAIN_MAX,
  EQ_FREQ_MIN,
  EQ_FREQ_MAX,
  resolveEqBands,
  calculateBandGainAtFrequency,
  calculateEqGainAtFrequency,
  clampEqGain,
  clampEqFrequency,
} from '@shared';

// ─── Layout Constants ────────────────────────────────────────────────────────
const W = 440;
const H = 160;
const PAD_L = 0;
const PAD_R = 0;
const PAD_T = 0;
const PAD_B = 0;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const LOG_MIN = Math.log10(EQ_FREQ_MIN);
const LOG_MAX = Math.log10(EQ_FREQ_MAX);
const LOG_SPAN = LOG_MAX - LOG_MIN;
const SAMPLE_COUNT = 96;

// ─── Band Configuration ─────────────────────────────────────────────────────
type BandKey = 'low' | 'lowMid' | 'highMid' | 'high';
type BandType = 'lowShelf' | 'bell' | 'highShelf';

interface BandConfig {
  key: BandKey;
  type: BandType;
  label: string;
  color: string;
  colorFill: string;
}

const BAND_CONFIG: BandConfig[] = [
  { key: 'low',     type: 'lowShelf',  label: 'LS',  color: '#34d399', colorFill: 'rgba(52,211,153,0.10)' },
  { key: 'lowMid',  type: 'bell',      label: 'LM',  color: '#fbbf24', colorFill: 'rgba(251,191,36,0.10)' },
  { key: 'highMid', type: 'bell',      label: 'HM',  color: '#fb7185', colorFill: 'rgba(251,113,133,0.10)' },
  { key: 'high',    type: 'highShelf', label: 'HS',  color: '#22d3ee', colorFill: 'rgba(34,211,238,0.10)' },
];

// ─── Coordinate Utilities ────────────────────────────────────────────────────
function freqToX(freqHz: number): number {
  const logF = Math.log10(Math.max(EQ_FREQ_MIN, Math.min(EQ_FREQ_MAX, freqHz)));
  return PAD_L + ((logF - LOG_MIN) / LOG_SPAN) * PLOT_W;
}

function xToFreq(x: number): number {
  const ratio = Math.max(0, Math.min(1, (x - PAD_L) / PLOT_W));
  return Math.pow(10, LOG_MIN + ratio * LOG_SPAN);
}

function gainToY(gainDb: number): number {
  const norm = (gainDb + EQ_GAIN_MAX) / (2 * EQ_GAIN_MAX);
  return PAD_T + PLOT_H * (1 - Math.max(0, Math.min(1, norm)));
}

function yToGain(y: number): number {
  const norm = 1 - Math.max(0, Math.min(1, (y - PAD_T) / PLOT_H));
  return norm * 2 * EQ_GAIN_MAX - EQ_GAIN_MAX;
}

// ─── Path Generators ─────────────────────────────────────────────────────────
function sampleCombinedPath(settings: AudioEqualizerSettings): string {
  const parts: string[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const ratio = i / (SAMPLE_COUNT - 1);
    const logF = LOG_MIN + ratio * LOG_SPAN;
    const freqHz = Math.pow(10, logF);
    const gain = calculateEqGainAtFrequency(settings, freqHz);
    const x = PAD_L + ratio * PLOT_W;
    const y = gainToY(gain);
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return parts.join(' ');
}

function sampleBandPath(band: AudioEqualizerBand, type: BandType): string {
  const parts: string[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const ratio = i / (SAMPLE_COUNT - 1);
    const logF = LOG_MIN + ratio * LOG_SPAN;
    const freqHz = Math.pow(10, logF);
    const gain = calculateBandGainAtFrequency(band, type, freqHz);
    const x = PAD_L + ratio * PLOT_W;
    const y = gainToY(gain);
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return parts.join(' ');
}

// ─── Frequency Grid Lines ────────────────────────────────────────────────────
const FREQ_GRID = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const GAIN_GRID = [-12, -6, 6, 12];

function formatFreq(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 0)}k` : `${f}`;
}

// ─── Component Props ─────────────────────────────────────────────────────────
export interface ParametricEqEditorProps {
  settings: AudioEqualizerSettings;
  onChange: (patch: Partial<AudioEqualizerSettings>) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function ParametricEqEditor({ settings, onChange }: ParametricEqEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  const bands = useMemo(() => resolveEqBands(settings), [settings]);

  const combinedPath = useMemo(() => sampleCombinedPath(settings), [settings]);

  const bandPaths = useMemo(
    () =>
      BAND_CONFIG.map((cfg) => ({
        ...cfg,
        path: sampleBandPath(bands[cfg.key], cfg.type),
      })),
    [bands],
  );

  const getSvgPoint = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }, []);

  const handleNodeMouseDown = useCallback(
    (bandKey: BandKey, bandType: BandType, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;

      const onMove = (moveEvt: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const pt = getSvgPoint(moveEvt);
        if (!pt) return;

        const newGain = clampEqGain(Math.round(yToGain(pt.y) * 2) / 2); // snap to 0.5 dB
        const newFreq = clampEqFrequency(Math.round(xToFreq(pt.x)));

        const currentBand = bands[bandKey];
        onChange({
          [bandKey]: {
            ...currentBand,
            gainDb: newGain,
            frequencyHz: newFreq,
          },
        });
      };

      const onUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [bands, onChange, getSvgPoint],
  );

  const handleNodeDoubleClick = useCallback(
    (bandKey: BandKey, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const currentBand = bands[bandKey];
      onChange({
        [bandKey]: { ...currentBand, gainDb: 0 },
      });
    },
    [bands, onChange],
  );

  const handleNodeWheel = useCallback(
    (bandKey: BandKey, bandType: BandType, e: React.WheelEvent) => {
      if (bandType !== 'bell') return; // Q only applies to peaking bells
      e.preventDefault();
      e.stopPropagation();
      const currentBand = bands[bandKey];
      const currentQ = currentBand.q ?? 1.0;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newQ = Math.round(Math.max(0.3, Math.min(5.0, currentQ + delta)) * 10) / 10;
      onChange({
        [bandKey]: { ...currentBand, q: newQ },
      });
    },
    [bands, onChange],
  );

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="rounded border border-hairline bg-black/80 overflow-hidden"
      >
        <defs>
          <linearGradient id="peqCombinedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-ai, #6366f1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent-ai, #6366f1)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Gain Grid Lines */}
        {GAIN_GRID.map((g) => {
          const y = gainToY(g);
          return (
            <line
              key={`g-${g}`}
              x1={PAD_L}
              y1={y}
              x2={W - PAD_R}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          );
        })}

        {/* 0 dB Center Line */}
        <line
          x1={PAD_L}
          y1={gainToY(0)}
          x2={W - PAD_R}
          y2={gainToY(0)}
          stroke="rgba(255,255,255,0.20)"
          strokeDasharray="3 3"
        />

        {/* Frequency Grid Lines */}
        {FREQ_GRID.map((f) => {
          const x = freqToX(f);
          return (
            <g key={`f-${f}`}>
              <line x1={x} y1={PAD_T} x2={x} y2={H - PAD_B} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text
                x={x}
                y={H - 3}
                fill="#64748b"
                fontSize="8"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {formatFreq(f)}
              </text>
            </g>
          );
        })}

        {/* Gain Labels */}
        {GAIN_GRID.filter((g) => g > 0).map((g) => (
          <g key={`gl-${g}`}>
            <text x={4} y={gainToY(g) + 3} fill="#475569" fontSize="7" fontFamily="monospace">
              +{g}
            </text>
            <text x={4} y={gainToY(-g) + 3} fill="#475569" fontSize="7" fontFamily="monospace">
              {-g}
            </text>
          </g>
        ))}

        {/* Individual Band Ghost Curves */}
        {settings.enabled &&
          bandPaths.map((bp) => (
            <path
              key={`band-${bp.key}`}
              d={bp.path}
              fill="none"
              stroke={bp.color}
              strokeWidth="1"
              strokeOpacity="0.25"
            />
          ))}

        {/* Combined Curve Fill */}
        {settings.enabled && (
          <path
            d={`${combinedPath} L ${W - PAD_R} ${gainToY(0)} L ${PAD_L} ${gainToY(0)} Z`}
            fill="url(#peqCombinedGrad)"
          />
        )}

        {/* Combined Curve Stroke */}
        <path
          d={combinedPath}
          fill="none"
          stroke={settings.enabled ? 'var(--accent-ai, #6366f1)' : '#64748b'}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Draggable Band Nodes */}
        {settings.enabled &&
          BAND_CONFIG.map((cfg) => {
            const band = bands[cfg.key];
            const cx = freqToX(band.frequencyHz);
            const cy = gainToY(band.gainDb);
            const isActive = Math.abs(band.gainDb) > 0.1;

            return (
              <g
                key={`node-${cfg.key}`}
                className="cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => handleNodeMouseDown(cfg.key, cfg.type, e)}
                onDoubleClick={(e) => handleNodeDoubleClick(cfg.key, e)}
                onWheel={(e) => handleNodeWheel(cfg.key, cfg.type, e)}
              >
                {/* Hit area (invisible, larger for easy grabbing) */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={12}
                  fill="transparent"
                  stroke="none"
                />

                {/* Vertical guide from 0-dB line to node */}
                {isActive && (
                  <line
                    x1={cx}
                    y1={gainToY(0)}
                    x2={cx}
                    y2={cy}
                    stroke={cfg.color}
                    strokeWidth="1"
                    strokeOpacity="0.3"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Node circle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={6}
                  fill={isActive ? cfg.color : 'transparent'}
                  fillOpacity={isActive ? 0.9 : 0}
                  stroke={cfg.color}
                  strokeWidth={isActive ? 2 : 1.5}
                  strokeOpacity={isActive ? 1 : 0.5}
                />

                {/* Label */}
                <text
                  x={cx}
                  y={cy - 10}
                  fill={cfg.color}
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight="bold"
                  opacity={isActive ? 1 : 0.5}
                >
                  {cfg.label} {band.gainDb > 0 ? '+' : ''}{band.gainDb.toFixed(1)}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
}
