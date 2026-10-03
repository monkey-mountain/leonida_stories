// HUD, menus, minimap, input and the main loop.
'use strict';

const $ = (id) => document.getElementById(id);

const UI = {
  helpT: 0, areaT: 0, vehT: 0, bigT: 0, subQueue: [], subT: 0, hudT: 0,

  init() {
    Render.init($('game'));
    this.mm = $('minimap').getContext('2d');
    this.buildTitle();
    this.buildGuide();
    this.bindInput();
    this.bindTouch();
    this.bindMenus();
    G.keysPressed = {};
    G.flashLights = [];
    // Build the world in the background of the title screen
    setTimeout(() => {
      G.world = new World(2026);
      $('title-loading').classList.add('hidden');
      $('title-buttons').classList.remove('hidden');
      this.titleCam = { x: 205 * T, y: 100 * T, t: 0 };
    }, 30);
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  frame(dt) {
    if (G.state === 'play') {
      update(dt);
      Render.draw();
      this.updateHud(dt);
      this.drawMinimap();
    } else if (G.state === 'title' && G.world) {
      // Slow flyover of Vice City behind the title screen
      const tc = this.titleCam;
      tc.t += dt;
      G.cam.x = tc.x + Math.sin(tc.t * 0.05) * 1800;
      G.cam.y = tc.y + Math.cos(tc.t * 0.04) * 1800;
      G.cam.zoom = Math.max(Render.W, Render.H) / 1400;
      G.time = (17.5 * 60 + tc.t * 4) % (24 * 60);
      G.player = G.player || newPlayer('lucia', -9999, -9999);
      G.player.x = -9999;
      Render.draw();
    } else if (G.state === 'pause') {
      Render.draw();
    }
    G.keysPressed = {};
    G.touch.actionPressed = false;
  },

  onGameStart() {
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('pause').classList.add('hidden');
    if (this.isTouch) $('touch').classList.remove('hidden');
    this.updateCharBadge();
    Sfx.init();
    const def = nextMission();
    if (def) this.help(`Mission marker: ${def.title}. Follow the yellow route on the minimap.`, 7);
  },

  // ---------------------------------------------------------------- HUD
  updateHud(dt) {
    const p = G.player;
    this.helpT -= dt; if (this.helpT <= 0) $('help').classList.remove('show');
    this.areaT -= dt; if (this.areaT <= 0) $('area').classList.remove('show');
    this.vehT -= dt; if (this.vehT <= 0) $('vehname').classList.remove('show');
    this.bigT -= dt; if (this.bigT <= 0) $('big').classList.remove('show');
    this.subT -= dt;
    if (this.subT <= 0) {
      const next = this.subQueue.shift();
      if (next) {
        const c = Object.values(LEONIDA.characters).find(ch => ch.short === next[0]);
        $('subtitle').innerHTML = `<b style="color:${c ? c.color : '#ffd400'}">${next[0]}:</b> ${escapeHtml(next[1])}`;
        $('subtitle').classList.add('show');
        this.subT = 3.5;
      } else $('subtitle').classList.remove('show');
    }
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const h = Math.floor(G.time / 60), m = Math.floor(G.time % 60);
    $('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${G.rain > 0.3 ? ' 🌧' : ''}`;
    $('money').textContent = '$' + G.money.toLocaleString();
    $('hp').style.width = clamp(p.health, 0, 100) + '%';
    $('ap').style.width = clamp(p.armor, 0, 100) + '%';
    $('ap').parentElement.style.opacity = p.armor > 0 ? 1 : 0.25;
    const wd = weaponDef(p.weapon);
    $('weapon-name').textContent = wd.name;
    $('ammo').textContent = p.weapon === 'fist' ? '' : (p.ammo[p.weapon] || 0);
    let stars = '';
    const blink = G.stars > 0 && G.unseen > 2 && Math.floor(G.t * 3) % 2 === 0;
    for (let i = 0; i < 5; i++) stars += `<span class="${i < G.stars ? (blink ? 'star blink' : 'star on') : 'star'}">★</span>`;
    $('stars').innerHTML = stars;
    const m2 = G.mission;
    if (m2 && m2.timer > 0) {
      $('timer').textContent = `${Math.floor(m2.timer / 60)}:${String(Math.floor(m2.timer % 60)).padStart(2, '0')}`;
      $('timer').classList.add('show');
    } else $('timer').classList.remove('show');
    if (p.vehicle) {
      $('speedo').classList.add('show');
      $('speedo').innerHTML = `${Math.round(p.vehicle.speed * 0.22)}<small> mph</small><div class="vhp"><div style="width:${clamp(p.vehicle.health / p.vehicle.spec.hp * 100, 0, 100)}%"></div></div>`;
    } else $('speedo').classList.remove('show');
  },

  help(text, dur = 3.5) { $('help').textContent = text; $('help').classList.add('show'); this.helpT = dur; },
  areaName(name) { $('area').textContent = name; $('area').classList.add('show'); this.areaT = 3.5; },
  vehicleName(name) {
    const st = G.radio ? LEONIDA.radio[G.radio] : '';
    $('vehname').innerHTML = `${escapeHtml(name)}${st ? `<small>📻 ${escapeHtml(st)}</small>` : ''}`;
    $('vehname').classList.add('show'); this.vehT = 3;
  },
  objective(text) {
    $('objective').textContent = text || '';
    $('objective').classList.toggle('show', !!text);
  },
  subtitles(lines) { this.subQueue.push(...lines); },
  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text; el.classList.add('show');
  },
  progress(f) {
    const el = $('progress');
    if (f < 0) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.firstElementChild.style.width = clamp(f * 100, 0, 100) + '%';
  },
  bigMessage(text, color, dur, kind, sub) {
    const el = $('big');
    el.querySelector('.big-title').textContent = text;
    el.querySelector('.big-title').style.color = color;
    el.querySelector('.big-sub').textContent = sub || '';
    el.className = 'show ' + (kind || '');
    this.bigT = dur;
  },
  flash() { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); },
  hurt() { const f = $('hurt'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); },
  starsBump() { const s = $('stars'); s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); },
  updateCharBadge() {
    const c = LEONIDA.characters[G.char];
    $('char-badge').innerHTML = `<span style="background:${c.color}"></span>${c.short}`;
  },

  // ---------------------------------------------------------------- minimap
  drawMinimap() {
    const g = this.mm, S = 200, span = 80, s = S / span;
    const p = G.player, w = G.world;
    const ptx = p.x / T, pty = p.y / T;
    g.fillStyle = '#286e9f';
    g.fillRect(0, 0, S, S);
    g.imageSmoothingEnabled = false;
    const sx = ptx - span / 2, sy = pty - span / 2;
    const cx0 = Math.max(0, sx), cy0 = Math.max(0, sy), cx1 = Math.min(MW, sx + span), cy1 = Math.min(MH, sy + span);
    if (cx1 > cx0 && cy1 > cy0) g.drawImage(w.minimap, cx0, cy0, cx1 - cx0, cy1 - cy0, (cx0 - sx) * s, (cy0 - sy) * s, (cx1 - cx0) * s, (cy1 - cy0) * s);
    const toMM = (wx, wy) => [(wx / T - sx) * s, (wy / T - sy) * s];
    this.drawMapOverlay(g, toMM, S, 1);
  },

  drawMapOverlay(g, toMM, S, scale) {
    const p = G.player;
    const edge = (x, y) => {
      const c = S / 2, dx = x - c, dy = y - c, r = S / 2 - 8;
      const d = Math.hypot(dx, dy);
      return d > r && scale === 1 ? [c + dx / d * r, c + dy / d * r] : [x, y];
    };
    // GPS route
    if (G.gps && G.gps.length > 1) {
      g.strokeStyle = G.mission ? '#ffd400' : '#c56cf0';
      g.lineWidth = 3 * scale; g.lineJoin = 'round';
      g.beginPath();
      const [px, py] = toMM(p.x, p.y);
      g.moveTo(px, py);
      for (const id of G.gps) { const n = G.world.nodes[id]; const [x, y] = toMM(n.x, n.y); g.lineTo(x, y); }
      const tgt = missionTarget() || G.waypoint;
      if (tgt) { const [x, y] = toMM(tgt.x, tgt.y); g.lineTo(x, y); }
      g.stroke();
    }
    const dot = (wx, wy, col, r = 4, clampEdge = false, label) => {
      let [x, y] = toMM(wx, wy);
      if (clampEdge) [x, y] = edge(x, y);
      else if (x < -5 || y < -5 || x > S + 5 || y > S + 5) return;
      g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, r * scale, 0, TAU); g.fill(); g.stroke();
      if (label) { g.fillStyle = '#000'; g.font = `bold ${9 * scale}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y + 0.5); }
    };
    for (const s of G.world.stores) if (s.cooldown <= G.t) dot(s.x, s.y, '#2ecc71', 3);
    for (const sh of SAFEHOUSES) { const pos = nodePos(sh.at); dot(pos.x, pos.y, '#4aa3ff', 5, false, 'H'); }
    for (const v of G.vehicles) if (v.type === 'police' && v.mode === 'chase') dot(v.x, v.y, Math.floor(G.t * 6) % 2 ? '#ff3b3b' : '#3b7bff', 3);
    for (const e of G.peds) if (!e.dead && (e.kind === 'gang' && e.mission || e.kind === 'cop' && G.stars > 0)) dot(e.x, e.y, e.kind === 'gang' ? '#ff3b3b' : '#3b7bff', 2.5);
    if (G.heli) dot(G.heli.x, G.heli.y, '#3b7bff', 4);
    if (!G.mission) {
      const def = nextMission();
      if (def) {
        const pos = nodePos(def.start);
        dot(pos.x, pos.y, def.char === 'any' ? '#ffd400' : LEONIDA.characters[def.char].color, 6, true, def.char === 'any' ? '★' : def.char[0].toUpperCase());
      }
    }
    const tgt = missionTarget();
    if (tgt) dot(tgt.x, tgt.y, '#ffd400', 5, true);
    if (G.waypoint) dot(G.waypoint.x, G.waypoint.y, '#c56cf0', 5, true);
    // player arrow
    const [px, py] = toMM(p.x, p.y);
    g.save(); g.translate(px, py); g.rotate(p.vehicle ? p.vehicle.a : p.a);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(8 * scale, 0); g.lineTo(-5 * scale, -5 * scale); g.lineTo(-2 * scale, 0); g.lineTo(-5 * scale, 5 * scale); g.closePath(); g.fill(); g.stroke();
    g.restore();
  },

  drawBigMap() {
    const cv = $('bigmap'), g = cv.getContext('2d');
    const S = cv.width, s = S / MW;
    g.imageSmoothingEnabled = false;
    g.drawImage(G.world.minimap, 0, 0, S, S);
    for (const r of LEONIDA.regions) {
      const [x0, y0, x1, y1] = r.rect;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.font = `bold ${Math.round(S / 52)}px sans-serif`;
      g.textAlign = 'center';
      const cx = (x0 + x1) / 2 * s, cy = (y0 + y1) / 2 * s + S * 0.04;
      const words = r.name.toUpperCase().split(' ');
      const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [words.join(' ')];
      lines.forEach((ln, i) => {
        const ly = cy + i * S / 44;
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillText(ln, cx + 1, ly + 1);
        g.fillStyle = '#fff';
        g.fillText(ln, cx, ly);
      });
    }
    this.drawMapOverlay(g, (wx, wy) => [wx / T * s, wy / T * s], S, 1.6);
  },

  // ---------------------------------------------------------------- menus
  buildTitle() {
    const save = loadSave();
    $('btn-continue').classList.toggle('hidden', !save);
    const cards = Object.values(LEONIDA.characters).map(c => `
      <div class="char-card" style="--c:${c.color}">
        <div class="char-avatar" style="background:${c.color}"><span style="background:${c.skin}"></span></div>
        <h3>${c.name}</h3><p>${c.bio}</p>
      </div>`).join('');
    $('title-chars').innerHTML = cards;
  },

  buildGuide() {
    const I = LEONIDA.info;
    const regions = LEONIDA.regions.map(r => `<li><b style="color:${r.color}">${r.name}</b> — ${r.desc}</li>`).join('');
    const chars = Object.values(LEONIDA.characters).map(c => `<li><b style="color:${c.color}">${c.name}</b> — ${c.bio}</li>`).join('');
    const sup = I.supporting.map(([n, d]) => `<li><b>${n}</b> — ${d}</li>`).join('');
    const veh = Object.values(LEONIDA.vehicles).map(v => `<li><b>${v.name}</b> — top speed ${Math.round(v.maxSpeed * 0.22)} mph</li>`).join('');
    const html = `
      <p class="muted">Facts about the real game, collected from public sources (Rockstar's announcements, trailers and press). Gameplay in this web app is fan-made and fictional.</p>
      <div class="facts">
        <div><span>Game</span>${I.title}</div>
        <div><span>Developer</span>${I.developer}</div>
        <div><span>Release</span>${I.release}</div>
        <div><span>Platforms</span>${I.platforms}</div>
        <div><span>Setting</span>${I.state}</div>
      </div>
      <h4>Timeline</h4><ul>${I.trailers.map(t => `<li>${t}</li>`).join('')}${I.delays.map(t => `<li>${t}</li>`).join('')}</ul>
      <h4>Protagonists</h4><ul>${chars}</ul>
      <h4>Supporting cast</h4><ul>${sup}</ul>
      <h4>Regions of Leonida</h4><ul>${regions}</ul>
      <h4>Vehicles in this web app</h4><ul class="cols">${veh}</ul>`;
    for (const el of document.querySelectorAll('.guide-content')) el.innerHTML = html;
  },

  buildMissions() {
    const next = nextMission();
    $('missions-list').innerHTML = LEONIDA.missions.map(m => {
      const done = G.completed.has(m.id);
      const who = m.char === 'any' ? 'Lucia & Jason' : LEONIDA.characters[m.char].short;
      const status = done ? '✔ Complete' : m === next ? '● Available' : '🔒 Locked';
      return `<div class="mission ${done ? 'done' : m === next ? 'next' : ''}"><b>${m.title}</b><span>${who} · $${m.reward.toLocaleString()}</span><em>${status}</em></div>`;
    }).join('');
    $('stats').innerHTML = `Missions: ${G.completed.size}/${LEONIDA.missions.length} · Cash: $${G.money.toLocaleString()} · Playing as ${LEONIDA.characters[G.char].name}`;
  },

  pause(tab = 'map') {
    if (G.state !== 'play') return;
    G.state = 'pause';
    $('pause').classList.remove('hidden');
    this.showTab(tab);
    Sfx.setStation(0);
  },

  resume() {
    if (G.state !== 'pause') return;
    G.state = 'play';
    $('pause').classList.add('hidden');
    $('phone').classList.add('hidden');
    if (G.player.vehicle && G.radio) Sfx.setStation(G.radio);
  },

  showTab(tab) {
    for (const b of document.querySelectorAll('#pause .tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
    for (const p of document.querySelectorAll('#pause .tab')) p.classList.toggle('hidden', p.id !== 'tab-' + tab);
    if (tab === 'map') this.drawBigMap();
    if (tab === 'missions') this.buildMissions();
  },

  openPhone() {
    if (G.state !== 'play') return;
    G.state = 'pause';
    const feed = LEONIDA.newsFeed.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    $('phone-feed').innerHTML = feed.map(([u, t]) => `<div class="post"><b>${u}</b><p>${escapeHtml(t)}</p></div>`).join('');
    $('phone').classList.remove('hidden');
  },

  bindMenus() {
    $('btn-new').onclick = () => {
      if (loadSave() && !confirm('Start a new game? Your saved progress will be overwritten when you save.')) return;
      Sfx.init(); initGame(null);
    };
    $('btn-continue').onclick = () => { Sfx.init(); initGame(loadSave()); };
    $('btn-guide').onclick = () => $('guide-modal').classList.remove('hidden');
    $('btn-controls').onclick = () => $('controls-modal').classList.remove('hidden');
    for (const b of document.querySelectorAll('.modal .close')) b.onclick = () => b.closest('.modal').classList.add('hidden');
    for (const b of document.querySelectorAll('#pause .tabs button')) b.onclick = () => this.showTab(b.dataset.tab);
    $('btn-resume').onclick = () => this.resume();
    $('btn-save').onclick = () => { if (G.mission) return alert('You can\'t save during a mission.'); saveGame(); this.resume(); };
    $('btn-quit').onclick = () => {
      $('pause').classList.add('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
      $('title').classList.remove('hidden');
      this.buildTitle();
      G.state = 'title'; G.vehicles = []; G.peds = []; G.heli = null; G.mission = null;
      Sfx.setStation(0);
    };
    $('opt-mute').onchange = (e) => Sfx.setMuted(e.target.checked);
    $('bigmap').addEventListener('click', (e) => {
      const r = e.target.getBoundingClientRect();
      const tx = (e.clientX - r.left) / r.width * MW, ty = (e.clientY - r.top) / r.height * MH;
      const free = G.world.nearestNode(tx * T, ty * T);
      if (!free) return;
      G.waypoint = { x: free.x, y: free.y };
      G.gpsT = 0;
      this.drawBigMap();
      this.help('Waypoint set.');
    });
    $('btn-clear-wp').onclick = () => { G.waypoint = null; this.drawBigMap(); };
    $('phone-close').onclick = () => this.resume();
    $('phone-save').onclick = () => { if (G.mission) return; saveGame(); };
  },

  // ---------------------------------------------------------------- input
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      G.keys[e.code] = true;
      G.keysPressed[e.code] = true;
      Sfx.init();
      if (G.state === 'play') {
        switch (e.code) {
          case 'KeyF': case 'Enter': if (!G.player.dead) enterOrExitVehicle(); break;
          case 'Tab': switchCharacter(); this.updateCharBadge(); break;
          case 'KeyQ': cycleWeapon(1); break;
          case 'KeyR': this.nextRadio(); break;
          case 'KeyM': this.pause('map'); break;
          case 'Escape': case 'KeyP': this.pause('missions'); break;
          case 'KeyT': this.openPhone(); break;
          case 'KeyN': Sfx.setMuted(!Sfx.muted); $('opt-mute').checked = Sfx.muted; this.help(Sfx.muted ? 'Sound off' : 'Sound on'); break;
          case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': {
            const w = LEONIDA.weapons[+e.code.slice(5) - 1];
            if (w && G.player.ammo[w.id] > 0) G.player.weapon = w.id;
            break;
          }
        }
      } else if (G.state === 'pause' && (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyM' || e.code === 'KeyT')) this.resume();
    });
    window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
    window.addEventListener('blur', () => { G.keys = {}; G.mouse.down = false; });
    const cv = $('game');
    cv.addEventListener('mousemove', (e) => { G.mouse.x = e.clientX; G.mouse.y = e.clientY; G.mouse.moved = G.t; });
    cv.addEventListener('mousedown', (e) => { if (e.button === 0) { G.mouse.down = true; G.mouse.moved = G.t; } Sfx.init(); });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) G.mouse.down = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { if (G.state === 'play') cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  },

  nextRadio() {
    G.radio = (G.radio + 1) % LEONIDA.radio.length;
    if (G.player.vehicle) {
      Sfx.setStation(G.radio);
      this.vehicleName(G.player.vehicle.spec.name);
      if (!G.radio) this.help('Radio off');
    } else this.help(`Radio preset: ${LEONIDA.radio[G.radio]}`);
  },

  bindTouch() {
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const zone = $('joy-zone'), knob = $('joy-knob'), base = $('joy-base');
    let id = null, ox = 0, oy = 0;
    zone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      id = t.identifier; ox = t.clientX; oy = t.clientY;
      G.touch.active = true;
      base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('show');
      Sfx.init();
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        let dx = t.clientX - ox, dy = t.clientY - oy;
        const d = Math.hypot(dx, dy), max = 55;
        if (d > max) { dx = dx / d * max; dy = dy / d * max; }
        G.touch.jx = dx / max; G.touch.jy = dy / max;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        id = null; G.touch.jx = 0; G.touch.jy = 0;
        knob.style.transform = ''; base.classList.remove('show');
      }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    const btn = (elId, down, up) => {
      const el = $(elId);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); G.touch.active = true; el.classList.add('down'); down(); Sfx.init(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('down'); if (up) up(); }, { passive: false });
    };
    btn('t-fire', () => { G.touch.fire = true; }, () => { G.touch.fire = false; });
    btn('t-enter', () => { if (G.state === 'play' && !G.player.dead) enterOrExitVehicle(); });
    btn('t-action', () => { G.touch.action = true; G.touch.actionPressed = true; }, () => { G.touch.action = false; });
    btn('t-brake', () => { G.touch.brake = true; }, () => { G.touch.brake = false; });
    btn('t-weapon', () => cycleWeapon(1));
    btn('t-map', () => this.pause('map'));
    btn('t-switch', () => { switchCharacter(); this.updateCharBadge(); });
    btn('t-radio', () => this.nextRadio());
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

window.addEventListener('load', () => UI.init());

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
