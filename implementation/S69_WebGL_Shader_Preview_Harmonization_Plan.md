# Milestone S69: Real-Time WebGL Shader Preview Harmonization & GPU Effect Acceleration

**Status:** Completed & Verified ✅  
**Scope:** Real-time WebGL2 GLSL fragment shader implementation for Film Emulation, Lens Optics & Distortion, Chroma Keying & Spill Suppression, 3-Way Color Grading Wheels, and Shape Masking, unifying preview playback at a rock-solid 60 FPS.

---

## 1. Executive Summary & Problem Statement
In video editing applications, playback responsiveness and visual fidelity are paramount:
- **Current Architecture:** `TimelinePreview.tsx` uses WebGL2 for basic color adjustments (brightness, contrast, saturation, gamma, hue) and transitions, while relying on DOM CSS filters (`filter: blur(...)`, CSS `clip-path`, `box-shadow`) for advanced effects (Film Emulation, Lens Optics, Chroma Key, Shape Masks).
- **The Bottleneck:** Applying CSS filters to multiple high-resolution video layers forces the browser compositor through costly CPU-to-GPU texture re-uploads and multi-pass compositor redraws, causing frame stuttering, desynchronization during playback, and slight visual discrepancies against the FFmpeg exported deliverable.
- **The Solution:** Unify and harmonize all visual effect processing directly inside the WebGL2 fragment shader (`shaders.ts` and `GlCompositor.ts`). By computing barrel distortion, chromatic aberration, procedural film grain, halation, chroma keying, 3-way color balance, and geometric shape masks in a single GPU pass, we eliminate DOM CSS filter overhead, ensure pixel-accurate parity with exported video, and guarantee buttery-smooth 60 FPS playback.

---

## 2. Technical Design & Shader Specifications

### 2.1 GLSL Shader Enhancements (`shaders.ts`)
1. **Lens Optics & Geometric Distortion:**
   - Radial barrel/pincushion distortion:
     ```glsl
     vec2 distortUV(vec2 uv, float k) {
       vec2 p = uv - 0.5;
       float r2 = dot(p, p);
       return 0.5 + p * (1.0 + k * r2);
     }
     ```
   - Chromatic aberration: Separate R, G, B sampling with radial dispersion offsets along the direction from center.
2. **Procedural Film Emulation:**
   - High-performance GPU noise grain:
     ```glsl
     float hash12(vec2 p) {
       vec3 p3 = fract(vec3(p.xyx) * 0.1031);
       p3 += dot(p3, p3.yzx + 33.33);
       return fract((p3.x + p3.y) * p3.z);
     }
     ```
   - Film grain blended proportionally to luminance (stronger in midtones, softer in deep blacks and bright highlights).
   - Halation: Soft red diffuse glow around high-contrast edges.
   - Temperature & Tint color shift.
3. **Chroma Key & Green Screen Extraction:**
   - Color Euclidean distance in normalized RGB/YUV space between pixel color and `uKeyColor`.
   - Smoothstep matte generation based on `similarity` and `smoothness`.
   - Green/Blue spill suppression: `color.g = min(color.g, max(color.r, color.b) * 0.95)`.
4. **3-Way Color Wheels (Lift / Gamma / Gain):**
   - Precise three-way color balance matching DaVinci Resolve and FFmpeg:
     ```glsl
     vec3 apply3WayGrade(vec3 c, vec3 lift, vec3 gamma, vec3 gain) {
       c = c * gain + lift * (1.0 - c);
       return pow(max(vec3(0.0), c), 1.0 / max(vec3(0.01), gamma));
     }
     ```
5. **Shape Masking (Geometric Signed Distance Fields):**
   - Rectangle, Circle, Ellipse SDF with center offset, rotation, dimensions, feather falloff, and invert switch.

### 2.2 Frame Graph & Uniform Serialization (`frame-graph.ts` & `gl-shader-ops.ts`)
- Create `src/shared/utils/timeline/gl-shader-ops.ts`:
  - `packFilmEmulationUniforms(film)`: Packs grain, halation, bloom, temp, tint.
  - `packLensOpticsUniforms(lens)`: Packs distortion, chromatic aberration, vignette.
  - `packChromaKeyUniforms(chroma)`: Packs keyColor, similarity, smoothness, spill.
  - `packColorGradingUniforms(grading)`: Packs lift, gamma, gain, temp, tint.
  - `packMaskUniforms(mask)`: Packs shape, center, size, rotation, feather, invert.
- Extend `GlLayer` in `frame-graph.ts` to carry these packed uniform payloads.

### 2.3 GlCompositor Binding (`GlCompositor.ts`)
- Query and cache WebGL uniform locations.
- Update `bind` to push uniform arrays to the active program.
- Early exit / no-op if effects are disabled, maintaining maximum performance.

### 2.4 TimelinePreview Integration (`TimelinePreview.tsx`)
- Pass `clip.effects` to `layerFor`.
- Omit redundant CSS filter overrides when WebGL is active.
- Seamless fallback to DOM styling if WebGL2 context is lost.

---

## 3. Verification Plan

### Automated Unit Tests
- `src/shared/utils/timeline/__tests__/gl-shader-ops.test.ts`:
  - Verify parameter packing for all 5 effect modules.
  - Test neutral default detection.
  - Test chromatic aberration vector calculations.
  - Test SDF mask bounds and feather math.
- `npm run typecheck`: 0 TypeScript compilation errors.
- `npx vitest run`: 100% test pass rate across all test suites.

### Manual / Visual Verification
- Open project in timeline preview with various effects (Film Grain, Halation, Lens Distortion, Chroma Key, 3-Way Color Wheels, Shape Masks).
- Toggle WebGL compositor on/off and verify identical visual results and 60 FPS playback.
