# S6: Sketch Lane Zone Thumbnails & UI Consistency Refactoring Plan

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S6_Sketch_Lane_Zone_Thumbnails_And_UI_Refactoring_Plan.md`  
**Status**: 🟢 Completed & Verified  
**Standard**: NLE Automation Track Standards (CapCut Desktop, Premiere Pro, Final Cut Pro, DaVinci Resolve)  

---

## Progress Checklist & Tracker

- [x] **Phase 1: Zone Geometry & Thumbnail Generation Utilities**
  - [x] Implement `zoneThumbnailViewBox(zone: WhiteboardZone, padding?: number): string` in `src/shared/utils/geometry/polygon.ts` to compute SVG viewBox matching the zone bounding box (`polygonBounds`).
  - [x] Implement `whiteboardZoneTimeSlices(zones, inFrames, outFrames, fps)` to compute exact frame and second timestamps for each zone's reveal window.
  - [x] Implement `polygonPointsSvg` for SVG polygon points string formatting.

- [x] **Phase 2: Sketch Keyframe Lane Elevation & Zone Visuals**
  - [x] Update `src/renderer/features/timeline-edit/ui/SketchKeyframeLane.tsx`:
    - [x] Increase lane height:
      - Default / compact: 28px (for single-pattern reveals like serpentine, wipe, trace).
      - Zones pattern: Expand to **52px** to render clear image thumbnails of each zone.
    - [x] Header enhancement:
      - Sticky 152px gutter displays pattern icon (`crop_free` for zones, `draw` for sketch), active clip count, and zone mode badge (`Zones Mode`).
    - [x] Trough zone rendering:
      - Partition drawing span (`inPx` to `outPx`) using `whiteboardZoneTimeSlices`.
      - Render individual zone image thumbnails inside each zone slice using SVG cropped polygon.
      - Render zone badges (`Z1`, `Z2`, etc.) and zone duration indicators.
      - Render boundary divider markers between adjacent zones.
      - Clicking on a zone thumbnail seeks the playhead directly to that zone's start frame.
      - Hover tooltip displaying zone index, type (`sketch`, `scribble`, `writing`, `wipe`), and duration.

- [x] **Phase 3: Refactor Sketches Tab UI for App Consistency**
  - [x] Update `src/renderer/features/timeline-media/ui/SketchPane.tsx`:
    - [x] Replace arbitrary category sidebar with **Reveal Pattern Navigation Rail**:
      - `serpentine`: **Writing** (icon: `edit_note`)
      - `wipe`: **Wipe** (icon: `swipe`)
      - `zones`: **Custom Zones** (icon: `crop_free`)
      - `trace`: **Line-Art Sketch** (icon: `draw`)
    - [x] Selecting a pattern directly switches the active reveal pattern and loads the pattern's dedicated settings stage.
    - [x] Main Settings Stage organization (CapCut 3-Card structure):
      - **Card 1: Pattern Specific Parameters** (writing row count slider, direction picker for wipe, zone list & editor trigger for zones, detail & order controls for trace).
      - **Card 2: Timing & In/Out Keyframes** (In point delay slider, Out point complete slider, 12fps hand-drawn cadence toggle).
      - **Card 3: Hand Stylus & Artistic Board Look** (Pen / Marker / None, Original / Sketch / Pencil / Comic).
    - [x] Ensure 100% visual consistency with `EffectsPane.tsx` and `TransitionsPane.tsx`.

- [x] **Phase 4: Verification & Automated Testing**
  - [x] Run `npm run typecheck` (0 errors).
  - [x] Run `npm test` with unit tests for `whiteboardZoneTimeSlices` and zone thumbnail geometry (12 passed).
  - [x] Verified zone thumbnails aligned on timeline and responsive pattern switching in the Sketch pane.

---

## 1. Requirement 1: Zone Images in the Timeline Sketch Lane

### 1.1 The Challenge
In whiteboard reveal animations with `pattern: 'zones'`, the image is partitioned into distinct user-drawn regions (e.g., Zone 1 = face, Zone 2 = background, Zone 3 = text or title). Currently, the timeline lane only displays a generic solid drawing bar.

Editors in professional NLEs need to visually identify **which part of the image is being revealed in each time slice**.

### 1.2 The Proposed Solution

```
+---------------------------------------------------------------------------------------------------------+
| [Sticky Gutter] |                         TIMELINE TROUGH (Height: 52px)                               |
| [🎨 Sketch FX ] |  [Clip Start]                                                            [Clip End]  |
| [ 3 Zones     ] |  |--- Delay ---[◆ In]=========[Zone 1]=========[Zone 2]========[Zone 3]=======[◆ Out]---|
|                 |                |       | [Face Thumb] | [Tree Thumb] | [Text Thumb] |   [Hold]  |
|                 |                |       |     Z1 1.2s  |    Z2 1.8s   |   Z3 0.9s    |           |
+---------------------------------------------------------------------------------------------------------+
```

#### A. Zone Time Partitioning:
Using `whiteboardZoneWindows(settings.zones)`:
- Returns an array of `{ start: number, end: number }` (normalized 0..1 of the draw window).
- `drawSpanPx = (outFrames - inFrames) * pixelsPerFrame`
- For each zone `i`:
  - `zoneStartPx = inPx + window[i].start * drawSpanPx`
  - `zoneEndPx = inPx + window[i].end * drawSpanPx`
  - `zoneWidthPx = zoneEndPx - zoneStartPx`

#### B. Zone Image Cropping & Rendering:
Each zone has normalized polygon points `points: { x: number, y: number }[]` (0..1 across frame).
Using `polygonBounds(zone.points)`:
- Bounding box `{ minX, maxX, minY, maxY }`.
- We render an SVG container matching `zoneWidthPx` × `36px`:
  ```tsx
  <svg
    viewBox={`${bounds.minX * frameWidth} ${bounds.minY * frameHeight} ${bounds.width * frameWidth} ${bounds.height * frameHeight}`}
    className="h-full w-full object-cover rounded-[2px]"
    preserveAspectRatio="xMidYMid slice"
  >
    <clipPath id={`zone-clip-${i}`}>
      <polygon points={zone.points.map(p => `${p.x * frameWidth},${p.y * frameHeight}`).join(' ')} />
    </clipPath>
    <image
      href={mediaUrl}
      width={frameWidth}
      height={frameHeight}
      clipPath={`url(#zone-clip-${i})`}
    />
  </svg>
  ```
- **Fallback**: When the zone width is narrow (< 32px), it displays the zone badge (`Z1`, `Z2`) with the zone type icon (`brush`, `gesture`, `swipe`, etc.).

#### C. Adaptive Lane Height:
- When a spine clip has `pattern: 'zones'` and `zones.length > 0`:
  - Lane height automatically elevates from 28px to **52px** (or **48px**).
  - Gutter height seamlessly matches the trough height.
- When clips use single-span patterns (`serpentine`, `wipe`, `trace`):
  - Lane maintains clean 28px height.

---

## 2. Requirement 2: UI Refactoring for the Sketches Tab

### 2.1 The Inconsistency in Current UI
In the current `SketchPane.tsx`:
- The left sidebar lists arbitrary meta-categories: `Reveal Pattern`, `Timing & Easing`, `Hand & Look`, `Custom Zones`.
- Inside `Reveal Pattern`, there was a SegmentedControl to pick between `Writing`, `Wipe`, `Zones`, `Sketch`.
- This broke app consistency with `EffectsPane` and `TransitionsPane`, where the left sidebar directly chooses the effect/transition category!

### 2.2 The Proposed Solution: Pattern-First Navigation Rail

#### Left Category Rail (w-36 / 144px):
Matches `EffectsPane` and `TransitionsPane` 100%:
1. ✍️ **Writing** (`serpentine`) - icon: `edit_note` (multi-line handwriting reveal)
2. ↔️ **Wipe** (`wipe`) - icon: `swipe` (directional straight-edge reveal)
3. 🔲 **Zones** (`zones`) - icon: `crop_free` (multi-region sequential drawing)
4. 🎨 **Sketch** (`trace`) - icon: `draw` (content-aware vector linework)

#### Right Main Content Stage:
When a pattern is selected in the rail, the main stage renders:
1. **Selection & Master Toggle Header**:
   - Clip preview badge (`Selected Still` or `Selected Video`)
   - "Toggle Whiteboard Reveal" Switch + "Apply to Clip" button
2. **Card 1: Selected Pattern Parameters**:
   - **Writing**: Row count slider (2 to 16 rows), row height preview.
   - **Wipe**: Direction segmented control (`L to R`, `R to L`, `Top to Bottom`).
   - **Zones**:
     - Visual zone card list showing zone number, entrance style, weight slider, and delete/reorder buttons.
     - Large, prominent **`[ ✂️ Open Zone Mask Editor ]`** button with active zone counter.
   - **Sketch**:
     - Line Detail segmented control (`Bold`, `Medium`, `Fine`).
     - Stroke Ordering segmented control (`Flowing`, `Reading`).
3. **Card 2: Timing & Keyframes (Universal)**:
   - Keyframe In (Start Delay) slider with exact seconds, percentage, and frame badge.
   - Keyframe Out (Draw Duration) slider with exact seconds, percentage, and frame badge.
   - Animation Cadence: Fluid (full fps) vs Hand-Drawn (12 fps).
4. **Card 3: Hand Stylus & Artistic Board Look (Universal)**:
   - Stylus: `Pen` | `Marker` | `None`.
   - Look: `Original` | `Sketch` (line-art) | `Pencil` (graphite & grain) | `Comic` (posterized tone).

---

## 3. Comparison: Before vs Proposed

| Feature | Current Implementation | Proposed Refactored Implementation |
| :--- | :--- | :--- |
| **Sketch Lane Appearance** | Generic gradient bar across the entire clip. | Visual thumbnails of each zone's cropped subject in its exact chronological time slice. |
| **Lane Height** | Fixed 28px. | Adaptive 52px when zones are present (clear thumbnail readability) and 28px for single patterns. |
| **Zone Timing Visibility** | Hidden inside zone editor modal only. | Clear zone division markers, timestamps, and zone tags (`Z1`, `Z2`) directly on the timeline. |
| **Sketches Tab Sidebar** | Meta-categories (`Pattern`, `Timing`, `Style`, `Zones`). | **Reveal Patterns as Categories** (`Writing`, `Wipe`, `Zones`, `Sketch`), matching `EffectsPane` & `TransitionsPane`. |
| **Pattern Settings** | Hidden inside sub-controls. | Dedicated, clean stage tailored specifically to the selected pattern. |

---

## 4. Verification Plan

1. **Unit Tests**:
   - Test `zoneThumbnailViewBox` calculation with standard and non-standard aspect ratios.
   - Test `whiteboardZoneTimeSlices` accuracy against `whiteboardZoneWindows`.
2. **Typecheck**:
   - Run `npm run typecheck` (0 errors).
3. **Visual Verification**:
   - Open studio with a still clip having 3 zones.
   - Verify that the Sketch lane expands to 52px and renders 3 distinct thumbnails for each zone.
   - Drag In and Out keyframes -> observe zone thumbnails scale proportionally in time.
   - Click a zone thumbnail -> playhead jumps to that zone's entrance frame.
   - Open Sketch tab in MediaPanel -> verify left rail cleanly selects `Writing`, `Wipe`, `Zones`, or `Sketch`, with right stage rendering tailored controls.
