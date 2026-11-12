// Headless tests for the pinball table physics and rules (games/pinball/table.js).
const T = require('../games/pinball/table.js');
let fails = 0;
const fail = (m) => { console.log('FAIL ' + m); fails++; if (fails > 10) process.exit(1); };
const NONE = { L: false, R: false, plunger: false, nudge: false };
const run = (s, inp, steps) => { const ev = []; for (let i = 0; i < steps; i++) ev.push(...T.step(s, inp)); return ev; };

// side of the ball relative to a flipper's axis (only where it projects onto the middle of the flipper)
function flipperSide(s, i) {
  const p = T.flipperPose(i, s.fl[i].a), b = s.ball;
  const ex = p.tx - p.px, ey = p.ty - p.py, l2 = ex * ex + ey * ey;
  const t = ((b.x - p.px) * ex + (b.y - p.py) * ey) / l2;
  if (t < 0.12 || t > 0.9) return 0;
  const cross = (ex * (b.y - p.py) - ey * (b.x - p.px)) / Math.sqrt(l2);
  if (Math.abs(cross) > 30) return 0;
  return Math.sign(cross) * (i ? -1 : 1); // -1 above, +1 below (for both flippers)
}
function checked(s, inp, steps, label) {
  for (let k = 0; k < steps; k++) {
    const before = [flipperSide(s, 0), flipperSide(s, 1)];
    T.step(s, inp(k));
    const bad = T.illegal(s);
    if (bad) { fail(label + ': ' + bad + ' at ' + s.ball.x.toFixed(1) + ',' + s.ball.y.toFixed(1)); return false; }
    for (let i = 0; i < 2; i++) {
      const after = flipperSide(s, i);
      if (before[i] === -1 && after === 1) { fail(label + ': passed through flipper ' + i); return false; }
    }
    if (s.ball.y > T.H || !s.ball.inPlay) return true;
  }
  return true;
}

// 1. launch: full pull reaches the playfield, a soft one falls back into the lane
{
  const s = T.newGame(1);
  run(s, { ...NONE, plunger: true }, 240);
  if (s.charge < 0.99) fail('plunger did not charge');
  run(s, NONE, 1);
  run(s, NONE, 480);
  if (!s.ball.inPlay) fail('full launch did not reach the playfield');
  const w = T.newGame(1);
  run(w, { ...NONE, plunger: true }, 30); run(w, NONE, 720);
  if (w.ball.inPlay || !T.resting(w)) fail('weak launch should fall back onto the plunger');
  console.log('launch ok');
}

// 2. cradle and flipper shot
{
  const s = T.newGame(2);
  Object.assign(s.ball, { x: 150, y: 560, vx: 0, vy: 0, inPlay: true });
  run(s, { ...NONE, L: true }, 240 * 3);
  const p = T.flipperPose(0, s.fl[0].a);
  if (Math.hypot(s.ball.vx, s.ball.vy) > 30 || s.ball.y > p.py) fail('ball not cradled on the raised left flipper (' + s.ball.x.toFixed(0) + ',' + s.ball.y.toFixed(0) + ')');
  // a ball falling onto the lowered flipper, flipped at different moments: the best shot must be strong
  let maxUp = 0;
  for (let delay = 60; delay < 160; delay += 4) {
    const s2 = T.newGame(3);
    Object.assign(s2.ball, { x: 140, y: 600, vx: 0, vy: 0, inPlay: true });
    run(s2, NONE, delay);
    for (let k = 0; k < 60; k++) { T.step(s2, { ...NONE, L: true }); maxUp = Math.max(maxUp, -s2.ball.vy); }
  }
  if (maxUp < 1200) fail('flipper shot too weak: ' + maxUp.toFixed(0));
  console.log('cradle ok, flip speed', maxUp.toFixed(0));
}

// 3. thousands of random high-speed shots with random flipping and nudging
{
  const spots = [[184, 450], [120, 300], [250, 320], [184, 560], [300, 480], [80, 480], [184, 120], [290, 230], [100, 230], [184, 640], [140, 640], [230, 640], [300, 140], [26, 240]];
  let seed = 12345; const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const N = 3000;
  let drains = 0;
  for (let n = 0; n < N; n++) {
    const s = T.newGame(n + 1);
    const [x0, y0] = spots[n % spots.length], a = r() * Math.PI * 2, v = 400 + r() * 2400;
    Object.assign(s.ball, { x: x0 + (r() - 0.5) * 16, y: y0 + (r() - 0.5) * 16, vx: Math.cos(a) * v, vy: Math.sin(a) * v, inPlay: true });
    s.saveT = 0;
    let L = false, Rr = false;
    const ok = checked(s, (k) => {
      if (r() < 0.02) L = !L; if (r() < 0.02) Rr = !Rr;
      return { L, R: Rr, plunger: false, nudge: k % 97 === 0 && r() < 0.2 };
    }, 240 * 4, 'shot ' + n);
    if (!ok) break;
    if (s.ballNum > 1 || s.extra) drains++;
  }
  console.log('random shots ok:', N, 'shots,', drains, 'drained');
}

// 4. fire straight at the flippers at top speed while they flip
{
  let seed = 99; const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let n = 0; n < 1500; n++) {
    const s = T.newGame(n + 7);
    const side = n % 2, fx = side ? 225 : 143;
    Object.assign(s.ball, { x: fx + (r() - 0.5) * 50, y: 600, vx: (r() - 0.5) * 400, vy: 2800, inPlay: true });
    s.saveT = 0;
    const flipAt = Math.floor(r() * 20);
    if (!checked(s, (k) => ({ ...NONE, L: k >= flipAt && side === 0, R: k >= flipAt && side === 1 }), 240, 'flipper bombard ' + n)) break;
  }
  console.log('flipper bombard ok');
}

// 5. a long game with a simple bot: never escapes, never stuck, game ends
{
  const s = T.newGame(424242);
  let steps = 0, still = 0, maxStill = 0, launches = 0;
  while (!s.over && steps < 240 * 60 * 40) {
    const b = s.ball;
    const inp = { ...NONE };
    if (T.resting(s) && !b.inPlay) { inp.plunger = steps % 400 < 200; }
    else {
      inp.L = b.y > 640 && b.x < 184 && b.vy > 60;
      inp.R = b.y > 640 && b.x >= 184 && b.vy > 60;
    }
    const ev = T.step(s, inp); steps++;
    if (ev.some((e) => e[0] === 'launch')) launches++;
    if (ev.some((e) => e[0] === 'escape')) { fail('ball escaped in long game'); break; }
    const bad = T.illegal(s); if (bad) { fail('long game: ' + bad); break; }
    if (b.inPlay && Math.hypot(b.vx, b.vy) < 5 && !inp.L && !inp.R) still++; else still = 0;
    maxStill = Math.max(maxStill, still);
  }
  if (!s.over) fail('long game did not finish');
  if (maxStill > 240 * 3) fail('ball sat still for ' + (maxStill / 240).toFixed(1) + ' s');
  console.log('long game ok: score', s.score, 'in', (steps / 240).toFixed(0), 's,', launches, 'launches, unstuck', s.unstuck, 'times');
}

// 6. stuck detector frees a ball wedged in place
{
  const s = T.newGame(5);
  Object.assign(s.ball, { x: 184, y: 450, vx: 0, vy: 0, inPlay: true });
  // hold the ball still by zeroing it every step (simulates a wedge) and check the detector fires
  let fired = false;
  for (let k = 0; k < 240 * 4 && !fired; k++) { s.ball.vx = 0; s.ball.vy = 0; s.ball.x = 184; s.ball.y = 450; fired = T.step(s, NONE).some((e) => e[0] === 'unstick'); }
  if (!fired) fail('stuck detector did not fire');
  console.log('stuck detector ok');
}

// 7. save / restore round trip continues identically
{
  const a = T.newGame(77);
  run(a, { ...NONE, plunger: true }, 200); run(a, NONE, 400);
  const b = JSON.parse(JSON.stringify(a));
  const inp = (k) => ({ L: k % 50 < 10, R: k % 70 < 12, plunger: false, nudge: false });
  for (let k = 0; k < 2000; k++) { T.step(a, inp(k)); T.step(b, inp(k)); }
  if (JSON.stringify(a) !== JSON.stringify(b)) fail('restored game diverged');
  if (JSON.stringify(a).length > 2000) fail('save too large: ' + JSON.stringify(a).length);
  console.log('save/restore ok,', JSON.stringify(a).length, 'bytes');
}

if (fails) { console.log(fails + ' failure(s)'); process.exit(1); }
console.log('pinball ok');
