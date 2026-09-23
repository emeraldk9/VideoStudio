# Milestone S76: Dual-System Audio Auto-Sync & A/V Clip Linking Engine

**Status:** Completed & Verified ✅  
**Scope:** Waveform cross-correlation auto-sync, A/V clip linking, camera scratch audio muting, timeline drag/trim propagation, and inspector sync status.

---

## 1. Problem Statement & Opportunities
In professional video production, audio is almost always recorded "dual-system":
- The camera records internal microphone audio ("scratch track"), which is low fidelity or echoey.
- An external multi-channel audio recorder (Zoom, Sound Devices, wireless lavalier) records crisp 24-bit 48kHz dialogue.
- Prior to S76 in VideoStudio:
  - Users had to manually zoom into timeline waveforms, slide audio clips millisecond-by-millisecond to match clapper peaks or speech transients.
  - After alignment, if an editor dragged or trimmed the video clip, the external audio clip did not move or trim with it because VideoStudio lacked clip linking.
  - The editor had to remember to manually mute the camera scratch audio.

## 2. Solutions Delivered in S76
1. **Schema & Model Extensions (`src/shared/types/sequence.ts`)**:
   - Added `linkedClipId?: string | null` and `syncOffsetFrames?: number` to `SequenceClip`.
   - Exported helper predicates `isClipLinked` and `getLinkedClip`.
2. **Waveform Cross-Correlation Sync Engine (`src/shared/utils/timeline/audio-sync-ops.ts`)**:
   - `calculateAudioWaveformSync`: Pearson normalized cross-correlation across zero-centered audio peak envelopes to determine optimal temporal lag $\Delta frames$ and confidence scoring (`high` | `medium` | `low`).
   - `applyDualSystemAudioSync`: Aligns external audio start time to camera video start + lag, mutually links both clips, and disables camera scratch audio (`sourceAudioEnabled: false`).
   - `linkClips` & `unlinkClips`: Bidirectional link creation and clean unlinking.
   - `propagateLinkedClipMove`: Propagates displacement deltas to linked clips during timeline move operations on free tracks.
3. **Timeline Editing & UI Integration (`TimelinePanel.tsx`, `TimelineClip.tsx`)**:
   - During free track drag operations in `TimelinePanel.tsx`, moving a linked clip automatically shifts its linked sibling by the exact same frame delta.
   - Added context menu actions in `TimelinePanel.tsx`:
     - "Link Clips" (`Ctrl+L` when 2 clips are selected).
     - "Unlink Clips" (`Ctrl+Shift+L` when a linked clip is selected).
     - "Auto-Sync Audio by Waveform..." (when 1 video and 1 audio clip are selected).
   - Rendered visual link indicator badge (`link` icon) in `TimelineClip.tsx` for linked clips with hover tooltip detailing sync offset.
4. **Inspector Controls (`AudioInspectorTab.tsx`)**:
   - Added dedicated **"Dual-System Sound & Link"** card displaying linked sibling clip name, track role, sync alignment offset in frames and milliseconds, camera scratch mute status indicator, and one-click "Unlink" action button.

## 3. Verification & Test Coverage
- `audio-sync-ops.test.ts`: 12 tests covering waveform cross-correlation lag detection (+15 frames, -10 frames, 0 frames), confidence scoring, dual-system alignment, scratch muting, mutual linking/unlinking, and move propagation.
- Full Vitest test suite: **66/66 test suites passed (817/817 unit tests passing)**.
- TypeScript static analysis: `tsc --noEmit` verified with **0 errors**.
