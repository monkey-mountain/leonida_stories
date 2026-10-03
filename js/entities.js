// Vehicles, pedestrians, bullets and effects.
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ------------------------------------------------------------------ vehicles
class Vehicle {
  constructor(type, x, y, a, color) {
    this.type = type;
    this.spec = LEONIDA.vehicles[type];
    this.x = x; this.y = y; this.a = a;
    this.vx = 0; this.vy = 0; this.spd = 0;
    this.color = color || pick(this.spec.colors);
    this.health = this.spec.hp;
    this.ctrl = 'none';    // none | player | traffic | police
    this.ai = null;
    this.mode = 'patrol';
    this.path = null; this.pathT = 0;
    this.stuck = 0; this.rev = 0;
    this.burn = 0; this.wreck = false;
    this.braking = false;
    this.mission = false;
    this.deployed = false;
    this.lastHitBy = null;
    this.honkT = 0;
    this.r = Math.max(this.spec.w, this.spec.l) * 0.45;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get forwardSpeed() { return this.vx * Math.cos(this.a) + this.vy * Math.sin(this.a); }

  blockedAt(world, x, y, a) {
    const c = Math.cos(a), s = Math.sin(a), hl = this.spec.l / 2, hw = this.spec.w / 2;
    const pts = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw]];
    for (const [lx, ly] of pts) {
      if (world.carBlockedAt(x + lx * c - ly * s, y + lx * s + ly * c)) return true;
    }
    return false;
  }

  // Arcade physics shared by the player and police
  drive(world, input, dt) {
    const st = this.spec;
    const fx = Math.cos(this.a), fy = Math.sin(this.a);
    let fwd = this.vx * fx + this.vy * fy;
    let lat = -this.vx * fy + this.vy * fx;
    const surf = world.tileAt(this.x, this.y);
    const offroad = surf === TILE.GRASS || surf === TILE.SAND || surf === TILE.SWAMP || surf === TILE.FOREST || surf === TILE.FIELD || surf === TILE.PARK;
    const maxF = st.maxSpeed * (offroad ? (this.type === 'pickup' || this.type === 'suv' ? 0.8 : 0.55) : 1) * (this.health < st.hp * 0.25 ? 0.7 : 1);
    this.braking = false;
    if (this.wreck) input = { throttle: 0, steer: 0, handbrake: true };

    if (input.throttle > 0) {
      if (fwd < -10) { fwd += st.brake * dt; this.braking = true; }
      else fwd += st.accel * input.throttle * dt * (fwd > maxF * 0.7 ? 0.5 : 1);
    } else if (input.throttle < 0) {
      if (fwd > 10) { fwd -= st.brake * dt; this.braking = true; }
      else fwd -= st.accel * 0.6 * dt;
    } else {
      fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 90 * dt);
    }
    if (fwd > maxF) fwd -= Math.min(fwd - maxF, 500 * dt);
    fwd = clamp(fwd, -st.maxSpeed * 0.35, st.maxSpeed);
    if (offroad) fwd *= 1 - 0.4 * dt;

    const steerFactor = clamp(Math.abs(fwd) / 140, 0, 1) * (1 - clamp((Math.abs(fwd) - 300) / 900, 0, 0.35));
    let na = this.a + input.steer * st.turn * steerFactor * Math.sign(fwd || 1) * dt * (input.handbrake ? 1.35 : 1);
    if (this.blockedAt(world, this.x, this.y, na) && !this.blockedAt(world, this.x, this.y, this.a)) na = this.a;
    this.a = na;

    const grip = input.handbrake ? 1.4 : st.grip;
    lat *= Math.max(0, 1 - grip * dt);
    if (input.handbrake) { fwd *= 1 - 1.1 * dt; this.braking = true; }
    this.slip = Math.abs(lat);

    const nfx = Math.cos(this.a), nfy = Math.sin(this.a);
    this.vx = nfx * fwd - nfy * lat;
    this.vy = nfy * fwd + nfx * lat;
    return this.move(world, dt);
  }

  move(world, dt) {
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (!this.blockedAt(world, nx, ny, this.a) || this.blockedAt(world, this.x, this.y, this.a)) {
      this.x = nx; this.y = ny; return 0;
    }
    const sp = this.speed;
    if (!this.blockedAt(world, nx, this.y, this.a)) { this.x = nx; this.vy *= -0.2; this.vx *= 0.85; }
    else if (!this.blockedAt(world, this.x, ny, this.a)) { this.y = ny; this.vx *= -0.2; this.vy *= 0.85; }
    else { this.vx *= -0.3; this.vy *= -0.3; }
    return sp;
  }

  damage(amt, by) {
    if (this.wreck || this.burn > 0) return;
    this.health -= amt;
    if (by) this.lastHitBy = by;
    if (this.health <= 0) { this.health = 0; this.burn = 2.2; }
  }

  draw(g, t) {
    const { w, l } = this.spec;
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.a);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(g, -l / 2 + 4, -w / 2 + 4, l, w, 5); g.fill();
    const body = this.wreck ? '#2b2a28' : this.color;
    if (this.type === 'truck') {
      g.fillStyle = body; roundRect(g, l / 2 - 16, -w / 2, 16, w, 4); g.fill();
      g.fillStyle = this.wreck ? '#333' : '#d8d8d8'; g.fillRect(-l / 2, -w / 2 - 1, l - 18, w + 2);
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(-l / 2 + 4, -w / 2 + 3, l - 26, w - 6);
      g.fillStyle = '#1d2b3a'; g.fillRect(l / 2 - 8, -w / 2 + 3, 4, w - 6);
    } else {
      g.fillStyle = body; roundRect(g, -l / 2, -w / 2, l, w, 6); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-l / 2 + 4, -w / 2 + 2, l - 8, 3);
      // windows
      g.fillStyle = this.wreck ? '#111' : '#1d2b3a';
      g.fillRect(l * 0.08, -w / 2 + 3, l * 0.18, w - 6);
      g.fillRect(-l * 0.36, -w / 2 + 3, l * 0.12, w - 6);
      if (this.type === 'pickup') { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-l / 2 + 3, -w / 2 + 3, l * 0.4, w - 6); }
      else { g.fillStyle = shadeSafe(body, 0.12); g.fillRect(-l * 0.24, -w / 2 + 3, l * 0.32, w - 6); }
      if (this.type === 'super' || this.type === 'sports') {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-l / 2 + 1, -w / 2 + 2, 3, w - 4);
      }
    }
    if (!this.wreck) {
      g.fillStyle = '#fff6c0';
      g.fillRect(l / 2 - 3, -w / 2 + 2, 3, 4); g.fillRect(l / 2 - 3, w / 2 - 6, 3, 4);
      g.fillStyle = this.braking ? '#ff2020' : '#8a1010';
      g.fillRect(-l / 2, -w / 2 + 2, 2, 4); g.fillRect(-l / 2, w / 2 - 6, 2, 4);
    }
    if (this.type === 'police' && !this.wreck) {
      g.fillStyle = '#1b2433'; g.fillRect(-l * 0.5 + 1, -w / 2, 6, w); g.fillRect(l / 2 - 7, -w / 2, 6, w);
      const on = this.mode === 'chase' && Math.floor(t * 8) % 2 === 0;
      g.fillStyle = this.mode === 'chase' ? (on ? '#ff2b2b' : '#2b6bff') : '#555';
      g.fillRect(-3, -w / 2 + 1, 5, w / 2 - 1);
      g.fillStyle = this.mode === 'chase' ? (on ? '#2b6bff' : '#ff2b2b') : '#555';
      g.fillRect(-3, 0, 5, w / 2 - 1);
    }
    if (this.mission && !this.wreck) {
      g.strokeStyle = '#ffd400'; g.lineWidth = 2;
      roundRect(g, -l / 2 - 3, -w / 2 - 3, l + 6, w + 6, 8); g.stroke();
    }
    g.restore();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function shadeSafe(c, a) { return c[0] === '#' && c.length === 7 ? shade(c, a) : c; }

// ------------------------------------------------------------------ people
const SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#ff6fb5', '#2ecc71'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a86b3c'];
const HAIRS = ['#1b1210', '#3b2314', '#7a4a1e', '#d9b36c', '#555', '#111'];

class Ped {
  constructor(kind, x, y) {
    this.kind = kind;   // civ | cop | gang
    this.x = x; this.y = y;
    this.a = rand(0, TAU);
    this.r = 9;
    this.health = kind === 'cop' ? 80 : kind === 'gang' ? 70 : 40;
    this.state = 'wander';
    this.t = rand(1, 4);
    this.cool = rand(0.5, 1.5);
    this.walk = 0;
    this.speed = 0;
    this.dead = false;
    this.deadT = 0;
    this.mission = false;
    this.arrest = 0;
    this.shirt = kind === 'cop' ? '#1d3557' : kind === 'gang' ? pick(['#2d6a4f', '#6a040f', '#3c096c']) : pick(SHIRTS);
    this.skin = pick(SKINS);
    this.hair = kind === 'cop' ? '#0d1b2a' : pick(HAIRS);
    this.armed = kind !== 'civ';
  }

  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    if (this.dead) {
      g.rotate(this.a);
      g.fillStyle = this.shirt; g.fillRect(-10, -5, 16, 10);
      g.fillStyle = this.skin; g.beginPath(); g.arc(9, 0, 5, 0, TAU); g.fill();
      g.restore();
      return;
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(3, 3, 9, 9, 0, 0, TAU); g.fill();
    g.rotate(this.a);
    const sw = Math.sin(this.walk) * 5 * Math.min(1, this.speed / 60);
    g.fillStyle = '#222';
    g.fillRect(-3 + sw, -6, 6, 4); g.fillRect(-3 - sw, 2, 6, 4);
    g.fillStyle = this.shirt;
    g.beginPath(); g.ellipse(0, 0, 6, 10, 0, 0, TAU); g.fill();
    if (this.armed) {
      g.fillStyle = '#111'; g.fillRect(4, 3, 12, 3);
      g.fillStyle = this.skin; g.beginPath(); g.arc(5, 5, 2.5, 0, TAU); g.fill();
    }
    g.fillStyle = this.skin; g.beginPath(); g.arc(1, 0, 5.5, 0, TAU); g.fill();
    g.fillStyle = this.hair; g.beginPath(); g.arc(-0.5, 0, 5, Math.PI * 0.5, Math.PI * 1.5); g.fill();
    if (this.kind === 'cop') { g.fillStyle = '#0d1b2a'; g.beginPath(); g.arc(0, 0, 5.8, Math.PI * 0.6, Math.PI * 1.4); g.fill(); }
    g.restore();
  }
}

function moveCircle(world, e, dx, dy) {
  const r = e.r * 0.8;
  const blocked = (x, y) => world.pedBlockedAt(x - r, y - r) || world.pedBlockedAt(x + r, y - r) ||
    world.pedBlockedAt(x - r, y + r) || world.pedBlockedAt(x + r, y + r);
  let moved = true;
  if (!blocked(e.x + dx, e.y)) e.x += dx; else moved = false;
  if (!blocked(e.x, e.y + dy)) e.y += dy; else moved = false;
  return moved;
}

// ------------------------------------------------------------------ effects
class Particle {
  constructor(x, y, vx, vy, life, size, color, grow = 0, fade = true) {
    Object.assign(this, { x, y, vx, vy, life, max: life, size, color, grow, fade });
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 1 - 2 * dt; this.vy *= 1 - 2 * dt;
    this.size += this.grow * dt;
    this.life -= dt;
    return this.life > 0;
  }
  draw(g) {
    g.globalAlpha = this.fade ? clamp(this.life / this.max, 0, 1) : 1;
    g.fillStyle = this.color;
    g.beginPath(); g.arc(this.x, this.y, Math.max(0.5, this.size), 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
}
