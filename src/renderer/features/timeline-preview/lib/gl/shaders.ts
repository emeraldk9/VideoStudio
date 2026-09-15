import { MAX_ADJUSTMENT_LAYERS } from './frame-graph';

/**
 * Beta S249 — the compositor's two shaders.
 *
 * One draw call per frame, two textures, one fragment program. The
 * alternative — a pass per layer with blending — cannot express the families
 * that must read *both* pictures at once: `pixelize` degrades both toward the
 * same block size before mixing, and `radial` chooses between them by angle.
 * Those two are precisely the ones the DOM switcher could not do, so the
 * shape of this file follows from what it exists to fix.
 *
 * Kept as strings in TypeScript rather than `.glsl` imports: the Vite config
 * has no glsl plugin, and adding a build-time transform to ship two shaders
 * would be a larger change than the shaders.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // A single triangle-pair quad in clip space; UV has its origin at the top
  // left, matching how a video frame arrives from texImage2D.
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/**
 * Family ids, shared between JS and GLSL. Kept as an explicit map rather than
 * an index into `GL_TRANSITION_FAMILIES` so reordering that array cannot
 * silently repoint a shader branch.
 */
export const FAMILY_IDS = {
  none: 0,
  dissolve: 1,
  dip: 2,
  wipe: 3,
  slide: 4,
  circle: 5,
  pixelize: 6,
  radial: 7,
  blur: 8,
  asymmetric: 9,
  additive: 10,
  luma: 11,
} as const;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform bool uHasA;
uniform bool uHasB;

// Per-layer sampling: (scaleX, scaleY, offsetX, offsetY) mapping frame UV to
// source UV. Carries both the fit (contain letterboxes, cover crops) and the
// Ken Burns viewport, because both are the same operation on a UV.
uniform vec4 uUvA;
uniform vec4 uUvB;
uniform vec2 uTexelA;
uniform vec2 uTexelB;

// brightness, contrast, saturation, gamma, hue(deg), sharpen, vignette
uniform float uFiltersA[7];
uniform float uFiltersB[7];
uniform float uAdjust[${MAX_ADJUSTMENT_LAYERS * 7}];
uniform int uAdjustCount;

uniform int uFamily;
uniform float uProgress;
uniform vec2 uDirection;
uniform float uSign;
uniform vec3 uVeilColor;
uniform float uVeilOpacity;
uniform vec3 uBackground;
// S250 — blend in linear light, mirroring \`xfadePlanFor\`'s own flag.
uniform bool uLinear;
// S250 — the asymmetric dissolve's out/in ratio; ignored by every other family.
uniform float uRatio;

const float PI = 3.1415926535897932384626433832795;

/**
 * sRGB <-> linear light.
 *
 * The export blends inside a \`gbrp16le\` linear wrap (S230), and a blend
 * computed on gamma-encoded values darkens its midpoint — the mid-dissolve
 * dip that reads as "digital". Doing it here is what stops the preview from
 * dipping where the export does not.
 *
 * The sRGB transfer function rather than bt709's: the textures come from the
 * browser's own decode, which lands in display space, and the two curves
 * differ by less than this preview can show.
 */
vec3 toLinear(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

/** A sampled colour in the space this transition blends in. */
vec3 blendSpace(vec3 c) {
  return uLinear ? toLinear(c) : c;
}

/** The inverse, applied only where \`blendSpace\` was. */
vec3 toSrgbIf(vec3 c) {
  return uLinear ? toSrgb(c) : c;
}

vec3 applyHue(vec3 color, float degrees) {
  if (abs(degrees) < 0.001) return color;
  float a = radians(degrees);
  float c = cos(a);
  float s = sin(a);
  // The YIQ rotation ffmpeg's \`hue\` filter performs.
  mat3 toYiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  mat3 toRgb = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYiq * color;
  yiq.yz = mat2(c, s, -s, c) * yiq.yz;
  return toRgb * yiq;
}

/** brightness/contrast/saturation/gamma/hue, in \`eq\`'s order and pivots. */
vec3 applyColor(vec3 color, float brightness, float contrast, float saturation, float gamma, float hue) {
  color += brightness;
  color = (color - 0.5) * contrast + 0.5;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, saturation);
  if (abs(gamma - 1.0) > 0.001) {
    color = pow(max(color, vec3(0.0)), vec3(1.0 / gamma));
  }
  return applyHue(color, hue);
}

/**
 * One picture, sampled at \`frameUv\` and graded.
 *
 * \`frameUv\` is the position in the *output* frame, which is \`vUv\` for every
 * family except \`slide\` — where both pictures translate, and passing a
 * shifted coordinate is the whole implementation. Outside the source
 * rectangle the frame is background: that is what makes \`contain\`
 * letterbox instead of smearing the edge texel.
 */
vec4 sampleLayer(sampler2D tex, vec4 uvXform, vec2 texel, float f[7], vec2 frameUv) {
  if (frameUv.x < 0.0 || frameUv.x > 1.0 || frameUv.y < 0.0 || frameUv.y > 1.0) {
    return vec4(uBackground, 0.0);
  }
  vec2 uv = frameUv * uvXform.xy + uvXform.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4(uBackground, 1.0);
  }
  vec3 color = texture(tex, uv).rgb;
  if (f[5] > 0.001) {
    // Unsharp mask: a 4-tap cross is not \`unsharp=5:5\`, and does not claim
    // to be — it is the same *direction* of correction at a cost the preview
    // can pay every frame.
    vec3 blur = (
      texture(tex, uv + vec2(texel.x, 0.0)).rgb +
      texture(tex, uv - vec2(texel.x, 0.0)).rgb +
      texture(tex, uv + vec2(0.0, texel.y)).rgb +
      texture(tex, uv - vec2(0.0, texel.y)).rgb
    ) * 0.25;
    color += (color - blur) * f[5] * 1.5;
  }
  color = applyColor(color, f[0], f[1], f[2], f[3], f[4]);
  if (f[6] > 0.001) {
    // \`vignette=PI/5*strength\`: a cos^4 falloff off the frame centre, which
    // is the filter's own model.
    float r = length(frameUv - 0.5) * 2.0;
    float fall = pow(cos(clamp(r * (PI / 5.0) * f[6] * 2.5, 0.0, PI * 0.5)), 4.0);
    color *= mix(1.0, fall, clamp(f[6], 0.0, 1.0));
  }
  return vec4(color, 1.0);
}

vec3 layerA(vec2 frameUv) {
  if (!uHasA) return uBackground;
  vec4 c = sampleLayer(uTexA, uUvA, uTexelA, uFiltersA, frameUv);
  return mix(uBackground, c.rgb, c.a);
}

vec3 layerB(vec2 frameUv) {
  if (!uHasB) return uBackground;
  vec4 c = sampleLayer(uTexB, uUvB, uTexelB, uFiltersB, frameUv);
  return mix(uBackground, c.rgb, c.a);
}

void main() {
  vec3 a = layerA(vUv);
  vec3 b = layerB(vUv);
  // The blending families work here and convert back at the end; the
  // selecting families (wipe, slide, circle, radial) set uLinear false, so
  // for them this pair and the round trip are both the identity.
  vec3 wa = blendSpace(a);
  vec3 wb = blendSpace(b);
  vec3 color;

  if (uFamily == ${FAMILY_IDS.none} || !uHasA) {
    color = uHasB ? b : a;
  } else if (uFamily == ${FAMILY_IDS.dissolve}) {
    color = toSrgbIf(mix(wa, wb, uProgress));
  } else if (uFamily == ${FAMILY_IDS.dip}) {
    // The incoming rises out of the solid in the second half; the veil below
    // covers the first. A flash holds its veil at 1 throughout.
    color = toSrgbIf(mix(wa, wb, clamp(uProgress * 2.0 - 1.0, 0.0, 1.0)));
  } else if (uFamily == ${FAMILY_IDS.asymmetric}) {
    // xfade: A*max(0,1-(1-P)/ratio) + B*(1-P), with P = 1 - progress.
    // The outgoing leaves within the first \`ratio\` of the window; the
    // incoming rises across the whole of it.
    color = toSrgbIf(wa * max(0.0, 1.0 - uProgress / uRatio) + wb * uProgress);
  } else if (uFamily == ${FAMILY_IDS.additive}) {
    // xfade: min(MAX, A*min(1,2*P) + B*min(1,2*(1-P))). Both images at full
    // weight through the middle, highlights blooming — which only *means*
    // anything in linear light, and is why this family sets the flag.
    color = toSrgbIf(
      min(vec3(1.0), wa * min(1.0, 2.0 * (1.0 - uProgress)) + wb * min(1.0, 2.0 * uProgress))
    );
  } else if (uFamily == ${FAMILY_IDS.luma}) {
    // xfade: if(gt(A,(1-P)*MAX),A,B) — per channel, as ffmpeg does it per
    // plane. The outgoing's bright pixels persist longest; hard-edged on
    // purpose, which is the archival feel.
    color = toSrgbIf(vec3(
      wa.r > uProgress ? wa.r : wb.r,
      wa.g > uProgress ? wa.g : wb.g,
      wa.b > uProgress ? wa.b : wb.b
    ));
  } else if (uFamily == ${FAMILY_IDS.blur}) {
    // The export's \`hblur\` token: a horizontal blur on both pictures whose
    // width peaks at the midpoint, cross-faded underneath. Nine taps is not
    // ffmpeg's kernel and does not claim to be — it is the same shape at a
    // cost the preview can pay per frame.
    float peak = 1.0 - abs(uProgress * 2.0 - 1.0);
    float spread = peak * 0.02;
    vec3 sa = vec3(0.0);
    vec3 sb = vec3(0.0);
    for (int i = -4; i <= 4; i++) {
      vec2 offset = vec2(float(i) * spread, 0.0);
      sa += blendSpace(layerA(vUv + offset));
      sb += blendSpace(layerB(vUv + offset));
    }
    color = toSrgbIf(mix(sa / 9.0, sb / 9.0, uProgress));
  } else if (uFamily == ${FAMILY_IDS.wipe}) {
    // The edge sweeps along uDirection; behind it is the incoming picture.
    // The coordinate matches the CSS \`inset()\` the DOM path uses, so the
    // two renderers wipe the same way round.
    float along = dot(vUv, abs(uDirection));
    float coord = (uDirection.x + uDirection.y) > 0.0 ? along : 1.0 - along;
    color = coord < uProgress ? b : a;
  } else if (uFamily == ${FAMILY_IDS.slide}) {
    // Both pictures translate, the incoming entering from the edge the
    // outgoing is leaving toward — xfade's \`slide*\`, which the DOM path
    // could only half-do (it translated the incoming over a stationary
    // underlay).
    vec3 outgoing = layerA(vUv - uDirection * uProgress);
    vec3 incoming = layerB(vUv + uDirection * (1.0 - uProgress));
    vec2 uvB = vUv + uDirection * (1.0 - uProgress);
    bool inB = uvB.x >= 0.0 && uvB.x <= 1.0 && uvB.y >= 0.0 && uvB.y <= 1.0;
    color = inB ? incoming : outgoing;
  } else if (uFamily == ${FAMILY_IDS.circle}) {
    // Normalised so 1.0 reaches the corner: the shape has covered the frame
    // exactly when progress lands on 1.
    float r = distance(vUv, vec2(0.5)) / 0.7071;
    float edge = uSign > 0.0 ? uProgress : 1.0 - uProgress;
    bool inside = uSign > 0.0 ? r < edge : r > edge;
    color = inside ? b : a;
  } else if (uFamily == ${FAMILY_IDS.pixelize}) {
    // Both pictures coarsen to the same block size, peaking at the midpoint,
    // and cross-fade underneath — xfade's own model, and the reason this
    // family cannot be faked with an opacity ramp.
    float peak = 1.0 - abs(uProgress * 2.0 - 1.0);
    float blocks = mix(240.0, 10.0, peak);
    vec2 snapped = (floor(vUv * blocks) + 0.5) / blocks;
    color = mix(layerA(snapped), layerB(snapped), uProgress);
  } else if (uFamily == ${FAMILY_IDS.radial}) {
    // A hand sweeping around the centre: the angle decides which picture,
    // not the opacity.
    vec2 d = vUv - 0.5;
    float swept = (atan(d.y, d.x) + PI) / (2.0 * PI);
    color = swept < uProgress ? b : a;
  } else {
    color = mix(a, b, uProgress);
  }

  if (uVeilOpacity > 0.0) {
    // Export-side the veil is part of the dip's own custom expression, so it
    // mixes in whatever space the family blended in — linear for a dip,
    // gamma-encoded for the plain fades, which fall to \`xfadePlanFor\`'s
    // default arm.
    color = toSrgbIf(
      mix(blendSpace(color), blendSpace(uVeilColor), clamp(uVeilOpacity, 0.0, 1.0))
    );
  }

  // The adjustment layers, applied to the finished frame in track order —
  // sequentially, because chaining two grades is not one summed grade.
  for (int i = 0; i < ${MAX_ADJUSTMENT_LAYERS}; i++) {
    if (i >= uAdjustCount) break;
    int o = i * 7;
    color = applyColor(color, uAdjust[o], uAdjust[o + 1], uAdjust[o + 2], uAdjust[o + 3], uAdjust[o + 4]);
  }

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

export { VERTEX_SHADER, FRAGMENT_SHADER };
