import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  WHITEBOARD_TRACE_MAX_PEN_POINTS,
  WHITEBOARD_TRACE_STROKE_FRACTION,
  type WhiteboardPenPoint,
  type WhiteboardTraceSettings,
} from '@shared';

import { encodeGrayPng } from './png-encode';
import { sourceIdentity } from './segment-cache';
import { decodeFrameRgba, probeFrameSize } from './watermark-frame-io';

/**
 * Beta S277 — the vector-sketch trace: the still's own linework, ordered
 * into strokes, encoded as a **time-map** — one grayscale PNG whose pixel
 * value is the normalized reveal time (0 drawn first, 254 last; 255 is
 * reserved so the ramp's final value completes everything). The export
 * drives it with a single animated `threshold` (see `whiteboard-segment.ts`)
 * — no per-frame masks, no `geq`, no image sequences.
 *
 * Pure classical vision in TS on purpose (the no-new-dependencies rule):
 * Gaussian → Sobel → hysteresis → Zhang–Suen thinning → 8-connected chain
 * tracing → ordering → arc-length time over `[0, strokeFraction]`, then a
 * chamfer-distance **fill bloom** over the remainder — line art first, the
 * picture blooming outward from its own linework, the VideoScribe grammar.
 *
 * **Coordinate space**: the analysis canvas has the padded sequence frame's
 * aspect (long edge ≤ {@link TRACE_ANALYSIS_MAX_EDGE}), with the source
 * letterboxed into it exactly as the export's `scale…,pad=…` does — so the
 * map upscales onto the frame aligned, and the pen path lands in the same
 * normalized space the zones use. The spike (2026-08-28) proved the whole
 * round trip byte-exact: our gray PNG → `format=gray` → in-graph `scale`.
 *
 * Artifacts cache under `userData/whiteboard-trace/<hash>/` keyed by source
 * identity + settings + {@link TRACE_ALGORITHM_VERSION} — the peaks-cache
 * convention. Parameters live in the document; paths never do.
 */

export const TRACE_ALGORITHM_VERSION = 1;
export const TRACE_ANALYSIS_MAX_EDGE = 960;
/** Chains shorter than this many skeleton pixels are noise, not strokes. */
const MIN_CHAIN_LENGTH = 8;

export interface TraceImageResult {
  /** Row-major time map, values 0..254 (255 never occurs — the completion reserve). */
  timeMap: Uint8Array;
  width: number;
  height: number;
  penPath: WhiteboardPenPoint[];
  /** Diagnostic: how many strokes survived. 0 means the bloom carries the whole reveal. */
  strokeCount: number;
}

const DETAIL_THRESHOLDS: Record<WhiteboardTraceSettings['detail'], { hi: number; lo: number }> = {
  low: { hi: 60, lo: 30 },
  medium: { hi: 40, lo: 20 },
  high: { hi: 24, lo: 12 },
};

/** Separable [1,2,1]/4 pass, horizontal then vertical — a cheap Gaussian. */
function blur(gray: Uint8Array, width: number, height: number): Uint8Array {
  const horizontal = new Uint8Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = gray[y * width + Math.max(0, x - 1)];
      const mid = gray[y * width + x];
      const right = gray[y * width + Math.min(width - 1, x + 1)];
      horizontal[y * width + x] = (left + 2 * mid + right) >> 2;
    }
  }
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const up = horizontal[Math.max(0, y - 1) * width + x];
      const mid = horizontal[y * width + x];
      const down = horizontal[Math.min(height - 1, y + 1) * width + x];
      out[y * width + x] = (up + 2 * mid + down) >> 2;
    }
  }
  return out;
}

/** Sobel |gx|+|gy|, scaled into 0..255. */
function sobelMagnitude(gray: Uint8Array, width: number, height: number): Uint8Array {
  const mag = new Uint8Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] + gray[i - width + 1] -
        2 * gray[i - 1] + 2 * gray[i + 1] -
        gray[i + width - 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      mag[i] = Math.min(255, (Math.abs(gx) + Math.abs(gy)) >> 2);
    }
  }
  return mag;
}

/** Double threshold + hysteresis: weak edges survive only when connected to a strong one. */
function hysteresis(mag: Uint8Array, width: number, height: number, hi: number, lo: number): Uint8Array {
  const edge = new Uint8Array(mag.length);
  const stack: number[] = [];
  for (let i = 0; i < mag.length; i += 1) {
    if (mag[i] >= hi) {
      edge[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (edge[n] === 0 && mag[n] >= lo) {
          edge[n] = 1;
          stack.push(n);
        }
      }
    }
  }
  return edge;
}

/** Zhang–Suen thinning to one-pixel skeletons; iteration-capped for safety. */
function thin(edge: Uint8Array, width: number, height: number): Uint8Array {
  const img = Uint8Array.from(edge);
  const toClear: number[] = [];
  for (let pass = 0; pass < 100; pass += 1) {
    let changed = false;
    for (let step = 0; step < 2; step += 1) {
      toClear.length = 0;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const i = y * width + x;
          if (img[i] === 0) continue;
          const p2 = img[i - width];
          const p3 = img[i - width + 1];
          const p4 = img[i + 1];
          const p5 = img[i + width + 1];
          const p6 = img[i + width];
          const p7 = img[i + width - 1];
          const p8 = img[i - 1];
          const p9 = img[i - width - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let transitions = 0;
          for (let k = 0; k < 8; k += 1) {
            if (ring[k] === 0 && ring[k + 1] === 1) transitions += 1;
          }
          if (transitions !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) {
            continue;
          }
          toClear.push(i);
        }
      }
      for (const i of toClear) img[i] = 0;
      if (toClear.length > 0) changed = true;
    }
    if (!changed) break;
  }
  return img;
}

interface Chain {
  /** Pixel coordinates in walk order. */
  points: { x: number; y: number }[];
}

/** 8-neighbour offsets. */
const NEIGHBOURS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Walks the skeleton into polyline chains: endpoints first, then leftover loops. */
function traceChains(skeleton: Uint8Array, width: number, height: number): Chain[] {
  const visited = new Uint8Array(skeleton.length);
  const degree = (x: number, y: number): number => {
    let count = 0;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && skeleton[ny * width + nx] === 1) {
        count += 1;
      }
    }
    return count;
  };
  const walk = (startX: number, startY: number): Chain => {
    const points: { x: number; y: number }[] = [];
    let x = startX;
    let y = startY;
    for (;;) {
      visited[y * width + x] = 1;
      points.push({ x, y });
      let next: { x: number; y: number } | null = null;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (
          nx >= 0 && ny >= 0 && nx < width && ny < height &&
          skeleton[ny * width + nx] === 1 && visited[ny * width + nx] === 0
        ) {
          next = { x: nx, y: ny };
          break;
        }
      }
      if (!next) return { points };
      x = next.x;
      y = next.y;
    }
  };
  const chains: Chain[] = [];
  // Endpoints first — walking from a line's tip yields the full stroke.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (skeleton[i] === 1 && visited[i] === 0 && degree(x, y) === 1) {
        chains.push(walk(x, y));
      }
    }
  }
  // Leftovers are loops (no endpoints) — start anywhere on them.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (skeleton[i] === 1 && visited[i] === 0) chains.push(walk(x, y));
    }
  }
  return chains.filter((chain) => chain.points.length >= MIN_CHAIN_LENGTH);
}

/** Orders chains; `'nearest'` may reverse a chain so its nearer end leads. */
function orderChains(chains: Chain[], order: WhiteboardTraceSettings['order']): Chain[] {
  if (order === 'reading') {
    return [...chains].sort((a, b) => {
      const rowA = Math.round(a.points[0].y / 24);
      const rowB = Math.round(b.points[0].y / 24);
      return rowA === rowB ? a.points[0].x - b.points[0].x : rowA - rowB;
    });
  }
  const remaining = [...chains];
  const ordered: Chain[] = [];
  let cursor = { x: 0, y: 0 };
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    let bestReversed = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const head = remaining[i].points[0];
      const tail = remaining[i].points[remaining[i].points.length - 1];
      const headDistance = Math.hypot(head.x - cursor.x, head.y - cursor.y);
      const tailDistance = Math.hypot(tail.x - cursor.x, tail.y - cursor.y);
      if (headDistance < bestDistance) {
        bestDistance = headDistance;
        bestIndex = i;
        bestReversed = false;
      }
      if (tailDistance < bestDistance) {
        bestDistance = tailDistance;
        bestIndex = i;
        bestReversed = true;
      }
    }
    const [chain] = remaining.splice(bestIndex, 1);
    const points = bestReversed ? [...chain.points].reverse() : chain.points;
    ordered.push({ points });
    cursor = points[points.length - 1];
  }
  return ordered;
}

/**
 * The pure core: gray analysis canvas in, time-map + pen path out.
 * Deterministic by construction — no randomness anywhere.
 */
export function traceImage(
  gray: Uint8Array,
  width: number,
  height: number,
  settings: WhiteboardTraceSettings,
): TraceImageResult {
  const strokeFraction = Math.min(
    0.95,
    Math.max(0.1, settings.strokeFraction ?? WHITEBOARD_TRACE_STROKE_FRACTION),
  );
  const { hi, lo } = DETAIL_THRESHOLDS[settings.detail];
  const skeleton = thin(hysteresis(sobelMagnitude(blur(gray, width, height), width, height), width, height, hi, lo), width, height);
  const chains = orderChains(traceChains(skeleton, width, height), settings.order);

  const timeMap = new Uint8Array(width * height).fill(255);
  const totalLength = chains.reduce((sum, chain) => sum + chain.points.length, 0);
  const penPath: WhiteboardPenPoint[] = [];
  const penEvery = Math.max(1, Math.ceil(totalLength / (WHITEBOARD_TRACE_MAX_PEN_POINTS - 1)));

  let cursor = 0;
  for (const chain of chains) {
    for (const point of chain.points) {
      const t = totalLength > 0 ? (cursor / totalLength) * strokeFraction : 0;
      const value = Math.min(254, Math.round(t * 254));
      // ±1 dilation so the drawn line has body; min() keeps the earliest time.
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = point.x + dx;
          const ny = point.y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
            const i = ny * width + nx;
            if (value < timeMap[i]) timeMap[i] = value;
          }
        }
      }
      if (cursor % penEvery === 0) {
        penPath.push({ t, x: point.x / width, y: point.y / height });
      }
      cursor += 1;
    }
  }
  if (totalLength > 0) {
    const lastPoint = chains[chains.length - 1].points[chains[chains.length - 1].points.length - 1];
    penPath.push({ t: strokeFraction, x: lastPoint.x / width, y: lastPoint.y / height });
  }

  // Fill bloom: two-pass chamfer distance from the stroked pixels (3/4-ish
  // metric scaled ×3), then the remaining time window by normalized distance.
  const INF = 0x3fffffff;
  const distance = new Int32Array(width * height).fill(INF);
  for (let i = 0; i < timeMap.length; i += 1) {
    if (timeMap[i] !== 255) distance[i] = 0;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (x > 0) distance[i] = Math.min(distance[i], distance[i - 1] + 3);
      if (y > 0) {
        distance[i] = Math.min(distance[i], distance[i - width] + 3);
        if (x > 0) distance[i] = Math.min(distance[i], distance[i - width - 1] + 4);
        if (x < width - 1) distance[i] = Math.min(distance[i], distance[i - width + 1] + 4);
      }
    }
  }
  let maxDistance = 0;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (x < width - 1) distance[i] = Math.min(distance[i], distance[i + 1] + 3);
      if (y < height - 1) {
        distance[i] = Math.min(distance[i], distance[i + width] + 3);
        if (x < width - 1) distance[i] = Math.min(distance[i], distance[i + width + 1] + 4);
        if (x > 0) distance[i] = Math.min(distance[i], distance[i + width - 1] + 4);
      }
      if (distance[i] < INF && distance[i] > maxDistance) maxDistance = distance[i];
    }
  }
  for (let i = 0; i < timeMap.length; i += 1) {
    if (timeMap[i] === 255) {
      const normalized = maxDistance > 0 ? distance[i] / maxDistance : 0;
      const t = strokeFraction + (1 - strokeFraction) * Math.min(1, normalized);
      timeMap[i] = Math.min(254, Math.round(t * 254));
    }
  }

  return { timeMap, width, height, penPath, strokeCount: chains.length };
}

/** Luma from RGBA (BT.601 — the tracer wants perceived edges, not colorimetry). */
export function rgbaToGray(rgba: Buffer | Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    const o = i * 4;
    gray[i] = Math.round(0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]);
  }
  return gray;
}

/**
 * The analysis canvas for a frame aspect: long edge ≤ 960, same aspect as
 * the padded sequence frame — the geometry the time-map upscales from.
 */
export function analysisCanvasFor(frameWidth: number, frameHeight: number): { width: number; height: number } {
  const scale = TRACE_ANALYSIS_MAX_EDGE / Math.max(frameWidth, frameHeight);
  if (scale >= 1) return { width: frameWidth, height: frameHeight };
  return {
    width: Math.max(16, Math.round(frameWidth * scale)),
    height: Math.max(16, Math.round(frameHeight * scale)),
  };
}

/**
 * Letterboxes a source gray raster into the canvas exactly as the export's
 * `scale=…:force_original_aspect_ratio=decrease,pad` does — bilinear sample,
 * white (board) padding, so pad areas carry no edges and bloom in last.
 */
export function letterboxGray(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): Uint8Array {
  const canvas = new Uint8Array(canvasWidth * canvasHeight).fill(255);
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const fitWidth = Math.max(1, Math.round(sourceWidth * scale));
  const fitHeight = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.floor((canvasWidth - fitWidth) / 2);
  const offsetY = Math.floor((canvasHeight - fitHeight) / 2);
  for (let y = 0; y < fitHeight; y += 1) {
    const sy = Math.min(sourceHeight - 1.001, (y + 0.5) / scale - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const fy = sy - y0;
    for (let x = 0; x < fitWidth; x += 1) {
      const sx = Math.min(sourceWidth - 1.001, (x + 0.5) / scale - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const fx = sx - x0;
      const i00 = y0 * sourceWidth + x0;
      const top = source[i00] * (1 - fx) + source[i00 + 1] * fx;
      const bottom = source[i00 + sourceWidth] * (1 - fx) + source[i00 + sourceWidth + 1] * fx;
      canvas[(y + offsetY) * canvasWidth + (x + offsetX)] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return canvas;
}

export interface TraceArtifact {
  mapPath: string;
  penPath: WhiteboardPenPoint[];
  /** The cache key — the descriptor names it so a retrace changes the segment identity. */
  hash: string;
}

const greatestCommonDivisor = (a: number, b: number): number => (b === 0 ? a : greatestCommonDivisor(b, a % b));

/**
 * Returns the cached artifact for (source, settings, frame aspect), tracing
 * and writing it on first need. Keyed by the frame *aspect* rather than its
 * exact size, so a draft render (halved geometry, same aspect) reuses the
 * full render's map — the in-graph `scale` fits either.
 */
export async function ensureTraceArtifact(options: {
  ffmpegPath: string;
  filePath: string;
  trace: WhiteboardTraceSettings;
  frameWidth: number;
  frameHeight: number;
  cacheDir: string;
}): Promise<TraceArtifact> {
  const identity = await sourceIdentity(options.filePath);
  if (!identity) throw new Error(`Cannot trace "${options.filePath}" — the file is unreadable.`);
  const divisor = greatestCommonDivisor(Math.max(1, options.frameWidth), Math.max(1, options.frameHeight));
  const key = JSON.stringify({
    v: TRACE_ALGORITHM_VERSION,
    size: identity.size,
    mtimeMs: identity.mtimeMs,
    trace: {
      detail: options.trace.detail,
      order: options.trace.order,
      strokeFraction: options.trace.strokeFraction ?? null,
    },
    aspectW: Math.round(options.frameWidth / divisor),
    aspectH: Math.round(options.frameHeight / divisor),
  });
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
  const dir = path.join(options.cacheDir, hash);
  const mapPath = path.join(dir, 'map.png');
  const penPathFile = path.join(dir, 'pen.json');
  try {
    const pen = JSON.parse(await fs.promises.readFile(penPathFile, 'utf8')) as WhiteboardPenPoint[];
    await fs.promises.access(mapPath, fs.constants.R_OK);
    return { mapPath, penPath: pen, hash };
  } catch {
    // Cold cache — trace now.
  }

  const size = await probeFrameSize(options.ffmpegPath, options.filePath);
  const rgba = await decodeFrameRgba(options.ffmpegPath, options.filePath, size.width, size.height);
  const canvas = analysisCanvasFor(options.frameWidth, options.frameHeight);
  const gray = letterboxGray(
    rgbaToGray(rgba, size.width, size.height),
    size.width,
    size.height,
    canvas.width,
    canvas.height,
  );
  const result = traceImage(gray, canvas.width, canvas.height, options.trace);

  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(mapPath, encodeGrayPng(result.timeMap, canvas.width, canvas.height));
  await fs.promises.writeFile(penPathFile, JSON.stringify(result.penPath), 'utf8');
  return { mapPath, penPath: result.penPath, hash };
}
