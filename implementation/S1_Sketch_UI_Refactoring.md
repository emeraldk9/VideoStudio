# S1 Sketch UI Refactoring Plan & Progress Tracker

**Location**: `C:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S1_Sketch_UI_Refactoring.md`  
**Status**: ✅ Completed (Phase 1, 2, 3 & 4 Complete)

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
