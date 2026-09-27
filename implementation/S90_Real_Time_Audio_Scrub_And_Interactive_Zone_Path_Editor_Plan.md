# S90: Real-Time Audio Scrubbing in Whiteboard Timeline & Interactive Zone Path Editor Plan

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S90_Real_Time_Audio_Scrub_And_Interactive_Zone_Path_Editor_Plan.md`  
**Target Repository 1**: `C:\Users\vivan\Documents\My Apps\srt-whiteboard-animation-main`  
**Target Repository 2**: `c:\Users\vivan\Documents\My Apps\VideoStudio`  
**Status**: ✅ Completed & Verified  
**Standard**: Professional Motion Design & Whiteboard Studio Pipeline (VideoScribe, Doodly, Explaindio, CapCut Whiteboard)

---

## Progress Checklist & Tracker

- [x] **Phase 1: Real-Time Audio Waveform Underlay in `SketchKeyframeLane.tsx`**
  - [x] **Audio 1.1**: Fetch and query sequence audio tracks overlapping spine sketch clips via `window.api.sequence.getPeaks`.
  - [x] **Audio 1.2**: Render responsive waveform canvas directly inside the sketch clip lane trough, synchronizing peak columns with pixels per frame.
  - [x] **Audio 1.3**: Add waveform display toggle button in the sticky lane header (`volume_up` / `volume_off`).

- [x] **Phase 2: Interactive Polygon Vertex & Path Editing in `WhiteboardZoneEditorModal.tsx`**
  - [x] **Path 2.1**: Interactive vertex editing:
    - Click on polygon edge midpoint or perimeter to insert a new vertex point.
    - Delete vertex with Delete / Backspace key or right-click.
    - Drag individual vertices with coordinate clamping and real-time polygon boundary updates.
  - [x] **Path 2.2**: In-Modal Live Simulation Player:
    - Play / Pause preview button directly in the modal stage.
    - Real-time zone-by-zone animated stroke reveal preview with simulated stylus tip position.

- [x] **Phase 3: Speech Pacing & Audio Cadence Alignment in `SketchPane.tsx`**
  - [x] **Cadence 3.1**: "Auto-Sync to Voiceover" utility function in `src/shared/utils/timeline/whiteboard.ts`:
    - Analyze peaks array to detect speech onset, sentence pauses, and speech offset.
    - Compute optimal `inFraction` and `drawFraction`.
    - If `zones` pattern is active, compute proportional zone weights based on speech segment durations.
  - [x] **Cadence 3.2**: Add "Sync to Voiceover" action button in `SketchPane.tsx` with instant clip patching and toast notification.

- [x] **Phase 4: Automated Verification & Test Coverage**
  - [x] **Test 4.1**: Unit tests in `sketch-keyframes.test.ts` for audio speech cadence detection and zone weight distribution.
  - [x] **Test 4.2**: Vitest test suite regression pass (all 76 test files, 949 tests passing).
  - [x] **Test 4.3**: TypeScript typecheck (`tsc --noEmit`) and Python engine verification (`test_engine.py` 11/11 tests passing).

---

## Technical Architecture

### 1. Voice Activity Detection (VAD) from Peak Bins
Given normalized peak bins $P = [p_0, p_1, \dots, p_{N-1}] \in [0, 1]^N$ corresponding to timeline frame range $[F_{\text{start}}, F_{\text{end}}]$:
1. Speech threshold $\theta_{\text{speech}} = \max\left(0.04, 0.25 \times \text{mean}(P) + 0.1 \times \max(P)\right)$.
2. Speech onset frame $F_{\text{in}} = \min \{ i \mid p_i \ge \theta_{\text{speech}} \}$.
3. Speech offset frame $F_{\text{out}} = \max \{ i \mid p_i \ge \theta_{\text{speech}} \}$.
4. If zones $Z_1, \dots, Z_k$ exist, segment speech energy into $k$ sub-intervals divided by local silence troughs ($\min \sum_{j} p_j$), yielding normalized zone weights:
$$w_k = \frac{\Delta F_k}{\sum_{m} \Delta F_m}$$
