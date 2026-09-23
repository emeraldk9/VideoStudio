# S38: Video Compositing & Chroma Key Engine (Green/Blue Screen Removal, Multi-Track Blend Modes, Spill Suppression & FFmpeg Alpha Compositing)

## Executive Overview
Step S38 establishes a professional-grade Video Compositing & Chroma Key Engine for VideoStudio. Editors can composite multiple video, image, and graphic layers on the timeline using 12 industry-standard layer blend modes (`screen`, `multiply`, `overlay`, `darken`, `lighten`, etc.) and isolate subjects against green, blue, magenta, or custom color backdrops with broadcast-accurate YUV color distance calculations, dual-threshold smooth edge antialiasing, and edge spill suppression.

---

## Mathematical Architecture & Color Calculus

### 1. Euclidean YUV Chroma Distance
Chroma keying in RGB space is susceptible to uneven lighting and shadow gradients. Converting RGB to ITU-R BT.601 YUV separates luminance ($Y$) from chromaticity ($U, V$):
$$Y = 0.299 R + 0.587 G + 0.114 B$$
$$U = -0.14713 R - 0.28886 G + 0.436 B$$
$$V = 0.615 R - 0.51499 G - 0.10001 B$$

The chromaticity distance $\Delta C$ between pixel color and key color is computed in UV space:
$$\Delta C = \sqrt{(U_{\text{pixel}} - U_{\text{key}})^2 + (V_{\text{pixel}} - V_{\text{key}})^2}$$

### 2. Dual-Threshold Alpha Matte Generation
Given similarity threshold $S \in [0.01, 1.0]$ and edge smoothness band $M \in [0.0, 0.5]$:
- $\text{InnerCut} = \max(0, S - M)$
- $\text{OuterCut} = S + M$

The resulting alpha value $\alpha \in [0.0, 1.0]$ is evaluated using smoothstep interpolation:
$$\alpha = \begin{cases}
0.0 & \text{if } \Delta C \le \text{InnerCut} \\
1.0 & \text{if } \Delta C \ge \text{OuterCut} \\
3t^2 - 2t^3 & \text{where } t = \frac{\Delta C - \text{InnerCut}}{\text{OuterCut} - \text{InnerCut}}
\end{cases}$$

### 3. Green/Blue Spill Suppression (Despill)
Reflected backdrop light on hair and shoulders is neutralized without altering the underlying luminance:
- **Green Spill**: If $G > \frac{R + B}{2}$, then:
  $$G_{\text{despill}} = \frac{R + B}{2} + (1 - \text{factor}) \cdot \left(G - \frac{R + B}{2}\right)$$
- **Blue Spill**: If $B > \frac{R + G}{2}$, then:
  $$B_{\text{despill}} = \frac{R + G}{2} + (1 - \text{factor}) \cdot \left(B - \frac{R + G}{2}\right)$$

### 4. 12 NLE Blend Modes
- **Normal**: Standard alpha overlay.
- **Screen**: $1 - (1 - A) \cdot (1 - B)$ (Light leaks, fire, dust, sparks).
- **Multiply**: $A \cdot B$ (Shadows, vignettes, sketches).
- **Overlay**: Combination of Multiply and Screen based on base luminance.
- **Darken / Lighten**: $\min(A, B)$ / $\max(A, B)$.
- **Color Dodge / Color Burn**: Contrast boost for vivid glowing highlights or deep shadows.
- **Hard Light / Soft Light**: Diffused and specular spotlight effects.
- **Difference / Exclusion**: Visual difference and inversion for alignment and stylization.

---

## Components Implemented

### 1. Pure Arithmetic & Filter Module (`src/shared/utils/timeline/compositing-ops.ts`)
- `BlendMode`, `BLEND_MODES` (with labels, categories, descriptions, and FFmpeg modes).
- `ChromaKeySettings`, `CHROMA_KEY_PRESETS` (`green_screen`, `blue_screen`, `magenta_screen`, `dark_shadow_key`, `high_key_white`).
- `hexToRgb`, `rgbToHex`, `rgbToYuv`, `calculateChromaDistance`.
- `calculateKeyAlpha(pixelRgb, keyRgb, similarity, smoothness)`: Smoothstep alpha matte calculus.
- `applySpillSuppression(rgb, keyColorHex, spillFactor)`.
- `buildFfmpegChromaKeyFilter(settings)`: Produces `chromakey=color=...:similarity=...:blend=...,despill=...`.
- `buildFfmpegBlendFilter(mode)`: Produces `blend=all_mode=...`.
- `buildSvgChromaFilterMatrix(settings)`: Generates dynamic `<feColorMatrix>` matrix values for browser preview.

### 2. Schema & Shared Root Integration (`effects.ts`, `index.ts`)
- Added `blendMode?: BlendMode` and `chromaKey?: ChromaKeySettings` to `ClipEffects` interface and Zod schema.
- Re-exported all compositing types, presets, and functions from `src/shared/index.ts`.

### 3. Real-Time Timeline Preview (`TimelinePreview.tsx`)
- In `overlayStyle(placed)`: Applied `mixBlendMode: placed.clip.effects?.blendMode ?? 'normal'`.
- Dynamic SVG filter reference: `url(#chromakey-${placed.clip.id})` injected into the CSS filter chain.
- SVG `<defs>` block dynamically instantiating `<feColorMatrix>` and `<feComponentTransfer>` for every clip with `chromaKey.enabled`.

### 4. Clip Inspector UI (`ClipInspector.tsx`)
- Added **Compositing & Blend Mode** section:
  - 12-mode dropdown selector with categorized options and real-time description hints.
- Added **Chroma Key (Green Screen)** section:
  - Master on/off toggle switch with accent status icon.
  - Studio preset chips (`Green Screen`, `Blue Screen`, `Magenta`, `Dark Key`, `High-Key White`).
  - Interactive color picker circle + hex display.
  - Similarity (Tolerance) slider (1% to 100%).
  - Smoothness (Edge Softness) slider (0% to 50%).
  - Spill Suppression slider (0% to 100%).
  - One-click Reset to Defaults.

---

## Verification & Testing Results

| Test Suite / Step | Result |
| :--- | :--- |
| **Compositing Ops Test Suite** (`compositing-ops.test.ts`) | **20 / 20 tests passed** |
| **Full Vitest Test Suite** (`npm test`) | **32 / 32 test files passed (358 / 358 tests, 100%)** |
| **TypeScript Typecheck** (`tsc --noEmit`) | **0 errors (Exit Code 0)** |
| **Vite Renderer Production Build** (`vite.renderer.config.ts`) | **Built in 8.83s (Exit Code 0)** |
| **Vite Main Production Build** (`vite.main.config.ts`) | **Built in 8.09s (Exit Code 0)** |
