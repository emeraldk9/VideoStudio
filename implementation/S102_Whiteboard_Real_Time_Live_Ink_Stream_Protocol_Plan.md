# Milestone S102: Whiteboard Real-Time Live Ink Stream Protocol & Broadcast Bridge

## 1. Context & Motivation
While file-based JSON bridge import/export (developed in S87 and S99) enables offline batch rendering, modern educational production and interactive studio workflows require **real-time live streaming of vector ink events**:
- Live drawing stroke-by-stroke synchronization between VideoStudio's timeline monitor and the Python rendering engine.
- Zero-latency broadcast of pen contact events (`touchdown`, `vertex`, `lift`, `erase_sweep`, `camera_pan`).
- Real-time synthesis of drawing foley audio cues synchronized to live user tablet/mouse input.

Milestone S102 builds the standardized, high-speed **Live Ink Stream Protocol (LISP)** and broadcaster bridge across Python and TypeScript.

---

### Objectives:
1. **Python Core Engine Protocol (`scripts/core/ink_streamer.py`)**:
   - `InkPacketType` enum (`TOUCHDOWN`, `VERTEX`, `LIFT`, `ERASE`, `CAMERA`, `RESET`).
   - `InkStreamPacket`: compact event payload with coordinates, pressure, nib angle, timestamp, and sequence number.
   - `InkStreamEncoder` & `InkStreamDecoder`: serialize/deserialize live packet streams with checksum and boundary verification.
   - Verification in `scripts/test_engine.py`: **Test 23**.
2. **VideoStudio Timeline & Network Operations**:
   - `src/shared/utils/timeline/ink-stream-protocol.ts`: Zero-dependency TypeScript implementation of `encodeInkPacket`, `decodeInkPacket`, packet factories, and stream accumulator.
   - Unit tests in `src/shared/utils/timeline/__tests__/ink-stream-protocol.test.ts`.
3. **VideoStudio UI in `SketchPane.tsx`**:
   - Add "Live Stream Broadcast Bridge" card with server status indicator, target port (default 8765), and live streaming toggle.
4. **Verification**:
   - All 23/23 Python engine tests passing.
   - All 86/86 VideoStudio test files passing with clean `tsc --noEmit`.

---

## 2. Architecture & Design

### Phase 1: Python Engine Protocol (`scripts/core/ink_streamer.py`)
1. Data structures:
   ```python
   class InkPacketType(str, Enum):
       TOUCHDOWN = "touchdown"
       VERTEX = "vertex"
       LIFT = "lift"
       ERASE = "erase"
       CAMERA = "camera"
       RESET = "reset"

   @dataclass
   class InkStreamPacket:
       seq: int
       timestamp_ms: float
       packet_type: InkPacketType
       x: float = 0.0
       y: float = 0.0
       pressure: float = 1.0
       nib_angle_deg: float = 45.0
       metadata: Dict[str, Any] = field(default_factory=dict)
   ```
2. Packet stream accumulator & validation:
   - Groups continuous `TOUCHDOWN -> VERTEX* -> LIFT` packets into cohesive stroke paths.
3. Standalone Test 23 in `scripts/test_engine.py`.

### Phase 2: VideoStudio Operations & Unit Tests
1. `src/shared/utils/timeline/ink-stream-protocol.ts`:
   - Matching TypeScript interfaces and compact serialization functions.
   - `InkStreamAccumulator` class to accumulate incoming packets into complete stroke polylines.
2. `src/shared/utils/timeline/__tests__/ink-stream-protocol.test.ts`:
   - Unit tests verifying serialization, deserialization, sequence ordering, and stroke accumulation.

### Phase 3: VideoStudio UI in `SketchPane.tsx`
- Add Live Ink Broadcast Bridge controls in `SketchPane.tsx`.

### Phase 4: Full Validation & Test Suite
- [x] Run `test_engine.py` (23/23 tests passing).
- [x] Run `npx tsc --noEmit` (clean 0 errors).
- [x] Run `npm test` across all 86 test files (994/994 tests passing).

---

## 3. Execution Status: 100% Complete & Verified
- **Python Whiteboard Engine**: `scripts/core/ink_streamer.py` with `InkPacketType`, `InkStreamPacket`, `encode_ink_packet`, `decode_ink_packet`, and `InkStreamAccumulator`. Verified with Test 23 in `scripts/test_engine.py` (**23/23 passing**).
- **TypeScript Operations**: `src/shared/utils/timeline/ink-stream-protocol.ts` built with zero external dependencies, providing `createInkPacket`, `encodeInkPacket`, `decodeInkPacket`, and `InkStreamAccumulator`. Exported via `src/shared/index.ts`.
- **Unit Tests**: `src/shared/utils/timeline/__tests__/ink-stream-protocol.test.ts` (**3/3 passing**).
- **UI Integration**: Live Ink Stream Bridge card with server target (`ws://127.0.0.1:8765`) and live streaming toggle integrated into `SketchPane.tsx`.
- **Regression Suite**: 86/86 test files, 994/994 unit tests passing cleanly with 0 TypeScript compiler errors.

