// Rendering of the game world, lighting and weather.
'use strict';

const Render = {
  W: 0, H: 0, dpr: 1, canvas: null, g: null, light: null, lg: null,

  init(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lg = this.light.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    this.light.width = Math.ceil(this.W / 2); this.light.height = Math.ceil(this.H / 2);
  },

  darkness() {
    const h = G.time / 60;
    if (h >= 7 && h < 18.5) return 0;
    if (h >= 18.5 && h < 21) return (h - 18.5) / 2.5 * 0.68;
    if (h >= 5 && h < 7) return (1 - (h - 5) / 2) * 0.68;
    return 0.68;
  },

  draw() {
    const g = this.g, w = G.world, cam = G.cam, z = cam.zoom * this.dpr;
    const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1c78ad';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const ox = this.W * this.dpr / 2 - (cam.x + sx) * z, oy = this.H * this.dpr / 2 - (cam.y + sy) * z;
    g.setTransform(z, 0, 0, z, ox, oy);
    g.imageSmoothingEnabled = true;

    // visible world rect
    const vw = this.W / cam.zoom, vh = this.H / cam.zoom;
    const x0 = cam.x - vw / 2 - 64, y0 = cam.y - vh / 2 - 64, x1 = cam.x + vw / 2 + 64, y1 = cam.y + vh / 2 + 64;
    const cs = CHUNK * T;
    for (let cy = Math.max(0, Math.floor(y0 / cs)); cy <= Math.min(MH / CHUNK - 1, Math.floor(y1 / cs)); cy++) {
      for (let cx = Math.max(0, Math.floor(x0 / cs)); cx <= Math.min(MW / CHUNK - 1, Math.floor(x1 / cs)); cx++) {
        g.drawImage(w.getChunk(cx, cy), cx * cs, cy * cs);
      }
    }
    const inView = (e, m = 60) => e.x > x0 - m && e.x < x1 + m && e.y > y0 - m && e.y < y1 + m;

    // animated water sparkle
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 40; i++) {
      const px = x0 + ((i * 397 + Math.floor(G.t * 0.5) * 131) % Math.max(1, (x1 - x0)));
      const py = y0 + ((i * 211 + Math.floor(G.t * 0.5) * 71) % Math.max(1, (y1 - y0)));
      if (w.tileAt(px, py) === TILE.WATER) g.fillRect(px, py, 6, 1.5);
    }

    // decals
    for (const d of G.decals) {
      if (!inView(d)) continue;
      if (d.kind === 'blood') {
        g.fillStyle = 'rgba(120,0,0,0.6)';
        g.beginPath(); g.ellipse(d.x, d.y, 12 * d.s, 9 * d.s, d.s, 0, TAU); g.fill();
      } else if (d.kind === 'scorch') {
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.beginPath(); g.arc(d.x, d.y, 40 * d.s, 0, TAU); g.fill();
      } else if (d.kind === 'skid') {
        g.save(); g.translate(d.x, d.y); g.rotate(d.a);
        g.fillStyle = 'rgba(20,20,20,0.35)'; g.fillRect(-4, -2, 8, 4);
        g.restore();
      }
    }

    // markers
    this.drawMarkers(g, inView);

    // pickups
    for (const pk of G.pickups) {
      if (pk.respawn > 0 || !inView(pk)) continue;
      const bob = Math.sin(G.t * 4 + pk.x) * 3;
      g.save(); g.translate(pk.x, pk.y + bob);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(2, 10 - bob, 10, 4, 0, 0, TAU); g.fill();
      const col = { health: '#e74c3c', armor: '#3498db', cash: '#2ecc71' }[pk.type] || '#f39c12';
      g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText({ health: '+', armor: 'A', cash: '$', pistol: 'P', smg: 'S', shotgun: 'SG', rifle: 'R' }[pk.type], 0, 1);
      g.restore();
    }

    // dead peds then alive
    for (const e of G.peds) if (e.dead && inView(e)) e.draw(g);
    for (const v of G.vehicles) if (inView(v, 80)) v.draw(g, G.t);
    for (const e of G.peds) if (!e.dead && inView(e)) e.draw(g);
    if (!G.player.vehicle && !G.player.dead) this.drawPlayer(g);
    if (G.player.dead && !G.player.vehicle) this.drawPlayer(g, true);

    // tracers
    g.strokeStyle = 'rgba(255,230,150,0.85)'; g.lineWidth = 1.5;
    g.beginPath();
    for (const tr of G.tracers) { g.moveTo(tr.x0, tr.y0); g.lineTo(tr.x1, tr.y1); }
    g.stroke();

    for (const pt of G.particles) if (inView(pt)) pt.draw(g);

    if (G.heli) this.drawHeli(g, G.heli);

    // lighting
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.drawLighting(g, x0, y0, x1, y1);
    if (G.rain > 0.02) this.drawRain(g);
  },

  drawPlayer(g, dead) {
    const p = G.player, c = LEONIDA.characters[p.char];
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.a);
    if (dead) {
      g.fillStyle = c.color; g.fillRect(-10, -5, 16, 10);
      g.fillStyle = c.skin; g.beginPath(); g.arc(9, 0, 5, 0, TAU); g.fill();
      g.restore(); return;
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(3, 3, 10, 10, 0, 0, TAU); g.fill();
    const sw = Math.sin(p.walk) * 5 * Math.min(1, p.speed / 60);
    g.fillStyle = '#222'; g.fillRect(-3 + sw, -7, 7, 4); g.fillRect(-3 - sw, 3, 7, 4);
    g.fillStyle = c.color; g.beginPath(); g.ellipse(0, 0, 7, 11, 0, 0, TAU); g.fill();
    if (p.weapon !== 'fist') {
      g.fillStyle = '#111';
      const len = { pistol: 12, smg: 15, shotgun: 20, rifle: 22 }[p.weapon] || 12;
      g.fillRect(4, 3, len, 3);
    }
    g.fillStyle = c.skin; g.beginPath(); g.arc(6, 5, 2.8, 0, TAU); g.fill();
    g.beginPath(); g.arc(1, 0, 6, 0, TAU); g.fill();
    g.fillStyle = c.hair;
    if (p.char === 'lucia') { g.beginPath(); g.arc(-1, 0, 6, Math.PI * 0.45, Math.PI * 1.55); g.fill(); g.fillRect(-9, -3, 5, 6); }
    else { g.beginPath(); g.arc(-0.5, 0, 5.5, Math.PI * 0.55, Math.PI * 1.45); g.fill(); }
    g.restore();
  },

  drawHeli(g, h) {
    g.save();
    g.translate(h.x, h.y);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(40, 40, 30, 14, h.a, 0, TAU); g.fill();
    g.rotate(h.a);
    g.fillStyle = '#1b2433';
    g.beginPath(); g.ellipse(0, 0, 24, 12, 0, 0, TAU); g.fill();
    g.fillRect(-48, -3, 30, 6);
    g.fillStyle = '#f4f4f4'; g.fillRect(-10, -12, 16, 3); g.fillRect(-10, 9, 16, 3);
    g.fillStyle = '#7fb4ff'; g.beginPath(); g.ellipse(12, 0, 8, 8, 0, -1.2, 1.2); g.fill();
    g.strokeStyle = 'rgba(200,200,200,0.6)'; g.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      const a = h.rot + k * Math.PI / 2;
      g.beginPath(); g.moveTo(Math.cos(a) * -40, Math.sin(a) * -40); g.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); g.stroke();
    }
    g.restore();
  },

  drawMarkers(g, inView) {
    const pulse = 1 + Math.sin(G.t * 4) * 0.12;
    const ring = (x, y, col, r = 26, label) => {
      g.save(); g.translate(x, y);
      g.fillStyle = col; g.globalAlpha = 0.25;
      g.beginPath(); g.arc(0, 0, r * pulse, 0, TAU); g.fill();
      g.globalAlpha = 0.9; g.strokeStyle = col; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, r * pulse, 0, TAU); g.stroke();
      if (label) {
        g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label, 0, 1);
      }
      g.restore();
    };
    // mission start
    if (!G.mission) {
      const def = nextMission();
      if (def) {
        const pos = nodePos(def.start);
        const col = def.char === 'any' ? '#ffd400' : LEONIDA.characters[def.char].color;
        if (inView(pos)) ring(pos.x, pos.y, col, 30, def.char === 'any' ? '★' : def.char[0].toUpperCase());
      }
      for (const sh of SAFEHOUSES) { const pos = nodePos(sh.at); if (inView(pos)) ring(pos.x, pos.y, '#4aa3ff', 20, '⌂'); }
    }
    for (const s of G.world.stores) if (inView(s) && s.cooldown <= G.t) ring(s.x, s.y, '#2ecc71', 14, '$');
    const t = missionTarget();
    if (t && inView(t)) {
      const isEnt = t instanceof Vehicle || t instanceof Ped;
      if (isEnt) {
        g.fillStyle = '#ffd400';
        g.beginPath(); g.moveTo(t.x, t.y - 34 + Math.sin(G.t * 6) * 4); g.lineTo(t.x - 9, t.y - 50); g.lineTo(t.x + 9, t.y - 50); g.closePath(); g.fill();
      } else ring(t.x, t.y, '#ffd400', 34);
    }
    if (G.mission && G.mission.step.type === 'kill') {
      for (const e of G.mission.gang) if (!e.dead && inView(e)) {
        g.fillStyle = '#ff3b3b';
        g.beginPath(); g.moveTo(e.x, e.y - 18); g.lineTo(e.x - 6, e.y - 28); g.lineTo(e.x + 6, e.y - 28); g.closePath(); g.fill();
      }
    }
    if (G.waypoint && inView(G.waypoint)) ring(G.waypoint.x, G.waypoint.y, '#c56cf0', 22);
  },

  drawLighting(g, x0, y0, x1, y1) {
    const dark = this.darkness();
    const rainDim = G.rain * 0.25;
    if (dark + rainDim < 0.02 && !G.flashLights.length) return;
    const lg = this.lg, L = this.light;
    const s = 0.5; // light map is half resolution
    const z = G.cam.zoom;
    const toL = (wx, wy) => [((wx - G.cam.x) * z + this.W / 2) * s, ((wy - G.cam.y) * z + this.H / 2) * s];
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, L.width, L.height);
    lg.fillStyle = `rgba(8,12,38,${Math.min(0.8, dark + rainDim)})`;
    lg.fillRect(0, 0, L.width, L.height);
    lg.globalCompositeOperation = 'destination-out';
    const glow = (wx, wy, r, a = 1) => {
      const [lx, ly] = toL(wx, wy);
      const rr = r * z * s;
      if (lx < -rr || ly < -rr || lx > L.width + rr || ly > L.height + rr) return;
      const grd = lg.createRadialGradient(lx, ly, 0, lx, ly, rr);
      grd.addColorStop(0, `rgba(0,0,0,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = grd;
      lg.beginPath(); lg.arc(lx, ly, rr, 0, TAU); lg.fill();
    };
    if (dark > 0.05) {
      for (const lamp of G.world.lamps) if (lamp.x > x0 && lamp.x < x1 && lamp.y > y0 && lamp.y < y1) glow(lamp.x, lamp.y, 150, 0.85);
      for (const v of G.vehicles) {
        if (v.wreck || v.ctrl === 'none' || v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1) continue;
        const c = Math.cos(v.a), sn = Math.sin(v.a);
        glow(v.x + c * 70, v.y + sn * 70, 80, 0.9);
        glow(v.x + c * 140, v.y + sn * 140, 90, 0.6);
      }
      glow(G.player.x, G.player.y, 110, 0.7);
      for (const s2 of G.world.stores) if (s2.x > x0 && s2.x < x1 && s2.y > y0 && s2.y < y1) glow(s2.x, s2.y, 70, 0.7);
      if (G.heli) glow(G.player.x + Math.sin(G.t) * 20, G.player.y + Math.cos(G.t) * 20, 120, 1);
    }
    for (const f of G.flashLights) glow(f.x, f.y, f.r, 1);
    lg.globalCompositeOperation = 'source-over';
    g.drawImage(L, 0, 0, this.canvas.width, this.canvas.height);
    // warm colour for neon nights in Vice City
    if (dark > 0.3 && G.region && G.region.id === 'vice') {
      g.fillStyle = `rgba(255,40,140,${(dark - 0.3) * 0.12})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  drawRain(g) {
    const n = Math.floor(220 * G.rain);
    g.strokeStyle = 'rgba(180,200,230,0.45)';
    g.lineWidth = 1 * this.dpr;
    g.beginPath();
    const W = this.canvas.width, H = this.canvas.height;
    for (let i = 0; i < n; i++) {
      const x = (i * 7919 + G.t * 300 * (1 + (i % 3) * 0.2)) % W;
      const y = (i * 104729 + G.t * 1400 * (1 + (i % 5) * 0.1)) % H;
      g.moveTo(x, y); g.lineTo(x - 4 * this.dpr, y + 16 * this.dpr);
    }
    g.stroke();
    g.fillStyle = `rgba(40,50,70,${G.rain * 0.12})`;
    g.fillRect(0, 0, W, H);
  },
};
