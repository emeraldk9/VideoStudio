# Milestone S63: Auxiliary Audio Submix Buses & Track Routing Engine

## Executive Overview
In professional NLE and DAW environments (DaVinci Resolve Fairlight, Adobe Premiere Pro Submix Tracks, and Final Cut Pro Roles), individual audio tracks are routed into intermediate **Submix Buses** (Dialogue, Music, SFX) before hitting the Master Output. Submix buses allow editors to:
1. Group tracks logically by sonic role (Speech/Dialogue, Background Music/Beds, Sound Effects/Foley/Ambience).
2. Apply collective processing (3-band parametric EQ, glue compression, gain adjustment, stereo pan) to an entire bus of tracks at once without having to tweak each clip or track individually.
3. Solo or mute entire stems with one click (e.g. mute all Music to audit Dialogue clarity, or isolate SFX).
4. Apply master glue compression and brickwall limiting across the final summed mix.

---

## Architecture & Data Flow

```
Track Level (Audio Clips + Keyframes)
   │
   ├─► Track 1 (Narration) ──► Dialogue Submix Bus (BUS 1) ──┐
   ├─► Track 2 (Guest VO)   ──►                             │
   │                                                         │
   ├─► Track 3 (Music Bed)  ──► Music Submix Bus (BUS 2)    ──┼──► Master Output Bus (Limiter + Glue Compressor)
   │                                                         │
   ├─► Track 4 (SFX / Hits) ──► SFX Submix Bus (BUS 3)      ──┤
   └─► Track 5 (Direct/Pip) ──► Master Direct Routing       ──┘
```

---

## Detailed Specifications

### 1. Pure Math & Operations (`src/shared/utils/timeline/audio-bus-ops.ts`)
- **Predefined Buses**:
  - `BUS_DIALOGUE = 'bus-dialogue'` (Name: "Dialogue", Badge: "DIA", color: violet)
  - `BUS_MUSIC = 'bus-music'` (Name: "Music", Badge: "MUS", color: emerald)
  - `BUS_SFX = 'bus-sfx'` (Name: "SFX", Badge: "SFX", color: amber/cyan)
  - `BUS_MASTER = 'bus-master'` (Direct to Master)
- **Data Models**:
  - `SubmixBusConfig`: `{ id, name, shortLabel, color, defaultRole? }`
  - `SubmixBusState`: `{ volumeDb, pan, mute, solo, eq?: AudioEqualizerSettings, compressor?: AudioCompressorSettings }`
- **Utility Functions**:
  - `inferDefaultTrackBus(track: SequenceTrack): string`:
    - `role === 'narration'` -> `bus-dialogue`
    - `role === 'music'` -> `bus-music`
    - others -> `bus-sfx`
  - `resolveTrackBus(trackId: string, track: SequenceTrack, routingMap?: Record<string, string>): string`
  - `computeSubmixBusLevels(...)`: Sums track stereo levels routed into each submix bus, applying bus volume, stereo pan, mute, and solo isolation.
  - `computeMasterWithBuses(...)`: Aggregates active Submix Buses and unrouted/direct tracks into the Master Bus output, with optional master glue compression and brickwall limiting.
- **Unit Tests**:
  - `src/shared/utils/timeline/__tests__/audio-bus-ops.test.ts` (100% test coverage).

### 2. State Store Integration (`src/renderer/features/timeline-edit/model/audioMixerStore.ts`)
- Track routing map: `trackBusRouting: Record<string, string>`
- Submix bus state map: `submixBuses: Record<string, SubmixBusState>`
- Store Actions:
  - `setTrackBusRouting(trackId, busId)`
  - `setBusVolume(busId, db)`
  - `setBusPan(busId, pan)`
  - `toggleBusMute(busId)`
  - `toggleBusSolo(busId)`
  - `setBusEq(busId, patch)`
  - `setBusCompressor(busId, patch)`
  - `setMasterCompressor(patch)`
  - `resetBus(busId)`
  - `resetAllBuses()`

### 3. Mixer Console Dock UI (`src/renderer/features/timeline-edit/ui/AudioMixerDock.tsx`)
- **Track Channel Strips**:
  - Sleek bus routing pill selector (`DIA`, `MUS`, `SFX`, `MST`) on each track strip with live color accent indicating current target bus.
- **Submix Bus Section**:
  - Dedicated submix channel strip container separating track channels from master output.
  - Full channel strips for `Dialogue (BUS 1)`, `Music (BUS 2)`, and `SFX (BUS 3)` featuring:
    - Bus badge, name, and routed track count badge.
    - Vertical volume slider (-60 to +6 dB).
    - Stereo dual VU meters with peak hold and clip indicator.
    - Pan slider (-100 to +100).
    - Mute (`M`) and Solo (`S`) buttons.
    - Equalizer (`EQ`) and Dynamics (`DYN`) inspection buttons.
- **Master Bus Strip & Glue Compressor**:
  - Master strip with Master Limiter toggle and Glue Compressor button.
  - Collapsible Master Glue Compressor panel with live gain reduction metering.

---

## Verification Criteria & Results
1. **Full test suite execution:** `npm test` passed 100% across all 56 test suites (651 tests, including 12 tests in `audio-bus-ops.test.ts`).
2. **Static typecheck:** `npx tsc --noEmit` completed with 0 errors.
3. **Ergonomic Integration:**
   - Track strips feature instant bus routing dropdowns (`DIA`, `MUS`, `SFX`, `MASTER`).
   - Submix Bus strips (`Dialogue`, `Music`, `SFX & Foley`) render with dedicated dual stereo VU meters, faders, pan, solo/mute, EQ, and DYN buttons.
   - Master Strip includes Master Limiter + Master Glue Compressor toggle and inspector.
   - Compact Toolbar Master Meter reflects full submix routing and master compression.

**Status:** Completed ✅ [2026-09-22 15:38]

