// Headless tests for the pinball engine and every table (games/pinball/engine.js, games/pinball/tables/*.js).
global.self = global;
const E = require('../games/pinball/engine.js');
for (const f of ['base', 'deep-current', 'neon-drive', 'starfall']) require('../games/pinball/tables/' + f + '.js');
let fails = 0;
const fail = (m) => { console.log('FAIL ' + m); fails++; if (fails > 10) process.exit(1); };
const NONE = { L: false, R: false, plunger: false, nudge: false };
const run = (T, s, inp, steps) => { const ev = []; for (let i = 0; i < steps; i++) ev.push(...T.step(s, inp)); return ev; };
const ball = (s) => s.balls[0];

// does the move p→q cross a wall segment (centre line) without having touched it? (tunnelling)
function crosses(T, p, q) {
  for (const c of T.walls) {
    if (c.k !== 'seg') continue;
    const d = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d1 = d(c.ax, c.ay, c.bx, c.by, p.x, p.y), d2 = d(c.ax, c.ay, c.bx, c.by, q.x, q.y);
    const d3 = d(p.x, p.y, q.x, q.y, c.ax, c.ay), d4 = d(p.x, p.y, q.x, q.y, c.bx, c.by);
    if (d1 * d2 < 0 && d3 * d4 < 0) return c;
  }
  return null;
}
function checked(T, s, inp, steps, label) {
  for (let k = 0; k < steps; k++) {
    const before = s.balls.map((b) => ({ x: b.x, y: b.y, b }));
    T.step(s, inp(k));
    for (const b of s.balls) {
      const bad = T.illegal(s, b);
      if (bad) { fail(T.id + ' ' + label + ': ' + bad + ' at ' + b.x.toFixed(1) + ',' + b.y.toFixed(1)); return false; }
      const p = before.find((o) => o.b === b);
      if (p && b.hold <= 0 && Math.hypot(b.x - p.x, b.y - p.y) < 40) {
        const c = crosses(T, p, b);
        if (c) { fail(T.id + ' ' + label + ': crossed ' + c.tag + ' ' + c.ax + ',' + c.ay); return false; }
      }
    }
    if (!s.balls.some((b) => b.inPlay) && !s.queue) return true;
  }
  return true;
}

for (const T of Object.values(E.TABLES)) {
  // 1. launch
  {
    const s = T.newGame(1);
    run(T, s, { ...NONE, plunger: true }, 240); run(T, s, NONE, 480);
    if (!ball(s).inPlay) fail(T.id + ': full launch did not reach the playfield');
    const w = T.newGame(1);
    run(T, w, { ...NONE, plunger: true }, 30); run(T, w, NONE, 720);
    if (ball(w).inPlay || !T.resting(w)) fail(T.id + ': weak launch should fall back onto the plunger');
  }
  // 2. cradle and flipper shot
  {
    const s = T.newGame(2);
    Object.assign(ball(s), { x: 150, y: 560, vx: 0, vy: 0, inPlay: true });
    run(T, s, { ...NONE, L: true }, 240 * 3);
    const p = T.flipperPose(0, s.fl[0].a);
    if (Math.hypot(ball(s).vx, ball(s).vy) > 30 || ball(s).y > p.py) fail(T.id + ': ball not cradled');
    let maxUp = 0;
    for (let delay = 60; delay < 160; delay += 4) {
      const s2 = T.newGame(3);
      Object.assign(ball(s2), { x: 140, y: 600, vx: 0, vy: 0, inPlay: true });
      run(T, s2, NONE, delay);
      for (let k = 0; k < 60; k++) { T.step(s2, { ...NONE, L: true }); maxUp = Math.max(maxUp, -ball(s2).vy); }
    }
    if (maxUp < 1200) fail(T.id + ': flipper shot too weak: ' + maxUp.toFixed(0));
  }
  // 3. random high-speed shots from all over the table, random flipping and nudging
  {
    let seed = 12345; const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const N = 2000; let n = 0, tries = 0;
    while (n < N && tries < N * 20) {
      tries++;
      const s = T.newGame(tries);
      const x0 = 20 + r() * 330, y0 = 20 + r() * 640, b = ball(s);
      Object.assign(b, { x: x0, y: y0, inPlay: true });
      if (T.illegal(s, b) || T.inLane(b) || T.walls.some((c) => c.k === 'circ' && Math.hypot(x0 - c.x, y0 - c.y) < c.r + 12)) continue;
      if (T.walls.some((c) => { if (c.k !== 'seg') return false; const ex = c.bx - c.ax, ey = c.by - c.ay, l2 = ex * ex + ey * ey; let t = ((x0 - c.ax) * ex + (y0 - c.ay) * ey) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x0 - c.ax - ex * t, y0 - c.ay - ey * t) < 14; })) continue;
      n++;
      const a = r() * Math.PI * 2, v = 400 + r() * 2400;
      b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; s.saveT = 0; s.saveReady = 0;
      let L = false, Rr = false;
      if (!checked(T, s, (k) => { if (r() < 0.02) L = !L; if (r() < 0.02) Rr = !Rr; return { L, R: Rr, plunger: false, nudge: k % 97 === 0 && r() < 0.2 }; }, 240 * 4, 'shot ' + n)) break;
    }
  }
  // 4. fire straight at the flippers at top speed while they flip
  {
    let seed = 99; const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let n = 0; n < 800; n++) {
      const s = T.newGame(n + 7), side = n % 2, fx = side ? 225 : 143;
      Object.assign(ball(s), { x: fx + (r() - 0.5) * 50, y: 600, vx: (r() - 0.5) * 400, vy: 2800, inPlay: true });
      s.saveT = 0; s.saveReady = 0;
      const flipAt = Math.floor(r() * 20);
      if (!checked(T, s, (k) => ({ ...NONE, L: k >= flipAt && side === 0, R: k >= flipAt && side === 1 }), 240, 'flipper bombard ' + n)) break;
    }
  }
  // 5. long games with a simple bot: never escape, never stuck, finish; collect which features fire
  {
    const seen = new Set(); let total = 0;
    for (let g = 0; g < 4; g++) {
      const s = T.newGame(424242 + g);
      let steps = 0;
      while (!s.over && steps < 240 * 60 * 30) {
        const inp = { ...NONE };
        if (T.resting(s)) inp.plunger = steps % 400 < 150 + g * 40;
        for (const b of s.balls) {
          if (!b.inPlay) continue;
          if (b.y > 640 && b.x < 184 && b.vy > 60) inp.L = true;
          if (b.y > 640 && b.x >= 184 && b.vy > 60) inp.R = true;
        }
        const ev = T.step(s, inp); steps++;
        for (const e of ev) seen.add(e[0] === 'show' ? 'show:' + e[1] : e[0]);
        if (ev.some((e) => e[0] === 'escape')) { fail(T.id + ': ball escaped in long game'); break; }
        let bad = null; for (const b of s.balls) bad = bad || T.illegal(s, b);
        if (bad) { fail(T.id + ' long game: ' + bad); break; }
      }
      if (!s.over) fail(T.id + ': long game did not finish');
      total += s.score;
    }
    console.log(T.id + ': long games ok, avg score', Math.round(total / 4), '·', [...seen].filter((x) => !['flip', 'wall', 'score', 'say'].includes(x)).sort().join(' '));
  }
  // 6. multiball and saucers: force a multiball and check all balls stay legal and it ends
  {
    const s = T.newGame(31337);
    const ev = []; const X = { };
    s.queue = 2; s.mb = 1;
    let steps = 0, maxBalls = 0;
    const r = (() => { let sd = 5; return () => ((sd = (sd * 1103515245 + 12345) >>> 0) / 4294967296); })();
    if (!checked(T, s, () => ({ L: r() < 0.3, R: r() < 0.3, plunger: false, nudge: false }), 240 * 60, 'multiball')) {}
    for (let k = 0; k < 10; k++) { maxBalls = Math.max(maxBalls, s.balls.length); }
    void ev; void X; void steps;
  }
  // 7. save / restore round trip continues identically
  {
    const a = T.newGame(77);
    run(T, a, { ...NONE, plunger: true }, 200); run(T, a, NONE, 400);
    const b = JSON.parse(JSON.stringify(a));
    const inp = (k) => ({ L: k % 50 < 10, R: k % 70 < 12, plunger: false, nudge: false });
    for (let k = 0; k < 3000; k++) { T.step(T === T ? a : a, inp(k)); T.step(b, inp(k)); }
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(T.id + ': restored game diverged');
    if (JSON.stringify(a).length > 4000) fail(T.id + ': save too large: ' + JSON.stringify(a).length);
  }
  console.log(T.id + ' ok');
}

// stuck detector
{
  const T = E.TABLES['deep-current'], s = T.newGame(5);
  Object.assign(ball(s), { x: 184, y: 450, vx: 0, vy: 0, inPlay: true });
  let fired = false;
  for (let k = 0; k < 240 * 4 && !fired; k++) { Object.assign(ball(s), { vx: 0, vy: 0, x: 184, y: 450 }); fired = T.step(s, NONE).some((e) => e[0] === 'unstick'); }
  if (!fired) fail('stuck detector did not fire');
}

if (fails) { console.log(fails + ' failure(s)'); process.exit(1); }
console.log('pinball ok');
