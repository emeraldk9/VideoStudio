# Implementation Plan: Step S27 — Professional Timeline Clipboard & 3-Point Editorial Engine

Provide video editors with industry-standard NLE clipboard and 3-point assembly workflows matching Premiere Pro, DaVinci Resolve, and Final Cut Pro: Copy (`Ctrl+C`), Cut (`Ctrl+X`), Ripple Cut (`Ctrl+Shift+X`), Overwrite Paste (`Ctrl+V`), Ripple Insert Paste (`Ctrl+Shift+V`), and Work Area Lift (`;`) & Extract (`'`).

## 1. Background & Architecture
Professional NLEs depend heavily on high-speed keyboard-driven assembly:
- **Copy & Paste (`Ctrl+C` / `Ctrl+V`)**: Copying selected clips preserving relative frame timing and track kinds.
- **Ripple Cut (`Ctrl+Shift+X`)**: Cuts clips to clipboard and closes the gap on affected tracks.
- **Ripple Insert Paste (`Ctrl+Shift+V`)**: Splits tracks at the playhead and ripples downstream media forward by the clipboard duration, inserting without destruction.
- **3-Point Work Area Assembly (`Lift` and `Extract`)**:
  - Lift (`;`): Cuts In/Out range without rippling (leaves gap).
  - Extract (`'`): Cuts In/Out range and ripples downstream timeline backward across unlocked tracks.

## 2. Key Modules & Interfaces
- **`TimelineClipboardPayload`** in `src/shared/utils/timeline/clipboard-ops.ts`
- **Actions in `sequenceStore.ts`**:
  - `copySelection()`
  - `cutSelection(ripple: boolean)`
  - `pasteClipboard(ripple: boolean, targetTrackId?: string)`
  - `liftWorkArea()`
  - `extractWorkArea()`
- **UI Integration**:
  - `TimelineToolbar.tsx`: Clipboard and Lift/Extract buttons
  - `TimelinePanel.tsx`: Context menu actions
  - `TimelineScreen.tsx`: Keyboard shortcuts (`Ctrl+C`, `Ctrl+X`, `Ctrl+Shift+X`, `Ctrl+V`, `Ctrl+Shift+V`, `;`, `'`)
  - `KeyboardShortcutsModal.tsx`: Updated cheatsheet

## 3. Verification Plan
- Unit tests in `src/shared/utils/timeline/__tests__/clipboard-ops.test.ts`.
- Full Vitest suite (`npm test`).
- 0 TypeScript errors (`npm run typecheck`).
- Production build validation (`npx vite build --config vite.main.config.ts`).
