import { useState, useRef, useCallback, useEffect } from 'react';
import {
  type ClipTransform,
  type SequenceClip,
  type TextContent,
  PIP_PRESETS,
  calculateGizmoDragPosition,
  calculateGizmoResize,
  calculateGizmoRotation,
  type GizmoHandle,
  type SnapGuideLine,
} from '@shared';

export interface TransformGizmoProps {
  clip: SequenceClip;
  containerDims: { width: number; height: number };
  onTransformChange: (transform: ClipTransform, commit?: boolean) => void;
  onTextPositionChange?: (pos: { x: number; y: number }, commit?: boolean) => void;
}

const HANDLE_CLASSES: Record<GizmoHandle, string> = {
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  n: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  e: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  w: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  rot: '-top-6 left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing',
};

export function TransformGizmo({
  clip,
  containerDims,
  onTransformChange,
  onTextPositionChange,
}: TransformGizmoProps) {
  const isText = clip.sourceKind === 'text';
  const textEffects = clip.effects?.text;
  const clipTransform = clip.effects?.transform;

  // Active gesture state
  const [activeGesture, setActiveGesture] = useState<'move' | 'resize' | 'rotate' | null>(null);
  const [activeGuides, setActiveGuides] = useState<SnapGuideLine[]>([]);
  const [liveTransform, setLiveTransform] = useState<ClipTransform | null>(null);
  const [liveTextPos, setLiveTextPos] = useState<{ x: number; y: number } | null>(null);

  // Gesture tracking refs
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialScale: number;
    handle?: GizmoHandle;
  } | null>(null);

  // Compute live or stored values
  const currentScale = liveTransform?.scale ?? clipTransform?.scale ?? 1;
  const currentX = isText
    ? (liveTextPos?.x ?? textEffects?.positionPct?.x ?? 0.5)
    : (liveTransform?.x ?? clipTransform?.x ?? 0.5);
  const currentY = isText
    ? (liveTextPos?.y ?? textEffects?.positionPct?.y ?? 0.5)
    : (liveTransform?.y ?? clipTransform?.y ?? 0.5);

  // Bounding box dimensions (as percentages of container)
  const boxWidthPct = isText ? 40 : currentScale * 100;
  const boxHeightPct = isText ? 20 : currentScale * 100;
  const boxLeftPct = isText ? (currentX * 100 - boxWidthPct / 2) : ((currentX - currentScale / 2) * 100);
  const boxTopPct = isText ? (currentY * 100 - boxHeightPct / 2) : ((currentY - currentScale / 2) * 100);

  // Move Gesture (Center / Box drag)
  const handleMoveStart = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();

      const pointerId = event.pointerId;
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(pointerId);

      dragRef.current = {
        pointerId,
        startX: event.clientX,
        startY: event.clientY,
        initialX: currentX,
        initialY: currentY,
        initialScale: currentScale,
      };
      setActiveGesture('move');

      const onPointerMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const deltaPx = {
          x: e.clientX - drag.startX,
          y: e.clientY - drag.startY,
        };
        const snapEnabled = !e.altKey;
        const next = calculateGizmoDragPosition(
          { x: drag.initialX, y: drag.initialY },
          deltaPx,
          containerDims,
          snapEnabled
        );

        setActiveGuides(next.activeGuides);

        if (isText && onTextPositionChange) {
          setLiveTextPos({ x: next.x, y: next.y });
          onTextPositionChange({ x: next.x, y: next.y }, false);
        } else {
          const updated: ClipTransform = {
            ...clipTransform,
            x: next.x,
            y: next.y,
            scale: currentScale,
          };
          setLiveTransform(updated);
          onTransformChange(updated, false);
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        target.releasePointerCapture(pointerId);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        setActiveGesture(null);
        setActiveGuides([]);

        const drag = dragRef.current;
        if (drag) {
          const deltaPx = {
            x: e.clientX - drag.startX,
            y: e.clientY - drag.startY,
          };
          const next = calculateGizmoDragPosition(
            { x: drag.initialX, y: drag.initialY },
            deltaPx,
            containerDims,
            !e.altKey
          );

          if (isText && onTextPositionChange) {
            onTextPositionChange({ x: next.x, y: next.y }, true);
          } else {
            onTransformChange({
              ...clipTransform,
              x: next.x,
              y: next.y,
              scale: currentScale,
            }, true);
          }
        }

        dragRef.current = null;
        setLiveTransform(null);
        setLiveTextPos(null);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [clipTransform, containerDims, currentScale, currentX, currentY, isText, onTextPositionChange, onTransformChange]
  );

  // Resize Gesture (Handle drag)
  const handleResizeStart = useCallback(
    (event: React.PointerEvent, handle: GizmoHandle) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();

      const pointerId = event.pointerId;
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(pointerId);

      dragRef.current = {
        pointerId,
        startX: event.clientX,
        startY: event.clientY,
        initialX: currentX,
        initialY: currentY,
        initialScale: currentScale,
        handle,
      };
      setActiveGesture('resize');

      const onPointerMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const deltaPx = {
          x: e.clientX - drag.startX,
          y: e.clientY - drag.startY,
        };
        const newScale = calculateGizmoResize(drag.initialScale, handle, deltaPx, containerDims);

        const updated: ClipTransform = {
          ...clipTransform,
          scale: newScale,
          x: currentX,
          y: currentY,
        };
        setLiveTransform(updated);
        onTransformChange(updated, false);
      };

      const onPointerUp = (e: PointerEvent) => {
        target.releasePointerCapture(pointerId);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        setActiveGesture(null);

        const drag = dragRef.current;
        if (drag) {
          const deltaPx = {
            x: e.clientX - drag.startX,
            y: e.clientY - drag.startY,
          };
          const finalScale = calculateGizmoResize(drag.initialScale, handle, deltaPx, containerDims);
          onTransformChange({
            ...clipTransform,
            scale: finalScale,
            x: currentX,
            y: currentY,
          }, true);
        }

        dragRef.current = null;
        setLiveTransform(null);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [clipTransform, containerDims, currentScale, currentX, currentY, onTransformChange]
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-visible select-none">
      {/* Magnetic Snap Alignment Guides */}
      {activeGuides.map((guide, idx) =>
        guide.axis === 'x' ? (
          <div
            key={`x-${idx}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] z-40"
            style={{ left: `${guide.positionPct * 100}%` }}
          >
            <span className="absolute top-2 left-1 font-mono text-[9px] bg-cyan-950/80 text-cyan-300 px-1 py-0.5 rounded border border-cyan-500/40">
              {guide.label}
            </span>
          </div>
        ) : (
          <div
            key={`y-${idx}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-px bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] z-40"
            style={{ top: `${guide.positionPct * 100}%` }}
          >
            <span className="absolute left-2 top-1 font-mono text-[9px] bg-cyan-950/80 text-cyan-300 px-1 py-0.5 rounded border border-cyan-500/40">
              {guide.label}
            </span>
          </div>
        )
      )}

      {/* Transform Bounding Box */}
      <div
        className={`pointer-events-auto absolute border-2 transition-[border-color] duration-100 ${
          activeGesture ? 'border-cyan-400 shadow-md' : 'border-accent-ai/80 hover:border-cyan-300'
        }`}
        style={{
          left: `${boxLeftPct}%`,
          top: `${boxTopPct}%`,
          width: `${boxWidthPct}%`,
          height: `${boxHeightPct}%`,
        }}
        onPointerDown={handleMoveStart}
      >
        {/* Center Drag Anchor Crosshair */}
        <div
          aria-label="Center Drag Anchor"
          title="Drag to reposition (Alt to disable snap)"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border border-cyan-400/80 bg-cyan-950/60 flex items-center justify-center cursor-move hover:scale-125 transition-transform shadow-md"
        >
          <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
        </div>

        {/* 8 Resize Handles (hidden for text clips, shown for video/stills) */}
        {!isText &&
          (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as GizmoHandle[]).map((handle) => (
            <div
              key={handle}
              role="button"
              aria-label={`Resize ${handle.toUpperCase()}`}
              className={`absolute h-2.5 w-2.5 bg-white border border-neutral-900 rounded-xs shadow-md transition-transform hover:scale-125 z-40 ${HANDLE_CLASSES[handle]}`}
              onPointerDown={(e) => handleResizeStart(e, handle)}
            />
          ))}

        {/* Floating Mini HUD */}
        <div
          className="pointer-events-auto absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex items-center gap-1.5 rounded-card border border-hairline bg-bg-panel/95 backdrop-blur-md px-2 py-1 shadow-2xl z-50 text-[11px] whitespace-nowrap"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Coordinates & Scale Readout */}
          <div className="flex items-center gap-1 font-mono text-[10px] text-text-secondary border-r border-hairline pr-1.5">
            <span>
              {Math.round(currentX * 100)}%, {Math.round(currentY * 100)}%
            </span>
            {!isText && (
              <>
                <span className="text-text-disabled">·</span>
                <span className="text-accent-ai font-semibold">{Math.round(currentScale * 100)}%</span>
              </>
            )}
          </div>

          {/* Quick Actions */}
          {!isText && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Full screen"
                title="Fit to full screen"
                onClick={() => onTransformChange({ ...clipTransform, scale: 1, x: 0.5, y: 0.5 }, true)}
                className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">fullscreen</span>
              </button>

              <button
                type="button"
                aria-label="Top-Right Corner PiP"
                title="Corner Top-Right PiP"
                onClick={() => onTransformChange({ ...clipTransform, ...PIP_PRESETS.corner_tr }, true)}
                className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_outward</span>
              </button>

              <button
                type="button"
                aria-label="Bottom-Right Corner PiP"
                title="Corner Bottom-Right PiP"
                onClick={() => onTransformChange({ ...clipTransform, ...PIP_PRESETS.corner_br }, true)}
                className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">south_east</span>
              </button>

              <button
                type="button"
                aria-label="Reset transform"
                title="Reset to center (1.0x)"
                onClick={() => onTransformChange({ ...clipTransform, scale: 1, x: 0.5, y: 0.5 }, true)}
                className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-accent-warning transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">restart_alt</span>
              </button>
            </div>
          )}

          {isText && (
            <button
              type="button"
              aria-label="Center text"
              title="Center text on canvas"
              onClick={() => onTextPositionChange && onTextPositionChange({ x: 0.5, y: 0.5 }, true)}
              className="flex items-center gap-1 p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-[10px]"
            >
              <span className="material-symbols-outlined text-[13px]">filter_center_focus</span>
              <span>Center</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
