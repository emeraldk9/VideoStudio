/**
 * Milestone S72 — Interactive Timeline Speed Ramping Bézier Gizmo & Optical Flow Retiming HUD.
 *
 * Provides a direct in-clip interactive speed curve editor overlaid on timeline clips:
 * - Real-time continuous Bézier velocity curve SVG visualization.
 * - Draggable speed inflection pins with vertical velocity adjustment (0.1x to 10x) and horizontal timing.
 * - Tangent ease wings for smooth acceleration / deceleration transitions.
 * - Freeze frame hold plateau insertion with crosshatch styling.
 * - Retiming mode selector: Nearest, Frame Blend, Optical Flow.
 * - Instant preset switching (Hero Ramp, Bullet Time, Montage Flash, etc.).
 * - Ripple sequence duration support.
 */

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  type SequenceClip,
  type SpeedRampSettings,
  type SpeedRampPoint,
  DEFAULT_SPEED_RAMP_SETTINGS,
  SPEED_RAMP_PRESETS,
  type SpeedRampPresetKey,
  buildSvgSpeedRampPath,
  splitSpeedSegmentAtNormalizedTime,
  updateSpeedPointVelocity,
  updateSpeedPointEasing,
  insertFreezeFrameRamp,
  calculateRampAverageSpeed,
  calculateRampedDuration,
} from '@shared';
import { useSequenceStore } from '../../../entities/sequence';

export interface InlineSpeedRampCurveProps {
  clip: SequenceClip;
  fps: number;
  widthPx: number;
  heightPx: number;
  onClose?: () => void;
}

type DragState =
  | {
      type: 'point';
      pointId: string;
      startX: number;
      startY: number;
      initialTimePct: number;
      initialSpeed: number;
    }
  | {
      type: 'ease';
      pointId: string;
      direction: 'in' | 'out';
      startX: number;
      initialDt: number;
    };

export function InlineSpeedRampCurve({
  clip,
  fps,
  widthPx,
  heightPx,
  onClose,
}: InlineSpeedRampCurveProps) {
  const patchClip = useSequenceStore((state) => state.patchClip);
  const commitClips = useSequenceStore((state) => state.commitClips);
  const document = useSequenceStore((state) => state.document);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ timePct: number; speed: number } | null>(null);

  const curveId = useId();
  const gradId = `speedGrad-${curveId}`;

  const speedRamp: SpeedRampSettings = useMemo(() => {
    if (clip.effects?.speedRamp) return clip.effects.speedRamp;
    return { ...DEFAULT_SPEED_RAMP_SETTINGS, enabled: true };
  }, [clip.effects?.speedRamp]);

  const retimingMode = (clip.effects as Record<string, unknown>)?.retimingMode as string ?? 'optical_flow';

  const updateSpeedRamp = useCallback(
    (newSettings: SpeedRampSettings) => {
      patchClip(clip.id, {
        effects: {
          ...clip.effects,
          speedRamp: newSettings,
        },
      });
    },
    [clip.id, clip.effects, patchClip],
  );

  const updateRetimingMode = useCallback(
    (mode: string) => {
      patchClip(clip.id, {
        effects: {
          ...clip.effects,
          retimingMode: mode,
        } as unknown as typeof clip.effects,
      });
    },
    [clip.id, clip.effects, patchClip],
  );

  const curveSvg = useMemo(() => {
    return buildSvgSpeedRampPath(speedRamp, widthPx, heightPx, 0.1, 8.0, 64);
  }, [speedRamp, widthPx, heightPx]);

  const avgSpeed = useMemo(() => calculateRampAverageSpeed(speedRamp), [speedRamp]);
  const rampedDuration = useMemo(
    () => calculateRampedDuration(clip.durationFrames, speedRamp),
    [clip.durationFrames, speedRamp],
  );

  // Apply speed preset
  const handleSelectPreset = (presetKey: SpeedRampPresetKey) => {
    const preset = SPEED_RAMP_PRESETS[presetKey];
    if (preset) {
      updateSpeedRamp({
        ...speedRamp,
        enabled: true,
        points: preset.points,
      });
    }
  };

  // Double click canvas to add speed inflection point
  const handleCanvasDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timePct = Math.max(0.02, Math.min(0.98, x / widthPx));
    const next = splitSpeedSegmentAtNormalizedTime(speedRamp, timePct);
    updateSpeedRamp(next);
  };

  // Add freeze frame hold plateau
  const handleAddFreezeFrame = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = insertFreezeFrameRamp(speedRamp, 0.4, 0.2);
    updateSpeedRamp(next);
  };

  // Pointer down on speed point
  const handlePointPointerDown = (
    e: React.PointerEvent,
    pointId: string,
    initialTimePct: number,
    initialSpeed: number,
  ) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      type: 'point',
      pointId,
      startX: e.clientX,
      startY: e.clientY,
      initialTimePct,
      initialSpeed,
    });
  };

  // Pointer down on ease handle
  const handleEasePointerDown = (
    e: React.PointerEvent,
    pointId: string,
    direction: 'in' | 'out',
    initialDt: number,
  ) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      type: 'ease',
      pointId,
      direction,
      startX: e.clientX,
      initialDt,
    });
  };

  // Pointer move handler
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const timePct = Math.max(0, Math.min(1, x / widthPx));
        const speed = 0.1 + (1 - (e.clientY - rect.top) / heightPx) * 7.9;
        setHoverInfo({ timePct, speed: Math.round(speed * 10) / 10 });
      }
      return;
    }

    if (dragState.type === 'point') {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;

      const dt = dx / widthPx;
      const newTime = Math.max(0.0, Math.min(1.0, dragState.initialTimePct + dt));

      // Invert Y: dragging UP increases speed, DOWN decreases speed
      const speedDelta = -(dy / heightPx) * 7.9;
      const newSpeed = Math.max(0.1, Math.min(10.0, dragState.initialSpeed + speedDelta));

      const updatedPoints = speedRamp.points.map((p) => {
        if (p.id !== dragState.pointId) return p;
        // Anchor points stay at 0 and 1 horizontally
        const fixedTime = p.timePct === 0 ? 0 : p.timePct === 1 ? 1 : newTime;
        return {
          ...p,
          timePct: fixedTime,
          speed: Math.round(newSpeed * 10) / 10,
        };
      });

      updateSpeedRamp({
        ...speedRamp,
        points: updatedPoints,
      });
    } else if (dragState.type === 'ease') {
      const dx = e.clientX - dragState.startX;
      const dt = dx / widthPx;
      const newSpan = Math.max(0.01, Math.min(0.4, Math.abs(dragState.initialDt + dt)));
      const next = updateSpeedPointEasing(speedRamp, dragState.pointId, newSpan);
      updateSpeedRamp(next);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture already released
      }
      setDragState(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30 flex flex-col justify-between overflow-hidden rounded-[4px] bg-black/85 backdrop-blur-md select-none border border-amber-400/60 shadow-2xl"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoverInfo(null)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top HUD Control Strip */}
      <div className="flex h-6 shrink-0 items-center justify-between border-b border-white/10 px-2 bg-black/60 text-[9px] font-mono text-text-primary">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 font-bold text-amber-400">
            <span className="material-symbols-outlined text-[13px]">speed</span>
            <span>Speed Ramp</span>
          </div>

          {/* Presets dropdown */}
          <select
            className="rounded bg-bg-app border border-white/15 px-1 py-0.5 text-[8.5px] font-bold text-text-primary focus:outline-none"
            onChange={(e) => handleSelectPreset(e.target.value as SpeedRampPresetKey)}
            defaultValue="hero_ramp"
            title="Load cinematic speed ramp preset"
          >
            <option value="hero_ramp">Hero Ramp</option>
            <option value="bullet_time">Bullet Time</option>
            <option value="montage_flash">Montage Flash</option>
            <option value="slow_in_fast_out">Slow In, Fast Out</option>
            <option value="fast_in_slow_out">Fast In, Slow Out</option>
            <option value="constant">Constant 1.0x</option>
          </select>

          {/* Retiming Mode Selector */}
          <div className="flex items-center gap-1 border-l border-white/15 pl-2">
            <span className="text-text-disabled">Retime:</span>
            <select
              value={retimingMode}
              onChange={(e) => updateRetimingMode(e.target.value)}
              className="rounded bg-bg-app border border-white/15 px-1 py-0.5 text-[8.5px] text-accent-ai focus:outline-none"
              title="Frame interpolation method"
            >
              <option value="nearest">Nearest</option>
              <option value="frame_blend">Frame Blend</option>
              <option value="optical_flow">Optical Flow (AI)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Freeze Frame Button */}
          <button
            type="button"
            onClick={handleAddFreezeFrame}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8.5px] font-bold bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Insert a freeze frame hold plateau into the speed curve"
          >
            <span className="material-symbols-outlined text-[11px]">pause</span>
            <span>Freeze</span>
          </button>

          {/* Average speed & duration readout */}
          <div className="flex items-center gap-1 text-[8px] text-text-disabled">
            <span>Avg: <strong className="text-amber-300">{avgSpeed.toFixed(2)}x</strong></span>
            <span>({rampedDuration}f)</span>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-4 w-4 items-center justify-center rounded text-text-disabled hover:text-white transition-colors"
              title="Close speed ramp curve editor"
            >
              <span className="material-symbols-outlined text-[13px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* SVG Interactive Speed Curve Canvas */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${widthPx} ${heightPx}`}
          preserveAspectRatio="none"
          className="absolute inset-0 cursor-crosshair"
          onDoubleClick={handleCanvasDoubleClick}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Horizontal Reference Speed Guidelines */}
          {/* 1.0x Normal Speed Line */}
          {(() => {
            const y1x = heightPx - ((1.0 - 0.1) / 7.9) * heightPx;
            return (
              <g>
                <line
                  x1="0"
                  y1={y1x}
                  x2={widthPx}
                  y2={y1x}
                  stroke="rgba(245, 158, 11, 0.4)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x="4"
                  y={y1x - 3}
                  fill="rgba(245, 158, 11, 0.7)"
                  fontSize="7.5"
                  fontFamily="monospace"
                >
                  1.0× Normal
                </text>
              </g>
            );
          })()}

          {/* 4.0x Fast Speed Line */}
          {(() => {
            const y4x = heightPx - ((4.0 - 0.1) / 7.9) * heightPx;
            return (
              <g>
                <line x1="0" y1={y4x} x2={widthPx} y2={y4x} stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
                <text x="4" y={y4x - 3} fill="rgba(255, 255, 255, 0.3)" fontSize="7" fontFamily="monospace">
                  4.0× Fast
                </text>
              </g>
            );
          })()}

          {/* Gradient Fill Under Curve */}
          <path d={curveSvg.fillPathD} fill={`url(#${gradId})`} />

          {/* Primary Velocity Stroke Path */}
          <path d={curveSvg.pathD} fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />

          {/* Ease Transition Wings & Tangent Handles */}
          {curveSvg.points.map((pt) => {
            const rawPoint = speedRamp.points.find((p) => p.id === pt.id);
            if (!rawPoint) return null;

            const handleInX = rawPoint.handleIn ? pt.x + rawPoint.handleIn.dt * widthPx : null;
            const handleOutX = rawPoint.handleOut ? pt.x + rawPoint.handleOut.dt * widthPx : null;

            return (
              <g key={`ease-${pt.id}`}>
                {handleInX !== null && (
                  <g>
                    <line x1={pt.x} y1={pt.y} x2={handleInX} y2={pt.y} stroke="#60a5fa" strokeWidth="1" />
                    <circle
                      cx={handleInX}
                      cy={pt.y}
                      r="3.5"
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth="1"
                      className="cursor-ew-resize hover:scale-125 transition-transform"
                      onPointerDown={(e) =>
                        handleEasePointerDown(e, pt.id, 'in', rawPoint.handleIn?.dt ?? -0.05)
                      }
                    />
                  </g>
                )}

                {handleOutX !== null && (
                  <g>
                    <line x1={pt.x} y1={pt.y} x2={handleOutX} y2={pt.y} stroke="#60a5fa" strokeWidth="1" />
                    <circle
                      cx={handleOutX}
                      cy={pt.y}
                      r="3.5"
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth="1"
                      className="cursor-ew-resize hover:scale-125 transition-transform"
                      onPointerDown={(e) =>
                        handleEasePointerDown(e, pt.id, 'out', rawPoint.handleOut?.dt ?? 0.05)
                      }
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* Inflection Keyframe Control Pins */}
          {curveSvg.points.map((pt) => {
            const isFreeze = pt.speed <= 0.15;
            return (
              <g key={pt.id}>
                {/* Pin Stem */}
                <line x1={pt.x} y1={pt.y} x2={pt.x} y2={heightPx} stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />

                {/* Draggable Diamond Keyframe Pin */}
                <rect
                  x={pt.x - 4.5}
                  y={pt.y - 4.5}
                  width="9"
                  height="9"
                  transform={`rotate(45 ${pt.x} ${pt.y})`}
                  fill={isFreeze ? '#38bdf8' : '#fbbf24'}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  className="cursor-move hover:scale-125 transition-transform shadow-md"
                  onPointerDown={(e) => handlePointPointerDown(e, pt.id, pt.timePct, pt.speed)}
                />

                {/* Velocity Label Badge */}
                <text
                  x={pt.x}
                  y={Math.max(10, pt.y - 8)}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="8"
                  fontWeight="bold"
                  fontFamily="monospace"
                  className="pointer-events-none drop-shadow-sm"
                >
                  {isFreeze ? 'FREEZE' : `${pt.speed.toFixed(1)}×`}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Coordinate Chip */}
        {hoverInfo && (
          <div className="pointer-events-none absolute bottom-1 left-2 flex items-center gap-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-mono text-amber-300 border border-white/10 shadow-xs">
            <span>Progress: {(hoverInfo.timePct * 100).toFixed(0)}%</span>
            <span>Speed: {hoverInfo.speed.toFixed(1)}×</span>
            <span className="text-text-disabled">(Double-click to add pin)</span>
          </div>
        )}
      </div>
    </div>
  );
}
