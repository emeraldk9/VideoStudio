import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  WHITEBOARD_MAX_ZONES,
  WHITEBOARD_MAX_ZONE_POINTS,
  WHITEBOARD_MAX_ZONE_WEIGHT,
  WHITEBOARD_MIN_ZONE_WEIGHT,
  polygonBounds,
  polygonCentroid,
  simplifyPolyline,
  toMediaUrl,
  type PolygonPoint,
  type WhiteboardZone,
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
      sweep: zone.sweep ?? 'lr',
      weight: zone.weight ?? 1,
    })),
  );
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  /** The in-flight freehand polyline, rendered live; `null` when not drawing. */
  const [drawing, setDrawing] = useState<PolygonPoint[] | null>(null);

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
          { key, points: simplified, sweep: 'lr', weight: 1 },
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

  const patchZone = (key: number, patch: Partial<Pick<DraftZone, 'sweep' | 'weight'>>) => {
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
        ...(zone.sweep !== 'lr' ? { sweep: zone.sweep } : {}),
        ...(zone.weight !== 1 ? { weight: zone.weight } : {}),
      })),
    );
    onClose();
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
                  const centroid = polygonCentroid(zone.points);
                  return (
                    <g key={zone.key}>
                      <polygon
                        points={svgPoints(zone.points)}
                        fill="var(--accent-ai)"
                        fillOpacity={selected ? 0.28 : 0.16}
                        fillRule="evenodd"
                        stroke="var(--accent-ai)"
                        strokeWidth={selected ? 2.5 : 1.5}
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
                        fill="var(--accent-ai)"
                        className="pointer-events-none select-none font-bold"
                      >
                        {index + 1}
                      </text>
                      {selected
                        ? zone.points.map((point, vertexIndex) => (
                            <circle
                              // Vertices have no identity beyond their slot.
                              // eslint-disable-next-line react/no-array-index-key
                              key={vertexIndex}
                              cx={point.x * sequenceWidth}
                              cy={point.y * sequenceHeight}
                              r={sequenceWidth * 0.006}
                              fill="var(--accent-ai)"
                              stroke="var(--bg-workspace)"
                              vectorEffect="non-scaling-stroke"
                              className="cursor-grab"
                              onPointerDown={(event) =>
                                startVertexDrag(event, zone.key, vertexIndex)
                              }
                            />
                          ))
                        : null}
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
        <span className="text-xs text-text-disabled">
          {draft.length}/{WHITEBOARD_MAX_ZONES} zones
        </span>
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
