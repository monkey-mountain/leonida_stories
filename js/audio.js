// Tiny Web Audio synth: weapons, explosions, sirens, engine and procedural radio.
'use strict';

const Sfx = {
  ctx: null, master: null, muted: false, engine: null, siren: null, radioTimer: null, station: 0,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Engine drone
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    osc.connect(filt); filt.connect(g); g.connect(this.master);
    osc.start();
    this.engine = { osc, g };

    // Siren
    const so = this.ctx.createOscillator();
    so.type = 'triangle';
    const sg = this.ctx.createGain();
    sg.gain.value = 0;
    so.connect(sg); sg.connect(this.master);
    so.start();
    this.siren = { osc: so, g: sg };
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },

  noise(dur, freq, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5, dur);
  },

  tone(freq, dur, vol, type = 'square', when = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  shot(vol = 0.35, weapon = 'pistol') {
    const f = weapon === 'shotgun' ? 1200 : weapon === 'rifle' ? 2600 : 2000;
    this.noise(weapon === 'shotgun' ? 0.3 : 0.15, f, vol);
  },
  punch() { this.noise(0.08, 600, 0.3); },
  explosion(vol = 0.8) { this.noise(1.2, 300, vol); this.noise(0.4, 1200, vol * 0.5); },
  pickup() { this.tone(660, 0.1, 0.15, 'square'); this.tone(990, 0.15, 0.15, 'square', 0.08); },
  cash() { this.tone(1200, 0.08, 0.12, 'triangle'); this.tone(1600, 0.12, 0.12, 'triangle', 0.07); },
  horn() { this.tone(370, 0.35, 0.18, 'square'); this.tone(440, 0.35, 0.12, 'square'); },
  crash(vol) { this.noise(0.25, 800, Math.min(0.6, vol)); },
  passed() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 0.18, 'triangle', i * 0.14)); },
  failed() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, 0.18, 'sawtooth', i * 0.18)); },
  wasted() { this.tone(110, 1.5, 0.3, 'sawtooth'); this.tone(82, 1.8, 0.25, 'sine', 0.2); },

  update(dt, engineSpeed, inCar, sirenOn) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engine.g.gain.setTargetAtTime(inCar ? 0.05 + Math.min(0.06, engineSpeed / 8000) : 0, t, 0.1);
    this.engine.osc.frequency.setTargetAtTime(45 + engineSpeed * 0.28, t, 0.1);
    this.siren.g.gain.setTargetAtTime(sirenOn ? 0.035 : 0, t, 0.2);
    if (sirenOn) this.siren.osc.frequency.setValueAtTime(700 + Math.sin(t * 5) * 250, t);
  },

  // Procedural radio: each station is a different scale/tempo loop
  setStation(i) {
    this.station = i;
    if (this.radioTimer) { clearInterval(this.radioTimer); this.radioTimer = null; }
    if (!this.ctx || i === 0 || i === 5) return;
    const styles = {
      1: { bpm: 118, scale: [0, 3, 5, 7, 10], root: 220, wave: 'square', bass: 'sawtooth' },  // synth pop
      2: { bpm: 140, scale: [0, 1, 5, 7, 8], root: 196, wave: 'sawtooth', bass: 'sine' },     // bass
      3: { bpm: 96, scale: [0, 2, 4, 7, 9], root: 262, wave: 'triangle', bass: 'sine' },      // island
      4: { bpm: 104, scale: [0, 2, 4, 5, 7, 9], root: 196, wave: 'triangle', bass: 'triangle' }, // country
      6: { bpm: 100, scale: [0, 2, 3, 5, 7, 8, 10], root: 233, wave: 'square', bass: 'triangle' }, // latin
    };
    const s = styles[i];
    let step = 0;
    const beat = 60 / s.bpm / 2;
    const prog = [0, 5, 3, 4];
    this.radioTimer = setInterval(() => {
      if (this.station !== i) return;
      const bar = Math.floor(step / 8) % prog.length;
      const deg = prog[bar];
      const semi = (n) => s.root * Math.pow(2, n / 12);
      if (step % 2 === 0) this.tone(semi(s.scale[deg % s.scale.length] - 24), beat * 1.8, 0.07, s.bass);
      if (step % 4 === 0) this.noise(0.05, 150, 0.12);
      if (step % 4 === 2) this.noise(0.08, 3000, 0.04, 'highpass');
      if (Math.random() < 0.55) {
        const n = s.scale[Math.floor(Math.random() * s.scale.length)] + (Math.random() < 0.3 ? 12 : 0);
        this.tone(semi(n), beat * 0.9, 0.035, s.wave);
      }
      step++;
    }, beat * 1000);
  },
};
