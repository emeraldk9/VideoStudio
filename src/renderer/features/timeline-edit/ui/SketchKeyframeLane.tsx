import { useMemo, useRef, useState, useCallback } from 'react';
import {
  formatTimecode,
  layoutTrack,
  polygonPointsSvg,
  resolveWhiteboardInFrame,
  resolveWhiteboardOutFrame,
  toMediaUrl,
  whiteboardZoneTimeSlices,
  zoneThumbnailViewBox,
  type ClipEffects,
  type SequenceClip,
  type SequenceTrack,
  type WhiteboardSettings,
} from '@shared';

import { useSequenceStore } from '../../../entities/sequence';
import { useMediaPanelStore } from '../../timeline-media/lib/mediaPanelStore';
import { LANE_LABEL_WIDTH_PX } from './TimelineLane';

export interface SketchKeyframeLaneProps {
  spineTrack: SequenceTrack;
  spineClips: SequenceClip[];
  fps: number;
  pixelsPerSecond: number;
  widthPx: number;
  selectedClipIds: string[];
}

/**
 * Beta S5 / S6 — Dedicated Timeline Lane for Sketch In/Out Keyframes & Zone Visuals.
 *
 * Visually represents the whiteboard reveal lifecycle for clips on the spine:
 * - Keyframe In (◆): Moment the drawing animation begins (amber diamond).
 * - Keyframe Out (◆): Moment the drawing completes and locks to full frame (cyan diamond).
 * - Drawing Span: Active drawing progress bar with animated/hatch pattern or zone thumbnails.
 * - Zone Thumbnails: Direct visual image previews of each custom zone in its chronological window.
 * - Adaptive Height: Automatically elevates to 52px when multi-zone reveals are active.
 * - Hold Span: 100% held frame duration through the end of the clip.
 *
 * Supports tactile dragging to retime in/out points directly on the timeline surface,
 * frame snapping, playhead seeking on click, and 1-click jump to Sketch Inspector.
 */
export function SketchKeyframeLane({
  spineTrack,
  spineClips,
  fps,
  pixelsPerSecond,
  widthPx,
  selectedClipIds,
}: SketchKeyframeLaneProps) {
  const patchClip = useSequenceStore((state) => state.patchClip);
  const setPlayhead = useSequenceStore((state) => state.setPlayhead);
  const select = useSequenceStore((state) => state.select);

  const pixelsPerFrame = pixelsPerSecond / fps;

  // Layout all clips on the spine track
  const placedSpine = useMemo(
    () => layoutTrack(spineClips, spineTrack),
    [spineClips, spineTrack],
  );

  // Filter for spine clips that have sketches enabled
  const sketchClips = useMemo(
    () => placedSpine.filter((item) => Boolean(item.clip.effects?.whiteboard)),
    [placedSpine],
  );

  // Check if any active sketch clip has multi-zone configuration
  const hasZones = useMemo(
    () =>
      sketchClips.some(
        (item) =>
          item.clip.effects?.whiteboard?.pattern === 'zones' &&
          (item.clip.effects.whiteboard.zones?.length ?? 0) > 0,
      ),
    [sketchClips],
  );

  // S6 Adaptive lane height: 52px for rich zone thumbnails, 28px standard compact
  const heightPx = hasZones ? 52 : 28;

  // Hovered keyframe tooltip state
  const [hoveredKeyframe, setHoveredKeyframe] = useState<{
    type: 'in' | 'out';
    frame: number;
    clipLabel: string;
    clientX: number;
    clientY: number;
  } | null>(null);

  // Active dragging state
  const dragRef = useRef<{
    clipId: string;
    type: 'in' | 'out';
    startX: number;
    originalInFrame: number;
    originalOutFrame: number;
    durationFrames: number;
    currentEffects: ClipEffects;
    currentSettings: WhiteboardSettings;
  } | null>(null);

  const handlePointerDownKeyframe = useCallback(
    (
      event: React.PointerEvent,
      clip: SequenceClip,
      type: 'in' | 'out',
      inFrame: number,
      outFrame: number,
    ) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const effects = clip.effects ?? {};
      const settings = effects.whiteboard;
      if (!settings) return;

      dragRef.current = {
        clipId: clip.id,
        type,
        startX: event.clientX,
        originalInFrame: inFrame,
        originalOutFrame: outFrame,
        durationFrames: clip.durationFrames,
        currentEffects: effects,
        currentSettings: settings,
      };
    },
    [],
  );

  const handlePointerMoveKeyframe = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.stopPropagation();

      const deltaPx = event.clientX - drag.startX;
      const deltaFrames = Math.round(deltaPx / pixelsPerFrame);

      if (drag.type === 'in') {
        // Clamp: 0 <= newInFrame <= outFrame - 1
        const maxIn = Math.max(0, drag.originalOutFrame - 1);
        const newIn = Math.min(maxIn, Math.max(0, drag.originalInFrame + deltaFrames));
        const inFraction = Number((newIn / Math.max(1, drag.durationFrames)).toFixed(3));

        patchClip(drag.clipId, {
          effects: {
            ...drag.currentEffects,
            whiteboard: {
              ...drag.currentSettings,
              inFraction,
              inSeconds: undefined,
            },
          },
        });
      } else {
        // Clamp: inFrame + 1 <= newOutFrame <= durationFrames
        const minOut = Math.min(drag.durationFrames, drag.originalInFrame + 1);
        const newOut = Math.min(
          drag.durationFrames,
          Math.max(minOut, drag.originalOutFrame + deltaFrames),
        );
        const drawFraction = Number((newOut / Math.max(1, drag.durationFrames)).toFixed(3));

        patchClip(drag.clipId, {
          effects: {
            ...drag.currentEffects,
            whiteboard: {
              ...drag.currentSettings,
              drawFraction,
              drawSeconds: undefined,
            },
          },
        });
      }
    },
    [patchClip, pixelsPerFrame],
  );

  const handlePointerUpKeyframe = useCallback((event: React.PointerEvent) => {
    if (dragRef.current) {
      event.stopPropagation();
      dragRef.current = null;
    }
  }, []);

  return (
    <div
      className="group/sketch-lane relative flex items-stretch select-none"
      style={{ minHeight: `${heightPx}px` }}
    >
      {/* Sticky Left Gutter Header (152px) */}
      {hasZones ? (
        <div
          className="sticky left-0 z-[26] flex shrink-0 flex-col justify-between overflow-hidden rounded-[var(--radius-button)] bg-bg-canvas p-1.5 border-r border-hairline/40 shadow-sm"
          style={{ width: LANE_LABEL_WIDTH_PX, height: `${heightPx}px` }}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span
                className="material-symbols-outlined text-[15px] text-accent-ai shrink-0"
                title="Sketch Keyframes Lane (Zones Active)"
              >
                crop_free
              </span>
              <span className="text-[11px] font-semibold text-text-primary tracking-tight truncate">
                Sketch FX
              </span>
            </div>
            <button
              type="button"
              title="Open Sketch Settings Panel"
              className="flex h-5 w-5 items-center justify-center rounded text-text-disabled hover:bg-bg-hover hover:text-text-primary transition-colors shrink-0"
              onClick={() => useMediaPanelStore.getState().setCategory('sketch')}
            >
              <span className="material-symbols-outlined text-[13px]">tune</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-1 text-[9px] text-text-secondary font-mono">
            <span className="rounded bg-accent-ai/15 px-1 py-0.2 font-bold text-accent-ai truncate">
              Zones Mode
            </span>
            <span className="text-text-disabled shrink-0">
              {sketchClips.length} {sketchClips.length === 1 ? 'clip' : 'clips'}
            </span>
          </div>
        </div>
      ) : (
        <div
          className="sticky left-0 z-[26] flex shrink-0 items-center justify-between overflow-hidden rounded-[var(--radius-button)] bg-bg-canvas pl-2 pr-2 border-r border-hairline/40 shadow-sm"
          style={{ width: LANE_LABEL_WIDTH_PX, height: `${heightPx}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span
              className="material-symbols-outlined text-[15px] text-accent-ai shrink-0"
              title="Sketch Keyframes Lane"
            >
              draw
            </span>
            <span className="text-[11px] font-medium text-text-primary tracking-tight truncate">
              Sketch FX
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span
              className="rounded bg-accent-ai/15 px-1 py-0.5 text-[9px] font-bold text-accent-ai"
              title={`${sketchClips.length} spine clip(s) with sketch animations`}
            >
              {sketchClips.length}
            </span>
            <button
              type="button"
              title="Open Sketch Settings Panel"
              className="flex h-5 w-5 items-center justify-center rounded text-text-disabled hover:bg-bg-hover hover:text-text-primary transition-colors"
              onClick={() => useMediaPanelStore.getState().setCategory('sketch')}
            >
              <span className="material-symbols-outlined text-[13px]">tune</span>
            </button>
          </div>
        </div>
      )}

      {/* Trough Area */}
      <div
        data-sketch-lane-trough
        className="relative shrink-0 rounded-[var(--radius-button)] bg-bg-workspace/70 overflow-hidden"
        style={{ height: `${heightPx}px`, width: Math.max(widthPx, 1) }}
      >
        {sketchClips.map((item) => {
          const settings = item.clip.effects?.whiteboard;
          if (!settings) return null;

          const clipStartFrames = item.startFrames;
          const durationFrames = item.clip.durationFrames;
          const isSelected = selectedClipIds.includes(item.clip.id);

          const inFrames = resolveWhiteboardInFrame(settings, durationFrames, fps);
          const outFrames = resolveWhiteboardOutFrame(settings, durationFrames, fps);

          const clipLeftPx = clipStartFrames * pixelsPerFrame;
          const clipWidthPx = Math.max(2, durationFrames * pixelsPerFrame);

          const inPx = inFrames * pixelsPerFrame;
          const outPx = outFrames * pixelsPerFrame;
          const drawSpanPx = Math.max(2, outPx - inPx);
          const holdSpanPx = Math.max(0, clipWidthPx - outPx);

          const clipHasZones = settings.pattern === 'zones' && (settings.zones?.length ?? 0) > 0;
          const zoneSlices = clipHasZones
            ? whiteboardZoneTimeSlices(settings.zones!, inFrames, outFrames, fps)
            : [];

          return (
            <div
              key={item.clip.id}
              className={`absolute top-0 bottom-0 rounded-[var(--radius-button)] border transition-colors ${
                isSelected
                  ? 'border-accent-ai/50 bg-accent-ai/5'
                  : 'border-hairline/40 bg-bg-surface/30'
              }`}
              style={{
                left: `${clipLeftPx}px`,
                width: `${clipWidthPx}px`,
              }}
              onClick={(e) => {
                // Clicking empty lane region selects the clip
                if (e.target === e.currentTarget) {
                  select([item.clip.id]);
                }
              }}
              onDoubleClick={() => {
                select([item.clip.id]);
                useMediaPanelStore.getState().setCategory('sketch');
              }}
            >
              {/* Pre-In Delay Indicator (if inFrames > 0) */}
              {inPx > 2 && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] border-t border-dashed border-accent-warning/40 opacity-75 pointer-events-none"
                  style={{ width: `${inPx}px` }}
                />
              )}

              {/* Active Drawing Span (between In and Out) */}
              <div
                className={`absolute top-1 bottom-1 flex items-stretch overflow-hidden rounded-[2px] border shadow-inner ${
                  clipHasZones
                    ? 'border-accent-ai/50 bg-bg-app'
                    : 'border-accent-ai/40 bg-gradient-to-r from-accent-warning/20 via-accent-ai/25 to-accent-ai/30 items-center justify-between px-1'
                }`}
                style={{
                  left: `${inPx}px`,
                  width: `${drawSpanPx}px`,
                }}
                title={`Sketch Active Reveal: ${inFrames}f to ${outFrames}f (${((outFrames - inFrames) / fps).toFixed(2)}s)`}
              >
                {clipHasZones ? (
                  // Render multi-zone time slices with visual thumbnails
                  zoneSlices.map((slice) => {
                    const sliceStartNorm = slice.startFraction;
                    const sliceEndNorm = slice.endFraction;
                    const sliceWidthNorm = sliceEndNorm - sliceStartNorm;
                    const slicePixelWidth = sliceWidthNorm * drawSpanPx;
                    const isLast = slice.index === zoneSlices.length - 1;

                    return (
                      <div
                        key={slice.index}
                        className={`group/zone relative flex h-full items-center justify-center overflow-hidden transition-all hover:brightness-110 cursor-pointer ${
                          !isLast ? 'border-r border-accent-ai/50' : ''
                        }`}
                        style={{
                          width: `${sliceWidthNorm * 100}%`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          select([item.clip.id]);
                          setPlayhead(clipStartFrames + slice.startFrame);
                        }}
                        title={`Zone ${slice.index + 1} (${slice.zone.type ?? 'sketch'}): ${slice.durationFrames}f (${slice.durationSeconds.toFixed(2)}s) — Click to seek`}
                      >
                        {/* Zone Cropped Image Preview */}
                        {item.clip.filePath && slicePixelWidth >= 20 && (
                          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-80 group-hover/zone:opacity-100 transition-opacity">
                            <svg
                              viewBox={zoneThumbnailViewBox(slice.zone.points, 1920, 1080)}
                              preserveAspectRatio="xMidYMid slice"
                              className="h-full w-full object-cover"
                            >
                              <defs>
                                <clipPath id={`zone-lane-clip-${item.clip.id}-${slice.index}`}>
                                  <polygon points={polygonPointsSvg(slice.zone.points, 1920, 1080)} />
                                </clipPath>
                              </defs>
                              <image
                                href={toMediaUrl(item.clip.filePath)}
                                width="1920"
                                height="1080"
                                clipPath={`url(#zone-lane-clip-${item.clip.id}-${slice.index})`}
                                preserveAspectRatio="xMidYMid slice"
                              />
                            </svg>
                          </div>
                        )}

                        {/* Scrim Overlay for text contrast */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent pointer-events-none" />

                        {/* Zone Badge */}
                        <div className="absolute top-1 left-1 flex items-center gap-1 z-10 pointer-events-none">
                          <span className="rounded bg-black/75 px-1 py-0.2 text-[8px] font-bold font-mono text-accent-ai border border-accent-ai/40 shadow-sm leading-tight">
                            Z{slice.index + 1}
                          </span>
                        </div>

                        {/* Zone Duration & Type Indicator */}
                        {slicePixelWidth >= 44 && (
                          <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between z-10 pointer-events-none">
                            <span className="font-mono text-[8px] text-white/90 drop-shadow">
                              {slice.durationSeconds.toFixed(1)}s
                            </span>
                            {slicePixelWidth >= 64 && (
                              <span className="material-symbols-outlined text-[11px] text-accent-ai drop-shadow">
                                {slice.zone.type === 'writing'
                                  ? 'edit_note'
                                  : slice.zone.type === 'scribble'
                                    ? 'gesture'
                                    : slice.zone.type === 'wipe'
                                      ? 'swipe'
                                      : 'draw'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  // Standard pattern rendering (serpentine, wipe, trace)
                  <>
                    {drawSpanPx > 36 && (
                      <span className="truncate text-[9px] font-mono text-accent-ai uppercase tracking-wider font-semibold pointer-events-none">
                        {settings.pattern === 'trace'
                          ? 'Sketch'
                          : settings.pattern === 'wipe'
                            ? 'Wipe'
                            : 'Writing'}
                      </span>
                    )}
                    {drawSpanPx > 60 && (
                      <span className="font-mono text-[9px] text-text-secondary pointer-events-none">
                        {((outFrames - inFrames) / fps).toFixed(1)}s
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Hold Span (from Out keyframe to clip tail) */}
              {holdSpanPx > 2 && (
                <div
                  className="absolute top-1 bottom-1 flex items-center rounded-r-[2px] bg-accent-ai/10 border-r border-y border-accent-ai/25 px-1 pointer-events-none"
                  style={{
                    left: `${outPx}px`,
                    width: `${holdSpanPx}px`,
                  }}
                  title={`Sketch Hold: ${outFrames}f to ${durationFrames}f (Hold final picture)`}
                >
                  {holdSpanPx > 28 && (
                    <span className="text-[8px] font-mono text-text-disabled uppercase tracking-tighter">
                      Hold
                    </span>
                  )}
                </div>
              )}

              {/* Keyframe In (◆) Handle */}
              <button
                type="button"
                aria-label={`Keyframe In: ${inFrames}f (${formatTimecode(clipStartFrames + inFrames, fps)})`}
                className="group/key-in absolute top-1/2 z-20 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center cursor-ew-resize focus:outline-none"
                style={{ left: `${inPx}px` }}
                onPointerDown={(event) =>
                  handlePointerDownKeyframe(event, item.clip, 'in', inFrames, outFrames)
                }
                onPointerMove={handlePointerMoveKeyframe}
                onPointerUp={handlePointerUpKeyframe}
                onPointerCancel={handlePointerUpKeyframe}
                onClick={(event) => {
                  event.stopPropagation();
                  setPlayhead(clipStartFrames + inFrames);
                }}
                onMouseEnter={(e) =>
                  setHoveredKeyframe({
                    type: 'in',
                    frame: clipStartFrames + inFrames,
                    clipLabel: item.clip.label || 'Spine Clip',
                    clientX: e.clientX,
                    clientY: e.clientY,
                  })
                }
                onMouseLeave={() => setHoveredKeyframe(null)}
              >
                <span className="block h-2.5 w-2.5 rotate-45 rounded-[1px] bg-accent-warning border border-black/70 shadow-sm transition-transform duration-75 group-hover/key-in:scale-125" />
              </button>

              {/* Keyframe Out (◆) Handle */}
              <button
                type="button"
                aria-label={`Keyframe Out: ${outFrames}f (${formatTimecode(clipStartFrames + outFrames, fps)})`}
                className="group/key-out absolute top-1/2 z-20 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center cursor-ew-resize focus:outline-none"
                style={{ left: `${outPx}px` }}
                onPointerDown={(event) =>
                  handlePointerDownKeyframe(event, item.clip, 'out', inFrames, outFrames)
                }
                onPointerMove={handlePointerMoveKeyframe}
                onPointerUp={handlePointerUpKeyframe}
                onPointerCancel={handlePointerUpKeyframe}
                onClick={(event) => {
                  event.stopPropagation();
                  setPlayhead(clipStartFrames + outFrames);
                }}
                onMouseEnter={(e) =>
                  setHoveredKeyframe({
                    type: 'out',
                    frame: clipStartFrames + outFrames,
                    clipLabel: item.clip.label || 'Spine Clip',
                    clientX: e.clientX,
                    clientY: e.clientY,
                  })
                }
                onMouseLeave={() => setHoveredKeyframe(null)}
              >
                <span className="block h-2.5 w-2.5 rotate-45 rounded-[1px] bg-accent-ai border border-black/70 shadow-sm transition-transform duration-75 group-hover/key-out:scale-125" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Floating Keyframe Tooltip */}
      {hoveredKeyframe && (
        <div
          className="pointer-events-none fixed z-50 flex flex-col gap-0.5 rounded-[var(--radius-card)] bg-bg-panel px-2 py-1 shadow-xl border border-hairline text-xs -translate-x-1/2 -translate-y-full mb-2"
          style={{
            left: `${hoveredKeyframe.clientX}px`,
            top: `${hoveredKeyframe.clientY - 6}px`,
          }}
        >
          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-text-primary">
            <span
              className={
                hoveredKeyframe.type === 'in' ? 'text-accent-warning' : 'text-accent-ai'
              }
            >
              ◆
            </span>
            <span>
              Sketch {hoveredKeyframe.type === 'in' ? 'In (Start)' : 'Out (Complete)'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-text-secondary">
            <span>{formatTimecode(hoveredKeyframe.frame, fps)}</span>
            <span>{hoveredKeyframe.frame}f</span>
          </div>
        </div>
      )}
    </div>
  );
}
