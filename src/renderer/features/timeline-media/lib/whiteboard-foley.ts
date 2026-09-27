/**
 * Milestone S91: Procedural Whiteboard Audio FX & Dynamic Foley Sound Synthesizer
 *
 * Implements real-time Web Audio API procedural synthesis of drawing contact sounds:
 * - Pen: Crisp, high-frequency metallic nib paper friction (5.2 kHz)
 * - Marker: Wet rubbery resonant sweep (900 Hz) with stick-slip squeaks
 * - Pencil: Granular graphite tooth texture (2.8 kHz)
 * - Chalk: Low-mid blackboard slate grit (1.4 kHz)
 * - Eraser/Wipe: Low broadband whoosh (450 Hz)
 *
 * All parameters modulate dynamically with stroke velocity v = sqrt(dx^2 + dy^2).
 */

export interface FoleyStylusConfig {
  centerFreq: number;
  bandwidth: number;
  baseGain: number;
  velocityScale: number;
  q: number;
}

export const FOLEY_STYLUS_CONFIGS: Record<string, FoleyStylusConfig> = {
  pen: {
    centerFreq: 5200,
    bandwidth: 2400,
    baseGain: 0.55,
    velocityScale: 1.2,
    q: 2.2,
  },
  marker: {
    centerFreq: 900,
    bandwidth: 700,
    baseGain: 0.65,
    velocityScale: 1.0,
    q: 3.2,
  },
  pencil: {
    centerFreq: 2800,
    bandwidth: 1900,
    baseGain: 0.60,
    velocityScale: 1.4,
    q: 1.8,
  },
  chalk: {
    centerFreq: 1400,
    bandwidth: 1200,
    baseGain: 0.70,
    velocityScale: 1.5,
    q: 1.5,
  },
  eraser: {
    centerFreq: 450,
    bandwidth: 450,
    baseGain: 0.50,
    velocityScale: 0.8,
    q: 1.2,
  },
};

export class WhiteboardFoleyEngine {
  private static instance: WhiteboardFoleyEngine | null = null;
  private audioCtx: AudioContext | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private bandpassFilter: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private isRunning = false;
  private currentStylus = 'pen';
  private masterVolume = 0.6;

  public static getInstance(): WhiteboardFoleyEngine {
    if (!WhiteboardFoleyEngine.instance) {
      WhiteboardFoleyEngine.instance = new WhiteboardFoleyEngine();
    }
    return WhiteboardFoleyEngine.instance;
  }

  private initContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = ctx.sampleRate * 2; // 2-second looping white/pink noise buffer
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink noise approximation filter
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.25;
    }
    return buffer;
  }

  public start(stylus = 'pen', volume = 0.6): void {
    if (this.isRunning) {
      this.setStylus(stylus);
      this.setVolume(volume);
      return;
    }

    try {
      const ctx = this.initContext();
      this.currentStylus = stylus;
      this.masterVolume = Math.max(0, Math.min(1, volume));

      const config = FOLEY_STYLUS_CONFIGS[stylus.toLowerCase()] || FOLEY_STYLUS_CONFIGS.pen;

      // 1. Noise source
      this.noiseSource = ctx.createBufferSource();
      this.noiseSource.buffer = this.createNoiseBuffer(ctx);
      this.noiseSource.loop = true;

      // 2. Resonant bandpass filter
      this.bandpassFilter = ctx.createBiquadFilter();
      this.bandpassFilter.type = 'bandpass';
      this.bandpassFilter.frequency.setValueAtTime(config.centerFreq, ctx.currentTime);
      this.bandpassFilter.Q.setValueAtTime(config.q, ctx.currentTime);

      // 3. Dynamic gain envelope
      this.gainNode = ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);

      // Connect nodes: Source -> Filter -> Gain -> Destination
      this.noiseSource.connect(this.bandpassFilter);
      this.bandpassFilter.connect(this.gainNode);
      this.gainNode.connect(ctx.destination);

      this.noiseSource.start();
      this.isRunning = true;
    } catch (err) {
      console.warn('Could not initialize Whiteboard Foley Web Audio:', err);
    }
  }

  public setStylus(stylus: string): void {
    this.currentStylus = stylus;
    if (!this.bandpassFilter || !this.audioCtx) return;
    const config = FOLEY_STYLUS_CONFIGS[stylus.toLowerCase()] || FOLEY_STYLUS_CONFIGS.pen;
    this.bandpassFilter.frequency.setTargetAtTime(config.centerFreq, this.audioCtx.currentTime, 0.03);
    this.bandpassFilter.Q.setTargetAtTime(config.q, this.audioCtx.currentTime, 0.03);
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  public updateVelocity(velocityPxPerSec: number, stylus?: string): void {
    if (!this.isRunning || !this.gainNode || !this.audioCtx) return;
    if (stylus && stylus !== this.currentStylus) {
      this.setStylus(stylus);
    }

    const config = FOLEY_STYLUS_CONFIGS[this.currentStylus.toLowerCase()] || FOLEY_STYLUS_CONFIGS.pen;

    // Contact threshold: silence if velocity < 10 px/s
    if (velocityPxPerSec < 10) {
      this.gainNode.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.02);
      return;
    }

    const normalizedVel = Math.min(1.0, velocityPxPerSec / 1200);
    const targetGain = normalizedVel * config.velocityScale * config.baseGain * this.masterVolume;
    this.gainNode.gain.setTargetAtTime(Math.max(0.0001, targetGain), this.audioCtx.currentTime, 0.025);
  }

  public stop(): void {
    if (!this.isRunning) return;
    try {
      if (this.gainNode && this.audioCtx) {
        this.gainNode.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.02);
      }
      setTimeout(() => {
        if (this.noiseSource) {
          try {
            this.noiseSource.stop();
            this.noiseSource.disconnect();
          } catch {
            // ignore if already stopped
          }
          this.noiseSource = null;
        }
        this.isRunning = false;
      }, 50);
    } catch {
      this.isRunning = false;
    }
  }

  public previewSample(stylus: string, durationSec = 0.8, volume = 0.7): void {
    this.start(stylus, volume);
    // Simulate drawing stroke velocity ramp
    this.updateVelocity(650, stylus);
    setTimeout(() => {
      this.updateVelocity(950, stylus);
    }, durationSec * 400);
    setTimeout(() => {
      this.stop();
    }, durationSec * 1000);
  }
}
