// World generation and rendering for the state of Leonida.
'use strict';

const T = 32;          // tile size in pixels
const MW = 256;        // map width in tiles
const MH = 256;        // map height in tiles
const GRID = 12;       // road grid spacing in tiles
const CHUNK = 32;      // chunk size in tiles

const TILE = {
  WATER: 0, SAND: 1, GRASS: 2, ROAD: 3, SIDEWALK: 4, BUILDING: 5, SWAMP: 6,
  FOREST: 7, BRIDGE: 8, FIELD: 9, PARK: 10, LOT: 11, TREE: 12,
};

const TILE_COLOR = {
  [TILE.WATER]: '#1c78ad', [TILE.SAND]: '#e6d29b', [TILE.GRASS]: '#5d9b47',
  [TILE.ROAD]: '#3a3c42', [TILE.SIDEWALK]: '#aaa79d', [TILE.BUILDING]: '#4a4a4a',
  [TILE.SWAMP]: '#4b6a3a', [TILE.FOREST]: '#2f5b2c', [TILE.BRIDGE]: '#5d5954',
  [TILE.FIELD]: '#b8a654', [TILE.PARK]: '#6fb35b', [TILE.LOT]: '#55575c', [TILE.TREE]: '#2f5b2c',
};

function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, s) {
  return vnoise(x, y, s) * 0.6 + vnoise(x * 2, y * 2, s + 1) * 0.3 + vnoise(x * 4, y * 4, s + 2) * 0.1;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const PASTELS = ['#f7a8c4', '#8fe3d6', '#ffd29d', '#c3b5f5', '#a8e6a1', '#f9f1a5', '#f5b7a0', '#9fd3f7'];
const GREYS = ['#6d7178', '#7c7f86', '#5c6067', '#8a8d93', '#6a6460', '#77706a'];
const WAREHOUSE = ['#8b8f96', '#9a8f7e', '#7d8a8f', '#a39e94'];

class World {
  constructor(seed = 2026) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.tiles = new Uint8Array(MW * MH);
    this.buildings = [];
    this.stores = [];
    this.lots = [];
    this.lamps = [];
    this.chunks = new Map();
    this.generate();
    this.buildGraph();
    this.buildChunkIndex();
    this.minimap = this.renderMinimap();
  }

  idx(x, y) { return y * MW + x; }
  get(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return TILE.WATER;
    return this.tiles[y * MW + x];
  }
  set(x, y, t) { if (x >= 0 && y >= 0 && x < MW && y < MH) this.tiles[y * MW + x] = t; }
  tileAt(px, py) { return this.get(Math.floor(px / T), Math.floor(py / T)); }

  regionAt(tx, ty) {
    for (const r of LEONIDA.regions) {
      const [x0, y0, x1, y1] = r.rect;
      if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) return r;
    }
    return null;
  }

  isLand(x, y) { const t = this.get(x, y); return t !== TILE.WATER; }
  isRoad(x, y) { const t = this.get(x, y); return t === TILE.ROAD || t === TILE.BRIDGE; }

  // ---------------------------------------------------------------- generation
  generate() {
    const rng = this.rng;
    const islands = [[132, 229, 11, 7], [156, 231, 9, 6], [181, 228, 12, 8], [205, 230, 10, 6], [231, 228, 13, 9]];

    // 1. Land and water
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const n = fbm(x / 14, y / 14, 7) * 8 - 4;
        let land = x > 5 + n && x < 245 + n * 0.3 && y > 5 + n && y < 204 + n;
        for (const [cx, cy, rx, ry] of islands) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry;
          if (dx * dx + dy * dy < 1 + n * 0.06) land = true;
        }
        // Inland lakes in Kalaga and Grassrivers
        const lake = fbm(x / 9, y / 9, 31);
        if (land && x > 10 && x < 160 && y > 100 && y < 198 && lake > 0.72) land = false;
        this.tiles[this.idx(x, y)] = land ? TILE.GRASS : TILE.WATER;
      }
    }

    // 2. Biomes
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        if (this.get(x, y) !== TILE.GRASS) continue;
        const r = this.regionAt(x, y);
        if (!r) continue;
        const n = fbm(x / 6, y / 6, 11);
        if (r.id === 'grass') {
          if (n > 0.64) this.set(x, y, TILE.WATER);
          else if (n > 0.38) this.set(x, y, TILE.SWAMP);
          else if (hash2(x, y, 5) > 0.93) this.set(x, y, TILE.TREE);
        } else if (r.id === 'kalaga') {
          if (n > 0.42) this.set(x, y, hash2(x, y, 3) > 0.55 ? TILE.TREE : TILE.FOREST);
          else if (hash2(x, y, 4) > 0.9) this.set(x, y, TILE.TREE);
        } else if (r.id === 'ambrosia') {
          if (n > 0.45 && n < 0.7) this.set(x, y, TILE.FIELD);
          else if (hash2(x, y, 9) > 0.97) this.set(x, y, TILE.TREE);
        } else if (r.id === 'keys' || r.id === 'gellhorn') {
          if (hash2(x, y, 6) > 0.95) this.set(x, y, TILE.TREE);
        }
      }
    }

    // 3. Beaches
    const beach = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const t = this.get(x, y);
        if (t === TILE.WATER || t === TILE.SWAMP) continue;
        const reg = this.regionAt(x, y);
        const rad = reg && (reg.id === 'vice' || reg.id === 'keys') ? 3 : 2;
        let near = false;
        for (let dy = -rad; dy <= rad && !near; dy++)
          for (let dx = -rad; dx <= rad && !near; dx++)
            if (this.get(x + dx, y + dy) === TILE.WATER && !(reg && reg.id === 'grass')) near = true;
        if (near) beach[this.idx(x, y)] = 1;
      }
    }
    for (let i = 0; i < beach.length; i++) if (beach[i]) this.tiles[i] = TILE.SAND;

    // 4. City grids
    const cities = [
      { id: 'vice', rect: [168, 12, 240, 192] },
      { id: 'gellhorn', rect: [12, 12, 72, 84] },
    ];
    for (const c of cities) {
      const [x0, y0, x1, y1] = c.rect;
      for (let y = y0; y <= y1 + 1; y++) {
        for (let x = x0; x <= x1 + 1; x++) {
          if ((x % GRID < 2 || y % GRID < 2) && this.get(x, y) !== TILE.WATER) this.set(x, y, TILE.ROAD);
        }
      }
    }

    // 5. Highways (bridges over water)
    const hw = (x0, y0, x1, y1) => {
      if (y0 === y1) {
        for (let x = x0; x <= x1 + 1; x++) for (let k = 0; k < 2; k++) this.setRoad(x, y0 + k);
      } else {
        for (let y = y0; y <= y1 + 1; y++) for (let k = 0; k < 2; k++) this.setRoad(x0 + k, y);
      }
    };
    hw(12, 96, 240, 96);    // Leonida Turnpike
    hw(72, 48, 168, 48);    // Ambrosia Road
    hw(72, 12, 72, 192);    // Kalaga Trail
    hw(120, 48, 120, 228);  // Grassrivers Parkway
    hw(156, 48, 156, 192);
    hw(72, 192, 240, 192);  // Southern Highway
    hw(120, 228, 240, 228); // Overseas Highway (Keys)
    hw(228, 192, 228, 228); // Seven Bridges
    hw(120, 144, 156, 144);
    hw(12, 144, 72, 144);
    hw(108, 12, 108, 48);

    // 6. Sidewalks in cities
    for (const c of cities) {
      const [x0, y0, x1, y1] = c.rect;
      for (let y = y0; y <= y1 + 1; y++) {
        for (let x = x0; x <= x1 + 1; x++) {
          const t = this.get(x, y);
          if (t === TILE.ROAD || t === TILE.WATER || t === TILE.BRIDGE) continue;
          let adj = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            if (this.get(x + dx, y + dy) === TILE.ROAD) adj = true;
          if (adj) this.set(x, y, TILE.SIDEWALK);
        }
      }
    }

    // 7. City blocks and buildings
    for (const c of cities) {
      const [x0, y0, x1, y1] = c.rect;
      for (let by = y0; by < y1; by += GRID) {
        for (let bx = x0; bx < x1; bx += GRID) this.fillBlock(c.id, bx + 3, by + 3, 8, 8);
      }
    }

    // 8. Ambrosia industry + penitentiary
    for (let bx = 84; bx < 156; bx += 12) {
      if (bx === 108) continue;
      if (rng() < 0.7) this.placeBuilding(bx + 2, 51, 7, 6, WAREHOUSE[Math.floor(rng() * WAREHOUSE.length)], 10, 'warehouse');
      if (rng() < 0.6) this.placeBuilding(bx + 2, 39, 7, 7, WAREHOUSE[Math.floor(rng() * WAREHOUSE.length)], 12, 'warehouse');
    }
    // Penitentiary: walled compound
    this.placeBuilding(92, 56, 12, 4, '#b9b3a6', 14, 'prison');
    this.placeBuilding(92, 66, 12, 4, '#b9b3a6', 14, 'prison');
    for (let y = 60; y < 66; y++) for (let x = 92; x < 104; x++) this.set(x, y, TILE.LOT);

    // 9. Keys houses and Grassrivers shacks
    for (let x = 122; x < 244; x += 3) {
      for (const side of [-1, 1]) {
        const y = side < 0 ? 224 : 232;
        if (rng() < 0.35 && this.areaFree(x, y, 2, 2, [TILE.GRASS, TILE.SAND])) {
          this.placeBuilding(x, y, 2, 2, PASTELS[Math.floor(rng() * PASTELS.length)], 4, 'house');
        }
      }
    }
    // Bait shop near node [10,15] = tile (121,181)
    if (true) {
      for (let y = 176; y < 180; y++) for (let x = 124; x < 130; x++) this.set(x, y, TILE.SAND);
      this.placeBuilding(125, 176, 4, 3, '#8b6b4a', 4, 'shack');
    }
    for (let i = 0; i < 40; i++) {
      const x = 86 + Math.floor(rng() * 66), y = 98 + Math.floor(rng() * 94);
      if (this.areaFree(x, y, 2, 2, [TILE.GRASS, TILE.SWAMP, TILE.SAND])) this.placeBuilding(x, y, 2, 2, '#7a6450', 3, 'shack');
    }
    for (let i = 0; i < 30; i++) {
      const x = 8 + Math.floor(rng() * 62), y = 100 + Math.floor(rng() * 96);
      if (this.areaFree(x, y, 3, 2, [TILE.GRASS, TILE.FOREST, TILE.SAND])) this.placeBuilding(x, y, 3, 2, '#7d5a3c', 4, 'cabin');
    }

    // 10. Street lamps at intersections
    for (let gy = 0; gy * GRID < MH; gy++) {
      for (let gx = 0; gx * GRID < MW; gx++) {
        const x = gx * GRID, y = gy * GRID;
        if (this.isRoad(x, y) && this.isRoad(x + 1, y + 1)) this.lamps.push({ x: (x + 1) * T, y: (y + 1) * T });
      }
    }
  }

  setRoad(x, y) {
    const t = this.get(x, y);
    if (t === TILE.WATER || t === TILE.BRIDGE) this.set(x, y, TILE.BRIDGE);
    else this.set(x, y, TILE.ROAD);
  }

  areaFree(x, y, w, h, allowed) {
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
      const t = this.get(x + i, y + j);
      if (j >= 0 && j < h && i >= 0 && i < w) { if (!allowed.includes(t)) return false; }
      else if (t === TILE.BUILDING) return false;
    }
    return true;
  }

  fillBlock(city, x, y, w, h) {
    const rng = this.rng;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const t = this.get(x + i, y + j);
      if (t === TILE.WATER || t === TILE.ROAD || t === TILE.BRIDGE) return;
    }
    const roll = rng();
    const downtown = city === 'vice' && x > 186 && x < 226 && y > 60 && y < 130;
    const beachfront = city === 'vice' && x >= 226;
    if (roll < (city === 'gellhorn' ? 0.16 : 0.08) && !downtown) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        this.set(x + i, y + j, hash2(x + i, y + j, 21) > 0.85 ? TILE.TREE : TILE.PARK);
      }
      return;
    }
    if (roll < 0.16) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, TILE.LOT);
      this.lots.push({ x, y, w, h });
      return;
    }
    const palette = city === 'gellhorn' ? GREYS.concat(['#b58a62', '#9c7a5a']) : (beachfront || rng() < 0.5 ? PASTELS : GREYS);
    const pick = () => palette[Math.floor(rng() * palette.length)];
    const hBase = downtown ? 40 : beachfront ? 22 : city === 'vice' ? 14 : 8;
    const layout = downtown ? (rng() < 0.6 ? 0 : 1) : Math.floor(rng() * 4);
    const parts = [];
    if (layout === 0) parts.push([0, 0, 8, 8]);
    else if (layout === 1) parts.push([0, 0, 8, 4], [0, 4, 8, 4]);
    else if (layout === 2) parts.push([0, 0, 4, 8], [4, 0, 4, 8]);
    else parts.push([0, 0, 4, 4], [4, 0, 4, 4], [0, 4, 4, 4], [4, 4, 4, 4]);
    for (const [px, py, pw, ph] of parts) {
      const height = hBase + Math.floor(rng() * hBase);
      const b = this.placeBuilding(x + px, y + py, pw, ph, pick(), height, downtown ? 'tower' : beachfront ? 'hotel' : 'block');
      // Some small buildings become stores
      if (pw * ph <= 32 && rng() < 0.22) this.makeStore(b, x, y, w, h);
    }
  }

  placeBuilding(x, y, w, h, color, height, kind) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, TILE.BUILDING);
    const b = { x, y, w, h, color, height, kind, seed: Math.floor(this.rng() * 1e9) };
    this.buildings.push(b);
    return b;
  }

  makeStore(b, bx, by, bw, bh) {
    // Door on the edge facing a sidewalk
    let dx, dy;
    if (b.y === by) { dx = (b.x + b.w / 2) * T; dy = b.y * T - 14; }
    else if (b.y + b.h === by + bh) { dx = (b.x + b.w / 2) * T; dy = (b.y + b.h) * T + 14; }
    else if (b.x === bx) { dx = b.x * T - 14; dy = (b.y + b.h / 2) * T; }
    else { dx = (b.x + b.w) * T + 14; dy = (b.y + b.h / 2) * T; }
    const names = ['24/7', 'Rob\'s Liquor', 'Limited Gas', 'Vice Mart', 'Bean Machine', 'Cluckin\' Bell', 'Pharmacy', 'Burger Shot'];
    b.store = true;
    this.stores.push({ x: dx, y: dy, name: names[this.stores.length % names.length], cooldown: 0, building: b });
  }

  // ---------------------------------------------------------------- road graph
  buildGraph() {
    const n = Math.ceil(MW / GRID);
    this.gn = n;
    this.nodes = new Array(n * n).fill(null);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * GRID, y = j * GRID;
      if (this.isRoad(x, y) && this.isRoad(x + 1, y) && this.isRoad(x, y + 1) && this.isRoad(x + 1, y + 1)) {
        this.nodes[j * n + i] = { i, j, id: j * n + i, x: (x + 1) * T, y: (y + 1) * T, adj: [] };
      }
    }
    const segOk = (x0, y0, dx, dy) => {
      for (let k = 0; k <= GRID; k++) {
        const x = x0 + dx * k, y = y0 + dy * k;
        if (!this.isRoad(x, y) || !this.isRoad(x + dy, y + dx)) return false;
      }
      return true;
    };
    for (const nd of this.nodes) {
      if (!nd) continue;
      const e = this.node(nd.i + 1, nd.j);
      if (e && segOk(nd.i * GRID, nd.j * GRID, 1, 0)) { nd.adj.push(e.id); e.adj.push(nd.id); }
      const s = this.node(nd.i, nd.j + 1);
      if (s && segOk(nd.i * GRID, nd.j * GRID, 0, 1)) { nd.adj.push(s.id); s.adj.push(nd.id); }
    }
    this.nodeList = this.nodes.filter(nd => nd && nd.adj.length > 0);
  }

  node(i, j) {
    if (i < 0 || j < 0 || i >= this.gn || j >= this.gn) return null;
    return this.nodes[j * this.gn + i];
  }

  nearestNode(px, py) {
    let best = null, bd = Infinity;
    const ci = Math.round((px / T - 1) / GRID), cj = Math.round((py / T - 1) / GRID);
    for (let r = 0; r < 6 && !best; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        const nd = this.node(i, j);
        if (!nd || nd.adj.length === 0) continue;
        const d = (nd.x - px) ** 2 + (nd.y - py) ** 2;
        if (d < bd) { bd = d; best = nd; }
      }
    }
    return best;
  }

  // BFS path between nodes; returns array of node ids
  path(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = new Map([[fromId, -1]]);
    const q = [fromId];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      for (const nb of this.nodes[cur].adj) {
        if (prev.has(nb)) continue;
        prev.set(nb, cur);
        if (nb === toId) {
          const out = [nb];
          let c = cur;
          while (c !== -1) { out.push(c); c = prev.get(c); }
          return out.reverse();
        }
        q.push(nb);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- collision
  solidForCar(t) { return t === TILE.WATER || t === TILE.BUILDING || t === TILE.TREE; }
  solidForPed(t) { return t === TILE.WATER || t === TILE.BUILDING || t === TILE.TREE; }
  carBlockedAt(px, py) { return this.solidForCar(this.tileAt(px, py)); }
  pedBlockedAt(px, py) { return this.solidForPed(this.tileAt(px, py)); }
  bulletBlockedAt(px, py) { const t = this.tileAt(px, py); return t === TILE.BUILDING; }

  lineOfSight(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / 16);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (this.bulletBlockedAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  // Find a walkable (or drivable) tile near a pixel position
  nearestFree(px, py, forCar) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    for (let r = 0; r < 12; r++) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const t = this.get(tx + i, ty + j);
        if (forCar ? !this.solidForCar(t) : !this.solidForPed(t)) return { x: (tx + i + 0.5) * T, y: (ty + j + 0.5) * T };
      }
    }
    return { x: px, y: py };
  }

  // ---------------------------------------------------------------- rendering
  buildChunkIndex() {
    this.chunkBuildings = new Map();
    for (const b of this.buildings) {
      const cx0 = Math.floor((b.x - 1) / CHUNK), cx1 = Math.floor((b.x + b.w + 1) / CHUNK);
      const cy0 = Math.floor((b.y - 1) / CHUNK), cy1 = Math.floor((b.y + b.h + 1) / CHUNK);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const k = cx + ',' + cy;
        if (!this.chunkBuildings.has(k)) this.chunkBuildings.set(k, []);
        this.chunkBuildings.get(k).push(b);
      }
    }
  }

  getChunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = this.chunks.get(k);
    if (c) { this.chunks.delete(k); this.chunks.set(k, c); return c; }
    c = this.renderChunk(cx, cy);
    this.chunks.set(k, c);
    if (this.chunks.size > 24) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  }

  renderChunk(cx, cy) {
    const size = CHUNK * T;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const g = cv.getContext('2d');
    const ox = cx * CHUNK, oy = cy * CHUNK;
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) this.drawTile(g, ox + i, oy + j, i * T, j * T);
    }
    // trees on top
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      if (this.get(ox + i, oy + j) === TILE.TREE) this.drawTree(g, ox + i, oy + j, i * T, j * T);
    }
    const bl = this.chunkBuildings.get(cx + ',' + cy) || [];
    g.save();
    g.translate(-ox * T, -oy * T);
    for (const b of bl) this.drawBuildingShadow(g, b);
    for (const b of bl) this.drawBuilding(g, b);
    g.restore();
    return cv;
  }

  drawTile(g, x, y, px, py) {
    const t = this.get(x, y);
    const v = hash2(x, y, 1);
    let col = TILE_COLOR[t];
    if (t === TILE.WATER) {
      let shore = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.get(x + dx, y + dy) !== TILE.WATER && this.get(x + dx, y + dy) !== TILE.BRIDGE) shore = true;
      const deep = fbm(x / 10, y / 10, 77);
      col = shore ? '#36a9c4' : deep > 0.55 ? '#1a6fa3' : '#1d7cb0';
      if (this.regionAt(x, y)?.id === 'grass') col = shore ? '#3f7d6a' : '#33695a';
    }
    g.fillStyle = col;
    g.fillRect(px, py, T, T);
    // texture
    g.globalAlpha = 0.035;
    g.fillStyle = v > 0.5 ? '#fff' : '#000';
    g.fillRect(px, py, T, T);
    g.globalAlpha = 1;

    switch (t) {
      case TILE.WATER:
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.lineWidth = 1.5;
        if (v > 0.6) { g.beginPath(); g.moveTo(px + 6, py + 12); g.quadraticCurveTo(px + 12, py + 8, px + 18, py + 12); g.stroke(); }
        break;
      case TILE.SAND:
        g.fillStyle = 'rgba(160,130,80,0.25)';
        for (let k = 0; k < 4; k++) g.fillRect(px + hash2(x, y, k + 10) * 30, py + hash2(x, y, k + 20) * 30, 2, 2);
        break;
      case TILE.GRASS: case TILE.PARK:
        g.fillStyle = 'rgba(30,70,20,0.25)';
        for (let k = 0; k < 3; k++) g.fillRect(px + hash2(x, y, k + 10) * 28, py + hash2(x, y, k + 20) * 28, 3, 3);
        break;
      case TILE.SWAMP:
        g.strokeStyle = 'rgba(160,190,90,0.5)';
        g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const rx = px + 4 + hash2(x, y, k + 30) * 24, ry = py + 6 + hash2(x, y, k + 40) * 22;
          g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + 2, ry - 7); g.stroke();
        }
        break;
      case TILE.FIELD:
        g.fillStyle = 'rgba(120,100,40,0.35)';
        for (let k = 0; k < T; k += 8) g.fillRect(px, py + k, T, 3);
        break;
      case TILE.LOT:
        g.fillStyle = 'rgba(255,255,255,0.5)';
        if (x % 2 === 0) g.fillRect(px, py + 2, 2, 12);
        break;
      case TILE.ROAD: case TILE.BRIDGE:
        this.drawRoadMarks(g, x, y, px, py, t);
        break;
      case TILE.SIDEWALK:
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = 1;
        g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
        break;
    }
  }

  drawRoadMarks(g, x, y, px, py, t) {
    const mx = x % GRID, my = y % GRID;
    const horiz = my < 2 && mx >= 2;
    const vert = mx < 2 && my >= 2;
    g.fillStyle = '#e8c547';
    if (horiz && my === 0 && this.isRoad(x, y + 1)) {
      if (x % 2 === 0) g.fillRect(px + 4, py + T - 1.5, 22, 3);
    } else if (horiz && my === 1) {
      // nothing; marking drawn by the upper tile
    }
    if (vert && mx === 0 && this.isRoad(x + 1, y)) {
      if (y % 2 === 0) g.fillRect(px + T - 1.5, py + 4, 3, 22);
    }
    // Crosswalks next to intersections in cities
    g.fillStyle = 'rgba(255,255,255,0.55)';
    if (horiz && (mx === 2 || mx === GRID - 1) && this.get(x, y - (my === 0 ? 1 : -1)) === TILE.SIDEWALK) {
      for (let k = 2; k < T; k += 6) g.fillRect(px + 8, py + k, 16, 3);
    }
    if (vert && (my === 2 || my === GRID - 1) && this.get(x - (mx === 0 ? 1 : -1), y) === TILE.SIDEWALK) {
      for (let k = 2; k < T; k += 6) g.fillRect(px + k, py + 8, 3, 16);
    }
    if (t === TILE.BRIDGE) {
      g.fillStyle = '#9b958c';
      if (!this.isRoad(x, y - 1)) g.fillRect(px, py, T, 4);
      if (!this.isRoad(x, y + 1)) g.fillRect(px, py + T - 4, T, 4);
      if (!this.isRoad(x - 1, y)) g.fillRect(px, py, 4, T);
      if (!this.isRoad(x + 1, y)) g.fillRect(px + T - 4, py, 4, T);
    }
  }

  drawTree(g, x, y, px, py) {
    const r = 11 + hash2(x, y, 2) * 6;
    const cx = px + T / 2 + (hash2(x, y, 3) - 0.5) * 8, cy = py + T / 2 + (hash2(x, y, 4) - 0.5) * 8;
    const palm = this.regionAt(x, y)?.id === 'vice' || this.regionAt(x, y)?.id === 'keys';
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(cx + 5, cy + 5, r, 0, Math.PI * 2); g.fill();
    if (palm) {
      g.strokeStyle = '#3f8f3a'; g.lineWidth = 4; g.lineCap = 'round';
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + hash2(x, y, 5);
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
      }
      g.fillStyle = '#7a5a30'; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#26501f'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3c7a30'; g.beginPath(); g.arc(cx - 3, cy - 3, r * 0.6, 0, Math.PI * 2); g.fill();
    }
  }

  drawBuildingShadow(g, b) {
    const off = Math.min(26, 4 + b.height * 0.4);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(b.x * T + off, b.y * T + off, b.w * T, b.h * T);
  }

  drawBuilding(g, b) {
    const x = b.x * T + 2, y = b.y * T + 2, w = b.w * T - 4, h = b.h * T - 4;
    const r = mulberry32(b.seed);
    g.fillStyle = shade(b.color, -0.25);
    g.fillRect(x, y, w, h);
    g.fillStyle = b.color;
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.strokeStyle = shade(b.color, 0.25);
    g.lineWidth = 2;
    g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    if (b.kind === 'tower') {
      g.fillStyle = shade(b.color, -0.12);
      g.fillRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6);
      if (r() < 0.4) {
        g.strokeStyle = '#f2f2f2'; g.lineWidth = 3;
        g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.22, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#f2f2f2'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('H', x + w / 2, y + h / 2 + 1);
      }
    } else if (b.kind === 'hotel' && r() < 0.6 && w > 60) {
      g.fillStyle = '#4fd1e8';
      g.fillRect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.35);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.35);
    } else if (b.kind === 'warehouse') {
      g.strokeStyle = shade(b.color, -0.15); g.lineWidth = 2;
      for (let k = x + 12; k < x + w - 4; k += 12) { g.beginPath(); g.moveTo(k, y + 4); g.lineTo(k, y + h - 4); g.stroke(); }
    } else if (b.kind === 'prison') {
      g.strokeStyle = '#555'; g.lineWidth = 3; g.strokeRect(x - 2, y - 2, w + 4, h + 4);
    }
    // rooftop units
    const n = Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const ux = x + 10 + r() * (w - 30), uy = y + 10 + r() * (h - 30);
      g.fillStyle = '#9da2a8'; g.fillRect(ux, uy, 10, 8);
      g.fillStyle = '#6c7177'; g.fillRect(ux + 2, uy + 2, 6, 4);
    }
    if (b.store) {
      g.fillStyle = '#1db954'; g.fillRect(x + w / 2 - 14, y + h / 2 - 9, 28, 18);
      g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('$', x + w / 2, y + h / 2 + 1);
    }
  }

  renderMinimap() {
    const cv = document.createElement('canvas');
    cv.width = MW; cv.height = MH;
    const g = cv.getContext('2d');
    const img = g.createImageData(MW, MH);
    const cols = {
      [TILE.WATER]: [40, 110, 160], [TILE.SAND]: [220, 200, 150], [TILE.GRASS]: [90, 140, 70], [TILE.ROAD]: [235, 235, 235],
      [TILE.SIDEWALK]: [150, 150, 145], [TILE.BUILDING]: [95, 95, 105], [TILE.SWAMP]: [75, 105, 60], [TILE.FOREST]: [45, 90, 45],
      [TILE.BRIDGE]: [235, 235, 235], [TILE.FIELD]: [180, 165, 90], [TILE.PARK]: [110, 175, 90], [TILE.LOT]: [120, 120, 125], [TILE.TREE]: [40, 80, 40],
    };
    for (let i = 0; i < MW * MH; i++) {
      const c = cols[this.tiles[i]];
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
