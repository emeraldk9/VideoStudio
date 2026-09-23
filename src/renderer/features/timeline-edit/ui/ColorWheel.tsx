import { useCallback, useEffect, useRef } from 'react';

import {
  colorWheelToRgb,
  rgbToColorWheel,
  type ColorWheelValue,
} from '@shared';

export interface ColorWheelProps {
  label: string;
  subLabel: string;
  value: ColorWheelValue;
  onChange: (value: ColorWheelValue) => void;
  colorTone?: 'shadows' | 'midtones' | 'highlights';
}

/**
 * Step S30 — Studio Grade 3-Way Chromatic Color Wheel
 *
 * Provides interactive radial puck dragging, magnetic snap-to-center,
 * double-click reset, and master luminance adjustment fader.
 */
export function ColorWheel({
  label,
  subLabel,
  value,
  onChange,
  colorTone = 'midtones',
}: ColorWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Convert current RGB offsets to polar coordinates for puck position
  const { angleRad, distanceNormalized } = rgbToColorWheel(value.r, value.g, value.b);

  // Calculate puck position in percentage relative to center (50%, 50%)
  // Polar coordinate: x = cos(angle)*dist, y = sin(angle)*dist
  const puckX = 50 + Math.cos(angleRad) * (distanceNormalized * 42);
  const puckY = 50 + Math.sin(angleRad) * (distanceNormalized * 42);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDraggingRef.current || !wheelRef.current) return;

      const rect = wheelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
      const maxRadius = rect.width / 2;

      const rawDist = Math.hypot(deltaX, deltaY);
      let distNormalized = rawDist / maxRadius;

      // Magnetic snap to center within 6% deadband
      if (distNormalized < 0.06) {
        distNormalized = 0;
      } else {
        distNormalized = Math.min(1.0, (distNormalized - 0.06) / 0.94);
      }

      let angle = Math.atan2(deltaY, deltaX);
      if (angle < 0) {
        angle += 2 * Math.PI;
      }

      const { r, g, b } = colorWheelToRgb(angle, distNormalized);
      onChange({
        ...value,
        r,
        g,
        b,
      });
    },
    [value, onChange],
  );

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    // Immediate update on pointer down click
    handlePointerMove(e.nativeEvent);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const handleWheelDoubleClick = () => {
    onChange({
      ...value,
      r: 0,
      g: 0,
      b: 0,
    });
  };

  const handleLumaDoubleClick = () => {
    onChange({
      ...value,
      luma: 0,
    });
  };

  const handleResetAll = () => {
    onChange({
      r: 0,
      g: 0,
      b: 0,
      luma: 0,
    });
  };

  const isModified =
    Math.abs(value.r) > 0.005 ||
    Math.abs(value.g) > 0.005 ||
    Math.abs(value.b) > 0.005 ||
    Math.abs(value.luma) > 0.005;

  const toneColorClass =
    colorTone === 'shadows'
      ? 'border-indigo-500/40 text-indigo-400'
      : colorTone === 'highlights'
      ? 'border-amber-500/40 text-amber-400'
      : 'border-emerald-500/40 text-emerald-400';

  return (
    <div className="flex flex-col items-center gap-2 p-2.5 rounded-lg border border-hairline bg-bg-surface/50 select-none min-w-[150px] flex-1">
      {/* Header */}
      <div className="flex items-center justify-between w-full px-1">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold tracking-wider text-text-primary uppercase">
            {label}
          </span>
          <span className="text-[9px] text-text-disabled font-mono">{subLabel}</span>
        </div>
        {isModified && (
          <button
            type="button"
            onClick={handleResetAll}
            title="Reset Wheel"
            className="text-text-disabled hover:text-accent-ai transition-colors"
          >
            <span className="material-symbols-outlined text-[13px]">refresh</span>
          </button>
        )}
      </div>

      {/* Circular Chromatic Wheel */}
      <div
        ref={wheelRef}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleWheelDoubleClick}
        title="Drag puck to adjust tint/hue balance (Double click to reset center)"
        className="relative w-28 h-28 rounded-full cursor-crosshair shadow-inner border border-white/10 overflow-hidden"
        style={{
          background: `
            radial-gradient(circle, rgba(20,20,24,0.92) 0%, rgba(20,20,24,0.3) 70%, transparent 100%),
            conic-gradient(from 0deg, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #32ade6, #007aff, #5856d6, #af52de, #ff2d55, #ff3b30)
          `,
        }}
      >
        {/* Subtle crosshairs */}
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/15 pointer-events-none -translate-y-1/2" />
        <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white/15 pointer-events-none -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/2 w-8 h-8 rounded-full border border-white/10 pointer-events-none -translate-x-1/2 -translate-y-1/2" />

        {/* Center magnetic reference dot */}
        <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-white/40 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        {/* Dynamic Draggable Puck */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
          style={{
            left: `${puckX}%`,
            top: `${puckY}%`,
            backgroundColor: distanceNormalized > 0.01 ? '#38bdf8' : 'rgba(255,255,255,0.85)',
            boxShadow: '0 0 8px rgba(56, 189, 248, 0.6), 0 0 2px rgba(0,0,0,0.8)',
          }}
        />
      </div>

      {/* Numeric Readouts */}
      <div className="flex items-center justify-center gap-2 font-mono text-[9px] text-text-disabled">
        <span>R: <span className={value.r !== 0 ? 'text-red-400 font-semibold' : ''}>{(value.r * 100).toFixed(0)}</span></span>
        <span>G: <span className={value.g !== 0 ? 'text-emerald-400 font-semibold' : ''}>{(value.g * 100).toFixed(0)}</span></span>
        <span>B: <span className={value.b !== 0 ? 'text-blue-400 font-semibold' : ''}>{(value.b * 100).toFixed(0)}</span></span>
      </div>

      {/* Master Luminance Slider */}
      <div className="w-full flex flex-col gap-0.5 px-1 mt-0.5">
        <div className="flex items-center justify-between text-[9px] font-mono text-text-disabled">
          <span>Luma</span>
          <span
            onDoubleClick={handleLumaDoubleClick}
            className={`cursor-pointer ${value.luma !== 0 ? 'text-accent-ai font-semibold' : ''}`}
            title="Double click to reset Luma"
          >
            {value.luma > 0 ? '+' : ''}{(value.luma * 100).toFixed(0)}%
          </span>
        </div>
        <div className="relative flex items-center">
          {/* Center notch at 0 */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-2 bg-white/30 pointer-events-none z-10" />
          <input
            type="range"
            min={-1.0}
            max={1.0}
            step={0.01}
            value={value.luma}
            onChange={(e) => onChange({ ...value, luma: parseFloat(e.target.value) })}
            onDoubleClick={handleLumaDoubleClick}
            title="Adjust Master Luminance (Double click to reset)"
            className="w-full h-1.5 bg-black/40 rounded appearance-none cursor-pointer accent-accent-ai"
          />
        </div>
      </div>
    </div>
  );
}
