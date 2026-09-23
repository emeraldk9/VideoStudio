# S3 Studio UI Refactoring & Optimization Plan

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S3_Studio_UI_Refactoring_And_Optimization_Plan.md`  
**Status**: ✅ Completed & Verified (`npm run typecheck` passing with 0 errors)  
**Standard**: Aligned with Industry Best Practices (CapCut Desktop, Adobe Premiere Pro, Apple Final Cut Pro, DaVinci Resolve)

---

## Progress Checklist & Tracker

- [x] **Item 1: Redundant Video Resolution & Frame Rate Cleanup**
  - [x] Audit all resolution/framerate surfaces (`TimelineToolbar`, `TimelinePreview` HUD, `ClipInspector` Overview, `TopNavigation`).
  - [x] Remove redundant `{fps} fps · {width}×{height}` pill from `TimelineToolbar.tsx`.
  - [x] Retain sequence resolution in `ClipInspector` Sequence Overview and streamline Preview Header HUD.
  - [x] Verify timeline toolbar space recovery and responsive layout across window widths.

- [x] **Item 2: Video Preview 9:16 Adaptive Viewport & Pinned Action Bar**
  - [x] Refactor `TimelinePreview.tsx` root container to `flex h-full min-h-0 flex-col justify-between overflow-hidden`.
  - [x] Convert middle video canvas into a responsive letterbox/pillarbox stage container (`flex-1 min-h-0 min-w-0 flex items-center justify-center`).
  - [x] Implement aspect-ratio bounded canvas sizing: calculate box bounds against both container height and width via ResizeObserver so 9:16 portrait video never overflows.
  - [x] Remove `overflow-y-auto` from `player` column slot in `TimelineScreen.tsx` to guarantee zero viewport scrolling.
  - [x] Ensure bottom transport bar (timecode HUD, frame stepping, play/pause, shuttle) is permanently pinned and 100% visible across all aspect ratios (16:9, 9:16, 1:1, 4:5, 21:9).

- [x] **Item 3: Inspector Panel Modernization & CapCut-Style Timeline Workflow**
  - [x] Deconstruct monolithic `ClipInspector.tsx` into clean, categorized inspector sub-tabs: `[ Video ]`, `[ Audio ]`, `[ Speed ]`, `[ Animation / Motion ]`, `[ Adjust / Color ]`, `[ Transition ]`.
  - [x] Eliminate redundant, generic `<Select>` dropdowns from the default inspector view; streamline into dedicated tabs.
  - [x] Implement CapCut-style workflow:
    - **Discovery**: Left rail `TransitionsPane` & `EffectsPane` provide rich visual card catalogs.
    - **Application**: Drag from library onto timeline cut / clip, or click "Apply to Selected Clip".
    - **Timeline Indicator**: Display subtle visual transition ribbon / badge (`{transitionIn} {frames}f`) on clip start in `TimelineClip.tsx`.
    - **Inspector Parameter Tuning**: Show dedicated, compact transition properties in the Transition tab when selected.

- [x] **Item 4: Effects Tab Refactoring**
  - [x] Upgrade `EffectsPane.tsx` to match CapCut Desktop layout reference (left sub-sidebar categories: Trending, Cinematic, Retro & VHS, Light & Warmth, Atmosphere, B&W & Noir, Lens & Vignette).
  - [x] Add instant search input (`Search video effects...`).
  - [x] Implement CapCut Pro diamond badge, hover action overlay, and download/add icons.
  - [x] Implement dual-action support:
    - `+ Track`: Inserts adjustment layer clip at playhead on an overlay lane.
    - `Apply`: Applies effect filters directly to active clip's `effects.filters`.
  - [x] Display visual active state ring and check badge when an effect matches the currently selected clip.

- [x] **Item 5: Redundant Left Panel Export Tab Removal & Modal Unification**
  - [x] Remove `'export'` from `MediaPanelCategory` in `mediaPanelStore.ts`.
  - [x] Remove `{ id: 'export', icon: 'download', label: 'Export' }` from `RAIL` in `MediaPanel.tsx`.
  - [x] Remove `exportPanel` prop from `MediaPanel.tsx` and strip `<RenderPanel />` injection in `TimelineScreen.tsx`.
  - [x] Standardize the single, unified export flow on the top-right header `Export` button (`ExportModal.tsx`), supporting `Ctrl+E`.

- [x] **Item 6: Timeline Editor Left Panel Track Headers Refactoring**
  - [x] In `TimelineLane.tsx`, remove text badges (`SPINE`, `T`, `V`, `A`) from track kind indicator.
  - [x] Remove heavy box borders (`border border-.../30`) and tinted container backgrounds from track icons.
  - [x] Convert track icons to sleek, minimalist standalone glyphs with subtle tonal coloring.
  - [x] Refactor track action buttons (`visibility`, `volume`, `headphones`, `lock`, `more_vert`) to borderless, flat styling with subtle hover highlights.

- [x] **Item 7: Application-Wide Clean, Minimalist UI & Surface Hierarchy**
  - [x] Audit and remove unnecessary `shadow-inner`, `shadow-xs`, and `shadow-md` from in-layout panels (preview canvas, toolbar clusters, timecode pills, inspector cards, top navigation, export modal cards, effects pane, transitions pane, text pane).
  - [x] Restrict elevated shadows strictly to floating overlays (context menus, dropdown portals, modal dialogs, tooltips).
  - [x] Eliminate nested double-borders and redundant hairline dividers across child containers; use subtle background tone differentiation.
  - [x] Harmonize icon sizes, padding, and border radiuses across all studio surfaces.

---

## 1. Item 1: Remove Redundant Resolution and Frame Rate Information

### 1.1 Problem Statement & Current State
In the current application, the sequence resolution (e.g., `1920×1080`) and frame rate (e.g., `24 fps`) are displayed simultaneously across **three separate surfaces**:
1. **Timeline Toolbar** ([TimelineToolbar.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-edit/ui/TimelineToolbar.tsx#L220-L222)): A static bordered badge `<span className="rounded bg-bg-canvas border border-hairline px-2 py-0.5 font-mono text-[11px] text-text-secondary">{document.sequence.fps} fps · {document.sequence.width}×{document.sequence.height}</span>` sits on the far right of the toolbar (circled in red by user in screenshot).
2. **Preview Header HUD** ([TimelinePreview.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-preview/ui/TimelinePreview.tsx#L985-L992)): Displays `{seqWidth}×{seqHeight} · 16:9` and `{fps} fps`.
3. **Inspector Panel (Sequence Overview)** ([ClipInspector.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-edit/ui/ClipInspector.tsx#L286-L288)): Displays `{document.sequence.width}×{document.sequence.height}` in the card header, and Duration + Framerate `24 FPS (16:9 Landscape)` in the properties grid.

### 1.2 Industry Standard Analysis
- **CapCut Desktop**: The timeline toolbar contains editing tools (Split, Delete, Freeze, Reverse) and timeline zoom slider. Sequence resolution is NEVER displayed on the timeline toolbar; it is accessed via the project canvas setting button under the player or in project settings.
- **Adobe Premiere Pro & DaVinci Resolve**: The timeline header/toolbar is exclusively dedicated to timeline tools, snapping, markers, and audio meters. Sequence resolution/FPS resides in the Project Bin / Sequence Settings modal.

### 1.3 Proposed Architectural Solution
- **Timeline Toolbar**: Completely remove lines 220–222 from `TimelineToolbar.tsx`. The right side of the toolbar will now cleanly host Snapping toggle, Audio Mixer Console toggle, Zoom out/slider/in, and "Fit sequence (Shift+Z)" button without cramped text overflow.
- **Preview Header HUD**: Simplify into a single, clean status chip (e.g., `1080p · 24fps` or `16:9`) that links to sequence properties or remains purely informational.
- **Inspector Panel**: Retain the detailed resolution and frame rate in `ClipInspector.tsx` under Sequence Overview, where sequence properties naturally belong when no clip is selected.

---

## 2. Item 2: Fix 9:16 Video Preview & Pinned Action Bar

### 2.1 Problem Statement & Current State
When the user switches the aspect ratio to **9:16 portrait** (e.g. 1080×1920) using the top navigation bar:
- In [TimelineScreen.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/screens/timeline/ui/TimelineScreen.tsx#L334), the player column is rendered as:
  `<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 pb-2">`
- In [TimelinePreview.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-preview/ui/TimelinePreview.tsx#L1045-L1052), the preview viewport container `boxRef` sets:
  `aspectRatio: sequenceAspect` with `w-full` and `maxHeight: 'calc(100vh - 350px)'`.
- In a 500px wide player column, `aspectRatio: 9/16` drives the box height to `500 * (16 / 9) = 888.8px`.
- Because the top workspace pane is typically ~360–440px high, the video box dramatically exceeds the available pane height.
- The `overflow-y-auto` causes the container to scroll, pushing the transport action buttons (play/pause, frame step, timecode HUD) completely off-screen, requiring the user to scroll vertically to control playback.

### 2.2 Industry Standard Analysis
- In **CapCut**, **Premiere**, and **Final Cut Pro**, the video preview monitor **never scrolls**.
- The monitor stage is a fixed-bounds viewport with pillarboxing/letterboxing.
- Regardless of whether the sequence is ultra-wide (21:9), widescreen (16:9), square (1:1), or vertical (9:16), the canvas automatically fits within BOTH the maximum available width AND maximum available height (`object-fit: contain` behavior for the canvas container).
- The transport bar is pinned permanently at the bottom of the monitor, and the monitor header is pinned at the top.

### 2.3 Proposed Architectural Solution
1. **Remove Player Column Scroll**:
   - In `TimelineScreen.tsx`, change player wrapper from `overflow-y-auto` to `overflow-hidden h-full min-h-0`.
2. **Three-Tier Non-Scrolling Layout in `TimelinePreview.tsx`**:
   - **Top Tier (Header HUD)**: `shrink-0` containing Aspect/Resolution chip, Social Guides / Safe Areas toggles, and Play/Pause status badge.
   - **Middle Tier (Viewport Canvas Stage)**: `flex-1 min-h-0 min-w-0 flex items-center justify-center relative overflow-hidden`.
     - Inside this stage, the video box is sized with dynamic aspect-ratio constraints:
       ```tsx
       <div
         ref={boxRef}
         className="relative overflow-hidden rounded-[var(--radius-card)] bg-[#07080b] border border-hairline/40"
         style={{
           aspectRatio: sequenceAspect,
           maxHeight: '100%',
           maxWidth: '100%',
           width: 'auto',
           height: 'auto',
           filter: glActive ? undefined : frameFilter,
         }}
       >
       ```
     - For 9:16 vertical video, `maxHeight: 100%` constrains the video box to the stage height, and width automatically scales to `height * (9/16)` (pillarbox).
     - For 16:9 landscape video, `maxWidth: 100%` constrains width, and height scales to `width * (9/16)` (letterbox).
   - **Bottom Tier (Transport Controls Bar)**: `shrink-0 pt-2 select-none`.
     - Timecode HUD pill, frame stepping, prominent play/pause, shuttle indicator.
     - **Guaranteed 100% visibility at all times** without any scrolling.

---

## 3. Item 3: Refactor Inspector Panel & CapCut-Style Timeline Workflow

### 3.1 Problem Statement & Current State
- `ClipInspector.tsx` is currently an unwieldy 1642-line monolith that dumps every clip attribute into one endless scroll:
  - Clip Name, Duration, Text content & styling, Speed, Placement (PiP), Animation (Keyframes), Volume Animation (Keyframes), Color Grading Panel, Motion (Ken Burns preset dropdown), Clip Audio, Transition In (massive `<Select>` dropdown + length + parameters), Transition Out.
- **Redundancy with Left Panel Tabs**:
  - The left navigation panel already has dedicated `TransitionsPane.tsx` and `EffectsPane.tsx`.
  - Having identical transition select dropdowns and motion dropdowns in the inspector creates UI duplication, clutter, and an unintuitive workflow.
  - On the timeline, clips do NOT display transition badges at their cuts.

### 3.2 Industry Standard Analysis (CapCut / Modern NLEs)
In CapCut:
1. **Left Panel = Library & Asset Store**:
   - Users browse and search Transitions and Effects with rich visual thumbnails.
2. **Timeline = Placement & Visual Feedback**:
   - Applying a transition places a clean transition indicator/badge (e.g. `⧗ 0.5s`) directly at the cut between clips on the timeline.
   - Clicking the transition badge on the timeline selects the transition.
3. **Right Inspector = Contextual Parameter Tuning**:
   - The inspector uses **segmented sub-tabs** at the top:
     - For Video/Still clips: `[ Basic / Video ]`, `[ Audio ]`, `[ Speed ]`, `[ Animation / Motion ]`, `[ Adjust / Color ]`.
     - For Transitions (when a transition is selected on timeline): Inspector displays only transition duration, transition mode, and specific parameters (e.g. Dip Color, Flash length).

### 3.3 Proposed Architectural Solution
1. **Decompose `ClipInspector.tsx` into Categorized Sub-Tabs**:
   - Introduce an Inspector Tab Header:
     - **Video Tab**: Transform (Position, Scale, Opacity), PiP Presets, Text styling (for text clips).
     - **Audio Tab**: Volume gain slider, Fade in/out, Dialogue switch, J/L split edit offset.
     - **Speed Tab**: Playback speed multipliers (0.25x to 4x), Duration editor.
     - **Animation / Motion Tab**: Ken Burns motion presets for stills (Pan, Zoom, Tilt, Speed), keyframe animation curves.
     - **Adjust / Color Tab**: Integrated `ColorGradingPanel` (Exposure, Contrast, Saturation, Temperature, Tint, Vignette).
2. **Timeline-Integrated Transition Badging**:
   - On the timeline (`TimelineClip.tsx`), when a clip has `transitionIn !== 'cut'`, render a clean, miniature transition icon badge at the head of the clip.
   - Clicking this badge selects the transition and opens the Transition Inspector sub-tab.
3. **Streamlined Transition Inspector**:
   - Remove the massive redundant transition dropdown from the default clip view. Replace with a dedicated Transition sub-tab or contextual panel that focuses solely on duration (frames/seconds) and fine-tuning options (Flash frames, Asymmetric ratio, Dip color).

---

## 4. Item 4: Refactoring the UI for the Effects Tab

### 4.1 Problem Statement & Current State
- `EffectsPane.tsx` is currently a minimal 134-line file containing:
  - 12 static preset swatches rendered in an unfilterable CSS grid.
  - No search bar.
  - No category navigation.
  - Only one action: clicking adds an effect clip at playhead on a new overlay track. It cannot apply an effect directly to the selected timeline clip.

### 4.2 Industry Standard Analysis
- In **CapCut** and **Premiere Pro**, the Effects panel provides:
  1. **Category Pills**: Categorized by purpose (`All`, `Cinematic`, `Retro`, `Mood`, `Stylized`, `Light`, `B&W`).
  2. **Search Bar**: Quick text filtering.
  3. **Dual Application Modes**:
     - **Add as Adjustment Layer**: Creates an independent effect clip spanning a timeline range.
     - **Apply to Selected Clip**: Directly adds the color/filter properties to the active clip without cluttering the timeline with extra tracks.
  4. **Visual Card Design**: Thumbnail previews with hover micro-animations, clear title, and action buttons.

### 4.3 Proposed Architectural Solution
- Upgrade `EffectsPane.tsx` with:
  - **Search Header**: Modern input with clear button and search icon.
  - **Category Pills**: Horizontal scrollable category bar: `All`, `Cinematic`, `Retro`, `Mood`, `Stylized`, `B&W`.
  - **Enhanced Effect Cards**:
    - High-quality preview swatch showing before/after or themed gradient.
    - Quick Action Buttons on hover:
      - `+ Track`: Adds adjustment clip to timeline at playhead.
      - `Apply`: Directly writes `filters` into currently selected clip's `effects.filters`.
  - **Active State Indicator**: Marks cards currently applied to the selected clip.

---

## 5. Item 5: Remove Redundant Left Panel Export Tab & Unify with Export Modal

### 5.1 Problem Statement & Current State
- In [MediaPanel.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-media/ui/MediaPanel.tsx#L34), line 34 includes `{ id: 'export', icon: 'download', label: 'Export' }`.
- When selected, it renders `<RenderPanel />` inside the narrow ~280px left sidebar column.
- Meanwhile, the top navigation bar already has a primary **"Export"** button ([TopNavigation.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/screens/timeline/ui/TopNavigation.tsx#L158)) that opens [ExportModal.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-render/ui/ExportModal.tsx).
- `ExportModal.tsx` is a polished dialog containing resolution presets, codec selection, bitrate controls, audio settings, render progress, and file dialog integration.
- Having Export in the left asset rail is non-standard, cramped, and confusing.

### 5.2 Industry Standard Analysis
- In all desktop NLEs (CapCut, Premiere, Resolve, Final Cut Pro), the left rail is strictly an **Asset / Media / Tool Library**.
- Export is exclusively a **Global Header Action** (Top Right) that triggers a dedicated dialog or workspace.

### 5.3 Proposed Architectural Solution
- Remove `export` from `RAIL` in `MediaPanel.tsx`.
- Remove `'export'` from `MediaPanelCategory` in `mediaPanelStore.ts`.
- Remove `exportPanel` prop from `MediaPanel.tsx` and remove `<RenderPanel />` slot from `TimelineScreen.tsx`.
- Keep `ExportModal.tsx` as the single, authoritative export interface, triggered by:
  - The Top Navigation "Export" button.
  - Keyboard shortcut `Ctrl+E` / `Cmd+E`.

---

## 6. Item 6: Refactor Timeline Left Panel Track Headers

### 6.1 Problem Statement & Current State
- In [TimelineLane.tsx](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-edit/ui/TimelineLane.tsx#L289-L317):
  - Each track header renders an icon + text label badge (`SPINE`, `T`, `V`, `A`) wrapped in a colorful border (`border border-accent-ai/30`, `border border-cyan-500/30`, etc.) and tinted background pill.
  - Adjacent control buttons (`visibility`, `volume`, `headphones`, `lock`, `more_vert`) have noticeable button boxes.
  - The user specifically requested: *"Refactoring the UI for the left panel in the Timeline Editor, do not add the lable, and border to the icons."*

### 6.2 Industry Standard Analysis (CapCut / DaVinci Resolve)
- Modern track headers are clean, borderless, and minimalist:
  - No text tags (`V`, `A`, `T`, `SPINE`) cluttering the header.
  - A single, crisp glyph represents the track type (`movie`, `videocam`, `title`, `auto_fix_high`, `graphic_eq`, `mic`).
  - Glyphs have **NO borders, NO boxes, and NO background fills**.
  - Control icons (`eye`, `speaker`, `headphones`, `lock`) are flat and borderless. They sit directly on the track canvas surface, subtly changing opacity/color only when active or hovered.

### 6.3 Proposed Architectural Solution
- In `TimelineLane.tsx`:
  - **Remove text label**: Strip the `<span className="font-mono text-[10px] font-bold leading-none">{isSpine ? 'SPINE' : ...}</span>`.
  - **Remove badge border and background**: Strip `bg-xxx/15` and `border border-xxx/30`. Replace with a clean icon glyph:
    ```tsx
    <span
      role="button"
      tabIndex={0}
      title={`${track.name} — double-click to rename`}
      aria-label={track.name}
      className={`flex items-center justify-center shrink-0 cursor-pointer p-1 text-text-secondary hover:text-text-primary transition-colors ${
        isSpine ? 'text-accent-ai' : isTextTrack(track) ? 'text-purple-400' : track.kind === 'video' ? 'text-cyan-400' : 'text-emerald-400'
      }`}
      onDoubleClick={() => setRenaming(true)}
    >
      <span className="material-symbols-outlined text-[16px] leading-none">
        {kindGlyph(track, spineTrackId)}
      </span>
    </span>
    ```
  - **Borderless Action Icons**: Ensure all track control buttons (`IconButton`) use borderless, flat styling (`text-text-disabled hover:text-text-primary hover:bg-white/5 active:bg-white/10 rounded-sm`).
  - Active states (e.g., track muted or locked) will show distinct color highlights (e.g. muted red, locked amber) without adding borders or boxes.

---

## 7. Item 7: Clean, Minimalist UI, Reduced Shading & Rationalized Surfaces

### 7.1 Problem Statement & Current State
- The UI has an over-reliance on multiple layers of 1px hairline borders (`border border-hairline`), inset shadows (`shadow-inner`), and cards inside cards (e.g., preview box, timecode pills, quick actions, inspector sections).
- This creates visual noise, makes panels feel busy, and distracts from the core media content.

### 7.2 Industry Standard Aesthetics
- **Modern Premium Pro Tools (Apple, Linear, CapCut Desktop)**:
  - **Tonal Depth over Borders**: Adjacent panels are differentiated by slight background tone shifts (`bg-app` #010101 vs `bg-canvas` #050505 vs `bg-workspace` #141413) rather than explicit borders everywhere.
  - **Zero Inset Shadows**: Inset shadows (`shadow-inner`) look dated and heavy. Modern video viewports use clean flat black borders or borderless matte backgrounds.
  - **Elevated Surfaces Strictly Reserved**: Box shadows (`shadow-md`, `shadow-lg`, `shadow-2xl`) are reserved solely for **floating Z-index elements** (menus, modals, popovers, tooltips). Permanent layout elements remain flat.

### 7.3 Proposed Architectural Solution
- **Global Tokens & Styles**:
  - Remove `shadow-inner` and `shadow-xs` from all static containers.
  - Ensure `border-hairline` is only used as a single divider separating major workspace panes (Media | Preview | Inspector | Timeline), not on individual controls.
- **Component Polish**:
  - **Preview Player**: Remove `shadow-inner` and heavy border. Replace with a clean, flat matte finish.
  - **Timeline Toolbar**: Remove nested button borders; group related tools seamlessly with 4px gap.
  - **Inspector**: Replace heavy bordered cards with clean, borderless section groups using subtle typography and clean dividers.

---

## 8. Verification & Validation Plan

### 8.1 Automated Checks
- Run TypeScript typecheck:
  ```powershell
  npm run typecheck
  ```
- Run ESLint linting:
  ```powershell
  npm run lint
  ```
- Run existing test suites:
  ```powershell
  npm test
  ```

### 8.2 Manual & Visual Verification
1. **Resolution & Framerate Check**: Verify the timeline toolbar right side is clean and spacious. Verify sequence resolution is visible in the Inspector Sequence Overview.
2. **Aspect Ratio & Preview Bounds Check**: Switch aspect ratios between `16:9`, `9:16`, `1:1`, `4:5`, and `21:9`.
   - Confirm the video preview fits within the stage bounds at 9:16.
   - Confirm the transport bar (play/pause, timecode, frame step) is 100% visible with **zero vertical scrolling**.
3. **Inspector Sub-Tabs & CapCut Workflow Check**: Select different clip types (Video, Audio, Text, Still) and verify the clean sub-tabs (`Video`, `Audio`, `Speed`, `Animation`, `Adjust`). Verify transitions are managed cleanly without duplicate select dropdowns.
4. **Effects Tab Check**: Test the new category pills, search filter, and dual application actions.
5. **Export Tab Removal Check**: Confirm left rail has only 5 creative tabs (Media, Transitions, Text, Effects, Sketch). Confirm top-right Export button and `Ctrl+E` launch the full Export modal.
6. **Track Headers Check**: Verify track headers have NO labels (`SPINE`, `T`, `V`, `A`) and NO borders around icons.
7. **Visual Aesthetics Audit**: Confirm clean, minimalist surfaces, absent inset shadows, and refined elevated surface hierarchy.

---

## 9. Phase 2: Left Panel UI/UX Refactoring (Horizontal Rail & Unified Vertical Sidebars)

### 9.1 Motivation & CapCut Desktop Alignment
- In CapCut Desktop, the primary navigation is a **top horizontal tab rail** (`Media`, `Transitions`, `Text`, `Effects`, `Sketch`), rather than a 64px vertical rail on the left.
- Moving the tab rail to the top recovers 64px width for the entire left panel.
- Inside every active module, CapCut provides a **consistent vertical sub-sidebar** on the left (`w-36` to `w-40`) for category selection, paired with an instant search bar and content grid on the right.

### 9.2 Progress Checklist & Tracker
- [x] **Top Horizontal Tab Rail** in `MediaPanel.tsx`:
  - Replace vertical left `<nav>` rail with a top horizontal tab bar (`Media`, `Transitions`, `Text`, `Effects`, `Sketch`).
  - Sleek, compact height (~38px), active bottom indicator line (`bg-accent-ai`).
- [x] **Unified Vertical Category Sidebar in `Media` (`FilesPane.tsx`)**:
  - Left sub-sidebar: `+ Import` button, `All Media`, `Videos`, `Audio`, `Photos & Stills`, `Unused Media`.
  - Right content area: Search input, sort/selection bar, and media grid.
- [x] **Unified Vertical Category Sidebar in `Transitions` (`TransitionsPane.tsx`)**:
  - Left sub-sidebar: `All Transitions`, `Basic & Dissolves`, `Wipes & Slides`, `Flash & Glitch`, `Motion & 3D`, `Cinematic`.
  - Right content area: Search input, duration quick selector, transition cards with hover preview.
- [x] **Unified Vertical Category Sidebar in `Text` (`TextPane.tsx`)**:
  - Left sub-sidebar: `Add Text`, `All Templates`, `Titles`, `Captions`, `Social & Badges`, `Minimal`, `Lower Thirds`.
  - Right content area: Search input, Default Text hero card, template grid.
- [x] **Unified Vertical Category Sidebar in `Sketch` (`SketchPane.tsx`)**:
  - Left sub-sidebar: `Drawing Presets`, `Hand Styles`, `Reveal Zones`, `Speed & Timing`.
  - Right content area: Category-focused controls, visual preview, and zone editor triggers.
- [x] **Verification**:
  - Run `npm run typecheck` (0 errors) and test interactive tab and category switching.
