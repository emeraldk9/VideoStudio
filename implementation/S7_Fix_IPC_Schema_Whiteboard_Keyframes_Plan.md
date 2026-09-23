# S7: Fix IPC Schema Validation for Whiteboard Keyframe Timing

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S7_Fix_IPC_Schema_Whiteboard_Keyframes_Plan.md`  
**Status**: 🟢 Completed & Verified  
**Standard**: Electron IPC Validation & Zod Schema Integrity  

---

## 1. Problem Audit & Root Cause Analysis

### 1.1 The User's Error
When adjusting a clip's whiteboard settings or dragging keyframe handles in the sketch lane, an error toast appears:
```text
Error invoking remote method 'sequence:replaceClips': Error: Invalid IPC payload: clips.0.effects.whiteboard: Unrecognized key: "inFraction" — the app is likely mid-update; restarting it reloads both halves. ×2
```

### 1.2 Root Cause
1. **Zod Strict Schema Rejection**:
   - In `src/shared/utils/timeline/effects.ts`, `clipEffectsSchema.shape.whiteboard` is defined with `.strict()`.
   - When S5 introduced `inFraction` and `inSeconds` to `WhiteboardSettings` in TypeScript, `clipEffectsSchema` in `effects.ts` was not updated with these two fields.
   - Every 500ms after a timeline edit, `schedulePersist` in `sequenceStore.ts` calls `window.api.sequence.replaceClips(...)`.
   - The main process IPC wrapper `withValidation(IPC_SCHEMAS[IPC_CHANNELS.SEQUENCE_REPLACE_CLIPS], ...)` in `src/main/ipc/with-validation.ts` evaluates `sequenceClipSchema.effects` (which is `clipEffectsSchema`).
   - Because `whiteboard` has `.strict()`, Zod throws: `Unrecognized key: "inFraction"`.
   - `announceTimelineError` in `src/renderer/entities/sequence/lib/announce.ts` formats this error and displays the toast.

2. **Accidental Nested Spreading in `SketchKeyframeLane.tsx`**:
   - In `handlePointerMoveKeyframe` of `SketchKeyframeLane.tsx`, `dragRef.current` stored `currentSettings: WhiteboardSettings` and did:
     ```ts
     patchClip(drag.clipId, {
       effects: {
         ...drag.currentSettings, // BUG: Spreading WhiteboardSettings into ClipEffects!
         whiteboard: { ...drag.currentSettings, inFraction }
       }
     });
     ```
   - Spreading `WhiteboardSettings` directly into `effects` pollutes `effects` with top-level fields (`pattern`, `rows`, `hand`, `look`), which would also be rejected by `clipEffectsSchema.strict()`.

---

## 2. Proposed Implementation Plan

### Phase 1: Update `clipEffectsSchema` in `src/shared/utils/timeline/effects.ts`
Add `inFraction` and `inSeconds` to the Zod schema for `whiteboard`:
```ts
whiteboard: z
  .object({
    pattern: z.enum(['serpentine', 'wipe', 'zones', 'trace']),
    rows: z.number().int().min(1).max(WHITEBOARD_MAX_ROWS),
    drawSeconds: z.number().min(WHITEBOARD_MIN_DRAW_SECONDS).max(3600).optional(),
    drawFraction: boundedNumber(0.01, 1).optional(),
    // S5 / S6 — Keyframe In start delay (fraction and seconds)
    inFraction: boundedNumber(0, 1).optional(),
    inSeconds: z.number().min(0).max(3600).optional(),
    hand: z.enum(['pen', 'marker', 'none']),
    cadenceFps: z
      .number()
      .int()
      .min(WHITEBOARD_MIN_CADENCE_FPS)
      .max(WHITEBOARD_MAX_CADENCE_FPS)
      .optional(),
    look: z.enum(['none', 'sketch', 'pencil', 'comic']),
    zones: z.array(...).optional(),
    trace: z.object(...).optional(),
  })
  .strict()
  .optional(),
```

### Phase 2: Fix `dragRef` Spreading in `SketchKeyframeLane.tsx`
1. Update `dragRef` state to store `currentEffects: ClipEffects`:
   ```ts
   const dragRef = useRef<{
     clipId: string;
     type: 'in' | 'out';
     startX: number;
     originalInFrame: number;
     originalOutFrame: number;
     durationFrames: number;
     currentEffects: ClipEffects;
     currentSettings: WhiteboardSettings;
   } | null>(null);
   ```
2. In `handlePointerDownKeyframe`:
   ```ts
   const effects = clip.effects ?? {};
   const settings = effects.whiteboard;
   if (!settings) return;
   dragRef.current = {
     clipId: clip.id,
     type,
     startX: event.clientX,
     originalInFrame: inFrame,
     originalOutFrame: outFrame,
     durationFrames: clip.durationFrames,
     currentEffects: effects,
     currentSettings: settings,
   };
   ```
3. In `handlePointerMoveKeyframe`:
   Spread `...drag.currentEffects` so that only valid `ClipEffects` keys are passed to `effects`.

### Phase 3: Automated Unit Test
In `src/main/media/__tests__/sketch-keyframes.test.ts`:
- Add a test verifying `clipEffectsSchema.safeParse` passes cleanly with `inFraction` and `inSeconds`:
  ```ts
  it('validates whiteboard inFraction and inSeconds in clipEffectsSchema without throwing', () => {
    const payload = {
      whiteboard: {
        pattern: 'serpentine',
        rows: 8,
        hand: 'pen',
        look: 'sketch',
        inFraction: 0.15,
        drawFraction: 0.85,
      },
    };
    const parsed = clipEffectsSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });
  ```

---

## 3. Progress Tracker

- [x] **Phase 1: Update `clipEffectsSchema` in `src/shared/utils/timeline/effects.ts`**
- [x] **Phase 2: Fix `dragRef` Spreading in `SketchKeyframeLane.tsx`**
- [x] **Phase 3: Add schema validation test in `sketch-keyframes.test.ts`**
- [x] **Phase 4: Run `npm test` (13 passed) and `npm run typecheck` (0 errors)**

