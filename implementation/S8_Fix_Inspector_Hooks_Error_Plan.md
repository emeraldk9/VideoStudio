# S8: Fix Inspector React Rules of Hooks Error

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S8_Fix_Inspector_Hooks_Error_Plan.md`  
**Status**: 🟢 Completed & Verified  
**Standard**: React 18 Rules of Hooks & Component Lifecycle Architecture  

---

## 1. Problem Audit & Root Cause Analysis

### 1.1 The User's Error
The Inspector panel crashed and displayed an ErrorBoundary fallback:
```text
Inspector Error
Rendered more hooks than during the previous render.
[ Retry ]
```

### 1.2 Root Cause
- In [`ClipInspector.tsx`](file:///c:/Users/vivan/Documents/My%20Apps/VideoStudio/src/renderer/features/timeline-edit/ui/ClipInspector.tsx), early returns existed for empty clip selection:
  ```tsx
  if (!clip && selectedClips.length > 1) {
    return <MultiClipInspector clips={selectedClips} fps={fps} />;
  }
  if (!clip) {
    return <SequenceOverviewCard document={document} fps={fps} durationFrames={durationFrames} />;
  }
  ```
- However, several hooks (`useMemo` for `availableTabs`, `useState` for `activeTab`, and `useEffect` for tab switching) were defined **after** these early returns!
- When no clip was selected, `ClipInspector` ran 7 hooks before returning `<SequenceOverviewCard />`.
- When a clip was subsequently selected, `ClipInspector` bypassed the early returns and executed 10 hooks.
- React immediately caught this discrepancy and threw:
  `Rendered more hooks than during the previous render.`

---

## 2. Solution Architecture

### 2.1 Subcomponent Extraction: `SingleClipInspector`
Extracted the single-clip inspector body into a dedicated subcomponent:
```tsx
export function ClipInspector() {
  const clip = useSequenceStore(selectSelectedClip);
  const selectedClips = useSequenceStore(useShallow(selectSelectedClips));
  const document = useSequenceStore((state) => state.document);
  const durationFrames = useSequenceStore(selectDurationFrames);
  const patchClip = useSequenceStore((state) => state.patchClip);

  if (!document) return null;
  const fps = document.sequence.fps;

  if (!clip && selectedClips.length > 1) {
    return <MultiClipInspector clips={selectedClips} fps={fps} />;
  }

  if (!clip) {
    return <SequenceOverviewCard document={document} fps={fps} durationFrames={durationFrames} />;
  }

  return (
    <SingleClipInspector
      key={clip.id}
      clip={clip}
      document={document}
      fps={fps}
      patchClip={patchClip}
    />
  );
}
```

### 2.2 Benefits
1. **100% Rules-of-Hooks Compliance**: Every hook in `ClipInspector` and `SingleClipInspector` is called at the top level unconditionally on every render.
2. **Fresh Mount on Clip Switch**: The `key={clip.id}` prop guarantees that switching clips completely unmounts the previous inspector and mounts a clean instance with the correct default tab for that clip's source kind (`video`, `still`, `audio`, `text`).

---

## 3. Progress Tracker

- [x] Identify early returns preceding hook declarations in `ClipInspector.tsx`
- [x] Extract `SingleClipInspector` component with top-level hooks
- [x] Use `key={clip.id}` for clean state reset across selections
- [x] Run `npm run typecheck` (0 errors)
- [x] Run `npm test` (13 passed)
