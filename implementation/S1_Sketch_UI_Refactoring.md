# S1 Sketch UI Refactoring Plan & Progress Tracker

**Location**: `C:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S1_Sketch_UI_Refactoring.md`  
**Status**: ✅ Completed (Phases 1, 2, 3, 4, 5, 6 & 7 Complete)

---

## Progress Checklist

- [x] **Phase 1: Requirements & UX Design Specification**
  - [x] Audit existing `SketchPane.tsx` and whiteboard schema.
  - [x] Design always-visible menu layout for active tab state (even without selected clip).
  - [x] Define minimalist, industry-standard UI hierarchy with modern design system tokens.
- [x] **Phase 2: Component Architecture & State Refactoring**
  - [x] Update `SketchPane.tsx` to maintain interactive state regardless of timeline selection.
  - [x] Implement conditional status banner when no still clip is selected.
  - [x] Build card-based section groups (Hero Card, Pattern Picker, Trace & Cadence, Hand & Look, Timing Slider).
  - [x] Connect clip patch operations seamlessly when a still clip is active.
- [x] **Phase 3: Visual Polish & Aesthetics**
  - [x] Apply modern card containers, hairline borders, and accent styling.
  - [x] Enhance controls with icons, tooltips, and badges.
- [x] **Phase 4: Verification & Testing**
  - [x] Typecheck validation with `npm run typecheck` (Passed with exit code 0).
  - [x] Manual & regression inspection: Menu is always visible, interactive, and beautifully styled.
- [x] **Phase 5: Cadence Streamlining & Sketch Pattern Smart-Pairing**
  - [x] Audited `cadenceFps` implementation across preview (`TimelinePreview.tsx`) and export (`whiteboard-segment.ts`).
  - [x] Replaced redundant 3-way `[Smooth | Sketchy | Choppy]` with streamlined binary `[Fluid | Hand-Drawn]`.
  - [x] Fixed naming collision by replacing `"Sketchy"` with `"Hand-Drawn"`.
  - [x] Implemented smart-pairing: selecting `Sketch` automatically pairs with Hand-Drawn (12 fps), while geometric patterns default to Fluid.
  - [x] Verified zero TypeScript compilation errors (`npm run typecheck`).
- [x] **Phase 6: Hand-Drawn Stroke Following & Curvature Tracking**
  - [x] Bumped `TRACE_ALGORITHM_VERSION = 2` to automatically refresh cached analysis with high-density contour data.
  - [x] Enhanced `orderChains` so `'nearest'` starts from the major silhouette/contour instead of top-left (0,0).
  - [x] Implemented contour-accurate chain sampling in `traceImage` (explicit start, interior curvature steps, and end per stroke).
  - [x] Increased `WHITEBOARD_TRACE_MAX_PEN_POINTS` to 240 for silky-smooth preview stroke tracking.
  - [x] Added `simplifyPenForExport` in `whiteboard-segment.ts` to strictly cap export graph expressions to safe CLI limits.
  - [x] Calibrated pen/stylus visual nib anchor in `TimelinePreview.tsx` (`translate(-4px, -24px)`).
  - [x] Verified zero TypeScript errors (`npm run typecheck`).
- [x] **Phase 7: Zone Types / Authentic Hand-Drawn Mechanics (Writing, Scribble, Contour Tracing)**
  - [x] Eliminated flat curtain-wipe as the sole zone reveal mechanic; introduced `WhiteboardZoneType` (`sketch`, `scribble`, `writing`, `wipe`).
  - [x] Implemented `writing` row-by-row reading trajectory with natural carriage returns in both preview and export expressions.
  - [x] Implemented `scribble` marker zigzag shading trajectory across zone bounds with sinusoidal oscillation in export graphs.
  - [x] Implemented `sketch` contour perimeter tracing with interior swirl in preview and export pipelines.
  - [x] Enhanced `WhiteboardZoneEditorModal.tsx` with Style dropdown selector and dynamic Text Rows control.
  - [x] Upgraded Zod schema in `effects.ts` with backward compatibility for legacy zones.
  - [x] Verified 100% clean typecheck (`npm run typecheck` returned code 0).

---

## 1. Problem Statement & UX Objectives

### Existing Issues
1. **Empty Selection Blanking**: When the user opens the "Sketch" tab in the Media Panel and no still image is selected on the timeline, the pane displays a single text line (*"Select a still on the timeline..."*) and hides all controls. Users cannot see what Sketch features exist without first finding and selecting a still clip.
2. **Visual Hierarchy & Styling**: Controls are stacked in plain unstyled rows with basic HTML labels, lacking card grouping, visual icons, clean spacing, and modern NLE aesthetic (CapCut / DaVinci Resolve style).

### Proposed Solution & Solutions Architecture
1. **Always-Visible Sketch Menu**:
   - The Sketch tab will **always render the complete controls panel**.
   - If **no still clip** is selected on the timeline, a subtle info banner is shown at the top (*"No still clip selected on timeline. Controls show default preview settings."*).
   - Users can tweak parameters (Pattern, Detail, Order, Draw Time, Cadence, Hand Style, Board Look) in preview mode. If a still clip is selected later (or currently selected), modifications immediately update the clip's `effects.whiteboard`.
2. **Refactored UI Layout**:
   - **Hero Activation Header**: A sleek toggle card with a switch and description.
   - **Pattern Selector**: Modern 4-option SegmentedControl (`Writing`, `Wipe`, `Zones`, `Sketch`).
   - **Sketch Vector Trace Controls**: Dedicated sub-card for Stroke Detail (`Bold`, `Medium`, `Fine`) & Order (`Flowing`, `Reading`).
   - **Draw Timing & Cadence**:
     - Range slider for Draw Time (% of clip & calculated duration in seconds).
     - Cadence selector (`Smooth`, `Sketchy (12Hz)`, `Choppy (8Hz)`).
   - **Visual Style & Hand**:
     - Hand overlay selector (`Pen`, `Marker`, `None`).
     - Artistic Board Look (`Original`, `Sketch`, `Pencil`, `Comic`).
   - **Zones Modal Trigger**: Action button for multi-region zone drawing.

---

## 2. Component Structure

```
SketchPane
 ├── Header Status Banner (shown when no still clip is selected)
 ├── Hero Enable/Disable Switch Card
 ├── Pattern Selection Group (Serpentine, Wipe, Zones, Trace)
 ├── Trace Settings Card (Detail, Order) [when Trace is selected/previewed]
 ├── Zones Action Card (Edit Zones Modal trigger) [when Zones is selected/previewed]
 ├── Draw Timing & Cadence Card (Slider + Cadence SegmentedControl)
 ├── Aesthetics & Hand Card (Hand Style, Board Look)
 ├── Footer Info / Tip Box
 └── WhiteboardZoneEditorModal (Modal)
```

---

## 3. Detailed File Changes

### `src/renderer/features/timeline-media/ui/SketchPane.tsx`
- Refactor render logic to remove early return on `!still`.
- Introduce local state `draftSettings` initialized to `WHITEBOARD_DEFAULTS` when no clip is selected.
- Bind control callbacks to either `patchClip` (when `still` is selected) or `draftSettings` (when `still` is null).
- Style all sections with card containers, hairline borders, accent colors, and material symbols icons.

---

## 4. Verification & Testing

1. `npm run typecheck` - Verify zero TypeScript compilation errors.
2. Verify tab active state renders all controls when:
   - No clip is selected.
   - Video/audio clip is selected.
   - Still clip is selected.
3. Verify clip mutation when modifying controls while still clip is selected.

---

## 5. In-Depth Audit: Smooth, Sketchy, and Choppy Functions

### 5.1 Current Architecture & Implementation

`cadenceFps` controls the discrete stepping rate of the whiteboard reveal clock across both the preview player and FFmpeg export:

| Setting | `cadenceFps` Value | Stepping Formula (Preview) | FFmpeg Export Implementation | Perceptual Effect |
| :--- | :--- | :--- | :--- | :--- |
| **Smooth** | `undefined` (`null`) | `seconds` (continuous) | Clock is `t`; ramp is native `fps` (30/60) | Fluid, unbroken motion at full frame rate |
| **Sketchy** | `12` | `Math.floor(s * 12) / 12` (83.3ms hold) | `floor(t*12)/12`; ramp rate `r=12` | 12 fps stepped motion (~2.5 frames held at 30fps) |
| **Choppy** | `8` | `Math.floor(s * 8) / 8` (125.0ms hold) | `floor(t*8)/8`; ramp rate `r=8` | 8 fps stepped motion (~3.75 frames held at 30fps) |

### 5.2 Key Audit Findings: Why They Feel Overly Similar & Out of Context

1. **Marginal Perceptual Difference (83ms vs 125ms)**:
   - The interval difference between 12Hz and 8Hz is only **41.7 milliseconds**. During typical playback durations (2–4 seconds), human eyes cannot reliably discern whether a line is updating at 12 fps or 8 fps; both simply register as generic "stop-motion stutter".
   - Offering both `12` and `8` creates unnecessary decision fatigue for users without providing distinct creative utility.

2. **Semantic Clash with the "Sketch" Pattern**:
   - The cadence option is currently labeled **"Sketchy"** in the Timing section, while the fourth reveal pattern is named **"Sketch"** (Trace).
   - This causes user confusion: users assume "Sketchy" is a setting that exclusively configures the "Sketch" pattern, or that selecting "Sketch" already includes "Sketchy".

3. **Incongruous Behavior on Geometric Patterns (`Wipe` / `Writing`)**:
   - When a stepped cadence (12Hz or 8Hz) is applied to geometric wipe boundaries or rectangular serpentine blocks, the straight mask line jumps abruptly across the image. It looks like dropped video frames or system stuttering rather than an artistic effect.
   - In contrast, when applied to **`Sketch` (vector trace)**, the linework blooms edge-by-edge along traced contours. Stepped cadence here simulates authentic 2D hand-drawn animation ("shot on twos").

### 5.3 Industry Standards Benchmarks

- **VideoScribe & Doodly**:
  - The drawing engine defaults directly to hand-drawn stroke cadence (12–15 fps) to emulate human hand speed.
  - They do not split stepped rates into arbitrary numbers like 8 and 12 fps. The paradigm is **Smooth (Fluid)** vs **Hand-Drawn (Stepped)**.
- **Adobe After Effects / Motion Design**:
  - The standard technique for hand-drawn / sketch look is **12 fps** (half of 24fps cinema, standard animation "on twos") using `Posterize Time`.
  - 8 fps is rarely used except for extreme claymation / retro game aesthetics ("on threes").

### 5.4 Proposed Solutions

#### Option A: Unified Binary Cadence with Smart Default (Recommended)
1. **Streamline Cadence to a 2-State Segmented Control**:
   - **Fluid (Smooth)**: Native project fps (30/60 fps).
   - **Hand-Drawn (12 fps)**: The universally recognized 12 fps animation cadence ("on twos").
   - Drop the redundant 8 fps ("Choppy") to eliminate ambiguity.
2. **Contextual Coupling to the Sketch Pattern**:
   - When the user selects the **Sketch (`trace`)** pattern, automatically default to **Hand-Drawn (12 fps)** (while still allowing the user to toggle to Smooth).
   - When selecting **Writing** or **Wipe**, default to **Fluid (Smooth)** to avoid jagged mask stepping.
3. **Rename for Clarity**:
   - Change the label from `"Sketchy"` to `"Hand-Drawn"` (or `"Stop-Motion"`), completely removing semantic collision with the `"Sketch"` pattern.

#### Option B: Nest Cadence Directly Inside the Sketch Pattern Card
- Only display the Cadence toggle inside the Sketch vector trace card.
- Geometric wipes and writing remain strictly smooth, where they look clean.

#### Option C: Stepped Toggle with Advanced Speed Override
- A clean toggle: `[Fluid | Hand-Drawn]`.
- An optional compact dropdown for power users wanting custom rates (8 fps, 12 fps, 15 fps) if needed.

---

## 6. In-Depth Audit: Hand-Drawn Stroke Following & Industry Standards

### 6.1 The Objective
In professional whiteboard video production (VideoScribe, Doodly, Vyond), the hand/stylus must appear to **physically draw each contour of the image**. The pen tip must track directly along the edge lines, curves, and silhouettes of the subject rather than cutting straight corners or gliding arbitrarily across empty space.

### 6.2 Current Codebase Architecture & Tracing Pipeline

The existing whiteboard trace system in `src/main/media/whiteboard-trace.ts` executes a classical computer vision pipeline:
1. **Line Extraction**: Gaussian blur → Sobel gradient magnitude → Hysteresis thresholding → Zhang-Suen morphological thinning.
2. **Chain Tracing**: Walks 8-connected skeleton neighbors into polyline chains (`Chain { points: {x, y}[] }`).
3. **Chain Ordering**:
   - `'reading'`: Clusters chains into horizontal rows (`y / 24`) and sorts left-to-right.
   - `'nearest'`: Greedy TSP nearest-neighbor search to chain endpoints.
4. **Time-Map Generation**: Stamps each pixel along the stroke with a normalized timestamp `t` ($0 \le t \le \text{strokeFraction}$, default 0.70). The remaining 30% time window is a chamfer-distance fill bloom.
5. **Pen Path Decimation**: Flattens all chains into a single array and samples coordinates into `penPath`:
   ```ts
   export const WHITEBOARD_TRACE_MAX_PEN_POINTS = 33;
   const penEvery = Math.max(1, Math.ceil(totalLength / (WHITEBOARD_TRACE_MAX_PEN_POINTS - 1)));
   ```
6. **Playback Interpolation**:
   - **Preview (`TimelinePreview.tsx`)**: Evaluates `whiteboardTraceFrontAt` via piecewise-linear interpolation between the 33 sampled keyframes.
   - **Export (`whiteboard-segment.ts`)**: Constructs a nested FFmpeg `if(lt(T,...),...,...)` expression string evaluating piecewise linear segments in `-filter_complex`.

---

### 6.3 Root Causes: Why the Hand Fails to Accurately Follow Image Strokes

Our deep audit reveals 5 distinct mathematical, architectural, and visual causes:

#### 1. Severe Keyframe Decimation (The 33-Point Cap)
- An edge-detected drawing typically contains **5,000 to 20,000 skeleton pixels** across dozens of curves, circles, corners, and contours.
- Decimating this to a maximum of **33 keyframes** means the pen path records a point only once every **150–600 pixels**.
- When `whiteboardTraceFrontAt` interpolates between point $A$ and point $B$, it draws a **straight chord line across 2D space**.
- **Result**: The hand cuts straight across arcs, circular eyes, letter loops, and facial silhouettes, completely bypassing the actual curves of the image.

#### 2. Disconnected Cross-Chain "Air Gliding" (No Pen-Up Concept)
- When chain $K$ (e.g. left eye) finishes and chain $K+1$ (e.g. right ear) begins, the distance between their endpoints can be hundreds of pixels of blank space.
- In `traceImage`, all points across all chains are flattened sequentially into a single timeline without distinguishing between **drawing on paper** and **repositioning in air**.
- **Result**: The pen moves slowly and visibly across blank background areas, drawing nothing while dragging its tip in thin air, or arriving late after the line has already revealed.

#### 3. Chain Ordering Visual Flaws
- **`'reading'` order**: Slices the drawing into artificial horizontal bands (`y / 24`). For illustrations, this causes the hand to oscillate mechanically back and forth across scanlines like a desktop flatbed scanner, rather than drawing cohesive shapes.
- **`'nearest'` order**: Greedy endpoint search frequently traps itself in local branches, forcing sudden massive diagonal jumps across the entire canvas when a branch ends.

#### 4. The FFmpeg Command-Line Bottleneck (Why the 33-Point Cap Existed)
- In `whiteboard-segment.ts`, the export implements hand motion by constructing a single recursive expression string:
  ```ts
  expr = `if(lt(${T},${end}),${segment(axis, i)},${expr})`;
  ```
  Nesting 32 `if` statements creates an expression ~4KB long. If `penPath` had 200 or 500 points, FFmpeg's expression parser would crash from recursion limits, and the command string would exceed OS command-line limits (8,191 chars on Windows).
- **The flaw**: This export-side string limitation was inadvertently imposed on the **Preview player**, even though JavaScript/Canvas in the preview player has zero command-line string limits!

#### 5. Nib / Stylus Anchor Misalignment
- In `TimelinePreview.tsx`:
  ```tsx
  <span className="material-symbols-outlined absolute text-3xl" style={{ left: `${wbGlyphFront.x * 100}%`, top: `${wbGlyphFront.y * 100}%` }}>
    {whiteboard.hand === 'marker' ? 'ink_marker' : 'stylus'}
  </span>
  ```
  The Material icon is anchored at its top-left $(0, 0)$. The visual pen tip is angled toward the bottom-left/center of the 30px bounding box.
- Without an anchor transform offset (`translate(-Xpx, -Ypx)`), the pen glyph visibly floats **several pixels away from the actual reveal line**.

---

### 6.4 Industry Standards Benchmark

| Feature | VideoScribe / Doodly | Adobe After Effects / Motion | VideoStudio (Current) |
| :--- | :--- | :--- | :--- |
| **Path Tracking** | Exact continuous vector Bézier curve tracking ($s \in [0, L]$) | Spline/parametric path keyframing | 33 uniform linear sample points |
| **Stroke Transitions** | Fast Pen-Up travel (50–100ms swift snap without drawing) | Mask transition / cut | Slow linear glide through empty space |
| **Curve Simplification** | Ramer-Douglas-Peucker (RDP) adaptive tolerance | Adaptive spatial tangents | Uniform division (`length / 32`) |
| **Drawing Hierarchy** | Main silhouettes first → interior details → fill | Layer stack ordering | Scanline row or greedy nearest |
| **Hand Anchor** | Calibrated to exact pixel coordinate of pen nib | Anchor Point at nib tip | Top-left bounding box without offset |

---

### 6.5 Proposed Solutions (Aligned with Industry Standards)

#### **Solution 1: High-Density Stroke Tracking in Preview & Curvature-Adaptive Path**
1. **Decouple Preview from FFmpeg's String Limit**:
   - The trace worker computes a **high-density pen path** (e.g. 300–600 points, or 1 point per animation step at 12 fps / sequence fps).
   - The preview player (`TimelinePreview.tsx`) tracks this high-resolution path, providing silky, exact stroke following on the monitor canvas.
2. **Adaptive Curve Simplification (Ramer-Douglas-Peucker)**:
   - Instead of blind uniform division (`length / 32`), apply the RDP algorithm to each chain.
   - Long straight lines need only 2 points; tight curves, loops, and corners retain the necessary density to follow the contour accurately.

#### **Solution 2: Distinguish Drawing vs. Transit ("Pen-Up / Pen-Down")**
1. **Explicit Transit Phase**:
   - When transitioning from chain $A$ to chain $B$, flag the movement as `transit: true` (or allocate a brief, dedicated 60–100ms transit time).
   - During transit, the draw threshold is paused, and the hand quickly repositions to the start of the next stroke.
2. **Eliminates Air-Drawing**:
   - The hand never drags across blank canvas while lines are revealing elsewhere.

#### **Solution 3: Hierarchical Stroke Ordering (Natural Human Drawing Order)**
1. **Longest / Outer Contours First**:
   - Sort chains by length and perimeter bounding box: draw the primary subject silhouette and major outlines first.
2. **Secondary Details Second**:
   - Draw internal facial features, text, or minor linework.
3. **Fill Bloom Last**:
   - When the pen finishes the final stroke, the hand can either gracefully exit the frame (slide down-right) or perform a brief shading wave as color blooms.

#### **Solution 4: Calibrated Nib Anchor Offset**
1. **Preview Calibration**:
   - Add calibrated CSS transform offset for `stylus` / `ink_marker` icons so the physical tip of the nib lands exactly on $(x, y)$.
2. **Export Calibration**:
   - Offset the `overlay=x=...:y=...` coordinates by the measured nib offset of `hand-pen.png` and `hand-marker.png` (currently `x - 6, y - 6`).

---

## 7. In-Depth Audit & Architectural Proposal: Zone Types & Hand-Drawn Stroke Following

### 7.1 Problem Statement: The "Curtain Wipe" Flaw in Current Zones

In the current whiteboard engine:
1. **Geometric Half-Plane Masking**: When a user draws a custom zone lasso around an illustration or text, the code executes `clipPolygonHalfPlane(zone.points, sweep.axis, front, sweep.keep)`. This is a flat, straight vertical or horizontal **curtain wipe**.
2. **Centroid Slider Motion**: The pen front is placed at:
   ```ts
   sweep.axis === 'x' ? { x: state.front, y: centroid.y } : { x: centroid.x, y: state.front }
   ```
   The hand stylus glides in a **single straight line across the zone's center** while a flat rectangular boundary sweeps across the picture.
3. **UX Failure**: It does not look like a human artist drawing or coloring the zone. It looks like a mechanical gradient wipe with a disconnected stylus hovering in the center.

---

### 7.2 Industry Standards Benchmark (VideoScribe, Doodly, Vyond)

Professional whiteboard animation software solves regional drawing through **3 distinct hand-drawn zone engines**:

| Zone Type | How It Renders | Hand Stylus Behavior | Best Used For |
| :--- | :--- | :--- | :--- |
| **1. Traced Sketch (`sketch`)** | Linework edge contours inside the zone are drawn stroke-by-stroke, followed by a color bloom. | Follows the actual contours, curves, and outlines within the zone. | Detailed illustrations, faces, logos, product outlines. |
| **2. Scribble / Shading (`scribble`)** | The zone is colored in via an angled continuous zigzag hatching path. | Rapidly zigzags back and forth at 45° across the zone, mimicking human marker shading. | Solid colors, flat vector art, filled shapes, backgrounds. |
| **3. Calligraphy / Writing (`writing`)** | Multi-line row-by-row serpentine reveal with carriage returns. | Writes left-to-right along successive text lines inside the polygon. | Text blocks, bullet points, titles, annotations. |
| **4. Linear Wipe (`wipe`)** | Smooth directional gradient wipe (existing behavior). | Sweeps across the zone axis. | Fast transitions or simple geometric graphics. |

---

### 7.3 Proposed Solutions & Algorithms

#### **Solution A: Traced Contour Sketching Inside Zones (`type: 'sketch'`)**
- **Algorithm**:
  1. Crop the analysis skeleton time-map to the zone polygon: only pixels $(x, y) \in \text{Zone}$ are retained.
  2. The stroke chains inside that zone are ordered via contour hierarchy (longest outline first).
  3. The hand stylus physical coordinates follow the specific stroke chains inside that zone.
  4. The mask reveals the linework along the pen's exact path, followed by a local chamfer-distance color bloom inside the zone.
- **Visual Result**: The hand physically sketches the object inside the lasso before moving to the next zone!

#### **Solution B: Hand-Drawn Scribble / Crosshatch Shading (`type: 'scribble'`)**
- **Algorithm**:
  1. Rotate the zone polygon by the shading angle $\theta$ (default $45^\circ$).
  2. Generate horizontal scanline chords spaced by the pen/marker nib diameter $D$ (e.g. 16px to 24px in sequence space).
  3. Connect the chord endpoints alternately (left-to-right, then right-to-left) to form a continuous **zigzag polyline**.
  4. The stylus tip traverses this zigzag path across the zone.
  5. The reveal mask grows along the dilated scribble path, so the image appears **colored in by the pen**.
- **Visual Result**: Authentic hand-drawn shading. The user sees the hand actively coloring in the lassoed area with rapid, energetic strokes.

#### **Solution C: Multi-Line Natural Writing (`type: 'writing'`)**
- **Algorithm**:
  1. Divide the zone's bounding box into $N$ horizontal text bands (e.g. 3 to 8 rows, or auto-calculated from zone height).
  2. Intersect each band with the zone polygon.
  3. The stylus traces each line left-to-right, then executes a swift "Pen-Up" carriage return to the beginning of the next line.
- **Visual Result**: Perfect for text, formulas, or bullet points lassoed by the user.

---

### 7.4 Data Schema & UI Architecture

#### **1. Updated `WhiteboardZone` Schema (`src/shared/types/sequence.ts`)**:
```ts
export type WhiteboardZoneType = 'sketch' | 'scribble' | 'writing' | 'wipe';

export interface WhiteboardZone {
  /** Simplified freehand polygon, 3..64 vertices. */
  points: { x: number; y: number }[];
  /** Entrance style: stroke trace, shading scribble, multi-line writing, or wipe. */
  type: WhiteboardZoneType;
  /** Angle for scribble shading (in degrees, default 45). */
  hatchAngle?: number;
  /** Number of text rows for writing mode (default 4). */
  rows?: number;
  /** Direction for wipe fallback ('lr' | 'rl' | 'tb'). */
  sweep?: 'lr' | 'rl' | 'tb';
  /** Proportional share of the draw window (0.25–4, default 1). */
  weight?: number;
}
```

#### **2. Zone Editor UI (`WhiteboardZoneEditorModal.tsx`)**:
In the sidebar where each zone is listed:
- Replace the lone "Sweep" dropdown with a clean **Type Selector**:
  - `[Sketch (Trace) | Scribble (Shade) | Writing (Text) | Wipe]`
- Show contextual secondary controls depending on the selected type:
  - If **`Scribble`**: Angle selector (`45° Diagonal`, `Horizontal`, `Vertical`) and Nib Density slider.
  - If **`Writing`**: Number of lines (`Auto`, `3 lines`, `5 lines`).
  - If **`Wipe`**: Direction dropdown (`Left → Right`, `Right → Left`, `Top → Bottom`).
  - If **`Sketch`**: Stroke detail badge (`Contour Trace`).
