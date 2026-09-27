import { describe, expect, it, vi } from 'vitest';
import { StylusFoleySynthesizer } from '../stylusFoleySynthesizer';

describe('StylusFoleySynthesizer (Milestone S160)', () => {
  it('instantiates cleanly and safely runs methods in headless environment', () => {
    const synth = new StylusFoleySynthesizer();
    expect(synth).toBeDefined();

    // Calling pointer events when AudioContext is unavailable should not throw
    expect(() => {
      synth.handlePointerDown('pen', 0.5, 0.7);
      synth.handlePointerMove('pen', 0.5, 300, 0.7);
      synth.handlePointerUp('pen', 0.7);
      synth.dispose();
    }).not.toThrow();
  });

  it('interacts with mock Web Audio API graph when present', () => {
    const mockParam = {
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };

    const mockNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockGain = {
      ...mockNode,
      gain: mockParam,
    };

    const mockFilter = {
      ...mockNode,
      frequency: mockParam,
      Q: mockParam,
      type: 'bandpass',
    };

    const mockOsc = {
      ...mockNode,
      frequency: mockParam,
      type: 'sine',
    };

    const mockBufferSource = {
      ...mockNode,
      buffer: null,
      loop: false,
    };

    const createGainSpy = vi.fn(() => ({ ...mockGain }));
    const createOscSpy = vi.fn(() => ({ ...mockOsc }));
    const closeSpy = vi.fn();

    class MockAudioContext {
      currentTime = 10;
      sampleRate = 44100;
      state = 'running';
      destination = {};
      createGain = createGainSpy;
      createBiquadFilter = vi.fn(() => ({ ...mockFilter }));
      createOscillator = createOscSpy;
      createBufferSource = vi.fn(() => ({ ...mockBufferSource }));
      createBuffer = vi.fn(() => ({
        getChannelData: () => new Float32Array(100),
      }));
      resume = vi.fn();
      close = closeSpy;
    }

    // Inject MockAudioContext class into globalThis
    vi.stubGlobal('AudioContext', MockAudioContext);

    const synth = new StylusFoleySynthesizer();

    synth.handlePointerDown('marker', 0.7, 0.8);
    expect(createGainSpy).toHaveBeenCalled();
    expect(createOscSpy).toHaveBeenCalled();

    // Move pointer with velocity to modulate sound
    synth.handlePointerMove('marker', 0.8, 600, 0.8);

    // Pointer up
    synth.handlePointerUp('marker', 0.8);

    // Teardown
    synth.dispose();
    expect(closeSpy).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
