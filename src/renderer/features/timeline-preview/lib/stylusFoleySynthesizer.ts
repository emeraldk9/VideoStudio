/**
 * Milestone S160 — Real-Time Stylus Audio Foley Synthesizer.
 *
 * Synthesizes dynamic acoustic feedback in real time via Web Audio API:
 * - Velocity & pressure-modulated substrate friction rasping (Pen, Marker, Pencil, Chalk).
 * - Stick-slip squeak resonance on smooth whiteboard/slate.
 * - Touchdown and liftoff tactile haptic audio impulses.
 */

import {
  computePressurePitchModulation,
  detectSqueakResonance,
  type StylusNibTool,
} from '@shared';

export interface StylusFoleyConfig {
  enabled: boolean;
  masterVolume: number;
}

export class StylusFoleySynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Noise path (friction texture)
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;

  // Squeak resonance path (stick-slip resonance)
  private squeakOsc: OscillatorNode | null = null;
  private squeakGain: GainNode | null = null;

  // Tactile impulse
  private thumpGain: GainNode | null = null;

  private isRunning = false;
  private isPointerDown = false;

  private initContext(): boolean {
    if (this.ctx) return true;

    const AudioCtx =
      typeof window !== 'undefined'
        ? (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
        : (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!AudioCtx) return false;

    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Create looping white/pink noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Pink noise filter approximation
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }

      // Noise generator graph
      this.noiseFilter = this.ctx.createBiquadFilter();
      this.noiseFilter.type = 'bandpass';
      this.noiseFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      this.noiseFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.noiseSource = this.ctx.createBufferSource();
      this.noiseSource.buffer = noiseBuffer;
      this.noiseSource.loop = true;
      this.noiseSource.connect(this.noiseFilter);
      this.noiseFilter.connect(this.noiseGain);
      this.noiseGain.connect(this.masterGain);
      this.noiseSource.start(0);

      // Squeak oscillator graph
      this.squeakOsc = this.ctx.createOscillator();
      this.squeakOsc.type = 'sine';
      this.squeakOsc.frequency.setValueAtTime(2400, this.ctx.currentTime);

      this.squeakGain = this.ctx.createGain();
      this.squeakGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.squeakOsc.connect(this.squeakGain);
      this.squeakGain.connect(this.masterGain);
      this.squeakOsc.start(0);

      // Thump graph
      this.thumpGain = this.ctx.createGain();
      this.thumpGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.thumpGain.connect(this.masterGain);

      this.isRunning = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Called on pointerdown to resume AudioContext and trigger touchdown acoustic impulse.
   */
  public handlePointerDown(tool: StylusNibTool, pressure: number, volume: number = 0.6): void {
    if (!this.initContext() || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.isPointerDown = true;
    this.playImpulse('touchdown', tool, pressure, volume);
  }

  /**
   * Called on pointermove with current pressure and velocity to modulate friction sound.
   */
  public handlePointerMove(
    tool: StylusNibTool,
    pressure: number,
    velocity: number, // px/sec
    volume: number = 0.6,
  ): void {
    if (!this.isPointerDown || !this.ctx || !this.noiseGain || !this.noiseFilter || !this.squeakGain || !this.squeakOsc) {
      return;
    }

    const t = this.ctx.currentTime;
    const normVel = Math.min(1.0, velocity / 1200); // 0 to 1
    const p = Math.max(0.05, Math.min(1.0, pressure));
    const vol = Math.max(0, Math.min(1, volume));

    if (velocity < 10) {
      this.noiseGain.gain.setTargetAtTime(0, t, 0.02);
      this.squeakGain.gain.setTargetAtTime(0, t, 0.02);
      return;
    }

    // Configure profile based on tool
    let baseFreq = 1200;
    let filterQ = 1.0;
    let frictionLevel = 0.25;
    let allowSqueak = true;

    switch (tool) {
      case 'pen':
        baseFreq = 2200;
        filterQ = 1.4;
        frictionLevel = 0.2;
        allowSqueak = false;
        break;
      case 'marker':
        baseFreq = 950;
        filterQ = 1.1;
        frictionLevel = 0.35;
        allowSqueak = true;
        break;
      case 'pencil':
        baseFreq = 3800;
        filterQ = 0.8;
        frictionLevel = 0.45;
        allowSqueak = false;
        break;
      case 'chalk':
        baseFreq = 2600;
        filterQ = 0.6;
        frictionLevel = 0.55;
        allowSqueak = true;
        break;
      case 'eraser':
        baseFreq = 400;
        filterQ = 0.9;
        frictionLevel = 0.3;
        allowSqueak = false;
        break;
    }

    // 1. Modulate friction noise
    const pitchShiftedFreq = computePressurePitchModulation(baseFreq, p, 0.35);
    this.noiseFilter.frequency.setTargetAtTime(pitchShiftedFreq, t, 0.015);
    this.noiseFilter.Q.setTargetAtTime(filterQ, t, 0.02);

    const targetNoiseGain = normVel * (0.3 + p * 0.7) * frictionLevel * vol;
    this.noiseGain.gain.setTargetAtTime(targetNoiseGain, t, 0.015);

    // 2. Modulate stick-slip squeak
    if (allowSqueak) {
      const squeak = detectSqueakResonance(p, velocity, {
        enabled: true,
        squeakThresholdPressure: 0.55,
        squeakThresholdVelocity: 200,
        squeakVolume: 0.4,
      });

      if (squeak.isResonating) {
        this.squeakOsc.frequency.setTargetAtTime(squeak.resonanceFreq, t, 0.01);
        this.squeakGain.gain.setTargetAtTime(squeak.audioGain * vol, t, 0.01);
      } else {
        this.squeakGain.gain.setTargetAtTime(0, t, 0.03);
      }
    } else {
      this.squeakGain.gain.setTargetAtTime(0, t, 0.02);
    }
  }

  /**
   * Called on pointerup / pointercancel to silence friction and trigger liftoff acoustic impulse.
   */
  public handlePointerUp(tool: StylusNibTool, volume: number = 0.6): void {
    if (!this.ctx) return;
    this.isPointerDown = false;
    const t = this.ctx.currentTime;
    if (this.noiseGain) this.noiseGain.gain.setTargetAtTime(0, t, 0.02);
    if (this.squeakGain) this.squeakGain.gain.setTargetAtTime(0, t, 0.02);
    this.playImpulse('liftoff', tool, 0.5, volume);
  }

  /**
   * Discrete tactile impulse sound for tip touchdown and liftoff.
   */
  private playImpulse(
    kind: 'touchdown' | 'liftoff',
    tool: StylusNibTool,
    pressure: number,
    volume: number,
  ): void {
    if (!this.ctx || !this.thumpGain) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const freq = kind === 'touchdown' ? (tool === 'chalk' ? 120 : 75) : 320;
      const decay = kind === 'touchdown' ? 0.035 : 0.015;
      const amp = (kind === 'touchdown' ? 0.18 + pressure * 0.15 : 0.08) * volume;

      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + decay);

      gain.gain.setValueAtTime(amp, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

      osc.connect(gain);
      gain.connect(this.masterGain ?? this.ctx.destination);

      osc.start(t);
      osc.stop(t + decay + 0.01);
    } catch {
      // Audio node scheduling guard
    }
  }

  public dispose(): void {
    if (this.noiseSource) {
      try { this.noiseSource.stop(); } catch {}
      this.noiseSource.disconnect();
    }
    if (this.squeakOsc) {
      try { this.squeakOsc.stop(); } catch {}
      this.squeakOsc.disconnect();
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
    this.isRunning = false;
  }
}

export const stylusFoley = new StylusFoleySynthesizer();
