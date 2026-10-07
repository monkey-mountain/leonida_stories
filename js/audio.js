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
    // speech synthesis bypasses the master gain, so restart or stop the radio explicitly
    if (this.station) this.setStation(this.station);
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

  // Radio is implemented in radio.js
  setStation(i) {
    this.station = i;
    if (typeof Radio !== 'undefined') Radio.play(this.muted ? 0 : i);
  },
};
