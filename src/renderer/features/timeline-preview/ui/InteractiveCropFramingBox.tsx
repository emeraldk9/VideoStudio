import React, { useRef, useState } from 'react';
import {
  type CropFramingBox,
  type TargetAspectRatio,
  ASPECT_RATIO_PRESETS,
  panOffsetFromCropBoxCenter,
} from '@shared';

export interface InteractiveCropFramingBoxProps {
  sourceWidth: number;
  sourceHeight: number;
  targetAspect: TargetAspectRatio;
  cropBox: CropFramingBox;
  panX: number;
  panY: number;
  onPanChange: (panX: number, panY: number) => void;
  onResetPan?: () => void;
}

/**
 * Interactive on-canvas draggable crop framing box.
 *
 * Allows editors to visually position the AI auto-reframe crop window over widescreen
 * or vertical content with live drag tracking, safe-zone awareness, and center-point indicators.
 */
export function InteractiveCropFramingBox({
  sourceWidth,
  sourceHeight,
  targetAspect,
  cropBox,
  panX,
  panY,
  onPanChange,
  onResetPan,
}: InteractiveCropFramingBoxProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    fromCenterX: number;
    fromCenterY: number;
  } | null>(null);

  const preset = ASPECT_RATIO_PRESETS[targetAspect];

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    dragStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      fromCenterX: cropBox.centerX,
      fromCenterY: cropBox.centerY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const parent = e.currentTarget.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;

    const newCenterX = Math.max(0, Math.min(1, drag.fromCenterX + dx));
    const newCenterY = Math.max(0, Math.min(1, drag.fromCenterY + dy));

    const newOffset = panOffsetFromCropBoxCenter(
      newCenterX,
      newCenterY,
      sourceWidth,
      sourceHeight,
      targetAspect,
    );

    onPanChange(newOffset.panX, newOffset.panY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const leftPct = cropBox.leftPct * 100;
  const topPct = cropBox.topPct * 100;
  const widthPct = cropBox.widthPct * 100;
  const heightPct = cropBox.heightPct * 100;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-30 overflow-hidden">
      {/* 1. Outside Scrim Masks (dim non-included frame portions) */}
      {/* Left Scrim */}
      {cropBox.leftPct > 0 && (
        <div
          className="absolute inset-y-0 left-0 bg-black/60 backdrop-blur-[1px] transition-opacity"
          style={{ width: `${leftPct}%` }}
        />
      )}
      {/* Right Scrim */}
      {cropBox.leftPct + cropBox.widthPct < 1 && (
        <div
          className="absolute inset-y-0 right-0 bg-black/60 backdrop-blur-[1px] transition-opacity"
          style={{ width: `${(1 - (cropBox.leftPct + cropBox.widthPct)) * 100}%` }}
        />
      )}
      {/* Top Scrim */}
      {cropBox.topPct > 0 && (
        <div
          className="absolute inset-x-0 top-0 bg-black/60 backdrop-blur-[1px] transition-opacity"
          style={{
            height: `${topPct}%`,
            left: `${leftPct}%`,
            width: `${widthPct}%`,
          }}
        />
      )}
      {/* Bottom Scrim */}
      {cropBox.topPct + cropBox.heightPct < 1 && (
        <div
          className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-[1px] transition-opacity"
          style={{
            height: `${(1 - (cropBox.topPct + cropBox.heightPct)) * 100}%`,
            left: `${leftPct}%`,
            width: `${widthPct}%`,
          }}
        />
      )}

      {/* 2. Draggable Framing Bounding Box */}
      <div
        role="region"
        aria-label={`Interactive ${preset.name} crop framing box`}
        className={`pointer-events-auto absolute cursor-grab active:cursor-grabbing border-2 rounded-xs transition-shadow ${
          isDragging
            ? 'border-accent-ai shadow-[0_0_15px_rgba(56,189,248,0.5)]'
            : 'border-accent-ai/80 hover:border-accent-ai shadow-md'
        }`}
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={onResetPan}
      >
        {/* Aspect Tag Header */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/70 border border-white/20 text-[10px] font-mono font-medium text-white shadow-xs backdrop-blur-sm">
          <span className="material-symbols-outlined text-[12px] text-accent-ai">
            {preset.icon}
          </span>
          <span>{preset.shortLabel}</span>
          {cropBox.maxPanX > 0 && (
            <span className="text-text-disabled text-[9px]">
              Pan X: {(panX * 100).toFixed(1)}%
            </span>
          )}
          {cropBox.maxPanY > 0 && (
            <span className="text-text-disabled text-[9px]">
              Pan Y: {(panY * 100).toFixed(1)}%
            </span>
          )}
        </div>

        {/* Center Crosshair */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="h-4 w-px bg-white/60 absolute left-0 -top-2" />
          <div className="w-4 h-px bg-white/60 absolute -left-2 top-0" />
          <div className="h-2 w-2 rounded-full border border-white/80 absolute -left-1 -top-1" />
        </div>

        {/* 4 Corner Markers */}
        <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-white pointer-events-none" />
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-white pointer-events-none" />
        <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-white pointer-events-none" />
        <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-white pointer-events-none" />

        {/* Bottom Hint */}
        <div className="absolute bottom-1 inset-x-0 text-center pointer-events-none">
          <span className="text-[8px] font-mono text-white/50 tracking-wider uppercase">
            {cropBox.maxPanX > 0 ? 'Drag horizontally · Double-click to center' : 'Drag to adjust framing'}
          </span>
        </div>
      </div>
    </div>
  );
}
