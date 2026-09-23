import type { ResolvedFilterValues } from '@shared';

import {
  MAX_ADJUSTMENT_LAYERS,
  NEUTRAL_FILTER_VALUES,
  type GlFrameGraph,
  type GlLayer,
} from './frame-graph';
import { FAMILY_IDS, FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

/**
 * Beta S249 — the preview's paint surface.
 *
 * **What this is not.** It is not a media engine. It never decodes, never
 * seeks, never owns a clock and never touches audio: the `<video>` and `<img>`
 * elements the switcher already mounted keep doing all of that, and this
 * reads their current frame with `texImage2D`. That is what bounds the
 * commitment `TimelinePreview.tsx`'s header comment refused to make — the
 * transport, the two seeking regimes, `media://` byte-range seeking and the
 * whole audio path are untouched by this file's existence.
 *
 * **Failure is a downgrade, never a black frame.** `create` returns `null`
 * when WebGL2 is unavailable, and `draw` returns `false` the first time
 * anything throws or the context is lost. The caller keeps the DOM switcher
 * mounted and shows it again — a driver this shader upsets costs fidelity,
 * not a preview.
 */

/** One picture's decoder element, as the compositor needs to see it. */
export interface GlSource {
  element: HTMLVideoElement | HTMLImageElement;
  /** Natural pixel size; `0` means "not ready", and the layer is skipped. */
  width: number;
  height: number;
}

interface Slot {
  texture: WebGLTexture;
  width: number;
  height: number;
}

const FILTER_KEYS: (keyof ResolvedFilterValues)[] = [
  'brightness',
  'contrast',
  'saturation',
  'gamma',
  'hue',
  'sharpen',
  'vignette',
];

function filterArray(values: ResolvedFilterValues): Float32Array {
  return new Float32Array(FILTER_KEYS.map((key) => values[key]));
}

const ZERO_FILM = new Float32Array(6);
const ZERO_LENS = new Float32Array(6);
const ZERO_CHROMA = new Float32Array(7);
const ZERO_GRADE = new Float32Array(12);
const ZERO_MASK = new Float32Array(9);

/**
 * Frame UV → source UV, as `(scaleX, scaleY, offsetX, offsetY)`.
 *
 * Two operations in one transform because they are the same operation:
 * the fit (a `contain` letterboxes by sampling *outside* 0..1 at the bars, a
 * `cover` crops by sampling a sub-rectangle) and the Ken Burns viewport
 * `motionAt` returned. Deriving them separately is how the pre-S228 preview
 * ended up panning 13.4% where the export panned 10.7%.
 */
export function uvTransform(
  layer: GlLayer,
  source: { width: number; height: number },
  frame: { width: number; height: number },
): [number, number, number, number] {
  const sourceAspect = source.width / Math.max(1, source.height);
  const frameAspect = frame.width / Math.max(1, frame.height);
  // How much of the source axis one frame axis spans, before the zoom.
  let spanX = 1;
  let spanY = 1;
  if (layer.fit === 'contain') {
    // Letterbox: the frame is wider than the picture, so the frame's x axis
    // covers more than the source's width — and the excess reads as bars.
    if (frameAspect > sourceAspect) spanX = frameAspect / sourceAspect;
    else spanY = sourceAspect / frameAspect;
  } else if (frameAspect > sourceAspect) {
    // Cover: crop the long axis instead of padding the short one.
    spanY = sourceAspect / frameAspect;
  } else {
    spanX = frameAspect / sourceAspect;
  }
  const zoom = Math.max(1, layer.viewport.scale);
  const scaleX = spanX / zoom;
  const scaleY = spanY / zoom;
  return [scaleX, scaleY, layer.viewport.x - scaleX / 2, layer.viewport.y - scaleY / 2];
}

export class GlCompositor {
  private failed = false;

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly program: WebGLProgram,
    private readonly slots: { a: Slot; b: Slot },
    private readonly canvas: HTMLCanvasElement,
  ) {}

  /** `null` when this browser or driver cannot give us a WebGL2 context. */
  static create(canvas: HTMLCanvasElement): GlCompositor | null {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        // The frame is redrawn every tick, so the browser is free to throw the
        // buffer away — and telling it so avoids a full-frame copy per compose.
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      });
    } catch {
      return null;
    }
    if (!gl) return null;

    const program = linkProgram(gl);
    if (!program) return null;

    const buffer = gl.createBuffer();
    if (!buffer) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const a = makeSlot(gl);
    const b = makeSlot(gl);
    if (!a || !b) return null;
    return new GlCompositor(gl, program, { a, b }, canvas);
  }

  /** Once true, the caller should show the DOM path and stop calling `draw`. */
  isFailed(): boolean {
    return this.failed || this.gl.isContextLost();
  }

  /**
   * Paints one frame. `false` means the compositor has given up for good.
   *
   * `sources` is keyed by slot rather than by clip id: which clip is outgoing
   * changes every cut, and the two textures are reused across all of them —
   * allocating a texture per clip would mean a GPU allocation on every cut of
   * a forty-clip sequence.
   */
  draw(
    graph: GlFrameGraph,
    sources: { a: GlSource | null; b: GlSource | null },
    background: [number, number, number],
  ): boolean {
    if (this.isFailed()) return false;
    try {
      const { gl, program } = this;
      const width = Math.max(1, this.canvas.clientWidth);
      const height = Math.max(1, this.canvas.clientHeight);
      // Device pixels, capped: a 4K display would otherwise ask the shader for
      // four times the fragments of a preview nobody is inspecting at 1:1.
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.useProgram(program);

      const frame = { width: pixelWidth, height: pixelHeight };
      const layerFor = (slot: 'a' | 'b'): GlLayer | undefined =>
        graph.layers.find((layer) => layer.slot === slot);

      const bound = {
        a: this.bind('a', 0, layerFor('a'), sources.a, frame),
        b: this.bind('b', 1, layerFor('b'), sources.b, frame),
      };

      const uniform = (name: string): WebGLUniformLocation | null =>
        gl.getUniformLocation(program, name);

      gl.uniform1i(uniform('uTexA'), 0);
      gl.uniform1i(uniform('uTexB'), 1);
      gl.uniform1i(uniform('uHasA'), bound.a ? 1 : 0);
      gl.uniform1i(uniform('uHasB'), bound.b ? 1 : 0);
      gl.uniform3f(uniform('uBackground'), background[0], background[1], background[2]);

      const transition = graph.transition;
      // A family whose second picture never arrived is not a transition; the
      // shader's `!uHasA` guard says the same thing, and this keeps the
      // uniform honest for anything reading it.
      gl.uniform1i(uniform('uFamily'), transition ? FAMILY_IDS[transition.family] : FAMILY_IDS.none);
      gl.uniform1f(uniform('uProgress'), transition?.progress ?? 1);
      // S250 — the blend space and the asymmetric ratio. Both are inert for
      // the families that ignore them, so a stale value cannot leak between
      // frames the way an unset uniform would.
      gl.uniform1i(uniform('uLinear'), transition?.linear ? 1 : 0);
      gl.uniform1f(uniform('uRatio'), transition?.ratio ?? 0.3);
      gl.uniform2f(
        uniform('uDirection'),
        transition?.direction.x ?? 0,
        transition?.direction.y ?? 0,
      );
      gl.uniform1f(uniform('uSign'), transition?.sign ?? 1);
      const veil = transition?.veil ?? null;
      gl.uniform3f(uniform('uVeilColor'), veil?.rgb[0] ?? 0, veil?.rgb[1] ?? 0, veil?.rgb[2] ?? 0);
      gl.uniform1f(uniform('uVeilOpacity'), veil?.opacity ?? 0);

      const adjustments = new Float32Array(MAX_ADJUSTMENT_LAYERS * FILTER_KEYS.length);
      graph.adjustments.slice(0, MAX_ADJUSTMENT_LAYERS).forEach((values, index) => {
        adjustments.set(filterArray(values), index * FILTER_KEYS.length);
      });
      gl.uniform1fv(uniform('uAdjust'), adjustments);
      gl.uniform1i(
        uniform('uAdjustCount'),
        Math.min(MAX_ADJUSTMENT_LAYERS, graph.adjustments.length),
      );

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** Uploads one slot's current frame and sets its sampling uniforms. */
  private bind(
    slot: 'a' | 'b',
    unit: number,
    layer: GlLayer | undefined,
    source: GlSource | null,
    frame: { width: number; height: number },
  ): boolean {
    const { gl, program } = this;
    const suffix = slot.toUpperCase();
    const target = this.slots[slot];
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);

    const ready = layer !== undefined && source !== null && source.width > 0 && source.height > 0;
    if (!ready) {
      gl.uniform4f(gl.getUniformLocation(program, `uUv${suffix}`), 1, 1, 0, 0);
      gl.uniform2f(gl.getUniformLocation(program, `uTexel${suffix}`), 0, 0);
      gl.uniform1fv(
        gl.getUniformLocation(program, `uFilters${suffix}`),
        filterArray(NEUTRAL_FILTER_VALUES),
      );
      gl.uniform1fv(gl.getUniformLocation(program, `uFilm${suffix}`), ZERO_FILM);
      gl.uniform1fv(gl.getUniformLocation(program, `uLens${suffix}`), ZERO_LENS);
      gl.uniform1fv(gl.getUniformLocation(program, `uChroma${suffix}`), ZERO_CHROMA);
      gl.uniform1fv(gl.getUniformLocation(program, `uGrade${suffix}`), ZERO_GRADE);
      gl.uniform1fv(gl.getUniformLocation(program, `uMask${suffix}`), ZERO_MASK);
      return false;
    }

    // `texImage2D` on a <video> uploads whatever frame the decoder is showing
    // right now — no readback, no canvas round-trip, and the decode stays
    // where the browser's hardware path already put it.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source.element);
    target.width = source.width;
    target.height = source.height;

    const [scaleX, scaleY, offsetX, offsetY] = uvTransform(layer, source, frame);
    gl.uniform4f(gl.getUniformLocation(program, `uUv${suffix}`), scaleX, scaleY, offsetX, offsetY);
    gl.uniform2f(
      gl.getUniformLocation(program, `uTexel${suffix}`),
      1 / source.width,
      1 / source.height,
    );
    gl.uniform1fv(gl.getUniformLocation(program, `uFilters${suffix}`), filterArray(layer.filters));
    gl.uniform1fv(
      gl.getUniformLocation(program, `uFilm${suffix}`),
      layer.gpuEffects?.film ?? ZERO_FILM,
    );
    gl.uniform1fv(
      gl.getUniformLocation(program, `uLens${suffix}`),
      layer.gpuEffects?.lens ?? ZERO_LENS,
    );
    gl.uniform1fv(
      gl.getUniformLocation(program, `uChroma${suffix}`),
      layer.gpuEffects?.chroma ?? ZERO_CHROMA,
    );
    gl.uniform1fv(
      gl.getUniformLocation(program, `uGrade${suffix}`),
      layer.gpuEffects?.grade ?? ZERO_GRADE,
    );
    gl.uniform1fv(
      gl.getUniformLocation(program, `uMask${suffix}`),
      layer.gpuEffects?.mask ?? ZERO_MASK,
    );
    return true;
  }

  dispose(): void {
    const { gl } = this;
    try {
      gl.deleteTexture(this.slots.a.texture);
      gl.deleteTexture(this.slots.b.texture);
      gl.deleteProgram(this.program);
    } catch {
      // A disposed context throws on every call; there is nothing left to free.
    }
  }
}

function makeSlot(gl: WebGL2RenderingContext): Slot | null {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // CLAMP_TO_EDGE and no mipmaps: the sources are non-power-of-two video
  // frames, and the shader already refuses to sample outside 0..1.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return { texture, width: 0, height: 0 };
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const compile = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      // eslint-disable-next-line no-console
      console.warn('timeline preview shader failed to compile', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    // eslint-disable-next-line no-console
    console.warn('timeline preview program failed to link', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}
