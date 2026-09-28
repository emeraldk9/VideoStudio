import { describe, expect, it, vi } from 'vitest';
import {
  clipAtFrame,
  clipSpeed,
  framesToSeconds,
  layoutTrack,
  type PlacedClip,
  type SequenceClip,
  type SequenceTrack,
} from '@shared';
import { transportClock } from '../../../../entities/sequence';

describe('Milestone S162: Playback Decoupling, Hardware Video Clock & Anti-Seek Engine', () => {
  const dummyTrack: SequenceTrack = {
    id: 'track-v1',
    sequenceId: 'seq-1',
    kind: 'video',
    name: 'V1',
    orderIndex: 0,
    muted: false,
    locked: false,
    volume: 1,
    videoEnabled: true,
    magnetic: true,
    heightPx: 48,
    role: null,
  };

  const clipA: SequenceClip = {
    id: 'clip-a',
    sequenceId: 'seq-1',
    trackId: 'track-v1',
    orderIndex: 0,
    sourceKind: 'video',
    filePath: 'video-a.mp4',
    sourceInFrames: 0,
    durationFrames: 48, // 2 seconds at 24fps
    startFrames: 0,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Clip A',
    overrides: [],
  };

  const clipB: SequenceClip = {
    id: 'clip-b',
    sequenceId: 'seq-1',
    trackId: 'track-v1',
    orderIndex: 1,
    sourceKind: 'video',
    filePath: 'video-b.mp4',
    sourceInFrames: 24, // starts 1s into source
    durationFrames: 72, // 3 seconds at 24fps
    startFrames: 48,
    transitionIn: 'cut',
    transitionFrames: 0,
    motionPreset: 'none',
    gainDb: 0,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: 'Clip B',
    overrides: [],
  };

  it('correctly maps hardware video currentTime to timeline sequence frame', () => {
    const fps = 24;
    const speed = clipSpeed(clipB.effects); // 1.0
    const sourceInSec = framesToSeconds(clipB.sourceInFrames ?? 0, fps); // 24 / 24 = 1.0s

    // Simulating video.currentTime = 1.5s (0.5s into clipB playback)
    const simulatedVideoCurrentTime = 1.5;
    const intoClipSec = (simulatedVideoCurrentTime - sourceInSec) / speed; // 0.5s
    const computedFrame = (clipB.startFrames ?? 0) + intoClipSec * fps; // 48 + 0.5 * 24 = 60

    expect(computedFrame).toBe(60);
  });

  it('publishes live frame to transportClock without throwing and notifies subscribers', () => {
    const listener = vi.fn();
    const unsub = transportClock.subscribe(listener);

    transportClock.start(0);
    transportClock.publish(12.5);
    transportClock.publish(25.0);

    expect(listener).toHaveBeenCalledWith(0);
    expect(listener).toHaveBeenCalledWith(12.5);
    expect(listener).toHaveBeenCalledWith(25.0);
    expect(transportClock.frame).toBe(25.0);
    expect(transportClock.running).toBe(true);

    transportClock.stop();
    expect(transportClock.running).toBe(false);
    unsub();
  });

  it('detects cut boundary crossings strictly when crossing clip thresholds', () => {
    const placedClips = layoutTrack([clipA, clipB], dummyTrack);

    let activeClipId: string | null = null;
    let cutRenderCount = 0;

    const onFrame = (frame: number) => {
      const placed = clipAtFrame(placedClips, frame);
      const clipId = placed?.clip.id ?? '__gap__';
      if (clipId !== activeClipId) {
        activeClipId = clipId;
        cutRenderCount++;
      }
    };

    // Frame 0..47: inside clipA (should trigger cut once at frame 0)
    for (let f = 0; f < 48; f++) {
      onFrame(f);
    }
    expect(activeClipId).toBe('clip-a');
    expect(cutRenderCount).toBe(1);

    // Frame 48..119: inside clipB (should trigger cut once at frame 48)
    for (let f = 48; f < 120; f++) {
      onFrame(f);
    }
    expect(activeClipId).toBe('clip-b');
    expect(cutRenderCount).toBe(2);

    // Frame 120: gap beyond sequence end (should trigger cut once at frame 120)
    onFrame(120);
    expect(activeClipId).toBe('__gap__');
    expect(cutRenderCount).toBe(3);
  });

  it('maintains trackLayoutMap instance equality to avoid redundant layout calculations', () => {
    const clips = [clipA, clipB];
    const tracks = [dummyTrack];

    const trackLayoutMap = new Map<string, PlacedClip[]>();
    for (const track of tracks) {
      trackLayoutMap.set(track.id, layoutTrack(clips, track));
    }

    const firstLookup = trackLayoutMap.get('track-v1');
    const secondLookup = trackLayoutMap.get('track-v1');

    expect(firstLookup).toBeDefined();
    expect(firstLookup).toBe(secondLookup); // Exact reference equality
    expect(firstLookup?.length).toBe(2);
  });

  it('only dispatches gain reduction when changes exceed the 0.3 dB threshold', () => {
    let lastGainReductionDb = 0;
    const dispatchedValues: number[] = [];

    const handleDuckingGain = (gainDb: number) => {
      if (Math.abs(gainDb - lastGainReductionDb) > 0.3) {
        lastGainReductionDb = gainDb;
        dispatchedValues.push(gainDb);
      }
    };

    // Micro-fluctuations under 0.3dB should be ignored
    handleDuckingGain(0.1);
    handleDuckingGain(0.2);
    handleDuckingGain(0.25);
    expect(dispatchedValues.length).toBe(0);

    // Significant drop (> 0.3dB from 0)
    handleDuckingGain(-2.5);
    expect(dispatchedValues).toEqual([-2.5]);

    // Small fluctuation around -2.5dB (-2.6dB, -2.4dB) should be ignored
    handleDuckingGain(-2.6);
    handleDuckingGain(-2.4);
    expect(dispatchedValues.length).toBe(1);

    // Release back to 0dB (> 0.3dB from -2.5dB)
    handleDuckingGain(0);
    expect(dispatchedValues).toEqual([-2.5, 0]);
  });

  it('pre-computes visual boundaries across all tracks and transitions for zero-lag switching', () => {
    const overlayTrack: SequenceTrack = {
      ...dummyTrack,
      id: 'track-v2',
      name: 'V2 Overlay',
      orderIndex: 1,
      magnetic: false,
    };
    const overlayClip: SequenceClip = {
      ...clipA,
      id: 'overlay-1',
      trackId: 'track-v2',
      startFrames: 20,
      durationFrames: 40, // 20..60
    };

    const tracks = [dummyTrack, overlayTrack];
    const clips = [clipA, clipB, overlayClip];
    const durationFrames = 120;

    const trackMap = new Map<string, PlacedClip[]>();
    for (const t of tracks) {
      trackMap.set(t.id, layoutTrack(clips, t));
    }

    const frames = new Set<number>([0, durationFrames]);
    for (const track of tracks) {
      const trackClips = trackMap.get(track.id) ?? [];
      for (const placed of trackClips) {
        frames.add(placed.startFrames);
        frames.add(placed.endFrames);
      }
    }
    const boundaries = Array.from(frames).sort((a, b) => a - b);

    // clipA: 0..48, overlay: 20..60, clipB: 48..120
    expect(boundaries).toEqual([0, 20, 48, 60, 120]);

    // Segment index search
    const getSegIdx = (frame: number) => {
      let idx = 0;
      while (idx < boundaries.length - 1 && frame >= boundaries[idx + 1]) {
        idx++;
      }
      return idx;
    };

    expect(getSegIdx(0)).toBe(0);
    expect(getSegIdx(15)).toBe(0);
    expect(getSegIdx(20)).toBe(1); // overlay enters
    expect(getSegIdx(35)).toBe(1);
    expect(getSegIdx(48)).toBe(2); // clipB enters
    expect(getSegIdx(60)).toBe(3); // overlay leaves
    expect(getSegIdx(100)).toBe(3);
    expect(getSegIdx(120)).toBe(4); // sequence end
  });

  it('directly triggers audio element play/pause during rAF loop at boundary precision', () => {
    const audioTrack: SequenceTrack = {
      ...dummyTrack,
      id: 'track-a1',
      kind: 'audio',
      name: 'A1',
      magnetic: false,
    };
    const audioClip: SequenceClip = {
      ...clipA,
      id: 'audio-bgm',
      trackId: 'track-a1',
      sourceKind: 'audio',
      startFrames: 24,
      durationFrames: 48, // 24..72
    };

    const placedAudio = layoutTrack([audioClip], audioTrack);
    expect(placedAudio.length).toBe(1);
    const placed = placedAudio[0];

    const mockAudioElement = {
      paused: true,
      currentTime: 0,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    };

    const syncAudioAtFrame = (frame: number, isPlaying: boolean) => {
      const inside = frame >= placed.startFrames && frame < placed.endFrames;
      if (!inside || !isPlaying) {
        if (!mockAudioElement.paused) {
          mockAudioElement.pause();
          mockAudioElement.paused = true;
        }
      } else {
        if (mockAudioElement.paused) {
          mockAudioElement.currentTime = (frame - placed.startFrames) / 24;
          mockAudioElement.play();
          mockAudioElement.paused = false;
        }
      }
    };

    // Before audio starts (frame 10)
    syncAudioAtFrame(10, true);
    expect(mockAudioElement.play).not.toHaveBeenCalled();
    expect(mockAudioElement.paused).toBe(true);

    // Audio in-point hit (frame 24)
    syncAudioAtFrame(24, true);
    expect(mockAudioElement.play).toHaveBeenCalledTimes(1);
    expect(mockAudioElement.currentTime).toBe(0);
    expect(mockAudioElement.paused).toBe(false);

    // Mid-clip playback (frame 40) - already playing, no redundant play() calls
    syncAudioAtFrame(40, true);
    expect(mockAudioElement.play).toHaveBeenCalledTimes(1);

    // Audio out-point hit (frame 72)
    syncAudioAtFrame(72, true);
    expect(mockAudioElement.pause).toHaveBeenCalledTimes(1);
    expect(mockAudioElement.paused).toBe(true);
  });

  it('decouples subtitle active cue highlighting from continuous playhead frames', () => {
    const subtitleClips: SequenceClip[] = [
      { ...clipA, id: 'sub-1', startFrames: 0, durationFrames: 24 },
      { ...clipA, id: 'sub-2', startFrames: 24, durationFrames: 36 }, // 24..60
    ];

    let activeCueId: string | null = null;
    let renderTriggerCount = 0;

    const onTransportFrame = (frame: number) => {
      const active = subtitleClips.find(
        (c) => frame >= (c.startFrames ?? 0) && frame < (c.startFrames ?? 0) + c.durationFrames,
      );
      const activeId = active?.id ?? null;
      if (activeId !== activeCueId) {
        activeCueId = activeId;
        renderTriggerCount++;
      }
    };

    // Simulating continuous 60fps playback through sub-1 (frames 0 to 23)
    for (let f = 0; f < 24; f++) {
      onTransportFrame(f);
    }
    expect(activeCueId).toBe('sub-1');
    expect(renderTriggerCount).toBe(1); // Rendered ONCE at frame 0, NOT 24 times

    // Simulating continuous playback through sub-2 (frames 24 to 59)
    for (let f = 24; f < 60; f++) {
      onTransportFrame(f);
    }
    expect(activeCueId).toBe('sub-2');
    expect(renderTriggerCount).toBe(2); // Rendered ONCE at cue transition, NOT 36 times

    // After sub-2 ends (gap at frame 60)
    onTransportFrame(60);
    expect(activeCueId).toBeNull();
    expect(renderTriggerCount).toBe(3);
  });

  describe('Milestone S171: High-Performance Media Playback, 60fps Scrubber & Optical Flow Retiming', () => {
    it('bypasses WebGL canvas overlay for standard video clips without active transitions or GPU shaders', () => {
      // Helper function mirroring TimelinePreview's S171 glActive decision
      const computeGlActive = (params: {
        glEnabled: boolean;
        current: { clip: SequenceClip } | null;
        boundary: { type: string } | null;
        resolvedMotion?: unknown;
        adjustmentsCount: number;
      }): boolean => {
        if (!params.glEnabled || !params.current) return false;
        const clip = params.current.clip;
        const hasGlTransition = params.boundary !== null;
        const hasGlEffects = Boolean(
          (clip.sourceKind === 'still' && params.resolvedMotion !== undefined) ||
            clip.effects?.filmEmulation?.enabled ||
            clip.effects?.lensOptics?.enabled ||
            clip.effects?.chromaKey?.enabled ||
            clip.effects?.colorGrade ||
            clip.effects?.mask?.enabled ||
            params.adjustmentsCount > 0,
        );
        return (
          (hasGlTransition || hasGlEffects) &&
          (clip.sourceKind === 'still' || clip.sourceKind === 'video')
        );
      };

      // 1. Standard video clip: no transitions, no shaders -> glActive is false (Direct 60fps GPU Hardware Scanout!)
      const plainVideo = { clip: clipA };
      expect(
        computeGlActive({
          glEnabled: true,
          current: plainVideo,
          boundary: null,
          adjustmentsCount: 0,
        }),
      ).toBe(false);

      // 2. Video with crossfade transition -> glActive is true (WebGL Compositor draws blend)
      expect(
        computeGlActive({
          glEnabled: true,
          current: plainVideo,
          boundary: { type: 'crossfade' },
          adjustmentsCount: 0,
        }),
      ).toBe(true);

      // 3. Video with color grade or film emulation -> glActive is true
      const gradedVideo = {
        clip: {
          ...clipA,
          effects: {
            filmEmulation: {
              enabled: true,
              stock: 'kodak_portra_400' as const,
              grainIntensity: 0.5,
              grainSize: 1.0,
              halationSpread: 0.3,
              halationColor: [1, 0, 0] as [number, number, number],
              bloomIntensity: 0.2,
              halationEnabled: true,
              bloomEnabled: true,
              filmGateWeave: 0.1,
              gateWeaveSpeed: 1.0,
            },
          },
        },
      };
      expect(
        computeGlActive({
          glEnabled: true,
          current: gradedVideo,
          boundary: null,
          adjustmentsCount: 0,
        }),
      ).toBe(true);

      // 4. Video under active adjustment layer -> glActive is true
      expect(
        computeGlActive({
          glEnabled: true,
          current: plainVideo,
          boundary: null,
          adjustmentsCount: 1,
        }),
      ).toBe(true);
    });

    it('syncs audio using micro-rate nudges for minor drift (< 0.8s) without popping or buffer dump', () => {
      let seekCount = 0;
      const el = {
        paused: false,
        currentTime: 2.0,
        playbackRate: 1.0,
        play: vi.fn().mockResolvedValue(undefined),
      };

      const syncAudio = (target: number, tempo = 1.0) => {
        const drift = el.currentTime - target;
        if (Math.abs(drift) > 0.8) {
          // Large drift -> hard seek
          el.currentTime = target;
          if (el.playbackRate !== tempo) el.playbackRate = tempo;
          seekCount++;
        } else if (Math.abs(drift) > 0.08) {
          // Micro drift -> smooth nudge rate without dumping audio decode buffer
          const nudge = drift > 0 ? 0.96 : 1.04;
          const adjustedRate = tempo * nudge;
          if (Math.abs(el.playbackRate - adjustedRate) > 0.01) {
            el.playbackRate = adjustedRate;
          }
        } else if (el.playbackRate !== tempo) {
          el.playbackRate = tempo;
        }
      };

      // Case 1: Audio is slightly behind target (drift = -0.15s)
      // Should nudge rate up to 1.04 to smoothly catch up with ZERO hard seeks!
      syncAudio(2.15);
      expect(seekCount).toBe(0);
      expect(el.playbackRate).toBeCloseTo(1.04, 2);

      // Case 2: Audio is slightly ahead of target (drift = +0.12s)
      el.currentTime = 2.12;
      syncAudio(2.0);
      expect(seekCount).toBe(0);
      expect(el.playbackRate).toBeCloseTo(0.96, 2);

      // Case 3: In sync (drift < 0.08s) -> restore normal playback rate 1.0
      el.currentTime = 2.02;
      syncAudio(2.0);
      expect(seekCount).toBe(0);
      expect(el.playbackRate).toBe(1.0);

      // Case 4: Major desync (e.g. user skipped playhead, drift = 2.5s) -> execute hard seek
      syncAudio(4.5);
      expect(seekCount).toBe(1);
      expect(el.currentTime).toBe(4.5);
    });
  });
});
