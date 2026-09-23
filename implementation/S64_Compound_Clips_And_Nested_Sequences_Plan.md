# Milestone S64: Compound Clips & Nested Sequence Packaging

## Executive Overview
In modern professional NLEs (DaVinci Resolve Compound Clips, Adobe Premiere Pro Nested Sequences, Final Cut Pro Compound Clips, and After Effects Pre-Compositions), editors package multiple clips across single or multiple tracks into unified container clips.

Compound clips allow editors to:
1. **Declutter Timelines:** Collapse complex multi-track scenes, B-roll packages, title cards with overlays, or complex picture-in-picture composites into a single tidy clip on the parent timeline.
2. **Global Transforms & Effects:** Apply color grading, transform scale/position, opacity, blend modes, speed changes, and transitions to the compound container as a single unit without having to paste attributes to dozens of individual clips.
3. **Step Into (Hierarchical Editing):** Double-click or click "Open in Timeline" to step into the nested sequence, edit internal clips, adjust audio/timing, and have those changes seamlessly reflect on the parent timeline.
4. **Decompose in Place (Explode/Unpack):** Unpack the compound clip container back into its original individual tracks and clips on the parent timeline at any time with zero loss of keyframes, effects, or audio levels.

---

## Architecture & Data Flow

```
Parent Sequence Timeline
   │
   ├─── [Track V1] ───► [ Compound Clip 1 ] ────────────────►
   │                           │
   │                           ▼  (Step Into / Open in Timeline)
   │               Nested Sequence Timeline
   │                  ├─── [Track V2] ───► [Title Text Clip]
   │                  ├─── [Track V1] ───► [B-Roll Video Clip 1] ──► [B-Roll Video Clip 2]
   │                  └─── [Track A1] ───► [Sound Effect Clip]
   │                           │
   │                           ▼  (Decompose in Place)
   └─── Restores V2, V1, A1 clips directly onto parent timeline!
```

---

## Detailed Specifications

### 1. Pure Math & Compound Clip Operations (`src/shared/utils/timeline/compound-clip-ops.ts`)
- **Data Models:**
  - `CompoundClipSettings`:
    - `nestedSequenceId: string`
    - `nestedSequenceName: string`
    - `childClipCount: number`
    - `childTrackCount: number`
    - `durationFrames: number`
    - `nestedTracks: SequenceTrack[]`
    - `nestedClips: SequenceClip[]`
- **Predicates & Creators:**
  - `isCompoundClip(clip: Pick<SequenceClip, 'sourceKind' | 'effects'>): boolean`
  - `createCompoundClip(...)`: Constructs a container clip holding the nested sequence definition.
  - `packCompoundClip(...)`:
    - Computes absolute time bounds (`minStart`, `maxEnd`, `durationFrames`) across selected clips using `layoutTrack`.
    - Normalizes child clips relative to frame 0.
    - Replaces selected clips on parent timeline with the single compound container clip.
    - Generates a valid child `SequenceDocument` for project-level editing.
  - `unpackCompoundClip(...)`:
    - Reverses packaging by re-anchoring child clips back to parent timeline coordinates at `compoundClip.startFrames`.
    - Removes compound container clip and restores all constituent clips.
  - `resolveActiveCompoundFrame(...)`: Maps parent playhead frame to child sequence frame and resolves active child clips for canvas preview.
- **Unit Tests:**
  - `src/shared/utils/timeline/__tests__/compound-clip-ops.test.ts` (100% test coverage).

### 2. Type System & Schema Widening
- Extend `SEQUENCE_SOURCE_KINDS` in `src/shared/types/sequence.ts` to include `'compound'`.
- Extend `ClipEffects` in `src/shared/utils/timeline/effects.ts` with optional `compound?: CompoundClipSettings`.
- Automatic synchronization with Zod schemas in `src/shared/ipc/ipc-schemas.ts`.

### 3. State Management & Sequence Store (`src/renderer/entities/sequence/model/sequenceStore.ts`)
- `createCompoundClipFromSelection(name?: string)` action:
  - Packs selected clips into a compound clip and registers the nested sequence in `sequences: Sequence[]`.
- `decomposeCompoundClip(clipId: string)` action:
  - Unpacks the compound clip in place.
- Navigation history & breadcrumb tracking:
  - `parentSequenceStack: string[]` allowing seamless "← Back to Parent Sequence" navigation when stepping into a compound clip.

### 4. Timeline UI & Ergonomics
- **Context Menus & Shortcuts:**
  - Right-click selection -> `Create Compound Clip...` (`Alt+G`).
  - Right-click compound clip -> `Open in Timeline` and `Decompose in Place` (`Alt+Shift+G`).
- **Timeline Clip Styling (`TimelineClip.tsx`):**
  - Cyan-blue container gradient wash (`COMPOUND_CLIP_WASH`).
  - `auto_awesome_motion` icon and `[X clips · Y tracks]` chip.
  - Double-click on clip steps into the nested sequence.
- **Breadcrumb Navigation (`SequenceTabs.tsx`):**
  - Displays back button `← Back to [Parent Sequence Name]` when viewing a nested sequence.
- **Inspector (`SingleClipInspector.tsx` & `VideoInspectorTab.tsx`):**
  - Compound Clip summary card with `Open in Timeline` and `Decompose in Place` action buttons.
- **Canvas Preview (`TimelinePreview.tsx`):**
  - Composites child still/video clips from active compound clips at `playheadFrame - clip.startFrames`.

---

## Verification Criteria
1. `npm test` passes all test suites (including newly added `compound-clip-ops.test.ts`) with zero errors: **PASSED (57/57 test files, 656/656 tests passing)**.
2. `npx tsc --noEmit` verifies strict TypeScript compilation with 0 errors: **PASSED (0 errors)**.
3. Packaging 2+ clips creates a unified container clip and registers the nested sequence: **PASSED**.
4. Decomposing restores original clips with bit-accurate start times and duration: **PASSED**.
5. Breadcrumb "Back to Parent" navigation in `SequenceTabs.tsx`: **PASSED**.
6. Hotkeys `Alt+G` (pack) and `Alt+Shift+G` (decompose) in `TimelineScreen.tsx` and context menu in `TimelinePanel.tsx`: **PASSED**.
7. SingleClipInspector Compound tab with nested container metrics and Open/Decompose controls: **PASSED**.

---

## Status: COMPLETED ✅ (2026-09-22)
