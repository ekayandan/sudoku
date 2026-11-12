// 3D view of a pinball table (three.js). Physics stays 2D in engine.js; this maps the playfield plane (x, y) to
// the 3D floor (x - 200, height, y - 415), raises walls, bumpers and flippers, and adds lighting, a chrome ball,
// bloom, particles, flashes and camera shake.
import * as THREE from './vendor/three.module.min.js';
import { EffectComposer } from './vendor/EffectComposer.js';
import { RenderPass } from './vendor/RenderPass.js';
import { UnrealBloomPass } from './vendor/UnrealBloomPass.js';
import { OutputPass } from './vendor/OutputPass.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { paintTable, insertLayout } from './art.js';

const CX = 200, CZ = 415;
const P = (x, y, h = 0) => new THREE.Vector3(x - CX, h, y - CZ);

export function createRenderer(canvas, T, opts = {}) {
  const th = T.theme;
  const low = !!opts.low;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(low ? 1.5 : 2, self.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030308');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(36, 1, 10, 4000);
  const disposables = [];
  const keep = (o) => (disposables.push(o), o);

  // ------------------------------------------------------------ lights
  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x1a1030, 0.35));
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.1);
  sun.position.set(-120, 700, 380);
  sun.target.position.set(0, 0, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 460, bottom: -460, near: 100, far: 1600 });
  sun.shadow.bias = -0.0008; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const flashLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 160, 1.6); l.position.y = 30; scene.add(l); return { l, t: 0 }; });

  // ------------------------------------------------------------ floor (painted art)
  const art = document.createElement('canvas'); art.width = 1024; art.height = Math.round(1024 * (T.H + 40) / T.W);
  paintTable(art.getContext('2d'), T, 1024);
  const tex = keep(new THREE.CanvasTexture(art));
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floorH = T.H + 40;
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(T.W, floorH)), keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0, envMapIntensity: 0.12 })));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, floorH / 2 - CZ);
  floor.receiveShadow = true; scene.add(floor);

  // ------------------------------------------------------------ cabinet
  const wood = keep(new THREE.MeshStandardMaterial({ color: '#2a1a12', roughness: 0.55, metalness: 0.1 }));
  const darkMetal = keep(new THREE.MeshStandardMaterial({ color: '#30333a', roughness: 0.3, metalness: 0.85 }));
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  box(24, 46, floorH + 40, wood, -CX - 2, 8, floorH / 2 - CZ);
  box(24, 46, floorH + 40, wood, CX + 2, 8, floorH / 2 - CZ);
  box(T.W + 28, 70, 24, wood, 0, 20, -CZ - 8);
  box(T.W + 28, 26, 30, wood, 0, -2, floorH - CZ + 12);
  box(T.W + 60, 10, floorH + 120, keep(new THREE.MeshStandardMaterial({ color: '#0a0a10', roughness: 0.9 })), 0, -6, floorH / 2 - CZ);
  // side rails (chrome lockdown)
  box(6, 4, floorH + 40, darkMetal, -CX - 10, 33, floorH / 2 - CZ);
  box(6, 4, floorH + 40, darkMetal, CX + 10, 33, floorH / 2 - CZ);

  // ------------------------------------------------------------ materials
  const col = (c) => new THREE.Color(c);
  const chrome = keep(new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 1, roughness: 0.16 }));
  const rail = keep(new THREE.MeshStandardMaterial({ color: '#8b939c', metalness: 0.85, roughness: 0.35 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: th.wall, roughness: 0.55, metalness: 0.05, emissive: col(th.wall), emissiveIntensity: 0.3 }));
  const guideMat = keep(new THREE.MeshStandardMaterial({ color: th.guide, roughness: 0.3, metalness: 0.6, emissive: col(th.guide), emissiveIntensity: 0.12 }));
  const plastic = keep(new THREE.MeshPhysicalMaterial({ color: th.solid, roughness: 0.25, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  const slingMat = keep(new THREE.MeshPhysicalMaterial({ color: th.solid, roughness: 0.2, clearcoat: 1, emissive: col(th.sling), emissiveIntensity: 0.08 }));

  // ------------------------------------------------------------ walls
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));
  const unitCyl = keep(new THREE.CylinderGeometry(1, 1, 1, 18));
  function wallSeg(ax, ay, bx, by, r, h, mat, base = 0) {
    const len = Math.hypot(bx - ax, by - ay);
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(len, h, r * 2);
    m.position.copy(P((ax + bx) / 2, (ay + by) / 2, base + h / 2));
    m.rotation.y = -Math.atan2(by - ay, bx - ax);
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
    for (const [x, y] of [[ax, ay], [bx, by]]) { const c = new THREE.Mesh(unitCyl, mat); c.scale.set(r, h, r); c.position.copy(P(x, y, base + h / 2)); c.castShadow = true; scene.add(c); }
  }
  const wallStyle = (tag) => tag === 'guide' ? [guideMat, 16, 2] : tag === 'lane' ? [rail, 22, 2] : tag === 'sling-side' ? [plastic, 14, 3] : [rail, 26, 3];
  for (const w of T.walls) {
    if (w.tag === 'bumper' || w.tag === 'standup' || w.tag === 'sling') continue;
    if (w.k === 'seg') { const [m, h, r] = wallStyle(w.tag); wallSeg(w.ax, w.ay, w.bx, w.by, Math.max(r, w.r), h, m); if (w.tag === 'wall') wallSeg(w.ax, w.ay, w.bx, w.by, w.r + 0.6, 4, rubber, 3); }
    else if (w.k === 'arc') {
      const [m, h, r] = wallStyle(w.tag), n = Math.max(6, Math.ceil(((w.a1 - w.a0) * w.R) / 14));
      for (let i = 0; i < n; i++) {
        const a = w.a0 + ((w.a1 - w.a0) * i) / n, b = w.a0 + ((w.a1 - w.a0) * (i + 1)) / n;
        wallSeg(w.x + w.R * Math.cos(a), w.y + w.R * Math.sin(a), w.x + w.R * Math.cos(b), w.y + w.R * Math.sin(b), Math.max(r, w.r), h, m);
      }
    } else if (w.k === 'circ' && w.tag === 'post') {
      const c = new THREE.Mesh(unitCyl, chrome); c.scale.set(w.r, 22, w.r); c.position.copy(P(w.x, w.y, 11)); c.castShadow = true; scene.add(c);
      const rb = new THREE.Mesh(keep(new THREE.TorusGeometry(w.r + 1, 1.6, 8, 20)), rubber); rb.rotation.x = Math.PI / 2; rb.position.copy(P(w.x, w.y, 9)); scene.add(rb);
    }
  }
  // solids: extruded plastics (aprons, slingshot bodies, blocks)
  for (const so of T.solids) {
    const sh = new THREE.Shape(so.pts.map(([x, y]) => new THREE.Vector2(x - CX, y - CZ)));
    const h = so.tag === 'apron' ? 10 : 14;
    const g = keep(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelSize: 1.5, bevelThickness: 1.5, bevelSegments: 2 }));
    g.rotateX(Math.PI / 2); g.translate(0, h + 1.5, 0);
    const m = new THREE.Mesh(g, so.tag === 'sling' ? slingMat : plastic); m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  // apron plates under the inlanes down to the bottom edge (decorative; the physics apron ends higher)
  for (const side of [0, 1]) {
    const X = side ? T.spec.mx || ((x) => 368 - x) : (x) => x;
    const pts = [[X(40), 628], [X(112), 690], [X(112), T.H + 30], [X(40), T.H + 30]];
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x - CX, y - CZ)));
    const g = keep(new THREE.ExtrudeGeometry(sh, { depth: 8, bevelEnabled: false })); g.rotateX(Math.PI / 2); g.translate(0, 8, 0);
    const m = new THREE.Mesh(g, plastic); m.receiveShadow = true; scene.add(m);
  }
  // slingshot rubber faces (flash on kick)
  const slingFaces = T.slings.map((s) => {
    const mat = new THREE.MeshStandardMaterial({ color: th.sling, roughness: 0.5, emissive: col(th.sling), emissiveIntensity: 0.5 }); keep(mat);
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay), m = new THREE.Mesh(unitBox, mat);
    m.scale.set(len, 12, 5); m.position.copy(P((s.ax + s.bx) / 2, (s.ay + s.by) / 2, 9)); m.rotation.y = -Math.atan2(s.by - s.ay, s.bx - s.ax);
    m.castShadow = true; scene.add(m); return { m, mat };
  });

  // ------------------------------------------------------------ bumpers
  const starTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = th.bumperCap; g.fillRect(0, 0, 128, 128);
    g.fillStyle = th.bumper; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 22 : 54; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 12, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return keep(t);
  })();
  const bumpers = T.bumpers.map((b) => {
    const grp = new THREE.Group(); grp.position.copy(P(b.x, b.y));
    const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(b.r + 2, b.r + 4, 4, 32)), darkMetal); base.position.y = 2; grp.add(base);
    const bodyMat = keep(new THREE.MeshStandardMaterial({ color: th.bumper, roughness: 0.35, emissive: col(th.bumper), emissiveIntensity: 0.35 }));
    const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(b.r - 3, b.r - 1, 14, 32)), bodyMat); body.position.y = 11; body.castShadow = true; grp.add(body);
    const skirt = new THREE.Mesh(keep(new THREE.CylinderGeometry(b.r + 1, b.r + 1, 3, 32)), chrome); skirt.position.y = 7; grp.add(skirt);
    const capMat = keep(new THREE.MeshStandardMaterial({ map: starTex, roughness: 0.25, emissive: col('#ffffff'), emissiveMap: starTex, emissiveIntensity: 0.25 }));
    const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(b.r, b.r - 1, 5, 32)), [plastic, capMat, plastic]); cap.position.y = 20.5; cap.castShadow = true; grp.add(cap);
    const ringMat = keep(new THREE.MeshBasicMaterial({ color: th.bumper, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(b.r, b.r + 4, 40)), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 1; grp.add(ring);
    scene.add(grp);
    return { b, grp, bodyMat, capMat, ring, ringMat, cap, pulse: 0 };
  });

  // ------------------------------------------------------------ targets, spinners, saucers, gate, plunger
  const drops = T.drops.map((d) => {
    const mat = keep(new THREE.MeshStandardMaterial({ color: th.drop, roughness: 0.3, metalness: 0.1, emissive: col(th.drop), emissiveIntensity: 0.12 }));
    const len = Math.hypot(d.bx - d.ax, d.by - d.ay) + 5, m = new THREE.Mesh(unitBox, mat);
    m.scale.set(len, 18, 6); m.rotation.y = -Math.atan2(d.by - d.ay, d.bx - d.ax);
    const p = P((d.ax + d.bx) / 2, (d.ay + d.by) / 2, 9); m.position.copy(p); m.castShadow = true; scene.add(m);
    return { m, mat, y: 9 };
  });
  const standups = T.standups.map((s) => {
    const mat = keep(new THREE.MeshStandardMaterial({ color: th.drop, roughness: 0.35, emissive: col(th.drop), emissiveIntensity: 0.1 }));
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay) + 8, m = new THREE.Mesh(unitBox, mat);
    m.scale.set(len, 16, 8); m.rotation.y = -Math.atan2(s.by - s.ay, s.bx - s.ax); m.position.copy(P((s.ax + s.bx) / 2, (s.ay + s.by) / 2, 8));
    m.castShadow = true; scene.add(m); return { m, mat };
  });
  const spinners = T.spinners.map((sp) => {
    const grp = new THREE.Group(); grp.position.copy(P(sp.x, sp.y, 16));
    const plateMat = keep(new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.9, roughness: 0.2, emissive: col(th.accent), emissiveIntensity: 0.1 }));
    const plate = new THREE.Mesh(unitBox, plateMat); plate.scale.set(sp.w - 4, 14, 1.4); plate.position.y = -6; plate.castShadow = true;
    const pivot = new THREE.Group(); pivot.add(plate); grp.add(pivot);
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(unitCyl, chrome); post.scale.set(1.6, 18, 1.6); post.position.set((sx * sp.w) / 2, -7, 0); grp.add(post); }
    const bar = new THREE.Mesh(unitCyl, chrome); bar.scale.set(1, sp.w, 1); bar.rotation.z = Math.PI / 2; grp.add(bar);
    scene.add(grp); return { pivot, plateMat };
  });
  const saucers = T.saucers.map((sc) => {
    const hole = new THREE.Mesh(keep(new THREE.CircleGeometry(12, 32)), keep(new THREE.MeshBasicMaterial({ color: '#000000' })));
    hole.rotation.x = -Math.PI / 2; hole.position.copy(P(sc.x, sc.y, 0.4)); scene.add(hole);
    const rimMat = keep(new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 1, roughness: 0.2, emissive: col(th.accent), emissiveIntensity: 0.2 }));
    const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(13, 2.2, 10, 32)), rimMat); rim.rotation.x = Math.PI / 2; rim.position.copy(P(sc.x, sc.y, 1.5)); scene.add(rim);
    const glowMat = keep(new THREE.MeshBasicMaterial({ color: th.accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const gl = new THREE.Mesh(keep(new THREE.RingGeometry(14, 30, 40)), glowMat); gl.rotation.x = -Math.PI / 2; gl.position.copy(P(sc.x, sc.y, 0.6)); scene.add(gl);
    return { rimMat, glowMat, gl };
  });
  const gates = T.gates.map((g) => { const m = new THREE.Mesh(unitCyl, chrome); const len = Math.hypot(g.bx - g.ax, g.by - g.ay); m.scale.set(1.5, len, 1.5); m.rotation.z = Math.PI / 2; m.rotation.y = -Math.atan2(g.by - g.ay, g.bx - g.ax); m.position.copy(P((g.ax + g.bx) / 2, (g.ay + g.by) / 2, 14)); scene.add(m); return m; });
  void gates;
  const plunger = new THREE.Group();
  { const rod = new THREE.Mesh(unitCyl, chrome); rod.scale.set(3, 60, 3); rod.rotation.x = Math.PI / 2; rod.position.set(0, 9, 30); plunger.add(rod);
    const tip = new THREE.Mesh(unitCyl, keep(new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.6 }))); tip.scale.set(10, 10, 10); tip.rotation.x = Math.PI / 2; tip.position.set(0, 9, 4); plunger.add(tip);
    scene.add(plunger); }

  // ------------------------------------------------------------ flippers
  const flipMat = keep(new THREE.MeshPhysicalMaterial({ color: th.flipper, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.5 }));
  const trimMat = keep(new THREE.MeshStandardMaterial({ color: th.flipperTrim, roughness: 0.5, emissive: col(th.flipperTrim), emissiveIntensity: 0.25 }));
  const flippers = T.flippers.map((f) => {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, f.r0, Math.PI / 2, Math.PI * 1.5, false);
    sh.lineTo(f.len, -f.r1); sh.absarc(f.len, 0, f.r1, -Math.PI / 2, Math.PI / 2, false); sh.lineTo(0, f.r0);
    const mk = (h, bevel) => { const g = keep(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: bevel, bevelSize: 1, bevelThickness: 1, bevelSegments: 2, curveSegments: 16 })); g.rotateX(Math.PI / 2); g.translate(0, h + 1, 0); return g; };
    const grp = new THREE.Group(); grp.position.copy(P(f.x, f.y));
    const body = new THREE.Mesh(mk(13, true), flipMat); body.castShadow = true; grp.add(body);
    const trim = new THREE.Mesh(mk(4, false), trimMat); trim.scale.set(1.04, 1, 1.12); trim.position.y = 4; grp.add(trim);
    const cap = new THREE.Mesh(unitCyl, chrome); cap.scale.set(3.5, 3, 3.5); cap.position.y = 15.5; grp.add(cap);
    scene.add(grp); return grp;
  });

  // ------------------------------------------------------------ inserts (lit lenses on the floor)
  const insertGeo = keep(new THREE.CircleGeometry(1, 28));
  const arrowGeo = keep(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, -1.3), new THREE.Vector2(1, 1), new THREE.Vector2(-1, 1)])));
  const inserts = insertLayout(T).map((ins) => {
    const c = ins.kind === 'mult' ? th.accent : ins.kind === 'arrow' ? th.wall : ins.kind === 'ring' ? th.light : ins.kind === 'save' ? '#34d399' : ins.kind === 'roll' ? th.accent : ins.kind === 'kick' || ins.kind === 'kickarrow' ? '#f87171' : th.guide;
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); keep(mat);
    const m = new THREE.Mesh(ins.kind === 'arrow' || ins.kind === 'kickarrow' ? arrowGeo : insertGeo, mat);
    m.rotation.x = -Math.PI / 2;
    if (ins.kind === 'arrow' || ins.kind === 'kickarrow') m.rotation.z = -(((ins.rot ?? -90) + 90) * Math.PI) / 180;
    const s = ins.r + 1.5; m.scale.set(s, s, s); m.position.copy(P(ins.x, ins.y, 0.5));
    const halo = new THREE.Mesh(insertGeo, mat); halo.rotation.x = -Math.PI / 2; halo.scale.setScalar(ins.r * 2.6); halo.position.copy(P(ins.x, ins.y, 0.45));
    scene.add(m, halo);
    return { ins, mat, base: col(c) };
  });

  // ------------------------------------------------------------ balls, shadows, trails
  const ballGeo = keep(new THREE.SphereGeometry(T.R, 40, 24));
  const ballMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.06, envMapIntensity: 1.4 }));
  const ballMeshes = [];
  const trailTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(c)); })();
  function ballMesh(i) {
    while (ballMeshes.length <= i) {
      const m = new THREE.Mesh(ballGeo, ballMat); m.castShadow = true; scene.add(m);
      const trailGeo = new THREE.BufferGeometry(); const N = 14;
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      keep(trailGeo);
      const trail = new THREE.Points(trailGeo, keep(new THREE.PointsMaterial({ size: 16, map: trailTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
      scene.add(trail);
      ballMeshes.push({ m, trail, hist: [] });
    }
    return ballMeshes[i];
  }

  // ------------------------------------------------------------ particles
  const PN = low ? 300 : 700;
  const pGeo = keep(new THREE.BufferGeometry());
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pBase = new Float32Array(PN * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, keep(new THREE.PointsMaterial({ size: 7, map: trailTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  points.frustumCulled = false; scene.add(points);
  let pNext = 0;
  function burst(x, y, h, color, n, speed = 160, up = 120) {
    const c = col(color);
    for (let k = 0; k < n; k++) {
      const i = pNext; pNext = (pNext + 1) % PN;
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      pPos[i * 3] = x - CX; pPos[i * 3 + 1] = h; pPos[i * 3 + 2] = y - CZ;
      pVel[i * 3] = Math.cos(a) * v; pVel[i * 3 + 1] = up * (0.3 + Math.random()); pVel[i * 3 + 2] = Math.sin(a) * v;
      pLife[i] = pMax[i] = 0.35 + Math.random() * 0.45;
      pBase[i * 3] = c.r * 2.2; pBase[i * 3 + 1] = c.g * 2.2; pBase[i * 3 + 2] = c.b * 2.2;
    }
  }
  function flashAt(x, y, color, power = 1) {
    const fl = flashLights.reduce((a, b) => (a.t < b.t ? a : b));
    fl.l.color.set(color); fl.l.position.set(x - CX, 34, y - CZ); fl.t = 0.18 * power; fl.p = 2600 * power;
  }

  // ------------------------------------------------------------ post-processing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ------------------------------------------------------------ camera fit (classic tilted view, table fills the stage)
  const look = new THREE.Vector3(0, 0, 0);
  let shake = 0;
  const camBase = new THREE.Vector3();
  const TILT = 33 * Math.PI / 180;
  function resize(w, h) {
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.fov = 44; camera.clearViewOffset(); camera.updateProjectionMatrix();
    const pts = [P(-14, -6, 46), P(414, -6, 46), P(-14, T.H + 36, 26), P(414, T.H + 36, 26)];
    let d = 900, lz = 0;
    const place = () => { look.set(0, 0, lz); camBase.set(0, Math.cos(TILT) * d, lz + Math.sin(TILT) * d); camera.position.copy(camBase); camera.lookAt(look); camera.updateMatrixWorld(); };
    for (let it = 0; it < 80; it++) {
      place();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { const v = p.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const span = Math.max((x1 - x0) / 1.96, (y1 - y0) / 1.94);
      lz -= ((y0 + y1) / 2) * d * 0.25;     // centre vertically
      d *= 1 + (span - 1) * 0.6;            // fill
    }
    place();
  }

  // ------------------------------------------------------------ per-frame update
  let time = 0, showT = 0, showKind = '', bloomBoost = 0;
  function onEvent(e, s) {
    switch (e[0]) {
      case 'bumper': {
        const bm = bumpers[e[1]]; bm.pulse = 1; burst(bm.b.x, bm.b.y, 18, th.bumper, 22, 200, 160); flashAt(bm.b.x, bm.b.y, th.bumper);
        break;
      }
      case 'sling': { const sf = T.slings[e[1]]; burst(e[2], e[3], 8, th.sling, 14, 160, 60); flashAt((sf.ax + sf.bx) / 2, (sf.ay + sf.by) / 2, th.sling, 0.7); break; }
      case 'drop': burst(e[2], e[3], 10, th.drop, 18, 140, 160); flashAt(e[2], e[3], th.drop, 0.8); break;
      case 'standup': burst(e[2], e[3], 10, th.drop, 12, 120, 100); break;
      case 'saucer': burst(e[2], e[3], 4, th.accent, 30, 120, 220); flashAt(e[2], e[3], th.accent, 1.2); break;
      case 'kickback': burst(e[2], e[3], 6, '#f87171', 30, 90, 260); flashAt(e[2], e[3], '#f87171', 1.2); shake = Math.max(shake, 0.5); break;
      case 'drain': shake = Math.max(shake, 0.3); break;
      case 'tilt': shake = 1.2; break;
      case 'nudge': shake = Math.max(shake, 0.6); break;
      case 'quake': shake = Math.max(shake, e[1]); break;
      case 'launch': shake = Math.max(shake, 0.15 * e[1]); break;
      case 'show': showKind = e[1]; showT = e[1] === 'jackpot' || e[1] === 'multiball' ? 2.2 : 1.4; bloomBoost = e[1] === 'jackpot' ? 1.2 : 0.6;
        if (e[1] === 'jackpot' || e[1] === 'multiball') for (let i = 0; i < 4; i++) burst(184, 420, 20, i % 2 ? th.accent : th.wall, 40, 320, 300);
        break;
      default:
    }
    void s;
  }

  function insertOn(ins, s) {
    const blinkFast = Math.floor(time * 8) % 2 === 0, blinkSlow = Math.floor(time * 3) % 2 === 0;
    switch (ins.kind) {
      case 'mult': return s.mult >= ins.m ? 1 : 0;
      case 'arrow': return ins.lit && ins.lit(s) ? (ins.blink ? (blinkSlow ? 1 : 0.25) : 0.75) : 0;
      case 'kick': case 'kickarrow': return s.kick[ins.idx ?? ins.id] ? (blinkSlow ? 1 : 0.4) : 0;
      case 'letter': {
        const ds = T.drops.filter((d) => d.group === ins.group), ss = T.standups.filter((d) => d.group === ins.group);
        if (ds.length) return s.drops[ds[ins.i].id] ? 0 : 1;
        if (ss.length) return s.stand[ss[ins.i].id] ? 1 : 0;
        return 0;
      }
      case 'ring': {
        const lit = Math.min(16, Math.floor(s.bonus / 1500));
        const chase = (Math.floor(time * 10) % 16) === ins.i ? 0.6 : 0;
        return ins.i < lit ? 0.85 : chase * (s.balls.some((b) => b.inPlay) ? 1 : 0.5);
      }
      case 'save': return s.saveT > 0 && !s.over ? (s.saveT > 2 || blinkFast ? 1 : 0.2) : s.extra ? 0.8 : 0;
      case 'roll': return s.roll[ins.id] ? 1 : 0;
      default: return 0;
    }
  }

  function render(s, events, dt) {
    time += dt;
    for (const e of events) onEvent(e, s);
    // light shows override inserts for a moment
    if (showT > 0) showT -= dt;
    bloomBoost = Math.max(0, bloomBoost - dt * 0.8);
    bloom.strength = 0.5 + bloomBoost;
    inserts.forEach((it, i) => {
      let v = insertOn(it.ins, s);
      if (showT > 0) {
        if (showKind === 'sweep') v = Math.max(v, Math.abs(((time * 2.2) % 1) - it.ins.y / T.H) < 0.08 ? 1 : 0);
        else if (showKind === 'flash') v = Math.floor(time * 12) % 2 ? 1 : v * 0.3;
        else if (showKind === 'orbit') v = Math.max(v, (Math.floor(time * 14) + i) % 5 === 0 ? 1 : 0);
        else v = (Math.floor(time * 16) + i) % 3 === 0 ? 1 : 0.15;
      }
      it.mat.opacity = v * 0.95;
    });
    bumpers.forEach((bm, i) => {
      const f = s.flash[bm.b.fl] > 0;
      if (f) bm.pulse = 1;
      bm.pulse = Math.max(0, bm.pulse - dt * 4);
      bm.capMat.emissiveIntensity = 0.15 + bm.pulse * 2.5;
      bm.bodyMat.emissiveIntensity = 0.25 + bm.pulse * 1.6 + (showT > 0 ? (Math.floor(time * 10 + i) % 2) * 0.8 : 0);
      bm.cap.position.y = 20.5 - bm.pulse * 3;
      bm.ringMat.opacity = bm.pulse * 0.9; const sc = 1 + (1 - bm.pulse) * 1.2; bm.ring.scale.set(sc, sc, 1);
    });
    slingFaces.forEach((sf, i) => { sf.mat.emissiveIntensity = s.flash[T.slings[i].fl] > 0 ? 2.5 : 0.25; });
    drops.forEach((d, i) => {
      const want = s.drops[i] ? 9 : -12; d.y += (want - d.y) * Math.min(1, dt * (s.drops[i] ? 10 : 22)); d.m.position.y = d.y;
      d.mat.emissiveIntensity = s.flash[T.drops[i].fl] > 0 ? 1.8 : 0.12;
    });
    standups.forEach((st, i) => { st.mat.emissiveIntensity = s.flash[T.standups[i].fl] > 0 ? 2.5 : s.stand[i] ? 1.2 : 0.1; });
    spinners.forEach((sp, i) => { sp.pivot.rotation.x = (s.spinA[i] % 1) * Math.PI * 2; sp.plateMat.emissiveIntensity = 0.1 + Math.min(1.5, s.spin[i] * 0.15); });
    saucers.forEach((sc, i) => {
      const held = s.balls.some((b) => b.hold > 0 && b.sc === i);
      const lit = held || (T.spec.saucerLit ? T.spec.saucerLit(s) : (s.L.lock || s.L.hole || s.mb));
      sc.glowMat.opacity = held ? 0.9 : lit ? 0.35 + 0.3 * Math.sin(time * 6) : 0;
      sc.gl.rotation.z += dt * (held ? 6 : 1.5);
      sc.rimMat.emissiveIntensity = held ? 2.5 : lit ? 0.8 : 0.2;
    });
    T.flippers.forEach((f, i) => { flippers[i].rotation.y = -s.fl[i].a; });
    plunger.position.copy(P(T.lane.x, T.lane.plungerY + s.charge * T.lane.pull + 4));
    // balls
    const balls = s.balls;
    balls.forEach((b, i) => {
      const bm = ballMesh(i);
      const sink = b.hold > 0 ? -5 : 0;
      bm.m.visible = true; bm.m.position.copy(P(b.x, b.y, T.R + sink));
      bm.m.rotation.x += (b.vy * dt) / T.R; bm.m.rotation.z -= (b.vx * dt) / T.R;
      bm.hist.unshift([b.x, b.y]); if (bm.hist.length > 14) bm.hist.pop();
      const sp = Math.hypot(b.vx, b.vy), tp = bm.trail.geometry.attributes.position, tc = bm.trail.geometry.attributes.color;
      const tcol = col(th.light);
      for (let k = 0; k < 14; k++) {
        const hp = bm.hist[Math.min(k, bm.hist.length - 1)];
        tp.setXYZ(k, hp[0] - CX, T.R, hp[1] - CZ);
        const a = sp > 700 ? (1 - k / 14) * Math.min(1, (sp - 700) / 1200) * 0.9 : 0;
        tc.setXYZ(k, tcol.r * a, tcol.g * a, tcol.b * a);
      }
      tp.needsUpdate = true; tc.needsUpdate = true; bm.trail.visible = true;
    });
    for (let i = balls.length; i < ballMeshes.length; i++) { ballMeshes[i].m.visible = false; ballMeshes[i].trail.visible = false; ballMeshes[i].hist.length = 0; }
    // particles
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) { pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
      pLife[i] -= dt;
      pVel[i * 3 + 1] -= 600 * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] = Math.max(1, pPos[i * 3 + 1] + pVel[i * 3 + 1] * dt); pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] <= 1) pVel[i * 3 + 1] *= -0.4;
      const a = Math.max(0, pLife[i] / pMax[i]);
      pCol[i * 3] = pBase[i * 3] * a; pCol[i * 3 + 1] = pBase[i * 3 + 1] * a; pCol[i * 3 + 2] = pBase[i * 3 + 2] * a;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    for (const fl of flashLights) { fl.t = Math.max(0, fl.t - dt); fl.l.intensity = fl.t > 0 ? (fl.p || 2600) * (fl.t / 0.18) : 0; }
    // camera shake (+ table nudge feel)
    shake = Math.max(0, shake - dt * 2.2);
    const reduced = opts.reducedMotion;
    const a = reduced ? 0 : shake * shake * 6;
    camera.position.set(camBase.x + (Math.random() - 0.5) * a, camBase.y + (Math.random() - 0.5) * a, camBase.z + (Math.random() - 0.5) * a);
    camera.lookAt(look);
    composer.render();
  }

  function dispose() {
    composer.dispose?.(); for (const d of disposables) d.dispose?.(); env.dispose(); pmrem.dispose(); renderer.dispose();
  }
  return { resize, render, dispose, burst };
}
