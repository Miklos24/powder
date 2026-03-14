import { ElementId } from './types';

const MASTER_VOLUME = 0.12;
const SAMPLE_INTERVAL = 3; // only scan every Nth frame for perf
const MIN_COUNT_THRESHOLD = 2; // minimum element count to trigger sound

/**
 * Procedural audio engine for ambient particle sounds.
 * All sounds are generated via Web Audio API — no audio files.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private frameCounter = 0;

  // Active sound layers
  private fireCrackle: CrackleLayer | null = null;
  private waterDrip: DripLayer | null = null;
  private sizzle: SizzleLayer | null = null;
  private electricZap: ZapLayer | null = null;

  /** Lazily init AudioContext on first user gesture. */
  private ensure(): boolean {
    if (this.ctx) return this.ctx.state === 'running';
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);

      this.fireCrackle = new CrackleLayer(this.ctx, this.master);
      this.waterDrip = new DripLayer(this.ctx, this.master);
      this.sizzle = new SizzleLayer(this.ctx, this.master);
      this.electricZap = new ZapLayer(this.ctx, this.master);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Called each frame with the current element grid.
   * Samples the grid to detect active elements and triggers sounds.
   */
  update(elements: Uint8Array): void {
    this.frameCounter++;
    if (this.frameCounter % SAMPLE_INTERVAL !== 0) return;
    if (!this.ensure()) return;

    // Count relevant elements (sparse scan — skip cells for perf)
    let fireCount = 0;
    let waterCount = 0;
    let lavaCount = 0;
    let electricityCount = 0;

    const step = 4; // sample every 4th cell
    for (let i = 0; i < elements.length; i += step) {
      switch (elements[i]) {
        case ElementId.Fire: fireCount++; break;
        case ElementId.Water: waterCount++; break;
        case ElementId.Lava: lavaCount++; break;
        case ElementId.Electricity: electricityCount++; break;
      }
    }

    // Scale counts back up (approximate)
    fireCount *= step;
    waterCount *= step;
    lavaCount *= step;
    electricityCount *= step;

    // Fire crackling — filtered white noise
    this.fireCrackle!.update(fireCount);

    // Water drip — sine wave blips when water present
    this.waterDrip!.update(waterCount);

    // Sizzle — when lava and water both exist (lava+water → steam reaction)
    const sizzleIntensity = Math.min(lavaCount, waterCount);
    this.sizzle!.update(sizzleIntensity);

    // Electric zap — short square wave bursts
    this.electricZap!.update(electricityCount);
  }

  /** Resume AudioContext after user gesture. */
  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

/**
 * Fire crackling: continuous filtered white noise, volume proportional to fire count.
 */
class CrackleLayer {
  private gain: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode;
  private targetGain = 0;

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 800;
    this.filter.Q.value = 1.5;

    this.filter.connect(this.gain);
    this.gain.connect(destination);

    this.startNoise();
  }

  private startNoise(): void {
    // Generate a short noise buffer and loop it
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate; // 1 second
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.source = this.ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.connect(this.filter);
    this.source.start();
  }

  update(fireCount: number): void {
    this.targetGain = fireCount > MIN_COUNT_THRESHOLD
      ? Math.min(0.6, fireCount / 500)
      : 0;

    // Smooth transition
    this.gain.gain.setTargetAtTime(
      this.targetGain, this.ctx.currentTime, 0.1
    );

    // Vary filter frequency for organic crackle feel
    if (this.targetGain > 0) {
      const freq = 600 + Math.random() * 600;
      this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    }
  }
}

/**
 * Water drip: occasional sine wave blips when water is present.
 */
class DripLayer {
  private lastDripTime = 0;

  constructor(private ctx: AudioContext, private destination: AudioNode) {}

  update(waterCount: number): void {
    if (waterCount < MIN_COUNT_THRESHOLD) return;

    const now = this.ctx.currentTime;
    // Drip rate increases with water amount, capped at ~3/sec
    const interval = Math.max(0.3, 2 - waterCount / 300);
    if (now - this.lastDripTime < interval) return;

    this.lastDripTime = now;
    this.playDrip();
  }

  private playDrip(): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Random pitch for variety
    osc.frequency.value = 800 + Math.random() * 600;
    osc.frequency.exponentialRampToValueAtTime(
      300 + Math.random() * 200,
      this.ctx.currentTime + 0.08
    );

    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.1);
  }
}

/**
 * Sizzle: filtered noise burst when lava meets water.
 */
class SizzleLayer {
  private lastSizzleTime = 0;

  constructor(private ctx: AudioContext, private destination: AudioNode) {}

  update(sizzleIntensity: number): void {
    if (sizzleIntensity < MIN_COUNT_THRESHOLD) return;

    const now = this.ctx.currentTime;
    if (now - this.lastSizzleTime < 0.4) return;

    this.lastSizzleTime = now;
    this.playSizzle(sizzleIntensity);
  }

  private playSizzle(intensity: number): void {
    const sampleRate = this.ctx.sampleRate;
    const duration = 0.15;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      // Noise with exponential decay
      const env = Math.exp(-i / (length * 0.3));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000 + Math.random() * 2000;

    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(0.3, intensity / 200);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.destination);

    source.start(this.ctx.currentTime);
  }
}

/**
 * Electric zap: short square wave bursts when electricity propagates.
 */
class ZapLayer {
  private lastZapTime = 0;

  constructor(private ctx: AudioContext, private destination: AudioNode) {}

  update(electricityCount: number): void {
    if (electricityCount < MIN_COUNT_THRESHOLD) return;

    const now = this.ctx.currentTime;
    if (now - this.lastZapTime < 0.15) return;

    this.lastZapTime = now;
    this.playZap(electricityCount);
  }

  private playZap(count: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = 100 + Math.random() * 150;
    // Rapid pitch sweep for electric feel
    osc.frequency.exponentialRampToValueAtTime(
      2000 + Math.random() * 1000,
      this.ctx.currentTime + 0.04
    );

    const volume = Math.min(0.2, count / 300);
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.06);
  }
}
