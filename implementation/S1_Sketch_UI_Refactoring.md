# S1 Sketch UI Refactoring Plan & Progress Tracker

**Location**: `C:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S1_Sketch_UI_Refactoring.md`  
**Status**: ✅ Completed (Phases 1, 2, 3, 4 & 5 Complete)

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
