import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  WHITEBOARD_MAX_ZONES,
  WHITEBOARD_MAX_ZONE_POINTS,
  WHITEBOARD_MAX_ZONE_WEIGHT,
  WHITEBOARD_MIN_ZONE_WEIGHT,
  exportWhiteboardAnnotation,
  importWhiteboardAnnotation,
  polygonBounds,
  polygonCentroid,
  simplifyPolyline,
  toMediaUrl,
  type PolygonPoint,
  type WhiteboardZone,
  type WhiteboardZoneType,
} from '@shared';

import { Button } from '../../../shared/ui/Button';
import { IconButton } from '../../../shared/ui/IconButton';
import { Modal } from '../../../shared/ui/Modal';
import { Select } from '../../../shared/ui/Select';

/**
 * Beta S275 — the whiteboard zone editor: draw the reveal by hand.
 *
 * `SheetLayoutEditorModal`'s model, polygon edition: a `media` dialog (the
 * one fixed-height size a drag canvas needs), **SVG over an `<img>`, not
 * `<canvas>`** — a dozen polygons at most, and DOM keeps the zones
 * focusable/inspectable. Every stored coordinate is normalized 0..1 of the
 * **padded sequence frame**: the stage below is sized to the sequence's own
 * aspect and the still `object-contain`s inside it, which reproduces the
 * export's `scale…,pad=…` letterbox exactly — so the numbers drawn here are
 * the numbers the masks rasterize and the preview clips, no conversion
 * anywhere.
 *
 * Gestures: drag on empty stage = freehand lasso (sampled, then
 * Ramer–Douglas–Peucker down to a storable polygon); drag inside a zone =
 * move it; drag a vertex handle = reshape. Document-level listeners for
 * every gesture, `useRegionDrag`'s stated reason (the pointer outruns the
 * element). The draft saves as one `patchClip` — one undo entry.
 */

interface DraftZone {
  key: number;
  points: PolygonPoint[];
  type: WhiteboardZoneType;
  rows?: number;
  sweep: 'lr' | 'rl' | 'tb';
  weight: number;
}

/** Module-level for the same reason as the sheet editor's region keys: seeding runs during render. */
let nextZoneKey = 0;

/** Minimum normalized pointer travel before a new freehand sample is kept. */
const SAMPLE_DISTANCE = 0.008;
/** RDP epsilon for the first simplification pass; grows until the polygon fits the cap. */
const SIMPLIFY_EPSILON = 0.005;
/** Smallest bounding-box extent a saved zone may have — below this it was a click, not a loop. */
const MIN_ZONE_EXTENT = 0.02;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const ZONE_TYPE_OPTIONS = [
  { value: 'sketch', label: 'Sketch (Contour)' },
  { value: 'scribble', label: 'Scribble (Shade)' },
  { value: 'writing', label: 'Writing (Lines)' },
  { value: 'wipe', label: 'Wipe (Linear)' },
];

const SWEEP_OPTIONS = [
  { value: 'lr', label: 'Left → right' },
  { value: 'rl', label: 'Right → left' },
  { value: 'tb', label: 'Top → bottom' },
];

export interface WhiteboardZoneEditorModalProps {
  filePath: string;
  sequenceWidth: number;
  sequenceHeight: number;
  zones: readonly WhiteboardZone[] | undefined;
  onSave: (zones: WhiteboardZone[]) => void;
  onClose: () => void;
}

export function WhiteboardZoneEditorModal({
  filePath,
  sequenceWidth,
  sequenceHeight,
  zones,
  onSave,
  onClose,
}: WhiteboardZoneEditorModalProps) {
  const [draft, setDraft] = useState<DraftZone[]>(() =>
    (zones ?? []).map((zone) => ({
      key: (nextZoneKey += 1),
      points: zone.points.map((point) => ({ ...point })),
      type: zone.type ?? 'sketch',
      rows: zone.rows ?? 4,
      sweep: zone.sweep ?? 'lr',
      weight: zone.weight ?? 1,
    })),
  );
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  /** The in-flight freehand polyline, rendered live; `null` when not drawing. */
  const [drawing, setDrawing] = useState<PolygonPoint[] | null>(null);

  // Live simulation playback state
  const [isPlayingSimulation, setIsPlayingSimulation] = useState(false);
  const [simProgress, setSimProgress] = useState(0);

  const insertVertex = useCallback((key: number, afterIndex: number, point: PolygonPoint) => {
    setDraft((current) =>
      current.map((zone) => {
        if (zone.key !== key || zone.points.length >= WHITEBOARD_MAX_ZONE_POINTS) return zone;
        const newPoints = [...zone.points];
        newPoints.splice(afterIndex + 1, 0, point);
        return { ...zone, points: newPoints };
      }),
    );
    setSelectedVertexIndex(afterIndex + 1);
  }, []);

  const deleteVertex = useCallback((key: number, vertexIndex: number) => {
    setDraft((current) =>
      current.map((zone) => {
        if (zone.key !== key || zone.points.length <= 3) return zone;
        return {
          ...zone,
          points: zone.points.filter((_, idx) => idx !== vertexIndex),
        };
      }),
    );
    setSelectedVertexIndex(null);
  }, []);

  // Keyboard shortcut: Delete or Backspace to delete selected vertex
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedKey !== null &&
        selectedVertexIndex !== null
      ) {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
        deleteVertex(selectedKey, selectedVertexIndex);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedKey, selectedVertexIndex, deleteVertex]);

  // Live simulation animation loop
  useEffect(() => {
    if (!isPlayingSimulation || draft.length === 0) return;
    let animationFrameId: number;
    const startTime = performance.now();
    const durationMs = Math.max(2500, draft.length * 1800);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const p = (elapsed % durationMs) / durationMs;
      setSimProgress(p);
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlayingSimulation, draft.length]);

  const simulationState = useMemo(() => {
    if (!isPlayingSimulation || draft.length === 0) return null;
    const totalWeight = draft.reduce((sum, z) => sum + (z.weight ?? 1), 0);
    if (totalWeight <= 0) return null;

    let cumulative = 0;
    for (let i = 0; i < draft.length; i++) {
      const zone = draft[i];
      const zoneWeight = (zone.weight ?? 1) / totalWeight;
      const zoneStart = cumulative;
      const zoneEnd = cumulative + zoneWeight;
      cumulative = zoneEnd;

      if (simProgress >= zoneStart && simProgress < zoneEnd) {
        const localT = (simProgress - zoneStart) / Math.max(0.0001, zoneWeight);
        const bounds = polygonBounds(zone.points);
        let tip: PolygonPoint = polygonCentroid(zone.points);

        if (zone.type === 'sketch') {
          const idx = Math.floor(localT * zone.points.length);
          const nextIdx = (idx + 1) % zone.points.length;
          const segT = localT * zone.points.length - idx;
          const p0 = zone.points[idx];
          const p1 = zone.points[nextIdx];
          tip = {
            x: p0.x + (p1.x - p0.x) * segT,
            y: p0.y + (p1.y - p0.y) * segT,
          };
        } else if (zone.type === 'writing') {
          const rows = zone.rows ?? 4;
          const rowIdx = Math.floor(localT * rows);
          const colT = localT * rows - rowIdx;
          tip = {
            x: bounds.minX + colT * (bounds.maxX - bounds.minX),
            y: bounds.minY + ((rowIdx + 0.5) / rows) * (bounds.maxY - bounds.minY),
          };
        } else if (zone.type === 'wipe') {
          const sweep = zone.sweep ?? 'lr';
          if (sweep === 'lr') {
            tip = {
              x: bounds.minX + localT * (bounds.maxX - bounds.minX),
              y: (bounds.minY + bounds.maxY) / 2,
            };
          } else if (sweep === 'rl') {
            tip = {
              x: bounds.maxX - localT * (bounds.maxX - bounds.minX),
              y: (bounds.minY + bounds.maxY) / 2,
            };
          } else {
            tip = {
              x: (bounds.minX + bounds.maxX) / 2,
              y: bounds.minY + localT * (bounds.maxY - bounds.minY),
            };
          }
        }

        return {
          activeZoneIndex: i,
          activeZoneKey: zone.key,
          tip,
        };
      }
    }
    return null;
  }, [isPlayingSimulation, draft, simProgress]);

  /**
   * The stage box, sized in px to the largest sequence-aspect rectangle the
   * available area holds. Measured (ResizeObserver) rather than styled with
   * `aspect-ratio`, because the box also needs `max-h`/`max-w` and CSS then
   * has to pick which constraint wins — measuring makes the letterbox
   * arithmetic explicit and identical to the export's fit.
   */
  const areaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const rect = area.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const scale = Math.min(rect.width / sequenceWidth, rect.height / sequenceHeight);
      setStageSize({ width: sequenceWidth * scale, height: sequenceHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [sequenceWidth, sequenceHeight]);

  const normalizedPoint = (event: PointerEvent | ReactPointerEvent): PolygonPoint => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  /** One document-level gesture at a time; move/up listeners detach on up/cancel. */
  const gesture = (
    onMove: (point: PolygonPoint) => void,
    onEnd: () => void,
  ): void => {
    const handleMove = (event: PointerEvent) => onMove(normalizedPoint(event));
    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
      onEnd();
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
  };

  const startFreehand = (event: ReactPointerEvent) => {
    if (event.button !== 0 || draft.length >= WHITEBOARD_MAX_ZONES) return;
    const start = normalizedPoint(event);
    let points: PolygonPoint[] = [start];
    setDrawing(points);
    setSelectedKey(null);
    gesture(
      (point) => {
        const last = points[points.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) < SAMPLE_DISTANCE) return;
        points = [...points, point];
        setDrawing(points);
      },
      () => {
        setDrawing(null);
        // Simplify until the polygon fits the schema's vertex cap — a slow,
        // detailed loop starts at ~0.005 and coarsens only if it must.
        let epsilon = SIMPLIFY_EPSILON;
        let simplified = simplifyPolyline(points, epsilon);
        while (simplified.length > WHITEBOARD_MAX_ZONE_POINTS) {
          epsilon *= 1.5;
          simplified = simplifyPolyline(points, epsilon);
        }
        if (simplified.length < 3) return;
        const bounds = polygonBounds(simplified);
        if (bounds.maxX - bounds.minX < MIN_ZONE_EXTENT || bounds.maxY - bounds.minY < MIN_ZONE_EXTENT) {
          return;
        }
        const key = (nextZoneKey += 1);
        setDraft((current) => [
          ...current,
          { key, points: simplified, type: 'sketch', rows: 4, sweep: 'lr', weight: 1 },
        ]);
        setSelectedKey(key);
      },
    );
  };

  const startZoneMove = (event: ReactPointerEvent, key: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedKey(key);
    const origin = normalizedPoint(event);
    const zone = draft.find((candidate) => candidate.key === key);
    if (!zone) return;
    const original = zone.points.map((point) => ({ ...point }));
    const bounds = polygonBounds(original);
    gesture(
      (point) => {
        // Clamp the delta so the zone's box never leaves the frame — the
        // schema's 0..1 bound, enforced at the gesture rather than at save.
        const dx = Math.min(1 - bounds.maxX, Math.max(-bounds.minX, point.x - origin.x));
        const dy = Math.min(1 - bounds.maxY, Math.max(-bounds.minY, point.y - origin.y));
        setDraft((current) =>
          current.map((candidate) =>
            candidate.key === key
              ? {
                  ...candidate,
                  points: original.map((p) => ({ x: p.x + dx, y: p.y + dy })),
                }
              : candidate,
          ),
        );
      },
      () => undefined,
    );
  };

  const startVertexDrag = (event: ReactPointerEvent, key: number, vertexIndex: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedKey(key);
    gesture(
      (point) => {
        setDraft((current) =>
          current.map((candidate) =>
            candidate.key === key
              ? {
                  ...candidate,
                  points: candidate.points.map((p, index) =>
                    index === vertexIndex ? point : p,
                  ),
                }
              : candidate,
          ),
        );
      },
      () => undefined,
    );
  };

  const patchZone = (key: number, patch: Partial<Pick<DraftZone, 'type' | 'rows' | 'sweep' | 'weight'>>) => {
    setDraft((current) =>
      current.map((zone) => (zone.key === key ? { ...zone, ...patch } : zone)),
    );
  };

  const moveZone = (key: number, direction: -1 | 1) => {
    setDraft((current) => {
      const index = current.findIndex((zone) => zone.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    onSave(
      draft.map((zone) => ({
        points: zone.points.map((point) => ({
          x: Number(point.x.toFixed(4)),
          y: Number(point.y.toFixed(4)),
        })),
        entrance: 'draw' as const,
        type: zone.type,
        ...(zone.type === 'writing' ? { rows: zone.rows ?? 4 } : {}),
        ...(zone.type === 'wipe' && zone.sweep !== 'lr' ? { sweep: zone.sweep } : {}),
        ...(zone.weight !== 1 ? { weight: zone.weight } : {}),
      })),
    );
    onClose();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportAnnotation = () => {
    const payload = exportWhiteboardAnnotation(
      draft.map((zone) => ({
        points: zone.points.map((p) => ({ ...p })),
        entrance: 'draw' as const,
        type: zone.type,
        rows: zone.rows,
        sweep: zone.sweep,
        weight: zone.weight,
      })),
      sequenceWidth,
      sequenceHeight,
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'annotation.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        const importedZones = importWhiteboardAnnotation(parsed, sequenceWidth, sequenceHeight);
        if (importedZones.length > 0) {
          const newDraft: DraftZone[] = importedZones.map((z) => ({
            key: (nextZoneKey += 1),
            points: z.points,
            type: z.type ?? 'sketch',
            rows: z.rows ?? 4,
            sweep: z.sweep ?? 'lr',
            weight: z.weight ?? 1,
          }));
          setDraft(newDraft);
          setSelectedKey(newDraft[0].key);
        }
      } catch (err) {
        console.error('Failed to import whiteboard annotation:', err);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const svgPoints = (points: readonly PolygonPoint[]): string =>
    points.map((point) => `${point.x * sequenceWidth},${point.y * sequenceHeight}`).join(' ');

  return (
    <Modal open title="Whiteboard zones" onClose={onClose} size="media" bodyScroll={false}>
      <div className="flex min-h-0 flex-1 gap-4">
        <div ref={areaRef} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
          {stageSize ? (
            <div
              ref={stageRef}
              className="relative bg-media-board"
              style={{ width: stageSize.width, height: stageSize.height }}
            >
              <img
                src={toMediaUrl(filePath)}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              />
              {/* Stage Overlay Controls */}
              <div className="absolute top-2 left-2 z-20 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlayingSimulation((prev) => !prev)}
                  disabled={draft.length === 0}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur shadow-md border transition-all ${
                    isPlayingSimulation
                      ? 'bg-accent-warning text-black border-accent-warning shadow-accent-warning/20'
                      : 'bg-black/75 text-white border-white/15 hover:bg-black/90 hover:border-accent-ai/50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {isPlayingSimulation ? 'pause' : 'play_arrow'}
                  </span>
                  <span>{isPlayingSimulation ? 'Pause Test' : 'Test Sequence'}</span>
                  {isPlayingSimulation && (
                    <span className="ml-1 font-mono text-[10px] opacity-80">
                      {Math.round(simProgress * 100)}%
                    </span>
                  )}
                </button>
              </div>

              <svg
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                viewBox={`0 0 ${sequenceWidth} ${sequenceHeight}`}
                preserveAspectRatio="none"
                role="application"
                aria-label="Zone drawing surface"
                onPointerDown={startFreehand}
              >
                {draft.map((zone, index) => {
                  const selected = zone.key === selectedKey;
                  const isSimulatingActive = simulationState?.activeZoneKey === zone.key;
                  const centroid = polygonCentroid(zone.points);
                  return (
                    <g key={zone.key}>
                      <polygon
                        points={svgPoints(zone.points)}
                        fill={isSimulatingActive ? 'var(--accent-warning)' : 'var(--accent-ai)'}
                        fillOpacity={isSimulatingActive ? 0.45 : selected ? 0.28 : 0.16}
                        fillRule="evenodd"
                        stroke={isSimulatingActive ? 'var(--accent-warning)' : 'var(--accent-ai)'}
                        strokeWidth={isSimulatingActive ? 3.5 : selected ? 2.5 : 1.5}
                        vectorEffect="non-scaling-stroke"
                        className="cursor-move"
                        onPointerDown={(event) => startZoneMove(event, zone.key)}
                      />
                      <text
                        x={centroid.x * sequenceWidth}
                        y={centroid.y * sequenceHeight}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={sequenceWidth * 0.03}
                        fill={isSimulatingActive ? 'var(--accent-warning)' : 'var(--accent-ai)'}
                        className="pointer-events-none select-none font-bold drop-shadow"
                      >
                        {index + 1}
                      </text>
                      {selected ? (
                        <>
                          {/* Midpoint Insertion Handles */}
                          {zone.points.length < WHITEBOARD_MAX_ZONE_POINTS &&
                            zone.points.map((point, i) => {
                              const next = zone.points[(i + 1) % zone.points.length];
                              const midX = (point.x + next.x) / 2;
                              const midY = (point.y + next.y) / 2;
                              return (
                                <circle
                                  key={`mid-${i}`}
                                  cx={midX * sequenceWidth}
                                  cy={midY * sequenceHeight}
                                  r={sequenceWidth * 0.004}
                                  fill="var(--accent-warning)"
                                  opacity={0.65}
                                  stroke="var(--bg-workspace)"
                                  vectorEffect="non-scaling-stroke"
                                  className="cursor-copy hover:opacity-100 hover:scale-150 transition-all"
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    insertVertex(zone.key, i, { x: midX, y: midY });
                                  }}
                                >
                                  <title>Click to insert vertex along this segment</title>
                                </circle>
                              );
                            })}

                          {/* Vertices */}
                          {zone.points.map((point, vertexIndex) => {
                            const isVertexSelected = selectedVertexIndex === vertexIndex;
                            return (
                              <circle
                                key={`vert-${vertexIndex}`}
                                cx={point.x * sequenceWidth}
                                cy={point.y * sequenceHeight}
                                r={sequenceWidth * (isVertexSelected ? 0.008 : 0.006)}
                                fill={isVertexSelected ? 'var(--accent-warning)' : 'var(--accent-ai)'}
                                stroke="var(--bg-workspace)"
                                strokeWidth={isVertexSelected ? 2 : 1}
                                vectorEffect="non-scaling-stroke"
                                className="cursor-grab hover:scale-125 transition-transform"
                                onPointerDown={(event) => {
                                  setSelectedVertexIndex(vertexIndex);
                                  startVertexDrag(event, zone.key, vertexIndex);
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  deleteVertex(zone.key, vertexIndex);
                                }}
                              >
                                <title>{`Vertex ${vertexIndex + 1} (Right-click or Del to remove)`}</title>
                              </circle>
                            );
                          })}
                        </>
                      ) : null}
                    </g>
                  );
                })}
                {drawing && drawing.length > 1 ? (
                  <polyline
                    points={svgPoints(drawing)}
                    fill="none"
                    stroke="var(--accent-ai)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-none"
                  />
                ) : null}

                {/* Simulation Stylus Pointer */}
                {isPlayingSimulation && simulationState && (
                  <g
                    transform={`translate(${simulationState.tip.x * sequenceWidth}, ${simulationState.tip.y * sequenceHeight})`}
                    className="pointer-events-none transition-all duration-75"
                  >
                    <circle
                      r={sequenceWidth * 0.006}
                      fill="var(--accent-warning)"
                      stroke="black"
                      strokeWidth={1.5}
                    />
                    <path
                      d="M 0 0 L 14 -32 L 22 -28 Z"
                      fill="#f59e0b"
                      stroke="black"
                      strokeWidth={1}
                      filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
                    />
                  </g>
                )}
              </svg>
            </div>
          ) : null}
        </div>
        <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
          <p className="text-xs text-text-secondary">
            Draw a loop over the picture to add a zone. Zones reveal in this order, the hand
            drawing each one in.
          </p>
          {draft.length === 0 ? (
            <p className="text-xs text-text-disabled">No zones yet.</p>
          ) : null}
          {draft.map((zone, index) => (
            <div
              key={zone.key}
              className={`flex flex-col gap-2 rounded-[var(--radius-card)] border p-2 ${
                zone.key === selectedKey ? 'border-[var(--accent-ai)]' : 'border-hairline'
              }`}
              onClick={() => setSelectedKey(zone.key)}
            >
              <div className="flex items-center gap-2 text-xs text-text-primary">
                <span className="font-bold">Zone {index + 1}</span>
                <span className="text-text-disabled">{zone.points.length} pts</span>
                <span className="flex-1" />
                <IconButton
                  icon="arrow_upward"
                  label={`Move zone ${index + 1} earlier`}
                  onClick={() => moveZone(zone.key, -1)}
                />
                <IconButton
                  icon="arrow_downward"
                  label={`Move zone ${index + 1} later`}
                  onClick={() => moveZone(zone.key, 1)}
                />
                <IconButton
                  icon="delete"
                  label={`Delete zone ${index + 1}`}
                  onClick={() => {
                    setDraft((current) => current.filter((candidate) => candidate.key !== zone.key));
                    if (selectedKey === zone.key) setSelectedKey(null);
                  }}
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="w-12 shrink-0">Style</span>
                <Select
                  aria-label={`Zone ${index + 1} style`}
                  value={zone.type}
                  onChange={(value) => {
                    if (value === 'sketch' || value === 'scribble' || value === 'writing' || value === 'wipe') {
                      patchZone(zone.key, { type: value });
                    }
                  }}
                  options={ZONE_TYPE_OPTIONS}
                />
              </div>
              {zone.type === 'writing' && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="w-12 shrink-0">Rows</span>
                  <Select
                    aria-label={`Zone ${index + 1} text rows`}
                    value={String(zone.rows ?? 4)}
                    onChange={(value) => patchZone(zone.key, { rows: Number(value) })}
                    options={[
                      { value: '2', label: '2 rows' },
                      { value: '3', label: '3 rows' },
                      { value: '4', label: '4 rows' },
                      { value: '6', label: '6 rows' },
                      { value: '8', label: '8 rows' },
                    ]}
                  />
                </div>
              )}
              {zone.type === 'wipe' && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="w-12 shrink-0">Sweep</span>
                  <Select
                    aria-label={`Zone ${index + 1} sweep direction`}
                    value={zone.sweep}
                    onChange={(value) => {
                      if (value === 'lr' || value === 'rl' || value === 'tb') {
                        patchZone(zone.key, { sweep: value });
                      }
                    }}
                    options={SWEEP_OPTIONS}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="w-12 shrink-0">Time ×</span>
                <input
                  type="range"
                  min={WHITEBOARD_MIN_ZONE_WEIGHT}
                  max={WHITEBOARD_MAX_ZONE_WEIGHT}
                  step={0.25}
                  value={zone.weight}
                  aria-label={`Zone ${index + 1} time share`}
                  className="flex-1 accent-[var(--accent-ai)]"
                  onChange={(event) => patchZone(zone.key, { weight: Number(event.target.value) })}
                />
                <span className="w-8 shrink-0 text-right font-mono">{zone.weight.toFixed(2)}</span>
              </label>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-disabled">
            {draft.length}/{WHITEBOARD_MAX_ZONES} zones
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            Import Annotation
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={draft.length === 0}
            onClick={handleExportAnnotation}
          >
            Export Annotation
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save zones</Button>
        </div>
      </div>
    </Modal>
  );
}
