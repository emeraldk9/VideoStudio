import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';


import {
  polygonBounds,
  polygonCentroid,
  resolveWhiteboardDrawSeconds,
  WHITEBOARD_EXPORT_MAX_PEN_POINTS,
  whiteboardCadenceHz,
  whiteboardRows,
  whiteboardZoneSweep,
  whiteboardZoneWindows,
  type RenderEncoderInfo,
  type WhiteboardPenPoint,
  type WhiteboardSettings,
  type WhiteboardZone,
} from '@shared';

import { videoEncodeArgs } from './render-encoder';

/**
 * Beta S161 — the whiteboard (hand-drawn) reveal, as a stage-1 segment
 * producer: the third sibling of `still-motion.ts` and `text-segment.ts`.
 * A still clip carrying `effects.whiteboard` renders through this instead of
 * the Ken Burns path.
 *
 * **Pure filtergraph, no frame generation.** The pipeline has no
 * image-sequence ingestion and no raster library, deliberately — so the
 * reveal is built from what ffmpeg can synthesize alone, verified against
 * the shipped `ffmpeg-static` binary (2026-08-13, ffmpeg 6.1.1):
 *
 * - `drawbox` CANNOT animate — its `t` parameter is border *thickness* and
 *   its geometry evaluates once. The mask therefore animates **position,
 *   never size**: solid white planes sliding over a black canvas via
 *   `overlay=x='<t-expr>':y='<t-expr>':eval=frame`, the exact primitive the
 *   layer graph already ships for keyframed PiP.
 * - The mask feeds `alphamerge` (explicit `format=gray` first — auto
 *   negotiation already picks gray, but encoded yuv420p white is 235 and a
 *   negotiation change would silently make "revealed" 92%-opaque).
 * - This is the pipeline's first `-filter_complex` stage-1 producer: the
 *   graph has four synthesized inputs and named pads, which `-vf` rejects.
 * - Every expression is wrapped in literal single quotes *inside the emitted
 *   string* — expressions contain commas, which are filter separators
 *   outside quotes and a hard parse error (the `buildLayerArgs` rule).
 * - Progress is `min(t/D,1)`: un-clamped `t/D` never reaches 100% (the last
 *   frame sits at `T−1/fps`), and the clamp is also what holds the finished
 *   frame from `drawSeconds` to the clip's end. At `t≥D` the row bar parks
 *   offscreen at `x=-W` while the full plane covers the frame — verified
 *   seam-free.
 *
 * Measured cost (1080p, 5s, 30fps): ~3.4s wall — ~0.2s over a plain wipe,
 * which is why serpentine ships as the default rather than a "fast" option.
 *
 * Geometry lives in `@shared`'s `whiteboardRevealAt`/`whiteboardClipPath` —
 * the preview's clip-path and these expressions are two readings of the one
 * function, per the effects module's two-consumer pattern.
 */

export interface WhiteboardSegmentOptions {
  settings: WhiteboardSettings;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  /** Resolved hand PNG, or null — `hand: 'none'` and the missing-asset fallback share it. */
  handAssetPath: string | null;
  /** S154 phase 3 colour chain, appended after the reveal like the still path appends it. */
  colorFilter?: string;
  draft?: boolean;
  /** S248 — the encode side only; the inputs are a still and a hand PNG. */
  encoder?: RenderEncoderInfo;
  /**
   * S275 — `pattern: 'zones'` only: the pre-rasterized zone mask PNGs, in
   * zone order, written by `whiteboard-mask.ts` into the render work dir at
   * this render's own geometry. The zone graph engages only when this list
   * matches the settings' zones one-to-one; anything else falls back to the
   * serpentine reveal (the degrade-never-fail posture).
   */
  zoneMaskPaths?: string[];
  /**
   * S277 — `pattern: 'trace'` only: the cached time-map PNG from
   * `whiteboard-trace.ts` (pixel value = normalized reveal time) and the
   * decimated pen path. Map absent → serpentine fallback, same posture as
   * zones. The pen path may be empty (a featureless image traced no strokes)
   * — the reveal still runs; only the hand is dropped.
   */
  traceMapPath?: string | null;
  tracePenPath?: WhiteboardPenPoint[];
}

/** The one predicate both the graph and the args read — they must agree on the input layout. */
function zoneModeFor(options: WhiteboardSegmentOptions): WhiteboardZone[] | null {
  const zones = options.settings.zones;
  if (options.settings.pattern !== 'zones' || !zones?.length) return null;
  if (options.zoneMaskPaths?.length !== zones.length) return null;
  return zones;
}

/** S277 — the trace twin of `zoneModeFor`: same both-sides agreement, same fallback. */
function traceModeFor(options: WhiteboardSegmentOptions): string | null {
  if (options.settings.pattern !== 'trace') return null;
  return options.traceMapPath ?? null;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * S296 — the reveal clock, as an ffmpeg time expression. Smooth is the bare
 * `t` (byte-identical graphs to pre-S296 — the neutrality the exact-string
 * tests pin); a cadence steps it: `floor(t*C)/C` holds each drawn state for
 * a full step while the picture underneath keeps the sequence rate.
 */
function revealClock(settings: Pick<WhiteboardSettings, 'cadenceFps'>): string {
  const hz = whiteboardCadenceHz(settings);
  return hz === null ? 't' : `(floor(t*${hz})/${hz})`;
}

/**
 * The bundled hand PNGs. `render-assets/` ships as an `extraResource`
 * (forge.config.ts) beside `selectors/`, resolved by the same rule; dev reads
 * the repo root. Returns `null` when missing — the segment falls back to a
 * hand-less reveal rather than failing the render (`resolveDrawtextFont`'s
 * report-never-throw posture).
 */
export function resolveHandAsset(hand: WhiteboardSettings['hand']): string | null {
  if (hand === 'none') return null;
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'render-assets')
    : path.join(app.getAppPath(), 'render-assets');
  const candidate = path.join(root, `hand-${hand}.png`);
  try {
    fs.accessSync(candidate, fs.constants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * The board look pre-filters. `sketch` = mono line-art via edge detection;
 * S295 adds `pencil` and `comic`. All are single comma-chains on purpose —
 * they insert into the linear [wbimg] chain, where a split/overlay branch
 * (what true crosshatching would need) has no place to put its labels.
 */
function lookFilter(look: WhiteboardSettings['look']): string {
  switch (look) {
    case 'sketch':
      // edgedetect emits white lines on black; negate makes ink on paper, and
      // a gentle eq lifts the grey haze the detector leaves.
      return 'edgedetect=low=0.06:high=0.2,negate,eq=contrast=1.4';
    case 'pencil':
      // Graphite. `sobel`, NOT `edgedetect` — that is the whole difference
      // from sketch. edgedetect is canny: hysteresis-thresholded, so it emits
      // thin binary wires no matter how the thresholds move. S295 shipped
      // pencil as edgedetect at lower thresholds, which made it sketch with a
      // haircut — measured 33 dB PSNR against sketch on a detailed source,
      // i.e. the same picture. sobel is the raw gradient magnitude: unthres-
      // holded, so stroke weight tracks local contrast and the tone survives
      // as soft lead rather than outline. Same source now reads 17 dB apart.
      // Then blur rounds the strokes, and temporal noise (allf=t+u) is the
      // spec's "paper grain motion" — re-rolled every frame, and at alls=16
      // it is actually visible, which at S295's alls=7 it was not.
      return 'format=gray,sobel,negate,gblur=sigma=0.6,eq=contrast=1.15:brightness=0.02,noise=alls=16:allf=t+u';
    case 'comic':
      // High-contrast cell shading: unsharp pre-darkens boundaries into ink
      // halos, then the luma quantizes to four flat tone bands. Honestly a
      // cel look, not crosshatching — hatching needs a pattern overlay.
      return 'format=gray,unsharp=5:5:1.0,lutyuv=y=trunc(val/64)*64+32,eq=contrast=1.5';
    default:
      return '';
  }
}

/**
 * The `-filter_complex` graph. Exported apart from the args so tests can pin
 * the expressions without the input scaffolding.
 */
export function buildWhiteboardFilterGraph(options: WhiteboardSegmentOptions): string {
  const width = Math.max(16, Math.round(options.width / 2) * 2);
  const height = Math.max(16, Math.round(options.height / 2) * 2);
  const fps = clamp(Math.round(options.fps), 1, 120);
  const frames = Math.max(1, Math.round(options.durationFrames));
  const totalSeconds = frames / fps;
  const rows = whiteboardRows(options.settings);
  const rowHeight = Math.ceil(height / rows);
  // S279 — the draw window derives from the clip here, at eval time (fraction
  // wins, legacy absolute honored, clamped strictly inside the clip). A
  // retime upstream re-derives it on the next build; nothing is stored stale.
  const drawSeconds = resolveWhiteboardDrawSeconds(options.settings, frames, fps);
  const d = drawSeconds.toFixed(4);

  const fit = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
  const look = lookFilter(options.settings.look);
  const post = [look, options.colorFilter ?? ''].filter((part) => part.length > 0).join(',');

  const zones = zoneModeFor(options);
  if (zones) {
    return buildZoneGraph(zones, options, {
      width,
      height,
      fps,
      totalSeconds,
      drawSeconds,
      fit,
      post,
    });
  }
  if (traceModeFor(options)) {
    return buildTraceGraph(options, { width, height, fps, totalSeconds, drawSeconds, fit, post });
  }

  // The clamped progress, and its row decomposition — `whiteboardRevealAt`
  // in expression form. `p*R` appears inline because ffmpeg expressions have
  // no variables; the shared function is the readable statement of this.
  const T = revealClock(options.settings);
  const scaled = `min(${T}/${d},1)*${rows}`;
  const rowTop = `floor(${scaled})/${rows}*${height}`;
  const frac = `(${scaled}-floor(${scaled}))`;

  const graph: string[] = [
    // The mask's raw materials and the board, synthesized inline — no -i's.
    `color=c=black:s=${width}x${height}:r=${fps}:d=${totalSeconds.toFixed(4)}[wbbg]`,
    `color=c=white:s=${width}x${height}:r=${fps}:d=${totalSeconds.toFixed(4)}[wbfull]`,
    `color=c=white:s=${width}x${rowHeight}:r=${fps}:d=${totalSeconds.toFixed(4)}[wbrow]`,
    `color=c=white:s=${width}x${height}:r=${fps}:d=${totalSeconds.toFixed(4)}[wbboard]`,
    // Completed rows: the full plane slid down from above the frame.
    `[wbbg][wbfull]overlay=x=0:y='${rowTop}-${height}':eval=frame[wbm1]`,
    // Current row: the bar slid in from the left. format=gray — see header.
    `[wbm1][wbrow]overlay=x='${frac}*${width}-${width}':y='${rowTop}':eval=frame,format=gray[wbmask]`,
    // The still, fitted, optionally sketch-toned/graded, alpha'd by the mask.
    `[0:v]${fit}${post ? `,${post}` : ''},format=rgba,setsar=1[wbimg]`,
    `[wbimg][wbmask]alphamerge[wbrev]`,
  ];

  if (options.handAssetPath) {
    graph.push(
      `[wbboard][wbrev]overlay=x=0:y=0[wbb2]`,
      `[1:v]format=rgba,setsar=1[wbhand]`,
      // The hand's top-left is the pen tip (the assets are drawn that way),
      // parked at the reveal front and dismissed when the drawing completes.
      `[wbb2][wbhand]overlay=x='${frac}*${width}':y='${rowTop}':eval=frame:enable='lt(${T},${d})',format=yuv420p,setsar=1[wbout]`,
    );
  } else {
    graph.push(`[wbboard][wbrev]overlay=x=0:y=0,format=yuv420p,setsar=1[wbout]`);
  }
  return graph.join(';');
}

/**
 * S275 — the zone reveal's graph: the S161 sliding-plane primitive, once per
 * user-drawn zone, each gated to its own window of the draw time.
 *
 * Per zone: a full-frame white plane slides across a black canvas
 * (position-animated, never size-animated — the standing drawbox fact), is
 * ANDed with the zone's static mask PNG via `blend=all_mode=darken` (min of
 * two gray planes; verified against the shipped binary 2026-08-28, frames
 * extracted), and alpha-merges a `split` copy of the fitted still. The cuts
 * stack onto the white board in reveal order. Every per-zone number — window,
 * sweep travel, centroid — is the closed form of `whiteboardZoneStateAt` /
 * `whiteboardZoneFrontAt`, which is what the preview renders: one geometry,
 * two consumers.
 *
 * The hand rides nested `if(lt(t,end),…)` window selectors — nested rather
 * than summed `between()` terms because contiguous windows share their
 * boundary instant, and a sum would double there.
 */
function buildZoneGraph(
  zones: readonly WhiteboardZone[],
  options: WhiteboardSegmentOptions,
  geometry: {
    width: number;
    height: number;
    fps: number;
    totalSeconds: number;
    drawSeconds: number;
    fit: string;
    post: string;
  },
): string {
  const { width, height, fps, totalSeconds, drawSeconds, fit, post } = geometry;
  const d = drawSeconds.toFixed(4);
  const dTotal = totalSeconds.toFixed(4);
  const T = revealClock(options.settings);
  const maskBase = options.handAssetPath ? 2 : 1;
  const windows = whiteboardZoneWindows(zones);

  const colorSource = (color: 'black' | 'white', pad: string): string =>
    `color=c=${color}:s=${width}x${height}:r=${fps}:d=${dTotal}[${pad}]`;

  const graph: string[] = [
    colorSource('white', 'wbboard'),
    `[0:v]${fit}${post ? `,${post}` : ''},format=rgba,setsar=1[wbimg]`,
  ];
  const imagePads = zones.map((_, index) => `wimg${index}`);
  if (zones.length === 1) {
    imagePads[0] = 'wbimg';
  } else {
    graph.push(`[wbimg]split=${zones.length}${imagePads.map((pad) => `[${pad}]`).join('')}`);
  }

  // Each zone's sweep front as a time expression, and the hand tip's x/y —
  // the compile of `whiteboardZoneSweep`/`polygonCentroid` into constants.
  const handX: string[] = [];
  const handY: string[] = [];
  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    const sweep = whiteboardZoneSweep(zone);
    const centroid = polygonCentroid(zone.points);
    const start = (windows[index].start * drawSeconds).toFixed(4);
    const span = Math.max(1 / fps, (windows[index].end - windows[index].start) * drawSeconds);
    const front = `(${sweep.from.toFixed(4)}+clip((${T}-${start})/${span.toFixed(4)},0,1)*${(sweep.to - sweep.from).toFixed(4)})`;
    // The plane that covers the kept half-plane: right edge at the front for
    // `lte` sweeps, left edge at the front for `gte` — S161's overlay grammar.
    const placement =
      sweep.axis === 'x'
        ? sweep.keep === 'lte'
          ? `x='${front}*${width}-${width}':y=0`
          : `x='${front}*${width}':y=0`
        : `x=0:y='${front}*${height}-${height}'`;
    graph.push(
      colorSource('black', `wzb${index}`),
      colorSource('white', `wzp${index}`),
      `[wzb${index}][wzp${index}]overlay=${placement}:eval=frame,format=gray[wzs${index}]`,
      `[${maskBase + index}:v]format=gray[wzm${index}]`,
      // mask ∩ sweep: darken = min on gray planes; explicit format=gray after
      // for the same limited-range insurance the serpentine mask carries.
      `[wzm${index}][wzs${index}]blend=all_mode=darken,format=gray[wza${index}]`,
      `[${imagePads[index]}][wza${index}]alphamerge[wcut${index}]`,
    );
    const bounds = polygonBounds(zone.points);
    const type = zone.type ?? 'sketch';

    if (type === 'scribble') {
      const localNorm = `clip((${T}-${start})/${span.toFixed(4)},0,1)`;
      const wave = `sin(${localNorm}*87.964)`;
      const halfH = ((bounds.maxY - bounds.minY) * height * 0.42).toFixed(2);
      handX.push(`${front}*${width}`);
      handY.push(`(${(centroid.y * height).toFixed(2)}+${wave}*${halfH})`);
    } else if (type === 'writing') {
      const rows = Math.min(16, Math.max(2, zone.rows ?? 4));
      const localNorm = `clip((${T}-${start})/${span.toFixed(4)},0,1)`;
      const rowH = (((bounds.maxY - bounds.minY) * height) / rows).toFixed(2);
      const rowProg = `mod(${localNorm}*${rows},1)`;
      const rowIdx = `floor(${localNorm}*${rows})`;
      handX.push(`(${(bounds.minX * width).toFixed(2)}+${rowProg}*${((bounds.maxX - bounds.minX) * width).toFixed(2)})`);
      handY.push(`(${(bounds.minY * height).toFixed(2)}+(${rowIdx}+0.5)*${rowH})`);
    } else if (sweep.axis === 'x') {
      handX.push(`${front}*${width}`);
      handY.push((centroid.y * height).toFixed(2));
    } else {
      handX.push((centroid.x * width).toFixed(2));
      handY.push(`${front}*${height}`);
    }
  }

  let board = 'wbboard';
  for (let index = 0; index < zones.length; index += 1) {
    const next = `wbb${index}`;
    const last = index === zones.length - 1;
    if (last && !options.handAssetPath) {
      graph.push(`[${board}][wcut${index}]overlay=x=0:y=0,format=yuv420p,setsar=1[wbout]`);
      return graph.join(';');
    }
    graph.push(`[${board}][wcut${index}]overlay=x=0:y=0[${next}]`);
    board = next;
  }

  // The window selector: zone i owns t < its window's end; the last zone is
  // the unconditional tail (windows partition the draw time exactly).
  const piecewise = (parts: string[]): string =>
    parts.reduceRight((tail, part, index) => {
      if (index === parts.length - 1) return part;
      const end = (windows[index].end * drawSeconds).toFixed(4);
      return `if(lt(${T},${end}),${part},${tail})`;
    }, '');
  graph.push(
    `[1:v]format=rgba,setsar=1[wbhand]`,
    `[${board}][wbhand]overlay=x='${piecewise(handX)}':y='${piecewise(handY)}':eval=frame:enable='lt(${T},${d})',format=yuv420p,setsar=1[wbout]`,
  );
  return graph.join(';');
}

/**
 * S277 — the trace reveal's graph: one time-map PNG driven by an animated
 * threshold. Every fact here is spike-verified against the shipped binary
 * (2026-08-28, frames extracted):
 *
 * - The ramp — `color=white, fade=t=in:d=D, format=gray` — is linear and
 *   full-range 0..255 in-graph, so map values compare against `255·t/D`
 *   exactly and the map's 0..254 values all complete strictly inside D.
 * - `threshold` is `[in][threshold][min][max]`: out = in < threshold ? min
 *   : max — so white-when-drawn puts the white plane in the *min* slot.
 * - The min/max planes are **lut-derived from the map input** (`lut=c0=…`),
 *   NOT `color` sources: bare color planes arrive limited-range (235/16)
 *   and would alpha-wash the picture ~8%; the map's own chain is proven
 *   full-range, so planes cut from it are true 0/255. The composite came
 *   out exact — revealed red (252,0,0) after yuv420p, unrevealed pure white.
 * - `gblur=sigma=0.8` puts a 2–3 px AA edge on the reveal front.
 *
 * The hand rides the decimated pen path as nested `if(lt(t,…))` segments —
 * clamped lerps, ≤ 32 of them (the shared cap) — and leaves when the
 * linework ends: the bloom is not pen work.
 */
/** Simplifies high-density pen paths to keep FFmpeg overlay expressions within parser stack limits. */
function simplifyPenForExport(
  pen: WhiteboardPenPoint[],
  maxPoints: number = WHITEBOARD_EXPORT_MAX_PEN_POINTS,
): WhiteboardPenPoint[] {
  if (pen.length <= maxPoints) return pen;
  const result: WhiteboardPenPoint[] = [pen[0]];
  const stride = (pen.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i += 1) {
    const idx = Math.min(pen.length - 1, Math.round(i * stride));
    result.push(pen[idx]);
  }
  result.push(pen[pen.length - 1]);
  return result;
}

function buildTraceGraph(
  options: WhiteboardSegmentOptions,
  geometry: {
    width: number;
    height: number;
    fps: number;
    totalSeconds: number;
    drawSeconds: number;
    fit: string;
    post: string;
  },
): string {
  const { width, height, fps, totalSeconds, drawSeconds, fit, post } = geometry;
  const d = drawSeconds.toFixed(4);
  const dTotal = totalSeconds.toFixed(4);
  const T = revealClock(options.settings);
  const cadence = whiteboardCadenceHz(options.settings);
  const mapInput = options.handAssetPath ? 2 : 1;

  // S296 — the trace clock is the fade ramp, a filter option rather than a
  // `t` expression, so it quantizes differently: generate the ramp at the
  // cadence rate and duplicate up to the sequence rate. The ramp then *holds*
  // each level for a full step — the same instants `floor(t*C)/C` lands on,
  // which keeps the hand and the linework stepping together.
  const rampSource = `color=c=white:s=${width}x${height}:r=${cadence ?? fps}:d=${dTotal},fade=t=in:st=0:d=${d},format=gray`;
  const ramp = cadence === null ? rampSource : `${rampSource},fps=${fps}`;

  const graph: string[] = [
    `color=c=white:s=${width}x${height}:r=${fps}:d=${dTotal}[wbboard]`,
    `[0:v]${fit}${post ? `,${post}` : ''},format=rgba,setsar=1[wbimg]`,
    `[${mapInput}:v]format=gray,scale=${width}:${height},split=3[wtmap][wtw0][wtb0]`,
    `[wtw0]lut=c0=255[wtwht]`,
    `[wtb0]lut=c0=0[wtblk]`,
    `${ramp}[wtramp]`,
    `[wtmap][wtramp][wtwht][wtblk]threshold,gblur=sigma=0.8[wbmask]`,
    `[wbimg][wbmask]alphamerge[wbrev]`,
  ];

  const rawPen = options.tracePenPath ?? [];
  const pen = simplifyPenForExport(rawPen, WHITEBOARD_EXPORT_MAX_PEN_POINTS);
  if (options.handAssetPath && pen.length >= 2) {
    // Nested clamped-lerp segments over absolute times; the last segment is
    // the unconditional tail of the selector.
    const segment = (axis: 'x' | 'y', index: number): string => {
      const a = pen[index];
      const b = pen[index + 1];
      const t0 = (a.t * drawSeconds).toFixed(4);
      const span = Math.max(1 / fps, (b.t - a.t) * drawSeconds).toFixed(4);
      const scale = axis === 'x' ? width : height;
      const from = (a[axis] * scale).toFixed(2);
      const delta = ((b[axis] - a[axis]) * scale).toFixed(2);
      return `(${from}+clip((${T}-${t0})/${span},0,1)*${delta})`;
    };
    const piecewise = (axis: 'x' | 'y'): string => {
      let expr = segment(axis, pen.length - 2);
      for (let i = pen.length - 3; i >= 0; i -= 1) {
        const end = (pen[i + 1].t * drawSeconds).toFixed(4);
        expr = `if(lt(${T},${end}),${segment(axis, i)},${expr})`;
      }
      return expr;
    };
    const handEnd = (pen[pen.length - 1].t * drawSeconds).toFixed(4);
    graph.push(
      `[wbboard][wbrev]overlay=x=0:y=0[wbb2]`,
      `[1:v]format=rgba,setsar=1[wbhand]`,
      `[wbb2][wbhand]overlay=x='${piecewise('x')}':y='${piecewise('y')}':eval=frame:enable='lt(${T},${handEnd})',format=yuv420p,setsar=1[wbout]`,
    );
  } else {
    graph.push(`[wbboard][wbrev]overlay=x=0:y=0,format=yuv420p,setsar=1[wbout]`);
  }
  return graph.join(';');
}

/** The full arg list for one whiteboard segment — `buildStillSegmentArgs`'s shape, graph edition. */
export function buildWhiteboardSegmentArgs(
  inputPath: string,
  outputPath: string,
  options: WhiteboardSegmentOptions,
): string[] {
  const fps = clamp(Math.round(options.fps), 1, 120);
  const frames = Math.max(1, Math.round(clamp(options.durationFrames, 1, 10_368_000)));
  const totalSeconds = (frames / fps).toFixed(4);
  const inputs = [
    '-loop',
    '1',
    '-framerate',
    String(fps),
    '-t',
    totalSeconds,
    '-i',
    inputPath,
  ];
  if (options.handAssetPath) {
    inputs.push('-loop', '1', '-framerate', String(fps), '-t', totalSeconds, '-i', options.handAssetPath);
  }
  // S275 — the zone masks, in zone order, after the still and the hand: the
  // graph's `maskBase` arithmetic depends on exactly this layout, and both
  // sides read the same `zoneModeFor` predicate.
  if (zoneModeFor(options)) {
    for (const maskPath of options.zoneMaskPaths ?? []) {
      inputs.push('-loop', '1', '-framerate', String(fps), '-t', totalSeconds, '-i', maskPath);
    }
  }
  // S277 — the time-map, same slot arithmetic (`traceModeFor` on both sides).
  const traceMap = traceModeFor(options);
  if (traceMap) {
    inputs.push('-loop', '1', '-framerate', String(fps), '-t', totalSeconds, '-i', traceMap);
  }
  return [
    '-y',
    ...inputs,
    '-filter_complex',
    buildWhiteboardFilterGraph(options),
    '-map',
    '[wbout]',
    // `-frames:v`, never `-t`, on the output — the still-motion drift rule:
    // the document holds frames, and a seconds round-trip loses one.
    '-frames:v',
    String(frames),
    ...videoEncodeArgs({ draft: options.draft, encoder: options.encoder }),
    outputPath,
  ];
}
