// Lightweight deterministic Web Audio synth for demo / offline tracks.

export class RetroSynthEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private volume = 0.7;
  private playing = false;
  private notes: number[] = [220, 261.63, 329.63, 392, 329.63, 293.66, 261.63, 246.94];
  private tempoMs = 260;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume * 0.16;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  configure(seed: string): void {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const scales = [
      [220, 261.63, 293.66, 329.63, 392, 440],
      [196, 220, 261.63, 293.66, 329.63, 392],
      [246.94, 293.66, 329.63, 369.99, 440, 493.88],
      [174.61, 220, 261.63, 329.63, 349.23, 440],
    ];
    const scale = scales[h % scales.length];
    this.notes = Array.from({ length: 8 }, (_, idx) => scale[(h + idx * 3) % scale.length]);
    this.tempoMs = 200 + (h % 140);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.volume * 0.16;
  }

  start(): void {
    this.stop();
    this.playing = true;
    this.step = 0;
    const ctx = this.ensureCtx();
    const tick = () => {
      if (!this.playing || !this.gain) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const freq = this.notes[this.step % this.notes.length];
      osc.type = this.step % 4 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      env.gain.setValueAtTime(0.001, now);
      env.gain.exponentialRampToValueAtTime(0.8, now + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, now + this.tempoMs / 1000 * 0.9);
      osc.connect(env);
      env.connect(this.gain);
      osc.start(now);
      osc.stop(now + this.tempoMs / 1000);
      this.step += 1;
    };
    tick();
    this.timer = window.setInterval(tick, this.tempoMs);
  }

  stop(): void {
    this.playing = false;
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
