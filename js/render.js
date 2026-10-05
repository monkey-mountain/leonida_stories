// 3D first-person renderer built on Three.js.
// The simulation runs on a 2D plane (x, y); here world x -> three X, world y -> three Z, height -> three Y.
'use strict';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
const WHEEL_GEO = new THREE.CylinderGeometry(3.2, 3.2, 2.6, 12).rotateX(Math.PI / 2);
const HEAD_GEO = new THREE.SphereGeometry(2.7, 10, 8);
const CHUNK_GEO = new THREE.PlaneGeometry(CHUNK * T, CHUNK * T).rotateX(-Math.PI / 2);
const VEH_HEIGHT = { sedan: 14, compact: 13, sports: 11.5, super: 11, muscle: 12.5, suv: 17, pickup: 16, truck: 30, police: 14 };

const Render = {
  W: 0, H: 0,
  meshes: new Map(),
  matCache: new Map(),
  colorCache: new Map(),
  labelCache: new Map(),
  ground: new Map(),
  pools: {},
  chase: { x: 0, y: 0, z: 0, init: false },
  title: { t: 0 },

  init(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#87c8f0');
    scene.fog = new THREE.Fog('#87c8f0', 500, 2100);
    const cam = this.camera = new THREE.PerspectiveCamera(72, 1, 1, 6000);
    cam.rotation.order = 'YXZ';
    scene.add(cam);

    this.hemi = new THREE.HemisphereLight('#dff3ff', '#5a6b4a', 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4dd', 0.8);
    this.sun.position.set(0.5, 1, 0.3);
    scene.add(this.sun);
    this.flash = new THREE.PointLight('#ffd27a', 0, 400, 2);
    scene.add(this.flash);
    this.lampLights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight('#ffd9a0', 0, 260, 1.6);
      scene.add(l); this.lampLights.push(l);
    }
    this.headlight = new THREE.SpotLight('#fff8e0', 0, 700, 0.55, 0.5, 1.2);
    scene.add(this.headlight); scene.add(this.headlight.target);

    // Ocean around the map
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#1c6fa3' }));
    ocean.position.set(MW * T / 2, -1.2, MH * T / 2);
    scene.add(ocean);

    this.buildFx();
    this.buildViewmodel();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.renderer.setSize(this.W, this.H, false);
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    this.updatePointScale();
  },

  updatePointScale() {
    if (this.pointMat) this.pointMat.uniforms.scale.value = this.H * this.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  },

  // ---------------------------------------------------------------- materials
  lam(color) {
    const k = 'l' + color;
    let m = this.matCache.get(k);
    if (!m) { m = new THREE.MeshLambertMaterial({ color }); this.matCache.set(k, m); }
    return m;
  },
  basic(color, opts) {
    const k = 'b' + color + (opts ? JSON.stringify(opts) : '');
    let m = this.matCache.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial(Object.assign({ color }, opts || {})); this.matCache.set(k, m); }
    return m;
  },
  glow(color) {
    return this.basic(color, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  },
  box(parent, mat, sx, sy, sz, x, y, z) {
    const m = new THREE.Mesh(UNIT_BOX, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    parent.add(m);
    return m;
  },
  parseColor(str) {
    let c = this.colorCache.get(str);
    if (c) return c;
    let a = 1, col;
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(Number);
      col = new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255);
      if (parts.length > 3) a = parts[3];
    } else col = new THREE.Color(str);
    c = { r: col.r, g: col.g, b: col.b, a };
    this.colorCache.set(str, c);
    return c;
  },

  // ---------------------------------------------------------------- static world
  setupWorld(world) {
    this.world = world;
    this.buildOverview(world);
    this.buildBuildings(world);
    this.buildTrees(world);
    this.buildLamps(world);
    this.buildStoreSigns(world);
  },

  buildOverview(world) {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 1024;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(world.minimap, 0, 0, 1024, 1024);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(MW * T, MH * T).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex }));
    mesh.position.set(MW * T / 2, -0.6, MH * T / 2);
    this.scene.add(mesh);
  },

  windowTextures() {
    const make = (lit) => {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 256;
      const g = cv.getContext('2d');
      g.fillStyle = lit ? '#000' : '#fff';
      g.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        if (lit) {
          if (hash2(i, j, 99) < 0.45) continue;
          g.fillStyle = hash2(i, j, 98) > 0.3 ? '#ffd98a' : '#bfe4ff';
        } else g.fillStyle = '#34465a';
        g.fillRect(i * 32 + 6, j * 32 + 7, 20, 17);
        if (!lit) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(i * 32 + 6, j * 32 + 7, 20, 3); }
      }
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    };
    return [make(false), make(true)];
  },

  buildBuildings(world) {
    const wp = [], wn = [], wu = [], wc = [];
    const rp = [], rn = [], rc = [];
    const col = new THREE.Color();
    const pushV = (arr, ...v) => { for (const x of v) arr.push(x); };
    const wall = (ax, az, bx, bz, h, nx, nz, c, len) => {
      const u = len / 224, v = h / 240;
      const verts = [[ax, 0, az, 0, 0], [bx, 0, bz, u, 0], [bx, h, bz, u, v], [ax, 0, az, 0, 0], [bx, h, bz, u, v], [ax, h, az, 0, v]];
      for (const [x, y, z, uu, vv] of verts) {
        pushV(wp, x, y, z); pushV(wn, nx, 0, nz); pushV(wu, uu, vv); pushV(wc, c.r, c.g, c.b);
      }
    };
    const roofQuad = (x0, z0, x1, z1, y, c) => {
      const verts = [[x0, z0], [x1, z1], [x1, z0], [x0, z0], [x0, z1], [x1, z1]];
      for (const [x, z] of verts) { pushV(rp, x, y, z); pushV(rn, 0, 1, 0); pushV(rc, c.r, c.g, c.b); }
    };
    for (const b of world.buildings) {
      const x0 = b.x * T + 2, z0 = b.y * T + 2, x1 = (b.x + b.w) * T - 2, z1 = (b.y + b.h) * T - 2;
      const h = 18 + b.height * 4;
      b.h3 = h;
      col.set(b.color);
      wall(x0, z0, x1, z0, h, 0, -1, col, x1 - x0);
      wall(x1, z0, x1, z1, h, 1, 0, col, z1 - z0);
      wall(x1, z1, x0, z1, h, 0, 1, col, x1 - x0);
      wall(x0, z1, x0, z0, h, -1, 0, col, z1 - z0);
      const rcol = col.clone().multiplyScalar(0.72);
      roofQuad(x0, z0, x1, z1, h, rcol);
      // Rooftop units for some character
      const rr = mulberry32(b.seed);
      const units = Math.floor(rr() * 3);
      for (let k = 0; k < units; k++) {
        const ux = x0 + 12 + rr() * (x1 - x0 - 34), uz = z0 + 12 + rr() * (z1 - z0 - 34), us = 8 + rr() * 6, uh = 5 + rr() * 5;
        const c2 = new THREE.Color('#9da2a8');
        roofQuad(ux, uz, ux + us, uz + us, h + uh, c2);
        const c3 = new THREE.Color('#7d8288');
        wall(ux, uz, ux + us, uz, h + uh, 0, -1, c3, 0); wall(ux + us, uz, ux + us, uz + us, h + uh, 1, 0, c3, 0);
        wall(ux + us, uz + us, ux, uz + us, h + uh, 0, 1, c3, 0); wall(ux, uz + us, ux, uz, h + uh, -1, 0, c3, 0);
      }
    }
    const [wallTex, litTex] = this.windowTextures();
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    this.wallMat = new THREE.MeshLambertMaterial({ map: wallTex, vertexColors: true, emissive: '#ffffff', emissiveMap: litTex, emissiveIntensity: 0, side: THREE.DoubleSide });
    this.scene.add(new THREE.Mesh(wg, this.wallMat));
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    rg.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    this.scene.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  },

  buildTrees(world) {
    const kinds = { palm: [], pine: [], round: [] };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (world.get(x, y) !== TILE.TREE) continue;
      const reg = world.regionAt(x, y);
      const kind = reg && (reg.id === 'vice' || reg.id === 'keys') ? 'palm' : reg && reg.id === 'kalaga' ? 'pine' : (hash2(x, y, 8) > 0.6 ? 'pine' : 'round');
      kinds[kind].push([(x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.4) * T, (y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.4) * T, 0.8 + hash2(x, y, 2) * 0.5]);
    }
    const total = kinds.palm.length + kinds.pine.length + kinds.round.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 6), this.lam('#6b4a2b'), total);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let ti = 0;
    const canopy = (geo, color, list, place) => {
      const im = new THREE.InstancedMesh(geo, this.lam(color), list.length);
      const c = new THREE.Color();
      list.forEach(([x, z, k], i) => {
        const { th, cy, cs } = place(k);
        s.set(2.2 * k, th, 2.2 * k); p.set(x, th / 2, z);
        trunk.setMatrixAt(ti++, m4.compose(p, q, s));
        s.set(cs[0], cs[1], cs[2]); p.set(x, cy, z);
        im.setMatrixAt(i, m4.compose(p, q, s));
        im.setColorAt(i, c.set(color).multiplyScalar(0.8 + hash2(x | 0, z | 0, 1) * 0.4));
      });
      this.scene.add(im);
    };
    canopy(new THREE.SphereGeometry(1, 8, 4), '#3f8f3a', kinds.palm, k => ({ th: 46 * k, cy: 46 * k, cs: [17 * k, 4 * k, 17 * k] }));
    canopy(new THREE.ConeGeometry(1, 1, 7), '#2a5a2a', kinds.pine, k => ({ th: 10 * k, cy: 10 * k + 20 * k, cs: [12 * k, 40 * k, 12 * k] }));
    canopy(new THREE.IcosahedronGeometry(1, 0), '#3c7a30', kinds.round, k => ({ th: 14 * k, cy: 22 * k, cs: [14 * k, 12 * k, 14 * k] }));
    this.scene.add(trunk);
  },

  buildLamps(world) {
    const n = world.lamps.length;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 1.1, 1, 6), this.lam('#4a4f55'), n);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: '#cccccc' });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 8, 6), this.bulbMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.lampPos = [];
    world.lamps.forEach((l, i) => {
      const x = l.x + 40, z = l.y + 40;
      this.lampPos.push({ x, y: z });
      poles.setMatrixAt(i, m4.compose(p.set(x, 21, z), q, s.set(1, 42, 1)));
      bulbs.setMatrixAt(i, m4.compose(p.set(x, 42, z), q, s.set(1, 1, 1)));
    });
    this.scene.add(poles); this.scene.add(bulbs);
  },

  buildStoreSigns(world) {
    const n = world.stores.length;
    const signs = new THREE.InstancedMesh(UNIT_BOX, this.basic('#1db954'), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    world.stores.forEach((st, i) => signs.setMatrixAt(i, m4.compose(p.set(st.x, 26, st.y), q, s.set(10, 7, 10))));
    this.scene.add(signs);
  },

  updateGround() {
    const cs = CHUNK * T, cx = this.camera.position.x, cz = this.camera.position.z;
    const R = 1750;
    const want = [];
    for (let j = 0; j < MH / CHUNK; j++) for (let i = 0; i < MW / CHUNK; i++) {
      const nx = clamp(cx, i * cs, (i + 1) * cs), nz = clamp(cz, j * cs, (j + 1) * cs);
      const d = Math.hypot(nx - cx, nz - cz);
      if (d < R) want.push([d, i, j]);
    }
    want.sort((a, b) => a[0] - b[0]);
    let built = 0;
    for (const [, i, j] of want) {
      const k = i + ',' + j;
      const g = this.ground.get(k);
      if (g) { g.used = this.frame; continue; }
      if (built >= 1 && this.ground.size > 0) continue; // spread chunk generation across frames
      const tex = new THREE.CanvasTexture(this.world.renderGround(i, j, 1024));
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const mesh = new THREE.Mesh(CHUNK_GEO, new THREE.MeshLambertMaterial({ map: tex }));
      mesh.position.set((i + 0.5) * cs, 0, (j + 0.5) * cs);
      this.scene.add(mesh);
      this.ground.set(k, { mesh, tex, used: this.frame });
      built++;
    }
    if (this.ground.size > 14) {
      const old = [...this.ground.entries()].filter(([, g]) => g.used !== this.frame).sort((a, b) => a[1].used - b[1].used);
      for (const [k, g] of old.slice(0, this.ground.size - 14)) {
        this.scene.remove(g.mesh); g.tex.dispose(); g.mesh.material.dispose();
        this.ground.delete(k);
      }
    }
  },

  // ---------------------------------------------------------------- entity models
  makeVehicle(v) {
    const { w, l } = v.spec;
    const H = VEH_HEIGHT[v.type] || 14;
    const g = new THREE.Group();
    const body = this.lam(v.color), glass = this.lam('#1a2633'), dark = this.lam('#151515');
    const bodies = [];
    const bTop = 3 + H * 0.45;
    if (v.type === 'truck') {
      bodies.push(this.box(g, body, 16, H * 0.7, w, l / 2 - 8, 3 + H * 0.35, 0));
      this.box(g, glass, 3, H * 0.25, w * 0.9, l / 2 - 1, 3 + H * 0.55, 0);
      bodies.push(this.box(g, this.lam('#e2e2e2'), l - 18, H, w + 2, -9, 3 + H / 2, 0));
    } else {
      bodies.push(this.box(g, body, l, H * 0.45, w, 0, 3 + H * 0.225, 0));
      const cabL = v.type === 'pickup' ? l * 0.3 : l * 0.48, cabX = v.type === 'pickup' ? l * 0.08 : -l * 0.08;
      this.box(g, glass, cabL, H * 0.4, w * 0.88, cabX, bTop + H * 0.2, 0);
      const roof = this.box(g, body, cabL * 0.9, 0.8, w * 0.84, cabX, bTop + H * 0.4 + 0.4, 0);
      bodies.push(roof);
      g.userData.roof = roof;
      if (v.type === 'pickup') this.box(g, dark, l * 0.38, 0.5, w * 0.8, -l * 0.28, bTop + 0.2, 0);
      if (v.type === 'police') {
        this.box(g, dark, l * 0.5, H * 0.2, w + 0.2, 0, 3 + H * 0.15, 0);
        g.userData.bar1 = this.box(g, this.basic('#550000'), 3, 1.6, w * 0.4, cabX, bTop + H * 0.4 + 1.6, -w * 0.22);
        g.userData.bar2 = this.box(g, this.basic('#000055'), 3, 1.6, w * 0.4, cabX, bTop + H * 0.4 + 1.6, w * 0.22);
      }
    }
    // lights
    const hl = this.basic('#fff6c8');
    this.box(g, hl, 0.6, 2, 3.5, l / 2, 3 + H * 0.3, -w / 2 + 3);
    this.box(g, hl, 0.6, 2, 3.5, l / 2, 3 + H * 0.3, w / 2 - 3);
    const tail = this.basic('#6a0a0a');
    g.userData.tails = [this.box(g, tail, 0.6, 2, 3.5, -l / 2, 3 + H * 0.3, -w / 2 + 3), this.box(g, tail, 0.6, 2, 3.5, -l / 2, 3 + H * 0.3, w / 2 - 3)];
    // wheels
    const wm = this.lam('#111111');
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const wh = new THREE.Mesh(WHEEL_GEO, wm);
      wh.position.set(sx * l * 0.32, 3.2, sz * (w / 2 - 1));
      g.add(wh);
    }
    g.userData.bodies = bodies;
    g.userData.H = H;
    return g;
  },

  makePed(e, colors) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const shirt = this.lam(colors.shirt), skin = this.lam(colors.skin), pants = this.lam(colors.pants || '#2b2f3a'), hair = this.lam(colors.hair);
    const legs = [];
    for (const z of [-1.6, 1.6]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 8.5, z);
      this.box(pivot, pants, 2.8, 8.5, 2.6, 0, -4.25, 0);
      inner.add(pivot); legs.push(pivot);
    }
    this.box(inner, shirt, 4.4, 7.5, 7.4, 0, 12.2, 0);
    const arms = [];
    for (const z of [-4.6, 4.6]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 15.5, z);
      this.box(pivot, shirt, 2.4, 3, 2.2, 0, -1.5, 0);
      this.box(pivot, skin, 2.2, 4.2, 2, 0, -5, 0);
      inner.add(pivot); arms.push(pivot);
    }
    const head = new THREE.Mesh(HEAD_GEO, skin);
    head.position.set(0.3, 18.5, 0);
    inner.add(head);
    const hr = new THREE.Mesh(HEAD_GEO, hair);
    hr.scale.set(1.05, 0.55, 1.05); hr.position.set(-0.4, 20, 0);
    inner.add(hr);
    if (e.kind === 'cop') this.box(inner, this.lam('#0d1b2a'), 6.4, 1.6, 6.2, 0.6, 21, 0);
    if (e.armed) {
      const gun = this.box(arms[1], this.lam('#111111'), 6, 1.4, 1.2, 3, -6.5, 0);
      arms[1].rotation.z = Math.PI / 2.3;
      g.userData.gun = gun;
    }
    g.userData = Object.assign(g.userData, { inner, legs, arms });
    return g;
  },

  syncEntities() {
    const seen = new Set();
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const near = (e) => Math.abs(e.x - cx) < 1900 && Math.abs(e.y - cz) < 1900;
    const t = G.t;
    for (const v of G.vehicles) {
      if (!near(v)) continue;
      seen.add(v);
      let m = this.meshes.get(v);
      if (!m) { m = this.makeVehicle(v); this.meshes.set(v, m); this.scene.add(m); }
      m.position.set(v.x, 0, v.y);
      m.rotation.y = -v.a;
      const ud = m.userData;
      if (ud.roof) ud.roof.visible = !(v === G.player.vehicle && G.camMode === 'fp' && G.state !== 'title');
      if (v.wreck && !ud.burnt) { ud.burnt = true; for (const b of ud.bodies) b.material = this.lam('#2b2a28'); }
      for (const tl of ud.tails) tl.material = v.braking ? this.basic('#ff2020') : this.basic('#6a0a0a');
      if (ud.bar1) {
        const on = v.mode === 'chase' && Math.floor(t * 8) % 2 === 0;
        const active = v.mode === 'chase';
        ud.bar1.material = this.basic(active ? (on ? '#ff2b2b' : '#550000') : '#3a3a3a');
        ud.bar2.material = this.basic(active ? (!on ? '#2b6bff' : '#000055') : '#3a3a3a');
      }
    }
    const peds = G.peds;
    for (const e of peds) {
      if (!near(e)) continue;
      seen.add(e);
      let m = this.meshes.get(e);
      if (!m) {
        m = this.makePed(e, { shirt: e.shirt, skin: e.skin, hair: e.hair, pants: e.kind === 'cop' ? '#1d2b45' : undefined });
        this.meshes.set(e, m); this.scene.add(m);
      }
      this.poseHuman(m, e.x, e.y, e.a, e.walk, e.speed, e.dead);
    }
    for (const [ent, m] of this.meshes) {
      if (!seen.has(ent)) { this.scene.remove(m); this.meshes.delete(ent); }
    }
  },

  poseHuman(m, x, y, a, walk, speed, dead) {
    const ud = m.userData;
    m.position.set(x, 0, y);
    m.rotation.y = -a;
    if (dead) {
      ud.inner.rotation.z = Math.PI / 2;
      ud.inner.position.set(-8, 2.5, 0);
      return;
    }
    ud.inner.rotation.z = 0;
    ud.inner.position.set(0, 0, 0);
    const sw = Math.sin(walk) * 0.7 * Math.min(1, speed / 60);
    ud.legs[0].rotation.z = sw; ud.legs[1].rotation.z = -sw;
    ud.arms[0].rotation.z = -sw * 0.8;
    if (!ud.gun) ud.arms[1].rotation.z = sw * 0.8;
  },

  // ---------------------------------------------------------------- effects & markers
  buildFx() {
    // Particles: custom point shader with per-point size and alpha
    const N = 900;
    this.pN = N;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    pg.setAttribute('rgba', new THREE.BufferAttribute(new Float32Array(N * 4), 4));
    pg.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.pointMat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 } },
      vertexShader: 'attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float scale;' +
        'void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - d * 1.4)); }',
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(pg, this.pointMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Tracers
    const TN = 400;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * 6), 3));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: '#ffe29a', transparent: true, opacity: 0.9 }));
    this.tracers.frustumCulled = false;
    this.tN = TN;
    this.scene.add(this.tracers);

    // Rain streaks around the camera
    const RN = 1400;
    const rg = new THREE.BufferGeometry();
    const rp = new Float32Array(RN * 6);
    for (let i = 0; i < RN; i++) {
      const x = rand(-400, 400), y = rand(0, 300), z = rand(-400, 400);
      rp.set([x, y, z, x - 1, y - 10, z], i * 6);
    }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#b8c8e0', transparent: true, opacity: 0.5 }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // Decal pool (blood / scorch marks)
    this.decalPool = [];
    const dg = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(dg, this.basic('#700000', { transparent: true, opacity: 0.7, depthWrite: false }));
      m.visible = false;
      this.scene.add(m);
      this.decalPool.push(m);
    }

    // Helicopter
    const heli = this.heli = new THREE.Group();
    const hb = this.lam('#1b2433');
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hb);
    body.scale.set(24, 11, 12);
    heli.add(body);
    this.box(heli, hb, 34, 4, 4, -36, 2, 0);
    this.box(heli, this.lam('#f4f4f4'), 14, 2, 12.4, -2, -2, 0);
    this.box(heli, this.basic('#9fd0ff'), 8, 6, 9, 16, 3, 0);
    this.rotor = this.box(heli, this.lam('#333333'), 90, 0.8, 4, 0, 13, 0);
    this.rotor2 = this.box(heli, this.lam('#333333'), 4, 0.8, 90, 0, 13, 0);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(45, 120, 16, 1, true), this.basic('#fff8d0', { transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = -60;
    heli.add(beam);
    heli.visible = false;
    this.scene.add(heli);

    // Generic pools for markers, arrows and sprites
    this.pools = { cyl: [], cone: [], sprite: [] };
    this.coneGeo = new THREE.ConeGeometry(5, 10, 4).rotateX(Math.PI);
  },

  poolGet(kind, factory) {
    const pool = this.pools[kind];
    const idx = this.poolIdx[kind] = (this.poolIdx[kind] || 0) + 1;
    if (!pool[idx - 1]) { const o = factory(); this.scene.add(o); pool.push(o); }
    const o = pool[idx - 1];
    o.visible = true;
    return o;
  },

  cylinder(x, z, r, h, color, alpha = 0.35) {
    const m = this.poolGet('cyl', () => new THREE.Mesh(UNIT_CYL, this.glow('#ffffff')));
    m.material = this.glow(color);
    m.material.opacity = alpha;
    m.scale.set(r, h, r);
    m.position.set(x, h / 2, z);
  },

  arrow(x, z, y, color) {
    const m = this.poolGet('cone', () => new THREE.Mesh(this.coneGeo, this.basic('#ffd400')));
    m.material = this.basic(color);
    m.position.set(x, y + Math.sin(G.t * 5) * 2, z);
    m.rotation.y = G.t * 2;
  },

  labelTexture(text, color) {
    const k = text + color;
    let t = this.labelCache.get(k);
    if (t) return t;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = color; g.beginPath(); g.arc(32, 32, 28, 0, TAU); g.fill();
    g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 32, 34);
    t = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false });
    this.labelCache.set(k, t);
    return t;
  },

  sprite(x, z, y, size, text, color) {
    const s = this.poolGet('sprite', () => new THREE.Sprite());
    s.material = this.labelTexture(text, color);
    s.position.set(x, y, z);
    s.scale.set(size, size, 1);
  },

  updateMarkers() {
    this.poolIdx = {};
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const near = (e, r = 1600) => Math.abs(e.x - cx) < r && Math.abs(e.y - cz) < r;
    if (G.state === 'play' || G.state === 'pause') {
      if (!G.mission) {
        const def = nextMission();
        if (def) {
          const pos = nodePos(def.start);
          const col = def.char === 'any' ? '#ffd400' : LEONIDA.characters[def.char].color;
          if (near(pos, 2500)) {
            this.cylinder(pos.x, pos.y, 30, 40, col);
            this.sprite(pos.x, pos.y, 52 + Math.sin(G.t * 3) * 3, 18, def.char === 'any' ? '★' : def.char[0].toUpperCase(), col);
          }
        }
        for (const sh of SAFEHOUSES) {
          const pos = nodePos(sh.at);
          if (near(pos)) { this.cylinder(pos.x, pos.y, 20, 26, '#4aa3ff'); this.sprite(pos.x, pos.y, 38, 14, 'H', '#4aa3ff'); }
        }
      }
      for (const s of G.world.stores) if (s.cooldown <= G.t && near(s, 900)) this.cylinder(s.x, s.y, 13, 14, '#2ecc71', 0.3);
      const t = missionTarget();
      if (t) {
        const isEnt = t instanceof Vehicle || t instanceof Ped;
        if (isEnt) this.arrow(t.x, t.y, isEnt && t instanceof Vehicle ? 44 : 32, '#ffd400');
        else { this.cylinder(t.x, t.y, 34, 60, '#ffd400'); this.cylinder(t.x, t.y, 6, 600, '#ffd400', 0.15); }
      }
      if (G.mission && G.mission.step.type === 'kill') for (const e of G.mission.gang) if (!e.dead) this.arrow(e.x, e.y, 30, '#ff3b3b');
      if (G.waypoint) { this.cylinder(G.waypoint.x, G.waypoint.y, 22, 40, '#c56cf0'); this.cylinder(G.waypoint.x, G.waypoint.y, 5, 600, '#c56cf0', 0.18); }
      for (const pk of G.pickups) {
        if (pk.respawn > 0 || !near(pk, 900)) continue;
        const col = { health: '#e74c3c', armor: '#3498db', cash: '#2ecc71' }[pk.type] || '#f39c12';
        const label = { health: '+', armor: 'A', cash: '$', pistol: 'P', smg: 'S', shotgun: 'SG', rifle: 'R' }[pk.type];
        this.sprite(pk.x, pk.y, 9 + Math.sin(G.t * 4 + pk.x) * 2, 11, label, col);
      }
    }
    for (const k of Object.keys(this.pools)) {
      const used = this.poolIdx[k] || 0;
      for (let i = used; i < this.pools[k].length; i++) this.pools[k][i].visible = false;
    }
  },

  updateFx(dt) {
    // particles
    const pos = this.points.geometry.attributes.position.array;
    const rgba = this.points.geometry.attributes.rgba.array;
    const size = this.points.geometry.attributes.size.array;
    let n = 0;
    for (const p of G.particles) {
      if (n >= this.pN) break;
      const f = p.life / p.max;
      const c = this.parseColor(p.color);
      const h = p.h != null ? p.h : 9 + (p.grow > 0 ? (1 - f) * 45 : (p.grow < 0 ? (1 - f) * 20 : 0));
      pos[n * 3] = p.x; pos[n * 3 + 1] = h; pos[n * 3 + 2] = p.y;
      rgba[n * 4] = c.r; rgba[n * 4 + 1] = c.g; rgba[n * 4 + 2] = c.b; rgba[n * 4 + 3] = c.a * (p.fade ? clamp(f, 0, 1) : 1);
      size[n] = Math.max(1, p.size * 2);
      n++;
    }
    const pg = this.points.geometry;
    pg.setDrawRange(0, n);
    pg.attributes.position.needsUpdate = true; pg.attributes.rgba.needsUpdate = true; pg.attributes.size.needsUpdate = true;

    // tracers
    const tp = this.tracers.geometry.attributes.position.array;
    let tn = 0;
    for (const tr of G.tracers) {
      if (tn >= this.tN) break;
      tp.set([tr.x0, 13, tr.y0, tr.x1, 13, tr.y1], tn * 6);
      tn++;
    }
    this.tracers.geometry.setDrawRange(0, tn * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;

    // decals
    let di = 0;
    for (let i = G.decals.length - 1; i >= 0 && di < this.decalPool.length; i--) {
      const d = G.decals[i];
      if (d.kind === 'skid') continue;
      const m = this.decalPool[di++];
      m.visible = true;
      m.position.set(d.x, 0.4 + di * 0.01, d.y);
      const r = d.kind === 'blood' ? 10 * d.s : 36 * d.s;
      m.scale.set(r, 1, r * 0.8);
      m.material = d.kind === 'blood' ? this.basic('#700000', { transparent: true, opacity: 0.7, depthWrite: false }) : this.basic('#111111', { transparent: true, opacity: 0.55, depthWrite: false });
    }
    for (; di < this.decalPool.length; di++) this.decalPool[di].visible = false;

    // helicopter
    const h = G.heli;
    this.heli.visible = !!h && G.state !== 'title';
    if (h) {
      this.heli.position.set(h.x, 120, h.y);
      this.heli.rotation.y = -h.a;
      this.rotor.rotation.y = h.rot; this.rotor2.rotation.y = h.rot;
    }

    // rain
    this.rain.visible = G.rain > 0.03;
    if (this.rain.visible) {
      const rp = this.rain.geometry.attributes.position.array;
      const fall = 700 * dt;
      for (let i = 0; i < rp.length; i += 6) {
        rp[i + 1] -= fall; rp[i + 4] -= fall;
        if (rp[i + 1] < 0) { rp[i + 1] += 300; rp[i + 4] += 300; }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
      this.rain.material.opacity = 0.55 * G.rain;
      this.rain.geometry.setDrawRange(0, Math.floor(this.rain.geometry.attributes.position.count * G.rain));
    }
  },

  // ---------------------------------------------------------------- first-person weapon
  buildViewmodel() {
    const vm = this.vm = new THREE.Group();
    this.camera.add(vm);
    const mk = (parts) => {
      const g = new THREE.Group();
      for (const [color, sx, sy, sz, x, y, z] of parts) this.box(g, this.lam(color), sx, sy, sz, x, y, z);
      g.traverse(o => { if (o.isMesh) { o.renderOrder = 999; o.material = o.material.clone(); o.material.depthTest = false; o.material.fog = false; } });
      g.visible = false;
      vm.add(g);
      return g;
    };
    const skin = '#c68a5e';
    this.guns = {
      fist: mk([[skin, 2.4, 2.4, 3.4, 0, 0, -1], [skin, 2.4, 2.4, 3.4, -9, 0, -1]]),
      pistol: mk([['#1b1b1b', 1.2, 1.5, 6, 0, 0.8, -3], ['#2b2b2b', 1.1, 3, 1.4, 0, -1, -0.6], [skin, 1.8, 2, 2.6, 0, -2.4, 0]]),
      smg: mk([['#1b1b1b', 1.4, 2, 9, 0, 0.8, -4], ['#2b2b2b', 1, 3.6, 1.4, 0, -1.6, -4.5], ['#2b2b2b', 1.1, 3, 1.4, 0, -1, -0.6], [skin, 1.8, 2, 2.6, 0, -2.4, 0]]),
      shotgun: mk([['#3a2a1a', 1.6, 2, 6, 0, 0, 1.5], ['#1b1b1b', 1.2, 1.4, 13, 0, 0.9, -6], ['#4a3a2a', 1.6, 1.4, 5, 0, -0.4, -6], [skin, 1.8, 2, 2.6, 0, -1.6, 0]]),
      rifle: mk([['#222', 1.4, 2.2, 15, 0, 0.6, -5], ['#333', 1, 4, 1.6, 0, -1.8, -5], ['#222', 1.4, 2.4, 5, 0, 0, 3], [skin, 1.8, 2, 2.6, 0, -2, -1]]),
    };
    const flashMat = new THREE.SpriteMaterial({ color: '#ffd27a', transparent: true, blending: THREE.AdditiveBlending, depthTest: false, fog: false });
    this.muzzle = new THREE.Sprite(flashMat);
    this.muzzle.renderOrder = 1000;
    this.muzzle.scale.set(5, 5, 1);
    vm.add(this.muzzle);
    vm.scale.setScalar(0.5);
  },

  updateViewmodel() {
    const p = G.player;
    const show = G.state === 'play' && !p.vehicle && !p.dead;
    this.vm.visible = show;
    if (!show) return;
    for (const [id, g] of Object.entries(this.guns)) g.visible = id === p.weapon;
    const r = G.recoil;
    const bob = p.speed > 0 ? Math.sin(p.walk) * 0.5 : 0;
    if (p.weapon === 'fist') {
      this.vm.position.set(3.4, -3.4 + bob * 0.4, -8 - r * 2.5);
    } else {
      this.vm.position.set(3.2 + bob * 0.3, -3.3 + Math.abs(bob) * 0.3, -8.5 + r * 1.2);
    }
    this.vm.rotation.set(r * 0.25, 0, 0);
    const len = { pistol: 6.5, smg: 9, shotgun: 13, rifle: 13 }[p.weapon] || 0;
    this.muzzle.visible = r > 0.6 && p.weapon !== 'fist';
    this.muzzle.position.set(0, 0.9, -len - 1);
    this.muzzle.material.rotation = G.t * 50;
  },

  // ---------------------------------------------------------------- lighting
  darkness() {
    const h = G.time / 60;
    if (h >= 7 && h < 18.5) return 0;
    if (h >= 18.5 && h < 21) return (h - 18.5) / 2.5;
    if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
    return 1;
  },

  updateLighting() {
    const n = this.darkness();
    const day = new THREE.Color('#87c8f0'), dusk = new THREE.Color('#f2876a'), night = new THREE.Color('#0a1030');
    const c = day.clone().lerp(night, n);
    c.lerp(dusk, Math.sin(n * Math.PI) * 0.55);
    if (G.rain > 0) c.lerp(new THREE.Color('#6d7682'), G.rain * 0.55);
    this.scene.background.copy(c);
    this.scene.fog.color.copy(c);
    this.scene.fog.far = 2100 - G.rain * 700;
    this.hemi.intensity = 0.95 - 0.68 * n - G.rain * 0.2;
    this.sun.intensity = 0.85 * (1 - n) * (1 - G.rain * 0.5);
    this.sun.color.set(n > 0.1 ? '#ffb38a' : '#fff4dd');
    if (this.wallMat) this.wallMat.emissiveIntensity = n * 0.9;
    if (this.bulbMat) this.bulbMat.color.set(n > 0.3 ? '#fff1b0' : '#cfcfcf');

    // nearest lamps get real lights at night
    const cx = this.camera.position.x, cz = this.camera.position.z;
    if (this.lampPos && n > 0.2) {
      const sorted = this.lampPos.filter(l => Math.abs(l.x - cx) < 700 && Math.abs(l.y - cz) < 700)
        .sort((a, b) => (a.x - cx) ** 2 + (a.y - cz) ** 2 - ((b.x - cx) ** 2 + (b.y - cz) ** 2));
      this.lampLights.forEach((l, i) => {
        const lp = sorted[i];
        if (lp) { l.position.set(lp.x, 40, lp.y); l.intensity = 1.6 * n; } else l.intensity = 0;
      });
    } else this.lampLights.forEach(l => { l.intensity = 0; });

    const v = G.player && G.player.vehicle;
    if (v && n > 0.2) {
      const fx = Math.cos(v.a), fz = Math.sin(v.a);
      this.headlight.position.set(v.x + fx * 20, 9, v.y + fz * 20);
      this.headlight.target.position.set(v.x + fx * 300, 0, v.y + fz * 300);
      this.headlight.intensity = 2.2 * n;
    } else this.headlight.intensity = 0;

    // flashes from gunfire and explosions
    let best = null;
    for (const f of G.flashLights || []) if (!best || f.r > best.r) best = f;
    if (best) { this.flash.position.set(best.x, 25, best.y); this.flash.intensity = best.r > 150 ? 4 : 1.5; this.flash.distance = best.r * 2; }
    else this.flash.intensity = 0;
  },

  // ---------------------------------------------------------------- camera
  updateCamera(dt) {
    const cam = this.camera, p = G.player, L = G.look;
    const shake = G.cam.shake * 0.25;
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    let fov = 72;
    if (p.vehicle) {
      const v = p.vehicle, H = VEH_HEIGHT[v.type] || 14;
      if (G.t - (G.mouse.moved || 0) > 1.2) L.carOff *= Math.max(0, 1 - dt * 2);
      const yaw = v.a + L.carOff;
      fov = 72 + Math.min(16, v.speed * 0.03);
      if (G.camMode === 'fp') {
        const fx = Math.cos(v.a), fz = Math.sin(v.a);
        const lx = Math.sin(v.a), lz = -Math.cos(v.a);
        const fwdOff = v.type === 'truck' ? v.spec.l / 2 - 8 : -v.spec.l * 0.12;
        cam.position.set(v.x + fx * fwdOff + lx * v.spec.w * 0.2 + sx, 3 + H * (v.type === 'truck' ? 0.62 : 0.62) + sy, v.y + fz * fwdOff + lz * v.spec.w * 0.2);
        cam.rotation.set(L.pitch * 0.6, -yaw - Math.PI / 2, 0);
        this.chase.init = false;
      } else {
        const back = 70 + H, up = 22 + H;
        const tx = v.x - Math.cos(yaw) * back, tz = v.y - Math.sin(yaw) * back;
        const c = this.chase;
        if (!c.init) { c.x = tx; c.z = tz; c.init = true; }
        const k = Math.min(1, dt * 6);
        c.x += (tx - c.x) * k; c.z += (tz - c.z) * k;
        cam.position.set(c.x + sx, up + sy, c.z);
        cam.lookAt(v.x + Math.cos(yaw) * 40, 10 + H * 0.5, v.y + Math.sin(yaw) * 40);
      }
    } else {
      const bob = p.speed > 0 && !p.dead ? Math.sin(p.walk * 2) * 0.5 : 0;
      cam.position.set(p.x + sx, (p.dead ? 4 : 16) + bob + sy, p.y);
      cam.rotation.set(L.pitch, -L.yaw - Math.PI / 2, p.dead ? 0.6 : 0);
      this.chase.init = false;
    }
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); this.updatePointScale(); }
  },

  titleCamera(dt) {
    const t = (this.title.t += dt);
    const cx = 205 * T + Math.sin(t * 0.05) * 1400, cz = 100 * T + Math.cos(t * 0.04) * 1600;
    this.camera.position.set(cx, 230, cz);
    this.camera.rotation.set(-0.38, t * 0.06, 0);
    G.time = (18.2 * 60 + t * 3) % (24 * 60);
  },

  // ---------------------------------------------------------------- frame
  draw(dt = 0.016) {
    if (!this.world) { this.renderer.render(this.scene, this.camera); return; }
    this.frame = (this.frame || 0) + 1;
    if (G.state === 'title') this.titleCamera(dt);
    else this.updateCamera(dt);
    this.updateGround();
    this.syncEntities();
    this.updateMarkers();
    this.updateFx(dt);
    this.updateViewmodel();
    this.updateLighting();
    this.renderer.render(this.scene, this.camera);
  },
};
