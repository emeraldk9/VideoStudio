import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  type CurvePoint,
  type RgbCurvesSettings,
  DEFAULT_RGB_CURVES,
  generateCurveSvgPath,
  isCurveNeutral,
} from '@shared';

export type CurveChannel = 'all' | 'r' | 'g' | 'b';

export interface RgbCurvesEditorProps {
  curves: RgbCurvesSettings | undefined;
  onChange: (curves: RgbCurvesSettings) => void;
}

const CANVAS_SIZE = 240;

const CHANNEL_CONFIG: Record<
  CurveChannel,
  { label: string; color: string; hoverColor: string; bgActive: string }
> = {
  all: {
    label: 'RGB',
    color: '#f3f4f6',
    hoverColor: '#ffffff',
    bgActive: 'bg-white/15 text-white border-white/40',
  },
  r: {
    label: 'Red',
    color: '#f87171',
    hoverColor: '#ef4444',
    bgActive: 'bg-red-500/20 text-red-400 border-red-500/50',
  },
  g: {
    label: 'Green',
    color: '#4ade80',
    hoverColor: '#22c55e',
    bgActive: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
  },
  b: {
    label: 'Blue',
    color: '#60a5fa',
    hoverColor: '#3b82f6',
    bgActive: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  },
};

export function RgbCurvesEditor({ curves = DEFAULT_RGB_CURVES, onChange }: RgbCurvesEditorProps) {
  const [activeChannel, setActiveChannel] = useState<CurveChannel>('all');
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  const activePoints: CurvePoint[] = useMemo(() => {
    const pts = curves[activeChannel];
    if (!pts || pts.length < 2) {
      return [
        [0, 0],
        [1, 1],
      ];
    }
    return pts.slice().sort((a, b) => a[0] - b[0]);
  }, [curves, activeChannel]);

  const updateActiveChannelPoints = useCallback(
    (newPoints: CurvePoint[]) => {
      const sorted = newPoints.slice().sort((a, b) => a[0] - b[0]);
      onChange({
        ...curves,
        [activeChannel]: sorted,
      });
    },
    [curves, activeChannel, onChange],
  );

  const getSvgCoordinates = (e: React.MouseEvent | MouseEvent): { x: number; y: number } | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const normX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const normY = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));

    return {
      x: Number(normX.toFixed(3)),
      y: Number(normY.toFixed(3)),
    };
  };

  const handleMouseDownOnPoint = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Alt-click or middle-click deletes intermediate point
    if (e.altKey || e.button === 1) {
      if (index > 0 && index < activePoints.length - 1) {
        const next = activePoints.filter((_, i) => i !== index);
        updateActiveChannelPoints(next);
        setSelectedPointIndex(null);
        return;
      }
    }

    setSelectedPointIndex(index);
    isDraggingRef.current = true;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const coords = getSvgCoordinates(moveEvt);
      if (!coords) return;

      const next = activePoints.map((pt, i) => {
        if (i !== index) return pt;
        // First point: locked to x = 0
        if (i === 0) return [0, coords.y] as CurvePoint;
        // Last point: locked to x = 1
        if (i === activePoints.length - 1) return [1, coords.y] as CurvePoint;
        // Intermediate points: clamp x between neighbors
        const minX = activePoints[i - 1][0] + 0.02;
        const maxX = activePoints[i + 1][0] - 0.02;
        const clampedX = Math.min(maxX, Math.max(minX, coords.x));
        return [Number(clampedX.toFixed(3)), coords.y] as CurvePoint;
      });

      updateActiveChannelPoints(next);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDoubleClickCanvas = (e: React.MouseEvent) => {
    const coords = getSvgCoordinates(e);
    if (!coords) return;

    // Check if clicked close to an existing point
    const threshold = 0.05;
    const existing = activePoints.find(
      (p) => Math.hypot(p[0] - coords.x, p[1] - coords.y) < threshold,
    );
    if (existing) return;

    // Insert new point
    const next: CurvePoint[] = [...activePoints, [coords.x, coords.y]];
    next.sort((a, b) => a[0] - b[0]);
    updateActiveChannelPoints(next);

    const newIdx = next.findIndex((p) => p[0] === coords.x && p[1] === coords.y);
    setSelectedPointIndex(newIdx !== -1 ? newIdx : null);
  };

  const handleResetChannel = () => {
    updateActiveChannelPoints([
      [0, 0],
      [1, 1],
    ]);
    setSelectedPointIndex(null);
  };

  const handleResetAllCurves = () => {
    onChange({
      all: [
        [0, 0],
        [1, 1],
      ],
      r: [
        [0, 0],
        [1, 1],
      ],
      g: [
        [0, 0],
        [1, 1],
      ],
      b: [
        [0, 0],
        [1, 1],
      ],
    });
    setSelectedPointIndex(null);
  };

  const handleApplyCurvePreset = (presetType: 's_curve' | 'lift_shadows' | 'crush_blacks' | 'roll_off') => {
    if (presetType === 's_curve') {
      updateActiveChannelPoints([
        [0, 0],
        [0.25, 0.18],
        [0.75, 0.82],
        [1, 1],
      ]);
    } else if (presetType === 'lift_shadows') {
      updateActiveChannelPoints([
        [0, 0.08],
        [0.35, 0.4],
        [1, 1],
      ]);
    } else if (presetType === 'crush_blacks') {
      updateActiveChannelPoints([
        [0.06, 0],
        [0.35, 0.28],
        [1, 1],
      ]);
    } else if (presetType === 'roll_off') {
      updateActiveChannelPoints([
        [0, 0],
        [0.7, 0.65],
        [1, 0.94],
      ]);
    }
  };

  const selectedPoint =
    selectedPointIndex !== null && activePoints[selectedPointIndex]
      ? activePoints[selectedPointIndex]
      : null;

  const currentCfg = CHANNEL_CONFIG[activeChannel];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-bg-surface/80 p-3 select-none text-xs">
      {/* Top Controls: Channel Tabs & Reset */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 rounded-md border border-hairline bg-bg-canvas p-0.5 text-[11px]">
          {(['all', 'r', 'g', 'b'] as CurveChannel[]).map((ch) => {
            const isSelected = activeChannel === ch;
            const cfg = CHANNEL_CONFIG[ch];
            return (
              <button
                key={ch}
                type="button"
                onClick={() => {
                  setActiveChannel(ch);
                  setSelectedPointIndex(null);
                }}
                className={`flex items-center gap-1.5 rounded px-2 py-0.5 font-medium transition-all border ${
                  isSelected
                    ? cfg.bgActive
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
                title={`Grade ${cfg.label} channel`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: cfg.color }}
                />
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleResetChannel}
            disabled={isCurveNeutral(curves[activeChannel])}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none transition-all"
            title={`Reset ${currentCfg.label} channel to linear`}
          >
            <span className="material-symbols-outlined text-xs">refresh</span>
            <span>Reset {currentCfg.label}</span>
          </button>
        </div>
      </div>

      {/* SVG Interactive Spline Canvas */}
      <div className="relative flex justify-center">
        <div className="relative rounded-lg border border-hairline bg-bg-canvas p-2 shadow-inner">
          <svg
            ref={svgRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            onDoubleClick={handleDoubleClickCanvas}
            className="overflow-visible cursor-crosshair"
          >
            {/* Background Grid Lines */}
            <defs>
              <pattern
                id="curve-grid"
                width={CANVAS_SIZE / 4}
                height={CANVAS_SIZE / 4}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${CANVAS_SIZE / 4} 0 L 0 0 0 ${CANVAS_SIZE / 4}`}
                  fill="none"
                  stroke="#272c3d"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              </pattern>
            </defs>
            <rect width={CANVAS_SIZE} height={CANVAS_SIZE} fill="url(#curve-grid)" />

            {/* Diagonal Neutral Identity Reference Line */}
            <line
              x1="0"
              y1={CANVAS_SIZE}
              x2={CANVAS_SIZE}
              y2="0"
              stroke="#374151"
              strokeWidth="1"
              strokeDasharray="3,3"
            />

            {/* Inactive Ghost Curves */}
            {(['all', 'r', 'g', 'b'] as CurveChannel[])
              .filter((ch) => ch !== activeChannel)
              .map((ch) => {
                const pts = curves[ch];
                if (!pts || pts.length < 2 || isCurveNeutral(pts)) return null;
                const pathStr = generateCurveSvgPath(pts, CANVAS_SIZE, CANVAS_SIZE);
                return (
                  <path
                    key={ch}
                    d={pathStr}
                    fill="none"
                    stroke={CHANNEL_CONFIG[ch].color}
                    strokeWidth="1.2"
                    strokeOpacity="0.3"
                  />
                );
              })}

            {/* Active Channel Bold Curve */}
            <path
              d={generateCurveSvgPath(activePoints, CANVAS_SIZE, CANVAS_SIZE)}
              fill="none"
              stroke={currentCfg.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 4px ${currentCfg.color}40)` }}
            />

            {/* Control Points */}
            {activePoints.map((pt, idx) => {
              const cx = pt[0] * CANVAS_SIZE;
              const cy = (1 - pt[1]) * CANVAS_SIZE;
              const isSelected = selectedPointIndex === idx;
              const isHovered = hoveredPointIndex === idx;
              const isEnd = idx === 0 || idx === activePoints.length - 1;

              return (
                <g key={idx}>
                  <title>{`Point #${idx + 1}: In ${(pt[0] * 100).toFixed(0)}%, Out ${(pt[1] * 100).toFixed(0)}%${
                    isEnd ? ' (Endpoint locked to border)' : ' (Alt+click to remove)'
                  }`}</title>
                  {/* Invisible larger hover/drag target */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="12"
                    fill="transparent"
                    className="cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => handleMouseDownOnPoint(idx, e)}
                    onMouseEnter={() => setHoveredPointIndex(idx)}
                    onMouseLeave={() => setHoveredPointIndex(null)}
                  />
                  {/* Visible point circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected || isHovered ? '6' : '4.5'}
                    fill={currentCfg.color}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? '2' : '1.5'}
                    className="pointer-events-none transition-all"
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Point Readout & Instructions */}
      <div className="flex items-center justify-between text-[11px] px-1 text-text-secondary">
        <div className="flex items-center gap-2">
          {selectedPoint ? (
            <span className="font-mono text-text-primary">
              In: <strong className="text-accent-ai">{Math.round(selectedPoint[0] * 100)}%</strong> · Out:{' '}
              <strong className="text-accent-ai">{Math.round(selectedPoint[1] * 100)}%</strong>
            </span>
          ) : (
            <span className="text-text-muted">Double-click canvas to add control point</span>
          )}
        </div>

        <span className="text-[10px] text-text-tertiary">
          Alt+Click point to remove
        </span>
      </div>

      {/* Curve Shape Quick Presets */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-hairline/60">
        <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
          Preset:
        </span>
        <button
          type="button"
          onClick={() => handleApplyCurvePreset('s_curve')}
          className="rounded border border-hairline bg-bg-canvas px-2 py-0.5 text-[10px] text-text-secondary hover:border-hairline-bright hover:bg-bg-hover hover:text-text-primary transition-all"
          title="Enhance cinematic dynamic range with S-curve contrast"
        >
          S-Curve
        </button>
        <button
          type="button"
          onClick={() => handleApplyCurvePreset('lift_shadows')}
          className="rounded border border-hairline bg-bg-canvas px-2 py-0.5 text-[10px] text-text-secondary hover:border-hairline-bright hover:bg-bg-hover hover:text-text-primary transition-all"
          title="Lift black point and shadow detail"
        >
          Lift Shadows
        </button>
        <button
          type="button"
          onClick={() => handleApplyCurvePreset('crush_blacks')}
          className="rounded border border-hairline bg-bg-canvas px-2 py-0.5 text-[10px] text-text-secondary hover:border-hairline-bright hover:bg-bg-hover hover:text-text-primary transition-all"
          title="Crush deep blacks for dramatic punch"
        >
          Crush Blacks
        </button>
        <button
          type="button"
          onClick={() => handleApplyCurvePreset('roll_off')}
          className="rounded border border-hairline bg-bg-canvas px-2 py-0.5 text-[10px] text-text-secondary hover:border-hairline-bright hover:bg-bg-hover hover:text-text-primary transition-all"
          title="Soft highlight roll-off protecting bright areas"
        >
          Highlight Roll-Off
        </button>
        <button
          type="button"
          onClick={handleResetAllCurves}
          className="ml-auto rounded px-2 py-0.5 text-[10px] text-text-muted hover:text-text-primary transition-colors"
          title="Reset all 4 curves to identity"
        >
          Reset All
        </button>
      </div>
    </div>
  );
}
