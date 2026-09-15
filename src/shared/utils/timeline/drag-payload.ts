import { z } from 'zod';

import { SEQUENCE_SOURCE_KINDS, type SequenceSourceKind } from '../../types/sequence';

/**
 * Beta S200 — the media pool → timeline drag contract, in one place.
 *
 * Until now the pool's tile (`timeline-media`) serialised a `MediaDragPayload`
 * and the lane's drop handler (`timeline-edit`) hand-parsed a `DroppedSource`
 * — two sibling slices restating one contract, which the FSD rules forbid
 * them from sharing directly. It belongs one layer down, and it belongs here
 * rather than in the renderer's `shared/` because the pure placement
 * (`placeSourcesAt`, `edit-ops.ts`) consumes the resolved item too.
 *
 * Two shapes are read, one is written:
 *
 * - **v2** — `{ v: 2, items: [...] }`, what every pool drag now writes. A
 *   multi-selection is N items in **visual grid order** (bin sort order, the
 *   Premiere/Resolve rule; for the Storyboard source that is cut order).
 * - **legacy** — one bare object, what the Text/Effects cards wrote before
 *   S200 and what any external tooling may still write. Read as a
 *   one-item drag.
 *
 * `parseTimelineDrag` never throws and returns `[]` for anything it cannot
 * read: a drop of garbage is "nothing happened", not a crash in a drop
 * handler.
 */

/** The private DnD type — same string S151 chose, so nothing outside the app changes. */
export const TIMELINE_DRAG_MIME = 'application/x-timeline-source';

/** The placeholder length for a still that carried no intent (S145's 3 s). */
export const DEFAULT_DROP_SECONDS = 3;

/** One dragged thing, **resolved** — every field answered, nothing optional. */
export interface TimelineDragItem {
  kind: SequenceSourceKind;
  label: string;
  /** `null` for the file-less kinds — a text or effect card. */
  filePath: string | null;
  /** S157 — an effect card's `EFFECT_PRESETS` id, or a text card's `TEXT_PRESETS` key. `null` for media. */
  presetId: string | null;
  /** The clip's length on landing — an intent (storyboard shot length) or the 3 s default. */
  durationSeconds: number;
  /** True only when `durationSeconds` was *measured* by a probe (S157). A drop of an unmeasured video/audio probes. */
  measured: boolean;
  /** S157 — storyboard identity, when the tile carried one; the clip keeps re-sync eligibility. */
  storyShotId: string | null;
  sourceTakeId: string | null;
}

/**
 * What an emitter hands `encodeTimelineDrag` — the tile's own loose shape,
 * resolved by the parser on the other side so no emitter has to restate the
 * defaults. Media items carry a `filePath`; text/effect cards a `presetId`.
 */
export interface TimelineDragSource {
  kind: SequenceSourceKind;
  label: string;
  filePath?: string | null;
  presetId?: string | null;
  durationSeconds?: number;
  /** S157 — whether `durationSeconds` is a measurement rather than an intent. */
  durationMeasured?: boolean;
  storyShotId?: string | null;
  sourceTakeId?: string | null;
}

const sourceSchema = z.object({
  kind: z.enum(SEQUENCE_SOURCE_KINDS),
  label: z.string().optional(),
  filePath: z.string().nullable().optional(),
  presetId: z.string().nullable().optional(),
  durationSeconds: z.number().finite().optional(),
  durationMeasured: z.boolean().optional(),
  storyShotId: z.string().nullable().optional(),
  sourceTakeId: z.string().nullable().optional(),
});

const payloadSchema = z.union([
  z.object({ v: z.literal(2), items: z.array(sourceSchema) }),
  sourceSchema,
]);

/**
 * Resolves one loose source into a placeable item, or `null` when it cannot
 * be placed at all (a text card with no preset, a media item with no path).
 * The rules are the ones `parseDropped` applied since S151/S157, unchanged:
 * a still's duration is an *intent* (the shot's length, or 3 s); for audio and
 * video any carried intent sizes the clip immediately, but only a probe's
 * `durationMeasured` excuses the drop from measuring the real one.
 */
function resolveItem(source: z.infer<typeof sourceSchema>): TimelineDragItem | null {
  const label = typeof source.label === 'string' && source.label ? source.label : 'Clip';
  if (source.kind === 'text' || source.kind === 'effect') {
    if (!source.presetId) return null;
    return {
      kind: source.kind,
      label,
      filePath: null,
      presetId: source.presetId,
      durationSeconds: DEFAULT_DROP_SECONDS,
      measured: false,
      storyShotId: null,
      sourceTakeId: null,
    };
  }
  if (!source.filePath) return null;
  const hasDuration = source.durationSeconds !== undefined && source.durationSeconds > 0;
  return {
    kind: source.kind,
    label,
    filePath: source.filePath,
    presetId: null,
    durationSeconds: hasDuration ? source.durationSeconds! : DEFAULT_DROP_SECONDS,
    measured:
      source.kind === 'still' ? hasDuration : hasDuration && source.durationMeasured === true,
    storyShotId: source.storyShotId ?? null,
    sourceTakeId: source.sourceTakeId ?? null,
  };
}

/** Serialises a drag — always the v2 envelope, however many items. */
export function encodeTimelineDrag(items: readonly TimelineDragSource[]): string {
  return JSON.stringify({ v: 2, items });
}

/**
 * Reads a drop. Unplaceable entries are dropped from the list rather than
 * failing the whole drag — one bad tile in a ten-tile selection is not a
 * reason to place nothing.
 */
export function parseTimelineDrag(text: string): TimelineDragItem[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return [];
  const sources = 'items' in parsed.data ? parsed.data.items : [parsed.data];
  return sources.map(resolveItem).filter((item): item is TimelineDragItem => item !== null);
}
