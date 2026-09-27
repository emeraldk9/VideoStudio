# S91: Procedural Whiteboard Audio FX & Dynamic Foley Sound Synthesis Plan

**Location**: `c:\Users\vivan\Documents\My Apps\VideoStudio\implementation\S91_Procedural_Whiteboard_Audio_FX_And_Foley_Synthesis_Plan.md`  
**Target Repository 1**: `C:\Users\vivan\Documents\My Apps\srt-whiteboard-animation-main`  
**Target Repository 2**: `c:\Users\vivan\Documents\My Apps\VideoStudio`  
**Status**: ✅ Completed & Verified  
**Standard**: Professional Motion Design & Whiteboard Studio Pipeline (VideoScribe, Doodly, Explaindio, CapCut Whiteboard)

---

## Progress Checklist & Tracker

- [x] **Phase 1: Procedural Foley Synthesis Engine in Python (`scripts/core/audio_foley.py`)**
  - [x] **Foley 1.1**: Math-driven procedural audio synthesis for all stylus materials:
    - `pen`: Crisp high-frequency paper scrape (3.5 kHz - 7 kHz bandpass).
    - `marker`: Rubbery friction and stick-slip squeaks on sharp directional turns (600 Hz - 1.5 kHz).
    - `pencil`: Granular graphite friction texture with velocity-proportional amplitude (1.8 kHz - 4.5 kHz).
    - `chalk`: Low-mid rough slate grit (800 Hz - 2.8 kHz) with micro-tap stroke onsets.
    - `eraser`/`wipe`: Soft low broadband whoosh (200 Hz - 800 Hz).
  - [x] **Foley 1.2**: Trajectory-driven synthesis function:
    - Generate continuous 44.1 kHz 16-bit PCM WAV track from stroke trajectories $[(t_i, x_i, y_i)]$.
    - Velocity gating: silence when stylus is lifted or resting ($\|v\| < 0.5 \text{ px/s}$).

- [x] **Phase 2: VideoStudio Web Audio API Foley Synthesizer (`whiteboard-foley.ts`)**
  - [x] **Audio 2.1**: Real-time Web Audio API node graph:
    - Noise buffer generator (white/pink noise loop).
    - Resonant biquad bandpass filter tuned to active stylus material.
    - Dynamic gain modulation tied to stylus tip velocity $v = \sqrt{\Delta x^2 + \Delta y^2}$.
  - [x] **Audio 2.2**: Integration with `assets/preview.html` and preview player:
    - Interactive audio playback synchronized with 60 FPS drawing loop.

- [x] **Phase 3: Whiteboard Settings & Inspector UI (`whiteboard.ts` & `SketchPane.tsx`)**
  - [x] **Schema 3.1**: Extend `WhiteboardSettings` and `clipEffectsSchema`:
    - `foleyEnabled?: boolean` (toggle drawing sound effects).
    - `foleyVolume?: number` (0.0 to 1.0, default 0.6).
  - [x] **UI 3.2**: Add Foley Sound FX section to Card 3 in `SketchPane.tsx`:
    - Switch toggle with volume slider and audio preview test button.

- [x] **Phase 4: Automated Verification & Test Coverage**
  - [x] **Test 4.1**: Python `test_engine.py` Test 12 verifying procedural synthesis for all stylus materials (12/12 passing).
  - [x] **Test 4.2**: VideoStudio Vitest unit tests in `sketch-keyframes.test.ts` for foley schema and synthesis calculations (22/22 passing).
  - [x] **Test 4.3**: Full Vitest regression suite (76 test files, 952 tests passing) and `tsc --noEmit` clean exit.

---

## Technical Architecture

### 1. Velocity-Dependent Granular Friction Synthesis
For a stroke sample at time $t$ with instantaneous tip velocity $v(t) = \sqrt{\dot{x}^2 + \dot{y}^2}$ and curvature $\kappa(t) = \frac{|\dot{x}\ddot{y} - \dot{y}\ddot{x}|}{(\dot{x}^2 + \dot{y}^2)^{3/2}}$:
1. Contact envelope:
$$A(t) = \min\left(1.0, \frac{v(t)}{v_{\text{ref}}}\right) \cdot \left(1 + \beta \cdot \min(1.0, \kappa(t))\right)$$
2. Filter frequencies by stylus:
   - Pen: $f_c = 4800 \text{ Hz}, Q = 2.2$
   - Marker: $f_c = 950 \text{ Hz}, Q = 3.5$ (+ squeak bursts when $\kappa(t) > \kappa_{\text{thresh}}$)
   - Pencil: $f_c = 2800 \text{ Hz}, Q = 1.8$
   - Chalk: $f_c = 1400 \text{ Hz}, Q = 1.5$
