// Core game loop and systems: player, traffic, police, crime, missions.
'use strict';

const HEAT_STARS = [1, 4, 10, 22, 40];
const HOSPITALS = [[16, 6], [15, 19], [10, 12], [3, 5], [11, 4], [6, 12]];
const SAFEHOUSES = [{ at: [17, 7], name: 'Vice City Safehouse' }, { at: [17, 19], name: 'Brian\'s Place (Keys)' }];

const G = {
  state: 'title',
  t: 0,
  vehicles: [], peds: [], bullets: [], particles: [], decals: [], tracers: [], pickups: [],
  heli: null,
  heat: 0, stars: 0, lastSeen: 0,
  money: 0,
  time: 9 * 60,
  rain: 0, rainTarget: 0, weatherT: 120,
  keys: {}, mouse: { x: 0, y: 0, down: false, moved: -10 },
  touch: { active: false, jx: 0, jy: 0, fire: false, brake: false },
  cam: { x: 0, y: 0, zoom: 1, shake: 0 },
  mission: null,
  completed: new Set(),
  char: 'lucia',
  chars: {},
  radio: 0,
  waypoint: null,
  gps: null, gpsT: 0,
  robbing: null,
  bustT: 0,
  messageT: 0,
  region: null,
};

// ------------------------------------------------------------------ setup
function nodePos(at) {
  const nd = G.world.node(at[0], at[1]) || G.world.nearestNode((at[0] * GRID + 1) * T, (at[1] * GRID + 1) * T);
  return { x: nd.x, y: nd.y };
}

function newPlayer(char, x, y) {
  return {
    char, x, y, a: 0, r: 10, health: 100, armor: 0, vehicle: null,
    ammo: { fist: Infinity, pistol: 48 }, weapon: 'pistol', cool: 0, walk: 0, speed: 0, dead: false,
  };
}

function initGame(saveData) {
  if (!G.world) G.world = new World(2026);
  const w = G.world;
  G.vehicles = []; G.peds = []; G.bullets = []; G.particles = []; G.decals = []; G.tracers = [];
  G.heli = null; G.heat = 0; G.stars = 0; G.mission = null; G.robbing = null; G.waypoint = null;
  G.pickups = LEONIDA.pickups.map(([type, tx, ty]) => {
    const p = w.nearestFree((tx + 0.5) * T, (ty + 0.5) * T, false);
    return { type, x: p.x, y: p.y, respawn: 0 };
  });
  for (const lot of w.lots) lot.spawned = false;
  for (const s of w.stores) s.cooldown = 0;

  const start = nodePos([9, 4]);
  const jStart = nodePos([17, 7]);
  if (saveData) {
    G.money = saveData.money;
    G.completed = new Set(saveData.completed);
    G.time = saveData.time;
    G.char = saveData.char;
    G.chars = saveData.chars;
    for (const c of Object.values(G.chars)) c.ammo = Object.assign({ fist: Infinity }, c.ammo);
  } else {
    G.money = 500;
    G.completed = new Set();
    G.time = 9 * 60;
    G.char = 'lucia';
    G.chars = {
      lucia: { x: start.x + 40, y: start.y + 40, health: 100, armor: 0, ammo: { fist: Infinity, pistol: 36 }, weapon: 'pistol' },
      jason: { x: jStart.x + 40, y: jStart.y + 40, health: 100, armor: 0, ammo: { fist: Infinity, pistol: 60, shotgun: 12 }, weapon: 'pistol' },
    };
  }
  loadChar(G.char);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  G.state = 'play';
  UI.onGameStart();
}

function loadChar(id) {
  const c = G.chars[id];
  const p = newPlayer(id, c.x, c.y);
  const free = G.world.nearestFree(c.x, c.y, false);
  p.x = free.x; p.y = free.y;
  p.health = c.health; p.armor = c.armor; p.ammo = c.ammo; p.weapon = c.weapon in c.ammo ? c.weapon : 'fist';
  G.player = p;
  G.char = id;
}

function storeChar() {
  const p = G.player;
  G.chars[G.char] = { x: p.x, y: p.y, health: p.health, armor: p.armor, ammo: p.ammo, weapon: p.weapon };
}

function switchCharacter() {
  if (G.mission) return UI.help('You can\'t switch characters during a mission.');
  if (G.stars > 0) return UI.help('Lose the cops before switching characters.');
  if (G.player.vehicle) exitVehicle(true);
  storeChar();
  const next = G.char === 'lucia' ? 'jason' : 'lucia';
  loadChar(next);
  G.vehicles = G.vehicles.filter(v => v.mission);
  G.peds = G.peds.filter(p => p.mission);
  for (const lot of G.world.lots) lot.spawned = false;
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  UI.flash();
  UI.help(`Switched to ${LEONIDA.characters[next].name}.`);
}

function saveGame(silent) {
  storeChar();
  const data = {
    v: 1, money: G.money, completed: [...G.completed], time: G.time, char: G.char,
    chars: JSON.parse(JSON.stringify(G.chars, (k, v) => (v === Infinity ? undefined : v))),
  };
  try { localStorage.setItem('leonida-save', JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  if (!silent) UI.help('Game saved.');
}

function loadSave() {
  try {
    const raw = localStorage.getItem('leonida-save');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ------------------------------------------------------------------ crime
function addHeat(n) {
  G.heat = Math.min(60, G.heat + n);
  const before = G.stars;
  G.stars = HEAT_STARS.filter(h => G.heat >= h).length;
  if (G.stars > before) { G.lastSeen = G.t; UI.starsBump(); }
}

function setMinStars(s) {
  if (G.stars >= s) { G.lastSeen = G.t; return; }
  G.heat = HEAT_STARS[s - 1];
  G.stars = s;
  G.lastSeen = G.t;
  UI.starsBump();
}

function clearWanted() {
  G.heat = 0; G.stars = 0;
  for (const v of G.vehicles) if (v.ctrl === 'police') v.mode = 'patrol';
}

function copNearby(radius) {
  const p = G.player;
  for (const v of G.vehicles) if (v.type === 'police' && v.ctrl === 'police' && dist(v, p) < radius) return true;
  for (const c of G.peds) if (c.kind === 'cop' && !c.dead && dist(c, p) < radius) return true;
  return false;
}

function panicAround(x, y, radius) {
  for (const p of G.peds) {
    if (p.dead || p.kind !== 'civ') continue;
    if (Math.hypot(p.x - x, p.y - y) < radius) {
      p.state = 'flee'; p.t = rand(4, 8); p.fx = x; p.fy = y;
    }
  }
  for (const v of G.vehicles) if (v.ctrl === 'traffic' && Math.hypot(v.x - x, v.y - y) < radius) v.panic = 6;
}

// ------------------------------------------------------------------ combat
function weaponDef(id) { return LEONIDA.weapons.find(w => w.id === id); }

function fire(shooter, x, y, a, wid, owner) {
  const wd = weaponDef(wid);
  if (wd.pellets === 0) {
    // melee
    Sfx.punch();
    for (const p of G.peds) {
      if (p.dead || p === shooter) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      const ang = Math.abs(wrapAngle(Math.atan2(p.y - y, p.x - x) - a));
      if (d < wd.range + 6 && ang < 1) hitPed(p, wd.dmg, owner, Math.cos(a) * 120, Math.sin(a) * 120);
    }
    return;
  }
  Sfx.shot(owner === 'player' ? 0.35 : 0.2 * proximityVol(x, y), wid);
  for (let k = 0; k < wd.pellets; k++) {
    const aa = a + rand(-wd.spread, wd.spread);
    G.bullets.push({
      x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 14, px: x, py: y,
      vx: Math.cos(aa) * wd.speed, vy: Math.sin(aa) * wd.speed,
      life: wd.range / wd.speed, dmg: owner === 'player' ? wd.dmg : wd.dmg * 0.55, owner, shooter,
    });
  }
  G.particles.push(new Particle(x + Math.cos(a) * 16, y + Math.sin(a) * 16, 0, 0, 0.06, 6, '#ffe28a'));
  G.flashLights.push({ x, y, r: 90, t: 0.06 });
  panicAround(x, y, 380);
  if (owner === 'player' && G.stars === 0) {
    const witnesses = G.peds.some(p => !p.dead && p.kind === 'civ' && dist(p, G.player) < 350);
    if (witnesses || copNearby(500)) addHeat(0.25);
  }
}

function proximityVol(x, y) {
  return clamp(1 - Math.hypot(x - G.player.x, y - G.player.y) / 900, 0.05, 1);
}

function hitPed(p, dmg, owner, kx = 0, ky = 0) {
  if (p.dead) return;
  p.health -= dmg;
  p.x += kx * 0.05; p.y += ky * 0.05;
  for (let i = 0; i < 3; i++) G.particles.push(new Particle(p.x, p.y, rand(-60, 60), rand(-60, 60), 0.4, 2.5, '#9b0d0d'));
  if (p.kind === 'civ') { p.state = 'flee'; p.t = 6; p.fx = G.player.x; p.fy = G.player.y; }
  if (p.kind === 'cop' && owner === 'player') { p.state = 'chase'; addHeat(1); }
  if (p.kind === 'gang') p.state = 'attack';
  if (p.health <= 0) killPed(p, owner);
}

function killPed(p, owner) {
  p.dead = true; p.deadT = 0; p.speed = 0;
  addDecal(p.x, p.y, 'blood');
  if (owner === 'player') {
    if (p.kind === 'cop') { addHeat(4); setMinStars(2); }
    else if (p.kind === 'civ') addHeat(1.5);
    if (Math.random() < 0.5) G.pickups.push({ type: 'cash', x: p.x + rand(-10, 10), y: p.y + rand(-10, 10), respawn: -1, amount: Math.floor(rand(10, 120)) });
  }
  panicAround(p.x, p.y, 250);
}

function hurtPlayer(dmg) {
  const p = G.player;
  if (p.dead) return;
  if (p.armor > 0) {
    const a = Math.min(p.armor, dmg * 0.7);
    p.armor -= a; dmg -= a;
  }
  p.health -= dmg;
  UI.hurt();
  if (p.health <= 0) { p.health = 0; playerDown('wasted'); }
}

function explode(x, y, by) {
  Sfx.explosion(0.9 * proximityVol(x, y));
  G.cam.shake = Math.max(G.cam.shake, 14 * proximityVol(x, y));
  for (let i = 0; i < 26; i++) {
    G.particles.push(new Particle(x, y, rand(-260, 260), rand(-260, 260), rand(0.4, 0.9), rand(6, 14), pick(['#ffd34d', '#ff8a00', '#ff3d00']), -6));
    G.particles.push(new Particle(x, y, rand(-80, 80), rand(-80, 80), rand(1.2, 2.4), rand(8, 14), 'rgba(50,50,50,0.6)', 14));
  }
  G.flashLights.push({ x, y, r: 320, t: 0.5 });
  addDecal(x, y, 'scorch');
  for (const p of G.peds) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < 120) hitPed(p, d < 70 ? 200 : 60, by, (p.x - x) * 4, (p.y - y) * 4);
  }
  for (const v of G.vehicles) {
    const d = Math.hypot(v.x - x, v.y - y);
    if (d > 1 && d < 130) {
      v.damage(700 * (1 - d / 130), by);
      v.vx += (v.x - x) / d * 200; v.vy += (v.y - y) / d * 200;
    }
  }
  const pd = Math.hypot(G.player.x - x, G.player.y - y);
  if (!G.player.vehicle && pd < 130) hurtPlayer(110 * (1 - pd / 130));
  panicAround(x, y, 500);
}

function addDecal(x, y, kind, a = 0) {
  G.decals.push({ x, y, kind, a, s: rand(0.8, 1.3) });
  if (G.decals.length > 300) G.decals.shift();
}

// ------------------------------------------------------------------ player
function enterOrExitVehicle() {
  const p = G.player;
  if (p.vehicle) return exitVehicle();
  let best = null, bd = 60;
  for (const v of G.vehicles) {
    if (v.wreck || v.burn > 0) continue;
    const d = dist(v, p);
    if (d < bd) { bd = d; best = v; }
  }
  if (!best) return;
  if (best.ctrl === 'traffic' || best.ctrl === 'police' && !best.deployed) {
    const kind = best.type === 'police' ? 'cop' : 'civ';
    const ped = new Ped(kind, best.x - Math.sin(best.a) * 26, best.y + Math.cos(best.a) * 26);
    const free = G.world.nearestFree(ped.x, ped.y, false);
    ped.x = free.x; ped.y = free.y;
    if (kind === 'civ') { ped.state = 'flee'; ped.t = 8; ped.fx = p.x; ped.fy = p.y; }
    else { ped.state = 'chase'; }
    G.peds.push(ped);
    if (best.type === 'police') addHeat(4);
    else if (copNearby(600)) addHeat(1);
  } else if (best.type === 'police') addHeat(2);
  best.ctrl = 'player';
  best.mode = 'player';
  best.ai = null;
  p.vehicle = best;
  G.lastCar = best;
  UI.vehicleName(best.spec.name);
  if (G.radio) Sfx.setStation(G.radio);
}

function exitVehicle(force) {
  const p = G.player, v = p.vehicle;
  if (!v) return;
  if (!force && v.speed > 130) return UI.help('Slow down to get out.');
  v.ctrl = 'none';
  v.braking = false;
  const side = [[-Math.sin(v.a), Math.cos(v.a)], [Math.sin(v.a), -Math.cos(v.a)]];
  let placed = false;
  for (const [sx, sy] of side) {
    const x = v.x + sx * (v.spec.w / 2 + 14), y = v.y + sy * (v.spec.w / 2 + 14);
    if (!G.world.pedBlockedAt(x, y)) { p.x = x; p.y = y; placed = true; break; }
  }
  if (!placed) { const f = G.world.nearestFree(v.x, v.y, false); p.x = f.x; p.y = f.y; }
  p.vehicle = null;
  Sfx.setStation(0);
}

function cycleWeapon(dir = 1) {
  const p = G.player;
  const owned = LEONIDA.weapons.filter(w => p.ammo[w.id] > 0).map(w => w.id);
  if (!owned.length) return;
  let i = owned.indexOf(p.weapon);
  i = (i + dir + owned.length) % owned.length;
  p.weapon = owned[i];
}

function aimAngle() {
  const p = G.player;
  if (G.touch.active || G.t - G.mouse.moved > 4) {
    // Auto-aim at the nearest threat in front of the player
    const base = p.vehicle ? p.vehicle.a : p.a;
    let best = null, bs = Infinity;
    for (const e of G.peds) {
      if (e.dead) continue;
      const d = dist(e, p);
      if (d > 420) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(e.y - p.y, e.x - p.x) - base));
      const hostile = e.kind === 'gang' || (e.kind === 'cop' && G.stars > 0);
      const score = d * (hostile ? 0.5 : 1.2) + ang * 300;
      if (ang < 1.1 && score < bs) { bs = score; best = e; }
    }
    if (G.heli && dist(G.heli, p) < 420) best = best || G.heli;
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : base;
  }
  const wm = screenToWorld(G.mouse.x, G.mouse.y);
  return Math.atan2(wm.y - p.y, wm.x - p.x);
}

function updatePlayer(dt) {
  const p = G.player, k = G.keys;
  if (p.dead) return;
  p.cool -= dt;
  const shooting = G.mouse.down || k.KeyJ || k.ControlLeft || G.touch.fire;

  if (p.vehicle) {
    const v = p.vehicle;
    let throttle = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let steer = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const handbrake = !!k.Space || G.touch.brake;
    if (G.touch.active) {
      const mag = Math.hypot(G.touch.jx, G.touch.jy);
      if (mag > 0.2) {
        const desired = Math.atan2(G.touch.jy, G.touch.jx);
        const diff = wrapAngle(desired - v.a);
        if (Math.abs(diff) > 2.4 && v.forwardSpeed < 60) { throttle = -1; steer = -Math.sign(diff); }
        else { steer = clamp(diff * 2.2, -1, 1); throttle = mag * (Math.abs(diff) > 1.6 ? 0.5 : 1); }
      }
      if (G.touch.brake) throttle = -1;
    }
    const impact = v.drive(G.world, { throttle, steer, handbrake }, dt);
    if (impact > 150) { Sfx.crash((impact - 150) / 400); v.damage((impact - 150) * 0.6, 'player'); G.cam.shake = Math.max(G.cam.shake, (impact - 150) / 40); }
    if (v.slip > 140 && v.speed > 150) {
      const c = Math.cos(v.a), s = Math.sin(v.a);
      for (const side of [-1, 1]) addDecal(v.x - c * v.spec.l * 0.35 - s * side * v.spec.w * 0.4, v.y - s * v.spec.l * 0.35 + c * side * v.spec.w * 0.4, 'skid', v.a);
    }
    p.x = v.x; p.y = v.y; p.a = v.a;
    if (shooting && p.cool <= 0 && p.weapon !== 'fist' && p.ammo[p.weapon] > 0 && p.weapon !== 'rifle') {
      // drive-by
      const wd = weaponDef(p.weapon);
      const a = aimAngle();
      fire(p, p.x, p.y, a, p.weapon, 'player');
      p.cool = wd.rate * 1.3;
      p.ammo[p.weapon]--;
    }
    if (v.burn > 0 && v.burn < 1.2) UI.help('Your vehicle is on fire! Get out! (F)');
    if (k.KeyH) { if (!G.hornCool || G.hornCool < G.t) { Sfx.horn(); G.hornCool = G.t + 0.5; panicAround(v.x, v.y, 150); } }
    return;
  }

  let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  let my = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
  if (G.touch.active && Math.hypot(G.touch.jx, G.touch.jy) > 0.15) { mx = G.touch.jx; my = G.touch.jy; }
  const mag = Math.hypot(mx, my);
  const sprint = k.ShiftLeft || k.ShiftRight || k.Space || (G.touch.active && mag > 0.9);
  const sp = sprint ? 230 : 140;
  if (mag > 0) {
    mx /= Math.max(1, mag); my /= Math.max(1, mag);
    const slow = G.world.tileAt(p.x, p.y) === TILE.SWAMP ? 0.6 : 1;
    moveCircle(G.world, p, mx * sp * slow * dt, my * sp * slow * dt);
    p.walk += dt * (sprint ? 16 : 11);
    p.speed = sp;
  } else p.speed = 0;
  const aiming = shooting || (G.t - G.mouse.moved < 4 && !G.touch.active);
  if (aiming) p.a = aimAngle();
  else if (mag > 0) p.a = Math.atan2(my, mx);

  if (shooting && p.cool <= 0) {
    if (!(p.ammo[p.weapon] > 0)) cycleWeapon(1);
    const wd = weaponDef(p.weapon);
    fire(p, p.x, p.y, p.a, p.weapon, 'player');
    p.cool = wd.rate;
    if (p.weapon !== 'fist') p.ammo[p.weapon]--;
    if (p.ammo[p.weapon] <= 0 && p.weapon !== 'fist') { delete p.ammo[p.weapon]; cycleWeapon(1); }
  }
}

function playerDown(kind) {
  const p = G.player;
  if (p.dead) return;
  p.dead = true;
  if (p.vehicle) { const v = p.vehicle; v.ctrl = 'none'; p.vehicle = null; p.x = v.x; p.y = v.y; }
  if (G.mission) failMission(kind === 'wasted' ? 'You died.' : 'You were busted.');
  Sfx.wasted();
  Sfx.setStation(0);
  UI.bigMessage(kind === 'wasted' ? 'WASTED' : 'BUSTED', kind === 'wasted' ? '#c0392b' : '#3a6ee8', 4);
  setTimeout(() => respawn(kind), 3800);
}

function respawn(kind) {
  const p = G.player;
  let best = null, bd = Infinity;
  for (const h of HOSPITALS) {
    const pos = nodePos(h);
    const d = Math.hypot(pos.x - p.x, pos.y - p.y);
    if (d < bd) { bd = d; best = pos; }
  }
  const f = G.world.nearestFree(best.x + 48, best.y + 48, false);
  const fee = Math.min(G.money, kind === 'wasted' ? 500 : 1000);
  G.money -= fee;
  const np = newPlayer(p.char, f.x, f.y);
  np.ammo = kind === 'busted' ? { fist: Infinity, pistol: 24 } : p.ammo;
  if (!np.ammo.pistol && kind === 'wasted') np.ammo.pistol = 24;
  G.player = np;
  clearWanted();
  G.peds = G.peds.filter(e => e.kind !== 'cop');
  G.vehicles = G.vehicles.filter(v => v.ctrl !== 'police');
  G.heli = null;
  G.cam.x = np.x; G.cam.y = np.y;
  UI.help(kind === 'wasted' ? `Hospital bill: $${fee}` : `Bail and legal fees: $${fee}. Weapons confiscated.`);
}

// ------------------------------------------------------------------ interaction
function interact(dt) {
  const p = G.player;
  const holding = G.keys.KeyE || G.touch.action;
  // Robbery: stores or mission target
  let target = null;
  const m = G.mission;
  if (!p.vehicle) {
    if (m && m.step.type === 'rob' && m.target && dist(p, m.target) < 60) target = { x: m.target.x, y: m.target.y, name: 'Vault', mission: true, hold: m.step.hold || 3 };
    else {
      for (const s of G.world.stores) {
        if (Math.hypot(s.x - p.x, s.y - p.y) < 44) { target = s; break; }
      }
    }
  }
  if (target && !target.mission && target.cooldown > G.t) {
    UI.prompt(`${target.name} — already hit. Come back later.`);
    G.robbing = null;
    return;
  }
  if (target) {
    UI.prompt(`Hold E to rob ${target.name}`);
    if (holding) {
      G.robbing = G.robbing && G.robbing.target === target ? G.robbing : { target, t: 0 };
      G.robbing.t += dt;
      const need = target.hold || 2.5;
      UI.progress(G.robbing.t / need);
      if (G.robbing.t >= need) {
        if (target.mission) {
          setMinStars(m.step.stars || 2);
          m.robbed = true;
          const cash = 0;
          if (cash) G.money += cash;
        } else {
          const cash = Math.floor(rand(400, 2400));
          G.money += cash;
          target.cooldown = G.t + 300;
          Sfx.cash();
          UI.help(`Robbed ${target.name}: +$${cash}`);
          setMinStars(2);
          if (m && m.step.type === 'rob' && !m.step.at) m.robbed = true;
        }
        panicAround(p.x, p.y, 400);
        G.robbing = null;
        UI.progress(-1);
      }
    } else { G.robbing = null; UI.progress(-1); }
    return;
  }
  G.robbing = null;
  UI.progress(-1);
  // Safehouses
  for (const sh of SAFEHOUSES) {
    const pos = nodePos(sh.at);
    if (Math.hypot(pos.x - p.x, pos.y - p.y) < 70 && !G.mission) {
      if (G.stars > 0) { UI.prompt('Lose the cops to use the safehouse.'); return; }
      UI.prompt(`${sh.name} — press E to save & sleep`);
      if (G.keysPressed.KeyE || G.touch.actionPressed) {
        G.time = (Math.floor(G.time / 60) * 60 + 6 * 60) % (24 * 60);
        p.health = 100;
        saveGame();
        UI.flash();
      }
      return;
    }
  }
  UI.prompt(null);
}

// ------------------------------------------------------------------ missions
function nextMission() {
  return LEONIDA.missions.find(m => !G.completed.has(m.id)) || null;
}

function checkMissionStart() {
  if (G.mission || G.player.dead) return;
  const def = nextMission();
  if (!def) return;
  const pos = nodePos(def.start);
  if (dist(G.player, pos) > 60) return;
  if (def.char !== 'any' && def.char !== G.char) {
    UI.prompt(`This mission is for ${LEONIDA.characters[def.char].short}. Press Tab to switch.`);
    return;
  }
  if (G.stars > 0) { UI.prompt('Lose the cops to start the mission.'); return; }
  startMission(def);
}

function startMission(def) {
  G.mission = { def, i: -1, step: null, target: null, timer: 0, robbed: false, gang: [], veh: null, ents: [] };
  UI.bigMessage(def.title, '#ffd400', 2.5, 'mission');
  UI.subtitles(def.intro);
  beginStep(0);
}

function beginStep(i) {
  const m = G.mission;
  m.i = i;
  m.step = m.def.steps[i];
  if (!m.step) return passMission();
  const s = m.step;
  m.target = s.at ? nodePos(s.at) : null;
  m.robbed = false;
  m.timer = s.time || 0;
  if (s.type === 'getcar' && s.spawn) {
    const v = spawnParked(s.spawn, m.target.x, m.target.y);
    v.mission = true; m.veh = v; m.ents.push(v);
    m.target = null;
  }
  if (s.type === 'destroy') {
    const v = spawnParked(s.spawn, m.target.x, m.target.y);
    v.mission = true; m.destroyTarget = v; m.ents.push(v);
    // Guards
    for (let k = 0; k < 2; k++) spawnGang(m.target.x + rand(-60, 60), m.target.y + rand(-60, 60));
    m.target = null;
  }
  if (s.type === 'kill') {
    m.gang = [];
    for (let k = 0; k < s.count; k++) m.gang.push(spawnGang(m.target.x + rand(-120, 120), m.target.y + rand(-120, 120)));
    m.target = null;
  }
  UI.objective(s.text);
}

function spawnGang(x, y) {
  const f = G.world.nearestFree(x, y, false);
  const g = new Ped('gang', f.x, f.y);
  g.mission = true; g.state = 'idle';
  g.weapon = pick(['pistol', 'smg', 'shotgun']);
  G.peds.push(g);
  G.mission.ents.push(g);
  return g;
}

function spawnParked(type, x, y) {
  const f = G.world.nearestFree(x, y, true);
  const v = new Vehicle(type, f.x, f.y, 0);
  // Align with the road if possible
  const tx = Math.floor(f.x / T), ty = Math.floor(f.y / T);
  if (tx % GRID < 2) v.a = Math.PI / 2;
  G.vehicles.push(v);
  return v;
}

function updateMission(dt) {
  const m = G.mission;
  if (!m) return;
  const s = m.step, p = G.player;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) return failMission('You ran out of time.');
  }
  if (m.veh && (m.veh.wreck || m.veh.burn > 0) && (s.type === 'getcar' || s.keepVehicle)) return failMission('The car was destroyed.');
  let done = false;
  switch (s.type) {
    case 'getcar':
      done = p.vehicle && (!m.veh || p.vehicle === m.veh);
      break;
    case 'goto': {
      const near = dist(p, m.target) < 70;
      done = near && (!s.inVehicle || p.vehicle) && (!s.onFoot || !p.vehicle) && (!s.keepVehicle || p.vehicle === m.veh);
      if (near && !done) UI.prompt(s.onFoot ? 'Get out of the vehicle.' : s.keepVehicle ? 'You need the Infernus.' : 'You need a vehicle.');
      break;
    }
    case 'kill':
      done = m.gang.every(g => g.dead);
      break;
    case 'destroy':
      done = m.destroyTarget.wreck || m.destroyTarget.burn > 0;
      break;
    case 'rob':
      done = m.robbed;
      break;
    case 'lose':
      done = G.stars === 0;
      break;
  }
  if (done) { Sfx.pickup(); beginStep(m.i + 1); }
}

function passMission() {
  const m = G.mission;
  G.completed.add(m.def.id);
  G.money += m.def.reward;
  for (const e of m.ents) e.mission = false;
  G.mission = null;
  Sfx.passed();
  UI.bigMessage('MISSION PASSED', '#ffd400', 4, 'passed', `+$${m.def.reward.toLocaleString()}`);
  UI.subtitles(m.def.outro || []);
  UI.objective(null);
  if (!nextMission()) setTimeout(() => UI.bigMessage('THE END?', '#ff4fa3', 5, 'passed', 'Leonida is yours. Free roam unlocked.'), 5000);
  saveGame(true);
}

function failMission(reason) {
  const m = G.mission;
  if (!m) return;
  for (const e of m.ents) e.mission = false;
  G.mission = null;
  Sfx.failed();
  UI.bigMessage('MISSION FAILED', '#e74c3c', 3.5, 'failed', reason);
  UI.objective(null);
}

function missionTarget() {
  const m = G.mission;
  if (m) {
    if (m.step.type === 'getcar' && m.veh && G.player.vehicle !== m.veh) return m.veh;
    if (m.step.type === 'destroy') return m.destroyTarget;
    if (m.step.type === 'kill') { const g = m.gang.find(e => !e.dead); return g || null; }
    if (m.step.type === 'rob' && !m.target) {
      let best = null, bd = Infinity;
      for (const s of G.world.stores) { const d = dist(s, G.player); if (d < bd && s.cooldown <= G.t) { bd = d; best = s; } }
      return best;
    }
    if (m.step.type === 'lose') return null;
    return m.target;
  }
  return null;
}

// ------------------------------------------------------------------ traffic
function spawnTraffic() {
  const p = G.player, w = G.world;
  const region = w.regionAt(Math.floor(p.x / T), Math.floor(p.y / T));
  const density = region ? ({ vice: 26, gellhorn: 16, keys: 12, ambrosia: 10, grass: 8, kalaga: 7 })[region.id] : 6;
  const count = G.vehicles.filter(v => v.ctrl === 'traffic' || (v.ctrl === 'police' && v.mode === 'patrol')).length;
  if (count >= density) return;
  for (let tries = 0; tries < 6; tries++) {
    const nd = pick(w.nodeList);
    const d = Math.hypot(nd.x - p.x, nd.y - p.y);
    if (d < 600 || d > 1300) continue;
    const to = w.nodes[pick(nd.adj)];
    const dx = Math.sign(to.x - nd.x), dy = Math.sign(to.y - nd.y);
    const police = Math.random() < 0.08;
    const type = police ? 'police' : pick(LEONIDA.trafficMix);
    const v = new Vehicle(type, nd.x - dy * 16, nd.y + dx * 16, Math.atan2(dy, dx));
    if (G.vehicles.some(o => dist(o, v) < 60)) continue;
    v.ctrl = police ? 'police' : 'traffic';
    v.mode = 'patrol';
    v.ai = { from: nd.id, to: to.id };
    v.cruise = rand(140, 210);
    v.spd = v.cruise * 0.6;
    G.vehicles.push(v);
    return;
  }
}

function somethingAhead(v, range) {
  const fx = Math.cos(v.a), fy = Math.sin(v.a);
  const check = (e, rad) => {
    const rx = e.x - v.x, ry = e.y - v.y;
    const along = rx * fx + ry * fy;
    if (along <= 0 || along > range) return false;
    return Math.abs(-rx * fy + ry * fx) < rad;
  };
  for (const o of G.vehicles) if (o !== v && check(o, 20)) return o;
  if (!G.player.vehicle && !G.player.dead && check(G.player, 16)) return G.player;
  for (const p of G.peds) if (!p.dead && check(p, 14)) return p;
  return null;
}

function updateTraffic(v, dt) {
  const w = G.world, ai = v.ai;
  let to = w.nodes[ai.to], from = w.nodes[ai.from];
  let dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  const tx = to.x - dy * 16, ty = to.y + dx * 16;
  if (Math.hypot(tx - v.x, ty - v.y) < 22) {
    const opts = to.adj.filter(id => id !== from.id);
    const next = opts.length ? pick(opts) : from.id;
    ai.from = to.id; ai.to = next;
    return;
  }
  const desired = Math.atan2(ty - v.y, tx - v.x);
  const diff = wrapAngle(desired - v.a);
  v.a += clamp(diff, -3.2 * dt, 3.2 * dt);
  let target = (v.cruise || 170) * (v.panic > 0 ? 1.6 : 1) * (Math.abs(diff) > 0.5 ? 0.5 : 1);
  if (v.panic > 0) v.panic -= dt;
  const block = somethingAhead(v, 70);
  if (block) {
    target = 0;
    if (block === G.player || block === G.player.vehicle) {
      v.honkT += dt;
      if (v.honkT > 2) { v.honkT = -rand(2, 5); Sfx.horn(); }
    }
  } else v.honkT = Math.min(v.honkT, 0);
  v.spd += clamp(target - v.spd, -500 * dt, 220 * dt);
  v.braking = target < v.spd - 10;
  v.vx = Math.cos(v.a) * v.spd; v.vy = Math.sin(v.a) * v.spd;
  v.x += v.vx * dt; v.y += v.vy * dt;
}

// Police driving: follows the road graph toward a target using physics
function updatePolice(v, dt) {
  const p = G.player, w = G.world;
  if (G.stars > 0 && v.mode !== 'chase' && dist(v, p) < 1600) { v.mode = 'chase'; v.path = null; }
  if (v.mode === 'patrol') {
    if (v.ai) return updateTraffic(v, dt);
    // lost chase: drive to nearest node then patrol
    const nd = w.nearestNode(v.x, v.y);
    if (nd && dist(v, nd) < 40) { v.ai = { from: nd.id, to: pick(nd.adj) }; v.spd = v.speed; v.cruise = 180; return; }
    return policeDriveTo(v, nd ? nd.x : v.x, nd ? nd.y : v.y, dt, false);
  }
  if (G.stars === 0) { v.mode = 'patrol'; v.ai = null; return; }
  const tgt = p.vehicle || p;
  // Deploy officers when the suspect is on foot
  if (!p.vehicle && dist(v, p) < 260 && !v.deployed) {
    v.drive(w, { throttle: v.forwardSpeed > 20 ? -1 : 0, steer: 0, handbrake: false }, dt);
    if (v.speed < 40) {
      v.deployed = true;
      const n = G.stars >= 3 ? 2 : 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const side = k === 0 ? 1 : -1;
        const f = w.nearestFree(v.x - Math.sin(v.a) * 24 * side, v.y + Math.cos(v.a) * 24 * side, false);
        const c = new Ped('cop', f.x, f.y);
        c.state = 'chase';
        c.weapon = G.stars >= 4 ? 'rifle' : G.stars >= 3 ? 'smg' : 'pistol';
        G.peds.push(c);
      }
    }
    return;
  }
  if (v.deployed) {
    v.drive(w, { throttle: 0, steer: 0, handbrake: true }, dt);
    if (p.vehicle && dist(v, p) > 400) v.deployed = false; // officers stay, car resumes chase with a new crew
    return;
  }
  policeDriveTo(v, tgt.x, tgt.y, dt, true);
}

function policeDriveTo(v, tx, ty, dt, aggressive) {
  const w = G.world;
  const d = Math.hypot(tx - v.x, ty - v.y);
  let gx = tx, gy = ty;
  v.pathT -= dt;
  if (d > 260 || !w.lineOfSight(v.x, v.y, tx, ty)) {
    if (v.pathT <= 0) {
      v.pathT = 0.8;
      const a = w.nearestNode(v.x, v.y), b = w.nearestNode(tx, ty);
      v.path = a && b ? w.path(a.id, b.id) : null;
    }
    const path = v.path;
    while (path && path.length > 1) {
      const n0 = w.nodes[path[0]], n1 = w.nodes[path[1]];
      if (Math.hypot(n0.x - v.x, n0.y - v.y) < 70 || Math.hypot(n1.x - v.x, n1.y - v.y) < Math.hypot(n1.x - n0.x, n1.y - n0.y)) path.shift();
      else break;
    }
    if (path && path.length) {
      const n = w.nodes[path[0]];
      if (path.length > 1 || Math.hypot(n.x - v.x, n.y - v.y) > 40) { gx = n.x; gy = n.y; }
    }
  }
  const desired = Math.atan2(gy - v.y, gx - v.x);
  const diff = wrapAngle(desired - v.a);
  let steer = clamp(diff * 2.5, -1, 1);
  let throttle = Math.abs(diff) > 1.4 ? 0.35 : 1;
  if (!aggressive) throttle *= 0.5;
  if (v.rev > 0) { v.rev -= dt; throttle = -1; steer = -Math.sign(diff); }
  else if (v.speed < 25 && throttle > 0) {
    v.stuck += dt;
    if (v.stuck > 1.1) { v.rev = 0.9; v.stuck = 0; }
  } else v.stuck = 0;
  const impact = v.drive(w, { throttle, steer, handbrake: Math.abs(diff) > 1.2 && v.speed > 250 }, dt);
  if (impact > 200) v.damage((impact - 200) * 0.3);
}

// ------------------------------------------------------------------ peds
function spawnPeds() {
  const p = G.player, w = G.world;
  const region = w.regionAt(Math.floor(p.x / T), Math.floor(p.y / T));
  const density = region ? ({ vice: 40, gellhorn: 24, keys: 14, ambrosia: 8, grass: 6, kalaga: 8 })[region.id] : 4;
  const count = G.peds.filter(e => e.kind === 'civ' && !e.dead).length;
  if (count >= density) return;
  for (let tries = 0; tries < 10; tries++) {
    const a = rand(0, TAU), d = rand(550, 950);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    const t = w.tileAt(x, y);
    const ok = t === TILE.SIDEWALK || ((t === TILE.SAND || t === TILE.PARK || t === TILE.GRASS || t === TILE.LOT) && Math.random() < 0.35);
    if (!ok) continue;
    G.peds.push(new Ped('civ', x, y));
    return;
  }
}

function updatePed(e, dt) {
  const w = G.world, p = G.player;
  if (e.dead) { e.deadT += dt; return; }
  e.cool -= dt;
  let mx = 0, my = 0, sp = 0;
  const pd = dist(e, p);
  if (e.kind === 'civ') {
    if (e.state === 'flee') {
      e.t -= dt;
      const a = Math.atan2(e.y - e.fy, e.x - e.fx) + Math.sin(G.t * 2 + e.x) * 0.4;
      mx = Math.cos(a); my = Math.sin(a); sp = 150;
      if (e.t <= 0) e.state = 'wander';
    } else {
      e.t -= dt;
      if (e.t <= 0) { e.a = rand(0, TAU); e.t = rand(2, 6); e.idle = Math.random() < 0.25; }
      if (!e.idle) {
        mx = Math.cos(e.a); my = Math.sin(e.a); sp = 42;
        const ahead = w.tileAt(e.x + mx * 20, e.y + my * 20), here = w.tileAt(e.x, e.y);
        if ((ahead === TILE.ROAD && here !== TILE.ROAD && Math.random() < 0.97) || w.pedBlockedAt(e.x + mx * 14, e.y + my * 14)) {
          e.a = Math.round(rand(0, 4)) * Math.PI / 2 + rand(-0.2, 0.2); mx = 0; my = 0;
        }
      }
    }
  } else if (e.kind === 'cop') {
    if (G.stars === 0 || p.dead) {
      e.state = 'calm';
      e.t -= dt;
      if (e.t <= 0) { e.a = rand(0, TAU); e.t = rand(2, 5); }
      mx = Math.cos(e.a) * 0.5; my = Math.sin(e.a) * 0.5; sp = 40;
    } else {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.a = a;
      const los = w.lineOfSight(e.x, e.y, p.x, p.y);
      const keep = G.stars >= 2 ? 140 : 18;
      if (pd > keep || !los) { mx = Math.cos(a); my = Math.sin(a); sp = 165; }
      if (G.stars >= 2 && los && pd < 340 && e.cool <= 0) {
        const wid = e.weapon || 'pistol';
        fire(e, e.x, e.y, a + rand(-0.12, 0.12), wid, 'cop');
        e.cool = wid === 'smg' || wid === 'rifle' ? 0.25 + (Math.random() < 0.2 ? 1.2 : 0) : rand(0.9, 1.5);
      }
      // Arrest
      if (G.stars <= 2 && !p.vehicle && pd < 32) {
        G.bustT += dt;
        if (G.bustT > 1.4) { G.bustT = 0; playerDown('busted'); }
      }
    }
  } else if (e.kind === 'gang') {
    if (e.state === 'idle' && pd < 380) e.state = 'attack';
    if (e.state === 'attack' && !p.dead) {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.a = a;
      const los = w.lineOfSight(e.x, e.y, p.x, p.y);
      if (pd > 170 || !los) { mx = Math.cos(a); my = Math.sin(a); sp = 130; }
      else { mx = Math.cos(a + Math.PI / 2) * Math.sin(G.t + e.x); my = Math.sin(a + Math.PI / 2) * Math.sin(G.t + e.x); sp = 70; }
      if (los && pd < 360 && e.cool <= 0) {
        fire(e, e.x, e.y, a + rand(-0.15, 0.15), e.weapon || 'pistol', 'gang');
        e.cool = e.weapon === 'smg' ? 0.3 + (Math.random() < 0.3 ? 1 : 0) : rand(0.8, 1.4);
      }
    }
  }
  if (sp > 0) {
    if (e.kind === 'civ' || mx || my) e.a = e.kind === 'civ' ? Math.atan2(my, mx) : e.a;
    const moved = moveCircle(w, e, mx * sp * dt, my * sp * dt);
    if (!moved && e.kind === 'civ') e.a += Math.PI / 2;
    e.walk += dt * sp / 12;
  }
  e.speed = sp;
}

// ------------------------------------------------------------------ helicopter
function updateHeli(dt) {
  const p = G.player;
  if (G.stars >= 4 && !G.heli && !p.dead) {
    const a = rand(0, TAU);
    G.heli = { x: p.x + Math.cos(a) * 900, y: p.y + Math.sin(a) * 900, a: 0, health: 600, cool: 2, rot: 0 };
  }
  const h = G.heli;
  if (!h) return;
  h.rot += dt * 30;
  if (G.stars < 3 || p.dead) {
    // leave
    h.x += Math.cos(h.a) * 300 * dt; h.y += Math.sin(h.a) * 300 * dt;
    if (dist(h, p) > 1500) G.heli = null;
    return;
  }
  const orbit = G.t * 0.5;
  const tx = p.x + Math.cos(orbit) * 180, ty = p.y + Math.sin(orbit) * 180;
  const d = Math.hypot(tx - h.x, ty - h.y);
  const sp = Math.min(380, d * 2);
  if (d > 1) { h.x += (tx - h.x) / d * sp * dt; h.y += (ty - h.y) / d * sp * dt; }
  h.a = Math.atan2(p.y - h.y, p.x - h.x);
  h.cool -= dt;
  if (h.cool <= 0 && dist(h, p) < 450) {
    h.cool = 0.2;
    if (!h.burst) h.burst = 4;
    h.burst--;
    if (h.burst <= 0) { h.cool = 3.5; h.burst = 0; }
    fire(h, h.x, h.y, h.a + rand(-0.3, 0.3), 'rifle', 'cop');
  }
  if (h.health <= 0) {
    explode(h.x, h.y, 'player');
    G.heli = null;
    addHeat(5);
  }
}

// ------------------------------------------------------------------ update
function update(dt) {
  G.t += dt;
  G.time = (G.time + dt * 1.0) % (24 * 60);
  const p = G.player;
  G.flashLights = (G.flashLights || []).filter(f => (f.t -= dt) > 0);

  updatePlayer(dt);
  interact(dt);
  checkMissionStart();

  for (const v of G.vehicles) {
    if (v.ctrl === 'traffic') updateTraffic(v, dt);
    else if (v.ctrl === 'police') updatePolice(v, dt);
    else if (v.ctrl === 'none') { if (v.speed > 1) v.drive(G.world, { throttle: 0, steer: 0, handbrake: true }, dt); }
    if (v.burn > 0) {
      v.burn -= dt;
      if (Math.random() < 0.6) G.particles.push(new Particle(v.x + rand(-8, 8), v.y + rand(-8, 8), rand(-20, 20), rand(-40, -10), 0.6, rand(4, 8), pick(['#ff9d00', '#ff5100', '#ffd000']), 4));
      if (v.burn <= 0) {
        v.wreck = true;
        if (v.ctrl === 'player') { exitVehicle(true); hurtPlayer(200); }
        if (v.ctrl === 'traffic' || v.ctrl === 'police') v.ctrl = 'none';
        if (v.lastHitBy === 'player' && v.type === 'police') addHeat(3);
        explode(v.x, v.y, v.lastHitBy);
      }
    } else if (!v.wreck && v.health < v.spec.hp * 0.3 && Math.random() < 0.3) {
      G.particles.push(new Particle(v.x + Math.cos(v.a) * v.spec.l * 0.4, v.y + Math.sin(v.a) * v.spec.l * 0.4, rand(-15, 15), rand(-15, 15), 1, 4, 'rgba(70,70,70,0.5)', 10));
    }
  }
  collideVehicles(dt);

  for (const e of G.peds) updatePed(e, dt);
  updateBullets(dt);
  updateHeli(dt);
  updatePickups(dt);
  updateWanted(dt);
  updateMission(dt);
  G.particles = G.particles.filter(pt => pt.update(dt));
  G.tracers = G.tracers.filter(tr => (tr.t -= dt) > 0);

  // spawning / despawning
  G.spawnT = (G.spawnT || 0) - dt;
  if (G.spawnT <= 0) {
    G.spawnT = 0.25;
    spawnTraffic(); spawnPeds(); spawnPolice(); spawnParkedCars();
    const keep = (e) => e.mission || e === p.vehicle || e === G.lastCar && dist(e, p) < 2500;
    G.vehicles = G.vehicles.filter(v => keep(v) || dist(v, p) < 1700 && !(v.wreck && dist(v, p) > 1100));
    G.peds = G.peds.filter(e => e.mission || (dist(e, p) < 1400 && !(e.dead && e.deadT > 40)));
    for (const lot of G.world.lots) if (lot.spawned && Math.hypot((lot.x + 4) * T - p.x, (lot.y + 4) * T - p.y) > 1900) lot.spawned = false;
  }

  // weather
  G.weatherT -= dt;
  if (G.weatherT <= 0) { G.weatherT = rand(90, 240); G.rainTarget = Math.random() < 0.3 ? rand(0.5, 1) : 0; }
  G.rain += clamp(G.rainTarget - G.rain, -0.1 * dt, 0.1 * dt);

  // region
  const r = G.world.regionAt(Math.floor(p.x / T), Math.floor(p.y / T));
  if (r && r !== G.region) { G.region = r; UI.areaName(r.name); }

  // camera
  const tgt = p.vehicle || p;
  const vx = p.vehicle ? p.vehicle.vx : 0, vy = p.vehicle ? p.vehicle.vy : 0;
  const lead = 0.45;
  G.cam.x += (tgt.x + vx * lead - G.cam.x) * Math.min(1, dt * 4);
  G.cam.y += (tgt.y + vy * lead - G.cam.y) * Math.min(1, dt * 4);
  const span = p.vehicle ? 900 + Math.min(600, p.vehicle.speed * 1.1) : 760;
  const zoomT = Math.max(Render.W, Render.H) / span;
  G.cam.zoom += (zoomT - G.cam.zoom) * Math.min(1, dt * 1.5);
  G.cam.shake = Math.max(0, G.cam.shake - dt * 25);

  // GPS
  G.gpsT -= dt;
  if (G.gpsT <= 0) {
    G.gpsT = 1;
    const target = missionTarget() || G.waypoint;
    if (target) {
      const a = G.world.nearestNode(p.x, p.y), b = G.world.nearestNode(target.x, target.y);
      G.gps = a && b ? G.world.path(a.id, b.id) : null;
    } else G.gps = null;
    if (G.waypoint && dist(p, G.waypoint) < 80) { G.waypoint = null; UI.help('Waypoint reached.'); }
  }

  Sfx.update(dt, p.vehicle ? p.vehicle.speed : 0, !!p.vehicle, G.stars > 0 && G.vehicles.some(v => v.type === 'police' && v.mode === 'chase' && dist(v, p) < 900));
}

function collideVehicles(dt) {
  const vs = G.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const d = Math.hypot(dx, dy);
      if (d >= rr * 0.85 || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      const overlap = rr * 0.85 - d;
      const kinA = a.ctrl === 'traffic', kinB = b.ctrl === 'traffic';
      a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = -rel;
        a.vx -= nx * imp * 0.6; a.vy -= ny * imp * 0.6;
        b.vx += nx * imp * 0.6; b.vy += ny * imp * 0.6;
        if (kinA) { a.spd *= 0.3; a.panic = 4; }
        if (kinB) { b.spd *= 0.3; b.panic = 4; }
        if (imp > 120) {
          const by = a.ctrl === 'player' || b.ctrl === 'player' ? 'player' : null;
          a.damage(imp * 0.5, by); b.damage(imp * 0.5, by);
          if (a.ctrl === 'player' || b.ctrl === 'player') {
            Sfx.crash(imp / 500);
            G.cam.shake = Math.max(G.cam.shake, imp / 60);
            const other = a.ctrl === 'player' ? b : a;
            if (other.type === 'police' && G.stars === 0) addHeat(1.2);
          }
        }
      }
    }
    // vehicles vs peds / player
    const sp = a.speed;
    if (sp < 40 || a.wreck) continue;
    for (const e of G.peds) {
      if (e.dead || Math.abs(e.x - a.x) > 40 || Math.abs(e.y - a.y) > 40) continue;
      if (Math.hypot(e.x - a.x, e.y - a.y) < a.r + 4) {
        const by = a.ctrl === 'player' ? 'player' : null;
        hitPed(e, sp > 160 ? 200 : sp * 0.4, by, a.vx, a.vy);
        e.x += a.vx * 0.08; e.y += a.vy * 0.08;
        if (by && e.kind === 'civ' && !e.dead) addHeat(0.5);
        if (by && e.kind === 'cop') addHeat(1);
      }
    }
    const p = G.player;
    if (!p.vehicle && !p.dead && Math.hypot(p.x - a.x, p.y - a.y) < a.r + 6 && sp > 60) {
      hurtPlayer(sp * 0.12);
      const n = Math.hypot(p.x - a.x, p.y - a.y) || 1;
      moveCircle(G.world, p, (p.x - a.x) / n * 20, (p.y - a.y) / n * 20);
    }
  }
}

function updateBullets(dt) {
  const w = G.world, p = G.player;
  const out = [];
  for (const b of G.bullets) {
    b.px = b.x; b.py = b.y;
    const steps = 3;
    let hit = false;
    for (let s = 0; s < steps && !hit; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (w.bulletBlockedAt(b.x, b.y)) {
        hit = true;
        G.particles.push(new Particle(b.x, b.y, rand(-40, 40), rand(-40, 40), 0.2, 2, '#ddd'));
        break;
      }
      for (const e of G.peds) {
        if (e.dead || e === b.shooter) continue;
        if (b.owner !== 'player' && e.kind === b.owner) continue;
        if (Math.abs(e.x - b.x) < 10 && Math.abs(e.y - b.y) < 10) { hitPed(e, b.dmg, b.owner, b.vx, b.vy); hit = true; break; }
      }
      if (hit) break;
      if (b.owner !== 'player' && !p.dead) {
        const tgt = p.vehicle || p;
        const r = p.vehicle ? p.vehicle.r : 10;
        if (Math.hypot(tgt.x - b.x, tgt.y - b.y) < r) {
          if (p.vehicle) { p.vehicle.damage(b.dmg * 1.5); if (Math.random() < 0.15) hurtPlayer(b.dmg * 0.4); }
          else hurtPlayer(b.dmg);
          hit = true; break;
        }
      }
      for (const v of G.vehicles) {
        if (v === (b.shooter && b.shooter.vehicle) || (b.owner === 'player' && v === p.vehicle) || v.wreck) continue;
        if (Math.abs(v.x - b.x) < v.r && Math.abs(v.y - b.y) < v.r && Math.hypot(v.x - b.x, v.y - b.y) < v.r) {
          v.damage(b.dmg * 1.5, b.owner === 'player' ? 'player' : null);
          G.particles.push(new Particle(b.x, b.y, rand(-60, 60), rand(-60, 60), 0.15, 2, '#ffd27a'));
          if (v.ctrl === 'traffic') v.panic = 6;
          hit = true; break;
        }
      }
      if (!hit && G.heli && b.owner === 'player' && Math.hypot(G.heli.x - b.x, G.heli.y - b.y) < 30) { G.heli.health -= b.dmg; hit = true; }
    }
    G.tracers.push({ x0: b.px, y0: b.py, x1: b.x, y1: b.y, t: 0.05 });
    b.life -= dt;
    if (!hit && b.life > 0) out.push(b);
  }
  G.bullets = out;
}

function updatePickups(dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    if (pk.respawn > 0) { pk.respawn -= dt; continue; }
    if (pk.respawn === -2) continue;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) > (p.vehicle ? 30 : 22) || p.dead) continue;
    const t = pk.type;
    if (t === 'health') { if (p.health >= 100) continue; p.health = 100; UI.help('Health restored'); }
    else if (t === 'armor') { if (p.armor >= 100) continue; p.armor = 100; UI.help('Body armor'); }
    else if (t === 'cash') { const amt = pk.amount || Math.floor(rand(200, 800)); G.money += amt; UI.help(`+$${amt}`); Sfx.cash(); }
    else {
      const add = { pistol: 36, smg: 120, shotgun: 16, rifle: 90 }[t];
      p.ammo[t] = (p.ammo[t] || 0) + add;
      if (p.weapon === 'fist' || p.weapon === 'pistol') p.weapon = t;
      UI.help(`${weaponDef(t).name} +${add}`);
    }
    if (t !== 'cash') Sfx.pickup();
    pk.respawn = pk.respawn === -1 ? -2 : 60;
  }
  G.pickups = G.pickups.filter(pk => pk.respawn !== -2);
}

function updateWanted(dt) {
  const p = G.player;
  if (G.stars === 0) { G.bustT = 0; return; }
  const seen = copNearby(G.heli ? 700 : 520) || (G.heli && dist(G.heli, p) < 600);
  if (seen) G.lastSeen = G.t;
  G.unseen = G.t - G.lastSeen;
  if (G.unseen > 6 + G.stars * 1.5) {
    G.stars--;
    G.heat = G.stars > 0 ? HEAT_STARS[G.stars - 1] : 0;
    G.lastSeen = G.t;
    if (G.stars === 0) { clearWanted(); UI.help('You lost the cops.'); }
  }
  if (!copNearby(80)) G.bustT = Math.max(0, G.bustT - dt);
  // Pulled over in a stopped vehicle
  if (p.vehicle && G.stars <= 1 && p.vehicle.speed < 15 && G.vehicles.some(v => v.type === 'police' && v.ctrl === 'police' && dist(v, p) < 60)) {
    G.bustT += dt;
    if (G.bustT > 3) { G.bustT = 0; playerDown('busted'); }
  }
}

function spawnPolice() {
  if (G.stars === 0) return;
  const p = G.player, w = G.world;
  const want = [0, 2, 3, 4, 6, 8][G.stars];
  const have = G.vehicles.filter(v => v.ctrl === 'police' && v.mode === 'chase' && !v.wreck).length;
  if (have >= want || Math.random() > 0.35) return;
  for (let tries = 0; tries < 8; tries++) {
    const nd = pick(w.nodeList);
    const d = Math.hypot(nd.x - p.x, nd.y - p.y);
    if (d < 650 || d > 1150) continue;
    const v = new Vehicle('police', nd.x, nd.y, Math.atan2(p.y - nd.y, p.x - nd.x));
    if (G.vehicles.some(o => dist(o, v) < 60)) continue;
    v.ctrl = 'police'; v.mode = 'chase';
    G.vehicles.push(v);
    return;
  }
}

function spawnParkedCars() {
  const p = G.player;
  for (const lot of G.world.lots) {
    if (lot.spawned) continue;
    const cx = (lot.x + 4) * T, cy = (lot.y + 4) * T;
    if (Math.hypot(cx - p.x, cy - p.y) > 1400) continue;
    lot.spawned = true;
    for (let k = 0; k < 4; k++) {
      if (Math.random() < 0.4) continue;
      const v = new Vehicle(pick(LEONIDA.trafficMix.filter(t => t !== 'truck')), (lot.x + 1.5 + k * 2) * T, (lot.y + 2) * T, Math.PI / 2);
      G.vehicles.push(v);
    }
  }
}

// ------------------------------------------------------------------ input helpers
function screenToWorld(sx, sy) {
  const z = G.cam.zoom;
  return { x: (sx - Render.W / 2) / z + G.cam.x, y: (sy - Render.H / 2) / z + G.cam.y };
}
