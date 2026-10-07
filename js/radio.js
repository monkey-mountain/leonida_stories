// In-game radio: procedurally composed songs per station, plus a talk station read by the
// browser's speech synthesizer. All music is generated live with Web Audio.
'use strict';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

const STATIONS = {
  1: {
    name: 'Vice City FM', genre: '80s synthwave', bpm: 112, root: 45, minor: true,
    prog: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-2, 2, 5]],
    songs: [['Neon Ocean Drive', 'The Pastels'], ['Midnight in Vice', 'Laser Lucia'], ['Starfish Island', 'Synth Cartel'], ['Pink Flamingo', 'Miami Vibes Inc.']],
  },
  2: {
    name: 'Leonida Bass Radio', genre: 'trap / hip-hop', bpm: 140, root: 41, minor: true,
    prog: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]],
    songs: [['Keys to the City', 'Real Dimez'], ['Bando in the Glades', 'Lil Gator'], ['Drip Like the Gulf', 'Dre\'Quan Priest ft. Boobie'], ['Turnpike', 'Big Sunshine']],
  },
  3: {
    name: 'Keys Island Rhythms', genre: 'reggae / tropical', bpm: 84, root: 48, minor: false,
    prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]],
    songs: [['Seven Bridges', 'Coral Sound System'], ['Salt Life', 'Island Jah'], ['Sunset Ferry', 'Conch Republic'], ['No Worries Mon', 'Keys Collective']],
  },
  4: {
    name: 'Grassrivers Country', genre: 'country', bpm: 108, root: 43, minor: false,
    prog: [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14]],
    songs: [['Airboat Heart', 'Dusty Hampton'], ['Gator Bait Blues', 'The Swamp Kings'], ['Pickup Truck Prayer', 'Mary-Lou Bayou'], ['Mud on My Boots', 'Cal & The Coasties']],
  },
  6: {
    name: 'Flash Latino', genre: 'reggaeton / latin', bpm: 96, root: 45, minor: true,
    prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-7, -4, 0]],
    songs: [['Calle Ocho', 'DJ Caminos'], ['Fuego en Vice', 'La Reina del Sur'], ['Perreo Leonida', 'El Flamingo'], ['Noche Caliente', 'Los Cayos']],
  },
};

const TALK = [
  'You are listening to W C T R, Leonida Today. I\'m your host. Let\'s get right into the news.',
  'Breaking news from Vice City. A man was arrested for walking an alligator through a shopping mall. He says the gator was his emotional support animal.',
  'Traffic update. The Leonida Turnpike is backed up near Ambrosia after a truck full of sugar tipped over. Drivers report the air smells like cotton candy.',
  'This hour is brought to you by Gator-B-Gone. Alligator in your pool? Alligator in your car? Call Gator-B-Gone. We remove the gator. Mostly.',
  'Police in Vice City remind residents that robbing a convenience store is a crime, even if you are filming it for your followers.',
  'Weather for Leonida. Hot. Humid. A chance of afternoon thunderstorms. And possibly a hurricane. Have a nice day.',
  'Caller on line two says he saw a couple on an airboat doing sixty miles an hour through the Grassrivers. Sir, that is not news. That is Tuesday.',
  'Port Gellhorn dockworkers are on strike again. Cargo is piling up. Somebody please tell them I ordered a jet ski.',
  'This segment is sponsored by Leonida Lottery. You probably won\'t win. But you might! You won\'t.',
  'Coming up after the break, we talk to a man from Ambrosia who claims the sugar refinery is controlled by lizards. Stay with us.',
  'Real estate in the Keys is up forty percent. If you want a house on the water, you will need a boat to sleep in. Back to you.',
  'Remember folks: in Leonida, the sun always shines, the rent is always due, and the cops are always watching. This is W C T R.',
];

const Radio = {
  station: 0, timer: null, nextTime: 0, step: 0, bar: 0, songIdx: 0, songBars: 0, talkIdx: 0, speaking: false, volume: 0.8,

  get ctx() { return Sfx.ctx; },

  ensureBus() {
    if (this.bus || !this.ctx) return;
    const c = this.ctx;
    this.bus = c.createGain();
    this.bus.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.bus.connect(comp);
    comp.connect(Sfx.master);
  },

  setVolume(v) {
    this.volume = v;
    if (this.bus) this.bus.gain.value = v;
    if (this.utter) this.utter.volume = v;
  },

  play(i) {
    if (!this.ctx) return;
    this.ensureBus();
    this.stop();
    this.station = i;
    if (!i) return;
    if (i === 5) { this.talkIdx = Math.floor(Math.random() * TALK.length); this.talkLoop(); return; }
    const st = STATIONS[i];
    if (!st) return;
    this.songIdx = Math.floor(Math.random() * st.songs.length);
    this.newSong(st);
    this.step = 0; this.bar = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  },

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.speaking = false;
    this.utter = null;
    this.station = 0;
  },

  newSong(st) {
    const [title, artist] = st.songs[this.songIdx % st.songs.length];
    this.song = { title, artist, seed: this.songIdx * 7919 + this.station * 131 };
    this.songBars = 0;
    // A 2-bar melody motif that repeats with variations, so it sounds like a song
    const r = mulberry32(this.song.seed);
    const scale = st.minor ? [0, 3, 5, 7, 10, 12, 15] : [0, 2, 4, 7, 9, 12, 14];
    this.motif = [];
    for (let s = 0; s < 32; s++) {
      const hit = st.bpm > 130 ? r() < 0.28 : r() < 0.45;
      this.motif.push(hit ? scale[Math.floor(r() * scale.length)] : null);
    }
    if (typeof UI !== 'undefined' && UI.nowPlaying) UI.nowPlaying(st.name, title, artist);
  },

  schedule() {
    const st = STATIONS[this.station];
    if (!st || !this.ctx) return;
    const sixteenth = 60 / st.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(st, this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
      if (this.step % 16 === 0) {
        this.bar++; this.songBars++;
        if (this.songBars >= 48) { this.songIdx++; this.newSong(st); }
      }
    }
  },

  // ---------------------------------------------------------------- instruments
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  },
  osc(type, f, t, dur, peak, a = 0.005, filt = 0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    let node = o;
    if (filt) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filt; o.connect(lp); node = lp; }
    node.connect(g); g.connect(this.bus);
    this.env(g, t, a, peak, dur);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  },
  noise(t, dur, peak, type, freq, q = 1) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = Sfx.noiseBuf;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(g); g.connect(this.bus);
    this.env(g, t, 0.002, peak, dur);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  },
  kick(t, v = 0.9) {
    const o = this.osc('sine', 150, t, 0.28, v, 0.002);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  },
  snare(t, v = 0.35) { this.noise(t, 0.16, v, 'bandpass', 1900, 0.8); this.osc('triangle', 190, t, 0.08, v * 0.6); },
  clap(t, v = 0.3) { for (let k = 0; k < 3; k++) this.noise(t + k * 0.012, 0.09, v, 'bandpass', 1400, 1.2); },
  hat(t, open, v = 0.12) { this.noise(t, open ? 0.18 : 0.035, v, 'highpass', 7500); },
  sub(t, f, dur, v = 0.5) {
    const o = this.osc('sine', f * 1.5, t, dur, v, 0.004);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  },
  chord(t, notes, dur, type, v, filt, a = 0.01) {
    for (const n of notes) { this.osc(type, NOTE(n), t, dur, v, a, filt); this.osc(type, NOTE(n) * 1.004, t, dur, v * 0.6, a, filt); }
  },

  playStep(st, step, t, s16) {
    const s = step % 16, bar = this.bar;
    const chord = st.prog[bar % st.prog.length];
    const root = st.root;
    const m = this.motif[step % 32];
    const intro = this.songBars < 2;
    switch (this.station) {
      case 1: { // synthwave
        if (s % 4 === 0) this.kick(t, 0.8);
        if (s === 4 || s === 12) { this.snare(t, 0.4); this.noise(t, 0.35, 0.12, 'bandpass', 1200); }
        if (s % 2 === 1) this.hat(t, false, 0.08);
        if (s % 2 === 0) this.osc('sawtooth', NOTE(root + chord[0]), t, s16 * 1.6, 0.16, 0.005, 700);
        if (s === 0) this.chord(t, chord.map(n => n + root + 24), s16 * 15, 'sawtooth', 0.025, 1800, 0.12);
        if (!intro) this.osc('square', NOTE(root + 36 + chord[(s % 3)]), t, s16 * 0.8, 0.03, 0.003, 2600); // arpeggio
        if (!intro && m != null && bar % 4 >= 2) this.osc('sawtooth', NOTE(root + 36 + m), t, s16 * 1.8, 0.05, 0.01, 3000);
        break;
      }
      case 2: { // trap
        if (s === 0 || s === 10) this.sub(t, NOTE(root + chord[0] - 12), s16 * 6, 0.55);
        if (s === 0 || s === 10) this.kick(t, 0.7);
        if (s === 8) this.clap(t, 0.35);
        const roll = bar % 4 === 3 && s >= 12;
        if (roll) { this.hat(t, false, 0.08); this.hat(t + s16 / 3, false, 0.06); this.hat(t + 2 * s16 / 3, false, 0.06); }
        else if (s % 2 === 0) this.hat(t, false, 0.08);
        if (s === 0 && bar % 2 === 0) this.chord(t, chord.map(n => n + root + 24), s16 * 30, 'triangle', 0.035, 1500, 0.2);
        if (!intro && m != null && s % 2 === 0) this.osc('sine', NOTE(root + 36 + m), t, s16 * 1.5, 0.08, 0.005); // bell lead
        break;
      }
      case 3: { // reggae
        if (s === 8) { this.kick(t, 0.75); this.snare(t, 0.22); }
        if (s % 4 === 2) this.chord(t, chord.map(n => n + root + 12), s16 * 0.9, 'triangle', 0.05, 2200); // skank
        if (s % 2 === 0) this.hat(t, false, 0.05);
        const bassPat = [0, null, null, 0, null, null, 7, null, 0, null, 12, null, 7, null, null, null];
        if (bassPat[s] != null) this.osc('sine', NOTE(root - 12 + chord[0] + bassPat[s]), t, s16 * 1.8, 0.4, 0.008);
        if (!intro && m != null && bar % 4 < 2) { this.osc('sine', NOTE(root + 24 + m), t, s16 * 2, 0.07, 0.003); this.osc('sine', NOTE(root + 36 + m), t, s16, 0.025, 0.003); } // steel drum
        break;
      }
      case 4: { // country boom-chick
        if (s === 0 || s === 8) { this.kick(t, 0.5); this.osc('triangle', NOTE(root + chord[0] - 12), t, s16 * 3, 0.35); }
        if (s === 4 || s === 12) { this.snare(t, 0.18); this.osc('triangle', NOTE(root + chord[2] - 12), t, s16 * 3, 0.3); }
        if (s % 2 === 0) this.chord(t, chord.map(n => n + root + 12), s16 * 0.7, 'triangle', 0.025, 3000); // strum
        if (s % 4 === 2) this.hat(t, false, 0.05);
        if (!intro && m != null && bar % 8 >= 4) this.osc('square', NOTE(root + 24 + m), t, s16 * 1.6, 0.035, 0.004, 2000); // fiddle-ish
        break;
      }
      case 6: { // reggaeton dembow
        const s8 = s % 8;
        if (s8 === 0 || s8 === 4) this.kick(t, 0.75);
        if (s8 === 3 || s8 === 6) this.snare(t, 0.25);
        if (s % 2 === 0) this.hat(t, false, 0.06);
        if (s === 0 || s === 6 || s === 8 || s === 14) this.osc('sine', NOTE(root - 12 + chord[0]), t, s16 * 2, 0.45, 0.005);
        if (s === 0 && bar % 2 === 0) this.chord(t, chord.map(n => n + root + 24), s16 * 30, 'sawtooth', 0.018, 1400, 0.15);
        if (!intro && m != null) this.osc('triangle', NOTE(root + 24 + m), t, s16 * 0.9, 0.07, 0.003); // marimba-ish
        break;
      }
    }
  },

  // ---------------------------------------------------------------- talk radio
  talkLoop() {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      if (typeof UI !== 'undefined') UI.nowPlaying('WCTR Talk', 'Talk radio needs speech synthesis', 'not available in this browser');
      return;
    }
    if (this.station !== 5) return;
    const line = TALK[this.talkIdx++ % TALK.length];
    const u = new SpeechSynthesisUtterance(line);
    u.lang = 'en-US'; u.rate = 1.05; u.pitch = 0.9; u.volume = this.volume;
    const voices = synth.getVoices().filter(v => v.lang && v.lang.startsWith('en'));
    if (voices.length) u.voice = voices[this.talkIdx % voices.length];
    u.onend = () => { if (this.station === 5) setTimeout(() => this.talkLoop(), 900); };
    this.utter = u;
    synth.speak(u);
    if (typeof UI !== 'undefined') UI.nowPlaying('WCTR Talk', 'Leonida Today', 'Live');
  },
};
