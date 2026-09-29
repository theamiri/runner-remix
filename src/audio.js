// Tiny synthesized sound effects (no audio files needed).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.1;
  }

  unlock() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  tone(freq, dur, { type = 'square', slide = 0, vol = 1, delay = 0 } = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(this.volume * vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 1) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume * vol;
    src.buffer = buf;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  jump() { this.tone(420, 0.1, { slide: 520, vol: 0.8 }); }
  doubleJump() { this.tone(640, 0.09, { slide: 600, vol: 0.7 }); }
  point() { this.tone(988, 0.07, { vol: 0.6 }); this.tone(1319, 0.14, { vol: 0.6, delay: 0.07 }); }
  bump() { this.tone(180, 0.12, { type: 'triangle', slide: -60 }); }
  crash() { this.noise(0.2, 0.9); this.tone(260, 0.3, { type: 'sawtooth', slide: -200, vol: 0.7 }); }
  world() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.09, { delay: i * 0.07, vol: 0.5 })); }
  best() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, { delay: i * 0.08, vol: 0.5 })); }
}
