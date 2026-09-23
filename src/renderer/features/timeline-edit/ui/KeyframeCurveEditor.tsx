/**
 * Beta S154 Phase 6 / S32 — Keyframe Bezier Curve Graph Editor.
 *
 * Interactive visual 2D Bezier graph editor providing visual easing handles,
 * velocity curve inspection, tangent handle dragging, and interpolation presets
 * (Linear, Ease-In, Ease-Out, Smooth Bezier, Hold).
 */

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  type ClipKeyframe,
  type KeyframeInterpolation,
  type KeyframeProperty,
  framesToSeconds,
  generatePresetHandles,
  getKeyframeControlPoints,
  keyframesFor,
  sampleCurvePoints,
  type SequenceClip,
} from '@shared';
import { Button } from '../../../shared/ui/Button';

export interface KeyframeCurveEditorProps {
  clip: SequenceClip;
  fps: number;
  availableProperties: KeyframeProperty[];
  defaultProperty?: KeyframeProperty;
  onUpdateKeyframes: (nextKeyframes: ClipKeyframe[] | undefined) => void;
  clipRelativePlayheadFrame: number;
}

type DragTarget =
  | { type: 'keyframe'; index: number; initialFrame: number; initialValue: number }
  | { type: 'handleOut'; keyframeIndex: number; initialOffsetF: number; initialOffsetV: number }
  | { type: 'handleIn'; keyframeIndex: number; initialOffsetF: number; initialOffsetV: number };

const PROPERTY_LABELS: Record<KeyframeProperty, { label: string; unit: string; min: number; max: number; step: number }> = {
  x: { label: 'Position X', unit: '%', min: 0, max: 1, step: 0.01 },
  y: { label: 'Position Y', unit: '%', min: 0, max: 1, step: 0.01 },
  volume: { label: 'Volume (Gain)', unit: 'dB', min: -40, max: 12, step: 0.5 },
  scale: { label: 'Scale', unit: 'x', min: 0.1, max: 2.5, step: 0.05 },
  opacity: { label: 'Opacity', unit: '%', min: 0, max: 1, step: 0.05 },
  rotation: { label: 'Rotation', unit: '°', min: -180, max: 180, step: 1 },
};

function getDefaultPropertyValue(property: KeyframeProperty): number {
  switch (property) {
    case 'scale':
    case 'opacity':
      return 1.0;
    case 'rotation':
    case 'volume':
      return 0.0;
    case 'x':
    case 'y':
    default:
      return 0.5;
  }
}

function formatPropertyValue(
  property: KeyframeProperty,
  value: number,
  precision: 'short' | 'long' = 'short',
): string {
  switch (property) {
    case 'volume':
      return precision === 'long' ? `${value.toFixed(1)} dB` : `${value.toFixed(0)}dB`;
    case 'scale':
      return precision === 'long' ? `${value.toFixed(2)}x` : `${value.toFixed(1)}x`;
    case 'rotation':
      return precision === 'long' ? `${value.toFixed(1)}°` : `${value.toFixed(0)}°`;
    case 'opacity':
    case 'x':
    case 'y':
    default:
      return precision === 'long' ? `${(value * 100).toFixed(1)}%` : `${(value * 100).toFixed(0)}%`;
  }
}

const INTERPOLATION_OPTIONS: Array<{ id: KeyframeInterpolation; label: string; icon: string }> = [
  { id: 'linear', label: 'Linear', icon: 'linear_scale' },
  { id: 'ease_in', label: 'Ease In', icon: 'trending_up' },
  { id: 'ease_out', label: 'Ease Out', icon: 'trending_flat' },
  { id: 'bezier', label: 'Smooth', icon: 'gesture' },
  { id: 'hold', label: 'Hold', icon: 'pause' },
];

export function KeyframeCurveEditor({
  clip,
  fps,
  availableProperties,
  defaultProperty,
  onUpdateKeyframes,
  clipRelativePlayheadFrame,
}: KeyframeCurveEditorProps) {
  const gradientId = useId();
  const [selectedProperty, setSelectedProperty] = useState<KeyframeProperty>(
    defaultProperty ?? availableProperties[0] ?? 'x',
  );
  const [selectedKeyIndex, setSelectedKeyIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'curve' | 'velocity'>('curve');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<{
    target: DragTarget;
    startX: number;
    startY: number;
  } | null>(null);

  // Active sorted keyframes for selected property
  const activeKeys = useMemo(
    () => keyframesFor(clip.keyframes, selectedProperty),
    [clip.keyframes, selectedProperty],
  );

  const durationFrames = Math.max(1, clip.durationFrames);
  const propConfig = PROPERTY_LABELS[selectedProperty];

  // SVG Geometry Dimensions
  const svgWidth = 440;
  const svgHeight = 220;
  const padLeft = 46;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 26;

  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  // Coordinate scales
  // Dynamic Y bounds with safety padding
  const yBounds = useMemo(() => {
    let min = propConfig.min;
    let max = propConfig.max;
    if (activeKeys.length > 0) {
      for (const k of activeKeys) {
        if (k.value < min) min = k.value;
        if (k.value > max) max = k.value;
      }
    }
    const margin = (max - min) * 0.1 || 0.1;
    return { min: min - margin, max: max + margin };
  }, [activeKeys, propConfig]);

  const frameToX = useCallback(
    (frame: number) => {
      const ratio = Math.max(0, Math.min(durationFrames, frame)) / durationFrames;
      return padLeft + ratio * plotWidth;
    },
    [durationFrames, padLeft, plotWidth],
  );

  const xToFrame = useCallback(
    (x: number) => {
      const ratio = (x - padLeft) / plotWidth;
      return Math.round(Math.max(0, Math.min(durationFrames, ratio * durationFrames)));
    },
    [durationFrames, padLeft, plotWidth],
  );

  const valueToY = useCallback(
    (value: number) => {
      const ratio = (value - yBounds.min) / (yBounds.max - yBounds.min || 1);
      return padTop + (1 - Math.max(0, Math.min(1, ratio))) * plotHeight;
    },
    [padTop, plotHeight, yBounds],
  );

  const yToValue = useCallback(
    (y: number) => {
      const ratio = 1 - (y - padTop) / plotHeight;
      const raw = yBounds.min + ratio * (yBounds.max - yBounds.min);
      // Snap to step
      return Math.round(raw / propConfig.step) * propConfig.step;
    },
    [padTop, plotHeight, propConfig.step, yBounds],
  );

  // Velocity curve sampling
  const velocitySamples = useMemo(() => {
    if (viewMode !== 'velocity' || activeKeys.length === 0) return [];
    return sampleCurvePoints(clip.keyframes, selectedProperty, 0, durationFrames, 2, fps);
  }, [viewMode, activeKeys.length, clip.keyframes, selectedProperty, durationFrames, fps]);

  const maxAbsVelocity = useMemo(() => {
    if (velocitySamples.length === 0) return 10;
    const max = Math.max(...velocitySamples.map((s) => Math.abs(s.velocity)));
    return Math.max(1, max * 1.2);
  }, [velocitySamples]);

  const velocityToY = useCallback(
    (vel: number) => {
      const normalized = vel / maxAbsVelocity; // -1 to 1
      return padTop + plotHeight * 0.5 - normalized * (plotHeight * 0.45);
    },
    [maxAbsVelocity, padTop, plotHeight],
  );

  // Build SVG Path for Value Curve
  const curveSvgPath = useMemo(() => {
    if (activeKeys.length === 0) {
      const defaultY = valueToY(selectedProperty === 'volume' ? 0 : 0.5);
      return `M ${frameToX(0)} ${defaultY} L ${frameToX(durationFrames)} ${defaultY}`;
    }

    let d = '';
    const first = activeKeys[0];
    const firstX = frameToX(first.frame);
    const firstY = valueToY(first.value);

    // Initial flat hold up to first keyframe
    d += `M ${frameToX(0)} ${firstY} L ${firstX} ${firstY}`;

    for (let i = 0; i < activeKeys.length - 1; i++) {
      const k1 = activeKeys[i];
      const k2 = activeKeys[i + 1];

      if (k1.interpolation === 'hold' || k2.frame === k1.frame) {
        const k2X = frameToX(k2.frame);
        const k2Y = valueToY(k2.value);
        d += ` L ${k2X} ${valueToY(k1.value)} L ${k2X} ${k2Y}`;
      } else if (k1.interpolation === 'linear') {
        const k2X = frameToX(k2.frame);
        const k2Y = valueToY(k2.value);
        d += ` L ${k2X} ${k2Y}`;
      } else {
        const cp = getKeyframeControlPoints(k1, k2);
        const x1 = frameToX(cp.x1);
        const y1 = valueToY(cp.y1);
        const x2 = frameToX(cp.x2);
        const y2 = valueToY(cp.y2);
        const x3 = frameToX(cp.x3);
        const y3 = valueToY(cp.y3);
        d += ` C ${x1.toFixed(1)} ${y1.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}, ${x3.toFixed(1)} ${y3.toFixed(1)}`;
      }
    }

    // Flat hold after last keyframe
    const last = activeKeys[activeKeys.length - 1];
    d += ` L ${frameToX(durationFrames)} ${valueToY(last.value)}`;
    return d;
  }, [activeKeys, durationFrames, frameToX, selectedProperty, valueToY]);

  // Build SVG Path for Velocity Curve
  const velocitySvgPath = useMemo(() => {
    if (velocitySamples.length === 0) return '';
    return velocitySamples
      .map((s, idx) => {
        const x = frameToX(s.frame);
        const y = velocityToY(s.velocity);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [velocitySamples, frameToX, velocityToY]);

  // Keyframe manipulation handlers
  const updateKeyframeAt = useCallback(
    (index: number, patch: Partial<ClipKeyframe>) => {
      const target = activeKeys[index];
      if (!target) return;

      const otherKeys = (clip.keyframes ?? []).filter(
        (k) => !(k.property === selectedProperty && k.frame === target.frame),
      );

      const updatedKey: ClipKeyframe = {
        ...target,
        ...patch,
      };

      const next = [...otherKeys, updatedKey];
      onUpdateKeyframes(next);
    },
    [activeKeys, clip.keyframes, onUpdateKeyframes, selectedProperty],
  );

  const applyPresetInterpolation = useCallback(
    (interpolation: KeyframeInterpolation) => {
      if (selectedKeyIndex === null || !activeKeys[selectedKeyIndex]) return;
      const k = activeKeys[selectedKeyIndex];
      const nextKey = activeKeys[selectedKeyIndex + 1];
      const deltaF = nextKey ? nextKey.frame - k.frame : 30;
      const deltaV = nextKey ? nextKey.value - k.value : 0;
      const handles = generatePresetHandles(interpolation, deltaF, deltaV);

      updateKeyframeAt(selectedKeyIndex, {
        interpolation,
        handleOut: interpolation === 'bezier' ? handles.handleOut : undefined,
      });
    },
    [activeKeys, selectedKeyIndex, updateKeyframeAt],
  );

  const addKeyframeAtPlayhead = useCallback(() => {
    const frame = Math.max(0, Math.min(durationFrames, clipRelativePlayheadFrame));
    // Sample current value at playhead or fallback to middle
    const currentKeys = activeKeys;
    let initialValue = getDefaultPropertyValue(selectedProperty);

    if (currentKeys.length > 0) {
      if (frame <= currentKeys[0].frame) {
        initialValue = currentKeys[0].value;
      } else if (frame >= currentKeys[currentKeys.length - 1].frame) {
        initialValue = currentKeys[currentKeys.length - 1].value;
      } else {
        const found = currentKeys.find((k) => k.frame === frame);
        if (found) {
          initialValue = found.value;
        } else {
          // linear estimate between nearest
          for (let i = 0; i < currentKeys.length - 1; i++) {
            if (frame > currentKeys[i].frame && frame < currentKeys[i + 1].frame) {
              const r = (frame - currentKeys[i].frame) / (currentKeys[i + 1].frame - currentKeys[i].frame);
              initialValue = currentKeys[i].value + (currentKeys[i + 1].value - currentKeys[i].value) * r;
              break;
            }
          }
        }
      }
    }

    const otherKeys = (clip.keyframes ?? []).filter(
      (k) => !(k.property === selectedProperty && k.frame === frame),
    );

    const newKey: ClipKeyframe = {
      property: selectedProperty,
      frame,
      value: Math.round(initialValue / propConfig.step) * propConfig.step,
      interpolation: 'bezier',
      handleOut: { frameOffset: 10, valueOffset: 0 },
      handleIn: { frameOffset: -10, valueOffset: 0 },
    };

    const next = [...otherKeys, newKey];
    onUpdateKeyframes(next);

    // Auto-select newly added keyframe
    const sorted = keyframesFor(next, selectedProperty);
    const newIdx = sorted.findIndex((k) => k.frame === frame);
    if (newIdx !== -1) {
      setSelectedKeyIndex(newIdx);
    }
  }, [
    activeKeys,
    clip.keyframes,
    clipRelativePlayheadFrame,
    durationFrames,
    onUpdateKeyframes,
    propConfig.step,
    selectedProperty,
  ]);

  const deleteSelectedKeyframe = useCallback(() => {
    if (selectedKeyIndex === null || !activeKeys[selectedKeyIndex]) return;
    const target = activeKeys[selectedKeyIndex];
    const next = (clip.keyframes ?? []).filter(
      (k) => !(k.property === selectedProperty && k.frame === target.frame),
    );
    onUpdateKeyframes(next.length > 0 ? next : undefined);
    setSelectedKeyIndex(null);
  }, [activeKeys, clip.keyframes, onUpdateKeyframes, selectedKeyIndex, selectedProperty]);

  // Pointer dragging for Nodes and Tangent Handles
  const handlePointerDown = (e: React.PointerEvent<SVGElement>, target: DragTarget) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragState({
      target,
      startX: e.clientX,
      startY: e.clientY,
    });
    if (target.type === 'keyframe') {
      setSelectedKeyIndex(target.index);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (!dragState || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const currentSvgX = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const currentSvgY = ((e.clientY - rect.top) / rect.height) * svgHeight;

    if (dragState.target.type === 'keyframe') {
      const newFrame = xToFrame(currentSvgX);
      const newValue = yToValue(currentSvgY);
      updateKeyframeAt(dragState.target.index, {
        frame: newFrame,
        value: newValue,
      });
    } else if (dragState.target.type === 'handleOut') {
      const k = activeKeys[dragState.target.keyframeIndex];
      if (!k) return;
      const kSvgX = frameToX(k.frame);
      const kSvgY = valueToY(k.value);
      const deltaSvgX = currentSvgX - kSvgX;
      const deltaSvgY = currentSvgY - kSvgY;

      // Convert delta to frame and value offsets
      const frameDelta = Math.max(0, Math.round((deltaSvgX / plotWidth) * durationFrames));
      const valueDelta = -((deltaSvgY / plotHeight) * (yBounds.max - yBounds.min));

      updateKeyframeAt(dragState.target.keyframeIndex, {
        interpolation: 'bezier',
        handleOut: { frameOffset: frameDelta, valueOffset: valueDelta },
      });
    } else if (dragState.target.type === 'handleIn') {
      const k = activeKeys[dragState.target.keyframeIndex];
      if (!k) return;
      const kSvgX = frameToX(k.frame);
      const kSvgY = valueToY(k.value);
      const deltaSvgX = currentSvgX - kSvgX;
      const deltaSvgY = currentSvgY - kSvgY;

      const frameDelta = Math.min(0, Math.round((deltaSvgX / plotWidth) * durationFrames));
      const valueDelta = -((deltaSvgY / plotHeight) * (yBounds.max - yBounds.min));

      updateKeyframeAt(dragState.target.keyframeIndex, {
        interpolation: 'bezier',
        handleIn: { frameOffset: frameDelta, valueOffset: valueDelta },
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGElement>) => {
    if (dragState) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }
      setDragState(null);
    }
  };

  // Selected Keyframe Data
  const selectedKey = selectedKeyIndex !== null ? activeKeys[selectedKeyIndex] : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-bg-surface p-3 select-none">
      {/* Property Selector & View Mode Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2">
        <div className="flex items-center gap-1">
          {availableProperties.map((prop) => (
            <button
              key={prop}
              type="button"
              onClick={() => {
                setSelectedProperty(prop);
                setSelectedKeyIndex(null);
              }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedProperty === prop
                  ? 'bg-accent-primary text-text-inverse shadow-sm'
                  : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'
              }`}
            >
              {PROPERTY_LABELS[prop]?.label ?? prop}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            title="Value Curve Graph"
            onClick={() => setViewMode('curve')}
            className={`rounded px-2 py-1 transition-colors ${
              viewMode === 'curve'
                ? 'bg-bg-subtle text-text-primary font-medium'
                : 'text-text-disabled hover:text-text-secondary'
            }`}
          >
            Value
          </button>
          <button
            type="button"
            title="Velocity Curve (Rate of Change)"
            onClick={() => setViewMode('velocity')}
            className={`rounded px-2 py-1 transition-colors ${
              viewMode === 'velocity'
                ? 'bg-bg-subtle text-text-primary font-medium'
                : 'text-text-disabled hover:text-text-secondary'
            }`}
          >
            Velocity
          </button>
        </div>
      </div>

      {/* SVG Curve Graph Canvas */}
      <div className="relative w-full overflow-hidden rounded bg-bg-app border border-hairline">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto cursor-crosshair touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-primary, #6366f1)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--accent-primary, #6366f1)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Background Grid Lines */}
          <g className="stroke-hairline opacity-60" strokeDasharray="3 3">
            {/* Horizontal Grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = padTop + pct * plotHeight;
              const val = yBounds.max - pct * (yBounds.max - yBounds.min);
              return (
                <g key={`y-${pct}`}>
                  <line x1={padLeft} y1={y} x2={svgWidth - padRight} y2={y} strokeWidth="1" />
                  <text
                    x={padLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-text-disabled text-[9px] font-mono select-none"
                  >
                    {formatPropertyValue(selectedProperty, val, 'short')}
                  </text>
                </g>
              );
            })}

            {/* Vertical Time Grid (0s, mid, end) */}
            {[0, 0.5, 1].map((pct) => {
              const x = padLeft + pct * plotWidth;
              const sec = framesToSeconds(Math.round(pct * durationFrames), fps);
              return (
                <g key={`x-${pct}`}>
                  <line x1={x} y1={padTop} x2={x} y2={svgHeight - padBottom} strokeWidth="1" />
                  <text
                    x={x}
                    y={svgHeight - padBottom + 14}
                    textAnchor="middle"
                    className="fill-text-disabled text-[9px] font-mono select-none"
                  >
                    {sec.toFixed(1)}s
                  </text>
                </g>
              );
            })}
          </g>

          {/* Area Fill under Curve (in Value mode) */}
          {viewMode === 'curve' && activeKeys.length > 0 && (
            <path
              d={`${curveSvgPath} L ${frameToX(durationFrames)} ${svgHeight - padBottom} L ${frameToX(0)} ${svgHeight - padBottom} Z`}
              fill={`url(#${gradientId})`}
            />
          )}

          {/* The Main Curve Path */}
          {viewMode === 'curve' ? (
            <path
              d={curveSvgPath}
              fill="none"
              stroke="var(--accent-primary, #6366f1)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <>
              {/* Zero-velocity center line */}
              <line
                x1={padLeft}
                y1={velocityToY(0)}
                x2={svgWidth - padRight}
                y2={velocityToY(0)}
                stroke="var(--text-disabled, #64748b)"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <path
                d={velocitySvgPath}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Playhead Indicator Line */}
          {clipRelativePlayheadFrame >= 0 && clipRelativePlayheadFrame <= durationFrames && (
            <g>
              <line
                x1={frameToX(clipRelativePlayheadFrame)}
                y1={padTop}
                x2={frameToX(clipRelativePlayheadFrame)}
                y2={svgHeight - padBottom}
                stroke="#ef4444"
                strokeWidth="1.5"
              />
              <polygon
                points={`${frameToX(clipRelativePlayheadFrame) - 4},${padTop} ${frameToX(clipRelativePlayheadFrame) + 4},${padTop} ${frameToX(clipRelativePlayheadFrame)},${padTop + 6}`}
                fill="#ef4444"
              />
            </g>
          )}

          {/* Keyframe Nodes & Tangent Handles (in Value Curve mode) */}
          {viewMode === 'curve' &&
            activeKeys.map((key, index) => {
              const kx = frameToX(key.frame);
              const ky = valueToY(key.value);
              const isSelected = selectedKeyIndex === index;

              return (
                <g key={`${key.property}-${key.frame}-${index}`}>
                  {/* Tangent Handles (shown when node is selected) */}
                  {isSelected && key.interpolation === 'bezier' && (
                    <>
                      {/* Handle In (if not first key) */}
                      {index > 0 && (
                        <g>
                          {(() => {
                            const offsetF = key.handleIn?.frameOffset ?? -10;
                            const offsetV = key.handleIn?.valueOffset ?? 0;
                            const hx = frameToX(Math.max(0, key.frame + offsetF));
                            const hy = valueToY(key.value + offsetV);
                            return (
                              <>
                                <line
                                  x1={kx}
                                  y1={ky}
                                  x2={hx}
                                  y2={hy}
                                  stroke="#a855f7"
                                  strokeWidth="1.2"
                                  strokeDasharray="2 2"
                                />
                                <circle
                                  cx={hx}
                                  cy={hy}
                                  r="4.5"
                                  className="fill-accent-ai cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                                  onPointerDown={(e) =>
                                    handlePointerDown(e, {
                                      type: 'handleIn',
                                      keyframeIndex: index,
                                      initialOffsetF: offsetF,
                                      initialOffsetV: offsetV,
                                    })
                                  }
                                />
                              </>
                            );
                          })()}
                        </g>
                      )}

                      {/* Handle Out (if not last key) */}
                      {index < activeKeys.length - 1 && (
                        <g>
                          {(() => {
                            const offsetF = key.handleOut?.frameOffset ?? 10;
                            const offsetV = key.handleOut?.valueOffset ?? 0;
                            const hx = frameToX(Math.min(durationFrames, key.frame + offsetF));
                            const hy = valueToY(key.value + offsetV);
                            return (
                              <>
                                <line
                                  x1={kx}
                                  y1={ky}
                                  x2={hx}
                                  y2={hy}
                                  stroke="#a855f7"
                                  strokeWidth="1.2"
                                  strokeDasharray="2 2"
                                />
                                <circle
                                  cx={hx}
                                  cy={hy}
                                  r="4.5"
                                  className="fill-accent-ai cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                                  onPointerDown={(e) =>
                                    handlePointerDown(e, {
                                      type: 'handleOut',
                                      keyframeIndex: index,
                                      initialOffsetF: offsetF,
                                      initialOffsetV: offsetV,
                                    })
                                  }
                                />
                              </>
                            );
                          })()}
                        </g>
                      )}
                    </>
                  )}

                  {/* Diamond Keyframe Anchor Node */}
                  <g
                    transform={`translate(${kx}, ${ky}) rotate(45)`}
                    className="cursor-pointer"
                    onPointerDown={(e) =>
                      handlePointerDown(e, {
                        type: 'keyframe',
                        index,
                        initialFrame: key.frame,
                        initialValue: key.value,
                      })
                    }
                  >
                    {isSelected && (
                      <rect
                        x="-7"
                        y="-7"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2"
                        className="animate-pulse"
                      />
                    )}
                    <rect
                      x="-5"
                      y="-5"
                      width="10"
                      height="10"
                      fill={isSelected ? '#ffffff' : 'var(--accent-primary, #6366f1)'}
                      stroke={isSelected ? '#6366f1' : '#ffffff'}
                      strokeWidth="1.5"
                      rx="1"
                    />
                  </g>
                </g>
              );
            })}
        </svg>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={addKeyframeAtPlayhead}
            title={`Add ${PROPERTY_LABELS[selectedProperty]?.label} keyframe at playhead`}
          >
            + Add Key at Playhead
          </Button>

          {selectedKey && (
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteSelectedKeyframe}
              className="text-text-danger hover:bg-danger-subtle"
              title="Delete selected keyframe"
            >
              Delete Key
            </Button>
          )}
        </div>

        {/* Easing Presets for Selected Keyframe */}
        {selectedKey && viewMode === 'curve' && (
          <div className="flex items-center gap-1 bg-bg-app rounded p-0.5 border border-hairline">
            <span className="text-[10px] text-text-disabled px-1 font-mono uppercase">Ease:</span>
            {INTERPOLATION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => applyPresetInterpolation(opt.id)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                  selectedKey.interpolation === opt.id
                    ? 'bg-accent-primary text-text-inverse'
                    : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'
                }`}
                title={`${opt.label} interpolation`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Keyframe Inspector Details */}
      {selectedKey && (
        <div className="flex items-center gap-3 rounded bg-bg-app px-2.5 py-1.5 text-xs font-mono text-text-secondary border border-hairline">
          <div>
            <span className="text-text-disabled">Time: </span>
            <span className="text-text-primary font-medium">
              {framesToSeconds(selectedKey.frame, fps).toFixed(2)}s ({selectedKey.frame}f)
            </span>
          </div>
          <div>
            <span className="text-text-disabled">Value: </span>
            <span className="text-text-primary font-medium">
              {formatPropertyValue(selectedProperty, selectedKey.value, 'long')}
            </span>
          </div>
          <div>
            <span className="text-text-disabled">Curve: </span>
            <span className="text-accent-primary font-medium capitalize">
              {selectedKey.interpolation.replace('_', ' ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
