/**
 * Milestone S67 — Inline Track Automation Lanes & Velocity Tangent Editor.
 *
 * Provides an interactive visual SVG automation curve directly inside timeline clips,
 * featuring smooth cubic Bézier curve rendering, diamond keyframe handles, draggable
 * velocity tangent handles (with symmetric / asymmetric curvature adjustment),
 * live parameter readout, double-click insertion, and multi-property switching
 * (Volume, Opacity, Scale, Rotation, Position).
 */

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  type ClipKeyframe,
  type KeyframeInterpolation,
  type KeyframeProperty,
  keyframesFor,
  type SequenceClip,
  buildSvgKeyframePath,
  denormalizeKeyframeValue,
  formatKeyframeValue,
  insertKeyframeAtFrame,
  deleteKeyframeAtFrame,
  normalizeKeyframeValue,
  updateKeyframeTangent,
  KEYFRAME_PROPERTY_CONFIGS,
} from '@shared';
import { useSequenceStore } from '../../../entities/sequence';

export interface InlineKeyframeCurveProps {
  clip: SequenceClip;
  fps: number;
  widthPx: number;
  heightPx: number;
  onClose?: () => void;
}

type DragState =
  | {
      type: 'keyframe';
      frame: number;
      startX: number;
      startY: number;
      initialFrame: number;
      initialValue: number;
    }
  | {
      type: 'handleIn' | 'handleOut';
      frame: number;
      startX: number;
      startY: number;
      initialFrameOffset: number;
      initialValueOffset: number;
    };

const INTERPOLATION_PRESETS: Array<{
  id: KeyframeInterpolation;
  label: string;
  icon: string;
}> = [
  { id: 'linear', label: 'Linear', icon: 'linear_scale' },
  { id: 'ease_in', label: 'Ease In', icon: 'trending_up' },
  { id: 'ease_out', label: 'Ease Out', icon: 'trending_flat' },
  { id: 'bezier', label: 'Smooth Bezier', icon: 'gesture' },
  { id: 'hold', label: 'Hold', icon: 'pause' },
];

export function InlineKeyframeCurve({
  clip,
  fps: _fps,
  widthPx,
  heightPx,
  onClose,
}: InlineKeyframeCurveProps) {
  const patchClip = useSequenceStore((state) => state.patchClip);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gradientId = useId();

  // Determine available properties based on clip sourceKind
  const availableProperties = useMemo<KeyframeProperty[]>(() => {
    switch (clip.sourceKind) {
      case 'audio':
        return ['volume'];
      case 'video':
      case 'still':
      case 'compound':
        return ['opacity', 'volume', 'scale', 'rotation', 'x', 'y'];
      case 'text':
        return ['opacity', 'scale', 'rotation', 'x', 'y'];
      case 'effect':
      default:
        return ['opacity'];
    }
  }, [clip.sourceKind]);

  const [activeProperty, setActiveProperty] = useState<KeyframeProperty>(() => {
    return clip.sourceKind === 'audio' ? 'volume' : 'opacity';
  });

  const [selectedKeyFrame, setSelectedKeyFrame] = useState<number | null>(null);
  const [hoveredKeyFrame, setHoveredKeyFrame] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Property config & default value
  const propertyConfig = KEYFRAME_PROPERTY_CONFIGS[activeProperty];
  const defaultValue = propertyConfig?.defaultValue ?? 0;

  // Active keyframes sorted by frame for current property
  const activeKeys = useMemo(
    () => keyframesFor(clip.keyframes, activeProperty),
    [clip.keyframes, activeProperty],
  );

  // Currently selected keyframe object
  const selectedKey = useMemo(
    () => activeKeys.find((k) => k.frame === selectedKeyFrame) ?? null,
    [activeKeys, selectedKeyFrame],
  );

  // Padding inside the clip block
  const paddingY = 8;
  const usableHeight = Math.max(12, heightPx - paddingY * 2);
  const totalFrames = Math.max(1, clip.durationFrames);

  // Coordinate conversions
  const frameToPx = useCallback(
    (f: number) => (Math.max(0, Math.min(totalFrames, f)) / totalFrames) * widthPx,
    [totalFrames, widthPx],
  );

  const pxToFrame = useCallback(
    (x: number) => Math.round(Math.max(0, Math.min(1, x / widthPx)) * totalFrames),
    [totalFrames, widthPx],
  );

  const valueToPy = useCallback(
    (v: number) => {
      const norm = normalizeKeyframeValue(activeProperty, v);
      return heightPx - paddingY - norm * usableHeight;
    },
    [activeProperty, heightPx, paddingY, usableHeight],
  );

  const pyToValue = useCallback(
    (y: number) => {
      const norm = Math.max(0, Math.min(1, (heightPx - paddingY - y) / usableHeight));
      return denormalizeKeyframeValue(activeProperty, norm);
    },
    [activeProperty, heightPx, paddingY, usableHeight],
  );

  // Path generation
  const curvePath = useMemo(() => {
    return buildSvgKeyframePath(
      clip.keyframes,
      activeProperty,
      clip.durationFrames,
      widthPx,
      heightPx,
      defaultValue,
      paddingY,
    );
  }, [clip.keyframes, activeProperty, clip.durationFrames, widthPx, heightPx, defaultValue, paddingY]);

  // Closed area path for subtle gradient wash under curve
  const areaPath = useMemo(() => {
    if (!curvePath) return '';
    const bottomY = heightPx - paddingY;
    return `${curvePath} L ${widthPx.toFixed(1)} ${bottomY.toFixed(1)} L 0 ${bottomY.toFixed(1)} Z`;
  }, [curvePath, widthPx, heightPx, paddingY]);

  // Baseline reference position (e.g., 0 dB or 1.0 opacity)
  const baselineY = useMemo(() => {
    const baseVal = activeProperty === 'volume' ? 0 : 1;
    return valueToPy(baseVal);
  }, [activeProperty, valueToPy]);

  // Keyframe commit helper
  const commitKeyframes = useCallback(
    (nextKeys: ClipKeyframe[]) => {
      patchClip(clip.id, { keyframes: nextKeys.length > 0 ? nextKeys : undefined });
    },
    [clip.id, patchClip],
  );

  // Add / Insert keyframe at double click or canvas click
  const handleCanvasDoubleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      event.stopPropagation();
      event.preventDefault();
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const targetFrame = pxToFrame(clickX);

      const nextKeys = insertKeyframeAtFrame(
        clip.keyframes,
        activeProperty,
        targetFrame,
        defaultValue,
        'bezier',
      );
      commitKeyframes(nextKeys);
      setSelectedKeyFrame(targetFrame);
    },
    [activeProperty, clip.keyframes, commitKeyframes, defaultValue, pxToFrame],
  );

  // Delete selected keyframe
  const handleDeleteSelected = useCallback(
    (event?: React.MouseEvent) => {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }
      if (selectedKeyFrame === null) return;
      const nextKeys = deleteKeyframeAtFrame(clip.keyframes, activeProperty, selectedKeyFrame);
      commitKeyframes(nextKeys);
      setSelectedKeyFrame(null);
    },
    [activeProperty, clip.keyframes, commitKeyframes, selectedKeyFrame],
  );

  // Change interpolation mode of selected keyframe
  const handleSetInterpolation = useCallback(
    (interpolation: KeyframeInterpolation) => {
      if (!selectedKey) return;
      const current = clip.keyframes ?? [];
      const updated = current.map((k) => {
        if (k.property === activeProperty && k.frame === selectedKey.frame) {
          return { ...k, interpolation };
        }
        return k;
      });
      commitKeyframes(updated);
    },
    [activeProperty, clip.keyframes, commitKeyframes, selectedKey],
  );

  // Pointer drag handling for keyframes & tangent handles
  const handlePointerDownKeyframe = useCallback(
    (event: React.PointerEvent, key: ClipKeyframe) => {
      event.stopPropagation();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      setSelectedKeyFrame(key.frame);
      setDragState({
        type: 'keyframe',
        frame: key.frame,
        startX: event.clientX,
        startY: event.clientY,
        initialFrame: key.frame,
        initialValue: key.value,
      });
    },
    [],
  );

  const handlePointerDownTangent = useCallback(
    (event: React.PointerEvent, handleType: 'handleIn' | 'handleOut') => {
      event.stopPropagation();
      if (!selectedKey) return;
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      const initialOffsetF =
        handleType === 'handleIn'
          ? (selectedKey.handleIn?.frameOffset ?? -totalFrames * 0.1)
          : (selectedKey.handleOut?.frameOffset ?? totalFrames * 0.1);
      const initialValueOffset =
        handleType === 'handleIn'
          ? (selectedKey.handleIn?.valueOffset ?? 0)
          : (selectedKey.handleOut?.valueOffset ?? 0);

      setDragState({
        type: handleType,
        frame: selectedKey.frame,
        startX: event.clientX,
        startY: event.clientY,
        initialFrameOffset: initialOffsetF,
        initialValueOffset,
      });
    },
    [selectedKey, totalFrames],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragState || !svgRef.current) return;
      event.stopPropagation();

      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;

      if (dragState.type === 'keyframe') {
        const dFrame = Math.round((dx / widthPx) * totalFrames);
        const newFrame = Math.max(0, Math.min(totalFrames, dragState.initialFrame + dFrame));

        const rect = svgRef.current.getBoundingClientRect();
        const currentY = event.clientY - rect.top;
        const newValue = pyToValue(currentY);

        const currentKeys = clip.keyframes ?? [];
        const nextKeys = currentKeys.map((k) => {
          if (k.property === activeProperty && k.frame === dragState.frame) {
            return {
              ...k,
              frame: newFrame,
              value: newValue,
            };
          }
          return k;
        });

        // Keep sorted by frame
        nextKeys.sort((a, b) => (a.property === b.property ? a.frame - b.frame : 0));
        commitKeyframes(nextKeys);
        setSelectedKeyFrame(newFrame);
        setDragState((prev) => (prev ? { ...prev, frame: newFrame } : null));
      } else if (dragState.type === 'handleIn' || dragState.type === 'handleOut') {
        const dFrame = (dx / widthPx) * totalFrames;
        const range = (propertyConfig?.max ?? 1) - (propertyConfig?.min ?? 0);
        const dVal = -(dy / usableHeight) * range;

        const isHandleOut = dragState.type === 'handleOut';
        const targetFrameOffset = isHandleOut
          ? Math.max(0, dragState.initialFrameOffset + dFrame)
          : Math.min(0, dragState.initialFrameOffset + dFrame);
        const targetValueOffset = dragState.initialValueOffset + dVal;

        if (selectedKey) {
          const symmetric = !event.shiftKey;
          const updatedKey = updateKeyframeTangent(
            selectedKey,
            isHandleOut ? 'out' : 'in',
            targetFrameOffset,
            targetValueOffset,
            symmetric,
          );

          const currentKeys = clip.keyframes ?? [];
          const nextKeys = currentKeys.map((k) => {
            if (k.property === activeProperty && k.frame === selectedKey.frame) {
              return updatedKey;
            }
            return k;
          });
          commitKeyframes(nextKeys);
        }
      }
    },
    [
      activeProperty,
      clip.keyframes,
      commitKeyframes,
      dragState,
      propertyConfig,
      pyToValue,
      selectedKey,
      totalFrames,
      usableHeight,
      widthPx,
    ],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (dragState) {
      event.stopPropagation();
      setDragState(null);
    }
  }, [dragState]);

  // Color schemes based on property
  const isAudioVolume = activeProperty === 'volume';
  const strokeColor = isAudioVolume ? '#f59e0b' : '#38bdf8';

  // Calculate tangent knob coordinates for selected keyframe
  const tangentControls = useMemo(() => {
    if (!selectedKey || selectedKey.interpolation !== 'bezier') return null;

    const kX = frameToPx(selectedKey.frame);
    const kY = valueToPy(selectedKey.value);

    const outOffsetF = selectedKey.handleOut?.frameOffset ?? totalFrames * 0.1;
    const outOffsetV = selectedKey.handleOut?.valueOffset ?? 0;
    const outX = frameToPx(selectedKey.frame + outOffsetF);
    const outY = valueToPy(selectedKey.value + outOffsetV);

    const inOffsetF = selectedKey.handleIn?.frameOffset ?? -totalFrames * 0.1;
    const inOffsetV = selectedKey.handleIn?.valueOffset ?? 0;
    const inX = frameToPx(selectedKey.frame + inOffsetF);
    const inY = valueToPy(selectedKey.value + inOffsetV);

    return { kX, kY, inX, inY, outX, outY };
  }, [frameToPx, selectedKey, totalFrames, valueToPy]);

  return (
    <div
      className="absolute inset-0 z-30 select-none overflow-hidden rounded-[4px] bg-black/40 backdrop-blur-[2px] transition-colors"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Top Floating Automation Toolbar Pill */}
      <div className="absolute top-1 left-1.5 right-1.5 z-40 flex items-center justify-between gap-1 pointer-events-auto">
        {/* Property Selector Chips */}
        <div className="flex items-center gap-0.5 rounded-[4px] bg-black/85 p-0.5 shadow-md border border-white/10 backdrop-blur-md">
          {availableProperties.map((prop) => {
            const isActive = prop === activeProperty;
            const keyCount = keyframesFor(clip.keyframes, prop).length;
            const shortLabel =
              prop === 'volume'
                ? 'VOL'
                : prop === 'opacity'
                  ? 'OPA'
                  : prop === 'scale'
                    ? 'SCL'
                    : prop === 'rotation'
                      ? 'ROT'
                      : prop.toUpperCase();

            return (
              <button
                key={prop}
                type="button"
                className={[
                  'flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold transition-all',
                  isActive
                    ? isAudioVolume
                      ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-xs'
                      : 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 shadow-xs'
                    : 'text-white/60 hover:text-white hover:bg-white/10',
                ].join(' ')}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveProperty(prop);
                  setSelectedKeyFrame(null);
                }}
                title={`${KEYFRAME_PROPERTY_CONFIGS[prop]?.label ?? prop} (${keyCount} keys)`}
              >
                <span>{shortLabel}</span>
                {keyCount > 0 && (
                  <span className="h-1 w-1 rounded-full bg-accent-ai shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Keyframe Context Controls (When a key is selected) */}
        {selectedKey ? (
          <div className="flex items-center gap-1 rounded-[4px] bg-black/85 px-1.5 py-0.5 shadow-md border border-white/10 backdrop-blur-md">
            {/* Interpolation buttons */}
            <div className="flex items-center gap-0.5 border-r border-white/10 pr-1">
              {INTERPOLATION_PRESETS.map((preset) => {
                const isSelected = (selectedKey.interpolation ?? 'linear') === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={[
                      'flex h-4 w-4 items-center justify-center rounded transition-colors',
                      isSelected
                        ? 'bg-accent-ai text-black font-bold'
                        : 'text-white/60 hover:text-white hover:bg-white/10',
                    ].join(' ')}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetInterpolation(preset.id);
                    }}
                    title={`Interpolation: ${preset.label}`}
                  >
                    <span className="material-symbols-outlined text-[11px] leading-none">
                      {preset.icon}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Value & Frame readout */}
            <span className="font-mono text-[9px] font-bold text-white/90">
              {formatKeyframeValue(activeProperty, selectedKey.value)}
            </span>
            <span className="font-mono text-[8px] text-white/50">
              f:{selectedKey.frame}
            </span>

            {/* Delete keyframe */}
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
              onClick={handleDeleteSelected}
              title="Delete Keyframe"
            >
              <span className="material-symbols-outlined text-[12px] leading-none">
                delete
              </span>
            </button>
          </div>
        ) : null}

        {/* Close Automation Lane Button */}
        {onClose && (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-black/80 text-white/60 hover:text-white hover:bg-white/20 border border-white/10 shadow-sm transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close Automation Curve (Alt+K)"
          >
            <span className="material-symbols-outlined text-[13px] leading-none">
              close
            </span>
          </button>
        )}
      </div>

      {/* SVG Canvas for Curve, Grid, Handles, and Points */}
      <svg
        ref={svgRef}
        className="h-full w-full cursor-crosshair overflow-visible"
        onDoubleClick={handleCanvasDoubleClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Baseline Guideline */}
        <line
          x1={0}
          y1={baselineY}
          x2={widthPx}
          y2={baselineY}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeDasharray="3 3"
          strokeWidth={1}
          className="pointer-events-none"
        />

        {/* Filled area under curve */}
        {areaPath && (
          <path
            d={areaPath}
            fill={`url(#${gradientId}-area)`}
            className="pointer-events-none transition-all"
          />
        )}

        {/* Continuous Bézier Curve */}
        {curvePath && (
          <path
            d={curvePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
          />
        )}

        {/* Tangent Handles (When a Bézier keyframe is selected) */}
        {tangentControls && (
          <g className="pointer-events-auto">
            {/* In stem line */}
            <line
              x1={tangentControls.kX}
              y1={tangentControls.kY}
              x2={tangentControls.inX}
              y2={tangentControls.inY}
              stroke="#a855f7"
              strokeWidth={1.25}
              strokeDasharray="2 2"
            />
            {/* Out stem line */}
            <line
              x1={tangentControls.kX}
              y1={tangentControls.kY}
              x2={tangentControls.outX}
              y2={tangentControls.outY}
              stroke="#a855f7"
              strokeWidth={1.25}
              strokeDasharray="2 2"
            />
            {/* In Handle Knob */}
            <circle
              cx={tangentControls.inX}
              cy={tangentControls.inY}
              r={4}
              fill="#c084fc"
              stroke="#581c87"
              strokeWidth={1.5}
              className="cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
              onPointerDown={(e) => handlePointerDownTangent(e, 'handleIn')}
            >
              <title>Tangent In Handle (Hold Shift for asymmetric)</title>
            </circle>
            {/* Out Handle Knob */}
            <circle
              cx={tangentControls.outX}
              cy={tangentControls.outY}
              r={4}
              fill="#c084fc"
              stroke="#581c87"
              strokeWidth={1.5}
              className="cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
              onPointerDown={(e) => handlePointerDownTangent(e, 'handleOut')}
            >
              <title>Tangent Out Handle (Hold Shift for asymmetric)</title>
            </circle>
          </g>
        )}

        {/* Keyframe Diamond Knobs */}
        {activeKeys.map((key) => {
          const kx = frameToPx(key.frame);
          const ky = valueToPy(key.value);
          const isSelected = key.frame === selectedKeyFrame;
          const isHovered = key.frame === hoveredKeyFrame;
          const size = isSelected ? 6.5 : isHovered ? 5.5 : 4.5;

          return (
            <g
              key={`${key.property}-${key.frame}`}
              transform={`translate(${kx}, ${ky})`}
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(e) => handlePointerDownKeyframe(e, key)}
              onMouseEnter={() => setHoveredKeyFrame(key.frame)}
              onMouseLeave={() => setHoveredKeyFrame(null)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedKeyFrame(key.frame);
              }}
            >
              {/* Hit area */}
              <circle r={12} fill="transparent" />

              {/* Diamond Polygon */}
              <polygon
                points={`${0},${-size} ${size},${0} ${0},${size} ${-size},${0}`}
                fill={isSelected ? '#ffffff' : strokeColor}
                stroke={isSelected ? '#06b6d4' : '#000000'}
                strokeWidth={isSelected ? 1.75 : 1}
                className="transition-transform filter drop-shadow-md"
              />

              {/* Value Tooltip on hover */}
              {(isHovered || isSelected) && (
                <text
                  x={0}
                  y={-size - 4}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="8"
                  fontFamily="monospace"
                  fontWeight="bold"
                  className="pointer-events-none select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                >
                  {formatKeyframeValue(activeProperty, key.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
