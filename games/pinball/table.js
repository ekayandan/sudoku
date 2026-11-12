// Pinball "Deep Current": table geometry, physics and rules. Pure, no DOM; works in the browser and in Node.
// World units: the table is 400 × 830, y grows downwards. One step = 1/240 s.
// Collision: every step is split into substeps so the ball (and a flipper tip) moves less than ~0.35 ball
// radii per substep relative to anything it can touch; each substep resolves overlap against capsule
// segments, arcs, circles and the rotating flippers. Nothing can be crossed without overlapping it first,
// so the ball never tunnels, whatever its speed.
(function (root) {
  'use strict';
  const W = 400, H = 830, R = 9, G = 1150, HZ = 240, DT = 1 / HZ, VMAX = 2800;
  const FL_LEN = 56, FL_R0 = 9, FL_R1 = 5, W_UP = 24, W_DOWN = 14;
  const LANE_X = 374, PLUNGER_Y = 772, PULL = 30, BALL_SAVE = 8, BALLS = 3;
  const deg = Math.PI / 180;
  const MID = 184; // playfield centre line (between the left wall and the plunger lane)
  const mx = (x) => 2 * MID - x;

  // ---------------------------------------------------------------- geometry
  const walls = []; // static colliders
  const seg = (ax, ay, bx, by, o = {}) => walls.push({ k: 'seg', ax, ay, bx, by, r: o.r ?? 3, e: o.e ?? 0.45, tag: o.tag || 'wall', kick: o.kick || 0, id: o.id ?? -1, hidden: !!o.hidden });
  const arc = (x, y, rad, a0, a1, o = {}) => walls.push({ k: 'arc', x, y, R: rad, a0: a0 * deg, a1: a1 * deg, r: o.r ?? 3, e: o.e ?? 0.4, tag: o.tag || 'wall', kick: 0, id: -1 });
  const circ = (x, y, rad, o = {}) => walls.push({ k: 'circ', x, y, r: rad, e: o.e ?? 0.5, tag: o.tag || 'post', kick: o.kick || 0, id: o.id ?? -1 });

  // outer shell: top arch, plunger lane, right wall
  arc(200, 200, 190, 180, 360, { r: 2 });
  seg(390, 200, 390, H + 20, { r: 2 });
  seg(358, 200, 358, H + 20, { r: 2, tag: 'lane' });
  // left orbit: channel between the outer wall and an inner guide, curving into the playfield at the bottom
  seg(10, 200, 10, 300, { r: 2 });
  arc(90, 300, 80, 115, 180, { r: 2 });
  seg(56.2, 372.5, 10, 440, { r: 2 });
  seg(10, 440, 10, H + 20, { r: 2 });
  arc(200, 200, 158, 180, 228, { r: 3, tag: 'guide' });
  seg(42, 200, 42, 300, { r: 3, tag: 'guide' });
  // top rollover lanes (guides between them)
  for (const x of [150, 190, 230, 270]) seg(x, 52, x, 86, { r: 3, tag: 'guide' });
  // pop bumpers
  const BUMPERS = [[140, 168], [230, 168], [185, 236]];
  BUMPERS.forEach(([x, y], i) => circ(x, y, 20, { tag: 'bumper', kick: 520, e: 0.6, id: i }));
  // drop-target bank on the right, with a solid block behind it
  seg(344, 282, 358, 262, { r: 2 });
  seg(344, 282, 344, 392, { r: 2 });
  seg(344, 392, 358, 412, { r: 2 });
  const TARGETS = [[288, 310], [314, 336], [340, 362], [366, 388]];
  // outlanes, inlanes, slingshots (left, then mirrored right)
  for (const side of [0, 1]) {
    const X = side ? mx : (x) => x;
    seg(X(40), 560, X(40), H + 20, { r: 3, tag: 'guide' });
    seg(X(40), 625, X(112), 688, { r: 3, tag: 'guide' });
    seg(X(66), 540, X(66), 605, { r: 3, tag: 'sling-side' });
    seg(X(66), 605, X(104), 640, { r: 3, tag: 'sling-side' });
    seg(X(66), 540, X(104), 640, { r: 3, tag: 'sling', kick: 430, e: 0.4, id: side });
  }
  // gate at the top of the plunger lane: solid only once the ball has left the lane
  const GATE = { k: 'seg', ax: 358, ay: 200, bx: 390, by: 186, r: 2, e: 0.3, tag: 'gate', kick: 0, id: -1 };
  // flippers
  const FLIPPERS = [
    { x: 118, y: 700, down: 30 * deg, up: -26 * deg },
    { x: mx(118), y: 700, down: 150 * deg, up: 206 * deg },
  ];
  // sensors: rectangles [x0, y0, x1, y1, name, index]
  const SENSORS = [
    [154, 58, 186, 82, 'lane', 0], [194, 58, 226, 82, 'lane', 1], [234, 58, 266, 82, 'lane', 2],
    [12, 220, 40, 260, 'orbit', 0],
    [12, 640, 38, 690, 'outlane', 0], [mx(38), 640, mx(12), 690, 'outlane', 1],
    [43, 575, 63, 610, 'inlane', 0], [mx(63), 575, mx(43), 610, 'inlane', 1],
  ];

  // ---------------------------------------------------------------- rng (state lives in s.seed)
  const rnd = (s) => { let x = s.seed | 0 || 0x9e3779b9; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.seed = x >>> 0; return s.seed / 4294967296; };

  // ---------------------------------------------------------------- state
  function newGame(seed = 1) {
    const s = {
      v: 1, seed: seed >>> 0 || 1, t: 0,
      ball: { x: LANE_X, y: PLUNGER_Y - R - 2, vx: 0, vy: 0, inPlay: false },
      fl: FLIPPERS.map((f) => ({ a: f.down, w: 0, hold: 0 })),
      charge: 0, score: 0, ballNum: 1, extra: 0, mult: 1, bonus: 0,
      lanes: [0, 0, 0], targets: [1, 1, 1, 1], banks: 0, targetT: 0,
      saveT: 0, saveReady: 1, shake: 0, tilted: false, over: false,
      flash: [0, 0, 0, 0, 0], sens: 0, msg: 'Launch!', msgT: 2,
      stuck: { x: 0, y: 0, t: 0 }, unstuck: 0,
    };
    return s;
  }
  const inLane = (b) => b.x > 358 && b.y > 220;
  const resting = (s) => { const b = s.ball; return inLane(b) && b.y > PLUNGER_Y - R - 40; };

  // ---------------------------------------------------------------- collision helpers
  function flipperPose(i, a) {
    const f = FLIPPERS[i];
    return { px: f.x, py: f.y, tx: f.x + FL_LEN * Math.cos(a), ty: f.y + FL_LEN * Math.sin(a) };
  }
  // Push the ball out of a surface whose nearest point is (qx,qy) with radius rr; (svx,svy) = surface velocity.
  function resolve(b, qx, qy, rr, e, svx, svy, fx, fy) {
    let dx = b.x - qx, dy = b.y - qy;
    let d = Math.hypot(dx, dy);
    const min = R + rr;
    if (d >= min) return 0;
    let nx, ny;
    if (d < 1e-6) { nx = fx; ny = fy; d = 0; } else { nx = dx / d; ny = dy / d; }
    b.x = qx + nx * min; b.y = qy + ny * min;
    const rvx = b.vx - svx, rvy = b.vy - svy, vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 1e-3;
    const tx = rvx - vn * nx, ty = rvy - vn * ny; // tangential part, light friction
    b.vx = svx + tx * 0.985 - e * vn * nx;
    b.vy = svy + ty * 0.985 - e * vn * ny;
    return -vn;
  }
  function closestSeg(px, py, c) {
    const ex = c.bx - c.ax, ey = c.by - c.ay, l2 = ex * ex + ey * ey;
    let t = l2 ? ((px - c.ax) * ex + (py - c.ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [c.ax + ex * t, c.ay + ey * t, t];
  }
  function closestArc(px, py, c) {
    let a = Math.atan2(py - c.y, px - c.x);
    while (a < c.a0) a += 2 * Math.PI;
    if (a > c.a1) {
      const p0 = [c.x + c.R * Math.cos(c.a0), c.y + c.R * Math.sin(c.a0)], p1 = [c.x + c.R * Math.cos(c.a1), c.y + c.R * Math.sin(c.a1)];
      return Math.hypot(px - p0[0], py - p0[1]) < Math.hypot(px - p1[0], py - p1[1]) ? p0 : p1;
    }
    return [c.x + c.R * Math.cos(a), c.y + c.R * Math.sin(a)];
  }

  function hitStatic(s, c, ev) {
    const b = s.ball;
    let q;
    if (c.k === 'seg') q = closestSeg(b.x, b.y, c);
    else if (c.k === 'arc') q = closestArc(b.x, b.y, c);
    else q = [c.x, c.y];
    const rr = c.k === 'circ' ? c.r : c.r;
    if (Math.abs(b.x - q[0]) > R + rr || Math.abs(b.y - q[1]) > R + rr) return;
    // fallback normal for a dead-centre overlap: segment normal pointing up, else up
    let fx = 0, fy = -1;
    if (c.k === 'seg') { const ex = c.bx - c.ax, ey = c.by - c.ay, l = Math.hypot(ex, ey) || 1; fx = ey / l; fy = -ex / l; if (fy > 0) { fx = -fx; fy = -fy; } }
    const imp = resolve(b, q[0], q[1], rr, c.e, 0, 0, fx, fy);
    if (!imp) return;
    if (c.kick && imp > 40 && !s.tilted) {
      // active surfaces: bumpers and slingshot faces kick the ball away along the normal
      let nx = b.x - q[0], ny = b.y - q[1]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
      const vn = b.vx * nx + b.vy * ny, want = c.kick;
      if (vn < want) { b.vx += (want - vn) * nx; b.vy += (want - vn) * ny; }
      if (c.tag === 'bumper') { s.flash[c.id] = 0.12; addScore(s, 1000); s.bonus += 100; ev.push(['bumper', c.id]); }
      if (c.tag === 'sling') { s.flash[3 + c.id] = 0.12; addScore(s, 100); ev.push(['sling', c.id]); }
    } else if (imp > 160) ev.push(['wall', imp]);
  }

  function hitTarget(s, i, ev) {
    const b = s.ball, [y0, y1] = TARGETS[i];
    const c = { ax: 336, ay: y0 + 4, bx: 336, by: y1 - 4 };
    const q = closestSeg(b.x, b.y, c);
    const imp = resolve(b, q[0], q[1], 4, 0.35, 0, 0, -1, 0);
    if (imp > 60 && !s.tilted) {
      s.targets[i] = 0; addScore(s, 2500); s.bonus += 500; ev.push(['target', i]);
      if (s.targets.every((t) => !t)) {
        s.banks++; addScore(s, 25000); s.targetT = 1.2;
        if (s.banks % 2 === 0) { s.extra++; say(s, 'EXTRA BALL!', 2.5); ev.push(['extra']); } else say(s, 'Reef cleared +25,000', 2);
      }
    }
  }

  function hitFlipper(s, i, ev) {
    const b = s.ball, f = s.fl[i], p = flipperPose(i, f.a);
    const ex = p.tx - p.px, ey = p.ty - p.py, l2 = ex * ex + ey * ey;
    let t = ((b.x - p.px) * ex + (b.y - p.py) * ey) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = p.px + ex * t, qy = p.py + ey * t, rr = FL_R0 + (FL_R1 - FL_R0) * t;
    if (Math.abs(b.x - qx) > R + rr || Math.abs(b.y - qy) > R + rr) return;
    // surface velocity at the contact point: ω × r
    const dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy) || 1;
    const cx = qx + (dx / d) * rr, cy = qy + (dy / d) * rr;
    const svx = -f.w * (cy - p.py), svy = f.w * (cx - p.px);
    const imp = resolve(b, qx, qy, rr, 0.32, svx, svy, 0, -1);
    if (imp > 250) ev.push(['flipper', i, imp]);
  }

  function addScore(s, n) { if (!s.tilted) s.score += n; }
  function say(s, msg, sec) { s.msg = msg; s.msgT = sec; }

  // ---------------------------------------------------------------- step
  // inp: { L, R, plunger, nudge } (booleans). Returns a list of events for sound/haptics.
  function step(s, inp) {
    const ev = [];
    if (s.over) return ev;
    const b = s.ball;
    s.t += DT;
    if (s.msgT > 0) s.msgT -= DT;
    for (let i = 0; i < s.flash.length; i++) if (s.flash[i] > 0) s.flash[i] -= DT;
    if (s.shake > 0) s.shake = Math.max(0, s.shake - 0.6 * DT);
    if (s.saveT > 0) s.saveT -= DT;
    if (s.targetT > 0 && (s.targetT -= DT) <= 0) s.targets = [1, 1, 1, 1];

    // flippers: target direction (a short tap keeps the flipper up for a moment)
    const want = [inp.L, inp.R];
    for (let i = 0; i < 2; i++) {
      const f = s.fl[i];
      if (want[i] && !s.tilted) {
        if (f.hold <= 0) {
          ev.push(['flip', i]);
          if (b.inPlay) { const L = s.lanes; s.lanes = i ? [L[2], L[0], L[1]] : [L[1], L[2], L[0]]; } // lane change
        }
        f.hold = 0.05;
      } else if (f.hold > 0) f.hold -= DT;
    }

    // plunger
    const pull = inp.plunger || inp.R;
    if (resting(s) && !b.inPlay) {
      if (pull) s.charge = Math.min(1, s.charge + DT / 0.9);
      else if (s.charge > 0) {
        b.vy = -(700 + 1750 * s.charge); b.vx = 0;
        ev.push(['launch', s.charge]); s.charge = 0;
      }
    } else if (!pull) s.charge = 0;

    // nudge
    if (inp.nudge && b.inPlay && !s.tilted) {
      b.vx += (rnd(s) - 0.5) * 160; b.vy -= 140; s.shake += 1; ev.push(['nudge']);
      if (s.shake > 3.2) { s.tilted = true; say(s, 'TILT', 99); ev.push(['tilt']); }
      else if (s.shake > 2.2) say(s, 'Careful…', 1.2);
    }

    // substeps: keep relative motion under ~0.35 R per substep
    const moving = s.fl.some((f, i) => (f.hold > 0 && !s.tilted) !== (Math.abs(f.a - FLIPPERS[i].down) < 1e-6));
    const sp = Math.hypot(b.vx, b.vy) + (moving ? W_UP * (FL_LEN + R) : 0);
    const n = Math.min(24, Math.max(1, Math.ceil((sp * DT) / (R * 0.35))));
    const h = DT / n;
    const plungerY = PLUNGER_Y + s.charge * PULL;
    for (let k = 0; k < n; k++) {
      b.vy += G * h; b.x += b.vx * h; b.y += b.vy * h;
      for (let i = 0; i < 2; i++) {
        const f = s.fl[i], F = FLIPPERS[i], dir = Math.sign(F.up - F.down);
        const up = f.hold > 0 && !s.tilted, target = up ? F.up : F.down;
        const diff = (target - f.a) * dir; // >0: needs to move up
        if (Math.abs(diff) < 1e-9) { f.w = 0; continue; }
        const w = diff > 0 ? W_UP * dir : -W_DOWN * dir;
        let na = f.a + w * h;
        if ((target - na) * Math.sign(w) <= 0) { na = target; }
        f.w = (na - f.a) / h; f.a = na;
      }
      for (let pass = 0; pass < 2; pass++) {
        for (const c of walls) hitStatic(s, c, ev);
        if (b.inPlay) hitStatic(s, GATE, ev);
        for (let i = 0; i < 4; i++) if (s.targets[i]) hitTarget(s, i, ev);
        hitFlipper(s, 0, ev); hitFlipper(s, 1, ev);
        if (inLane(b)) { // plunger tip
          if (b.y + R > plungerY) { b.y = plungerY - R; if (b.vy > 0) b.vy = 0; }
        }
      }
      const v = Math.hypot(b.vx, b.vy);
      if (v > VMAX) { b.vx *= VMAX / v; b.vy *= VMAX / v; }
    }
    if (!b.inPlay && b.x < 352) { b.inPlay = true; if (s.saveReady) { s.saveT = BALL_SAVE; s.saveReady = 0; } }
    // once in the lane again (weak launch fell back), it is not in play yet
    sensors(s, ev);
    stuckCheck(s, inp, ev);
    // safety net: a ball outside the table (should never happen) goes back to the plunger without losing a ball
    if (!(b.x > 0 && b.x < W && b.y > -20 && Number.isFinite(b.vx + b.vy))) { ev.push(['escape']); toLane(s); }
    else if (b.y > H) drain(s, ev);
    return ev;
  }

  function sensors(s, ev) {
    const b = s.ball;
    let now = 0;
    SENSORS.forEach(([x0, y0, x1, y1], i) => { if (b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) now |= 1 << i; });
    const entered = now & ~s.sens;
    s.sens = now;
    if (!entered || s.tilted) return;
    SENSORS.forEach(([, , , , name, idx], i) => {
      if (!(entered & (1 << i))) return;
      if (name === 'lane') {
        addScore(s, 500); s.bonus += 200;
        if (!s.lanes[idx]) { s.lanes[idx] = 1; ev.push(['lane', idx]); }
        if (s.lanes.every(Boolean)) {
          s.lanes = [0, 0, 0]; addScore(s, 10000);
          if (s.mult < 6) s.mult++;
          say(s, 'Bonus ×' + s.mult, 1.8); ev.push(['mult', s.mult]);
        }
      } else if (name === 'orbit') {
        if (b.vy < 0) { addScore(s, 5000); s.bonus += 500; say(s, 'Current ride +5,000', 1.5); ev.push(['orbit']); }
      } else if (name === 'inlane') { addScore(s, 1000); s.bonus += 200; ev.push(['inlane', idx]); }
      else if (name === 'outlane') { addScore(s, 3000); ev.push(['outlane', idx]); }
    });
  }

  function stuckCheck(s, inp, ev) {
    const b = s.ball, st = s.stuck;
    if (!b.inPlay || (inLane(b) && b.y > 600)) { st.t = 0; st.x = b.x; st.y = b.y; return; }
    if (Math.hypot(b.x - st.x, b.y - st.y) > 8) { st.x = b.x; st.y = b.y; st.t = 0; return; }
    st.t += DT;
    const cradled = inp.L || inp.R;
    if (st.t > (cradled ? 12 : 2.5)) {
      b.vx = (rnd(s) - 0.5) * 500; b.vy = -500 - rnd(s) * 300; b.y -= 2;
      st.t = 0; s.unstuck++; ev.push(['unstick']);
    }
  }

  function toLane(s) {
    const b = s.ball;
    b.x = LANE_X; b.y = PLUNGER_Y - R - 2; b.vx = 0; b.vy = 0; b.inPlay = false;
    s.charge = 0; s.sens = 0; s.stuck.t = 0;
  }

  function drain(s, ev) {
    if (s.saveT > 0 && !s.tilted) {
      toLane(s); say(s, 'Ball saved', 2); ev.push(['saved']); return;
    }
    const bonus = s.tilted ? 0 : s.bonus * s.mult;
    s.score += bonus;
    ev.push(['drain', bonus]);
    s.bonus = 0; s.mult = 1; s.saveReady = 1; s.tilted = false; s.shake = 0; s.lanes = [0, 0, 0];
    toLane(s);
    if (s.extra > 0) { s.extra--; say(s, 'Shoot again', 2.5); return; }
    s.ballNum++;
    if (s.ballNum > BALLS) { s.ballNum = BALLS; s.over = true; ev.push(['over']); say(s, 'Game over', 99); return; }
    say(s, bonus ? 'Bonus ' + bonus.toLocaleString('en-US') : 'Ball ' + s.ballNum, 2);
  }

  // Positions the ball must never reach (behind walls, inside solids). Used by the tests.
  function illegal(s) {
    const b = s.ball, x = b.x, y = b.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'nan';
    if (y > H + 40) return null; // drained
    if (x < 10 + R - 1.5 || x > 390 - R + 1.5) return 'outside side walls';
    if (y < 200 && Math.hypot(x - 200, y - 200) > 190 - R + 1.5) return 'outside top arch';
    if (y > 205 && x > 358 - R + 1.5 && x < 358 + R - 1.5) return 'inside lane divider';
    for (const [bx, by] of BUMPERS) if (Math.hypot(x - bx, y - by) < 20 + R - 1.5) return 'inside bumper';
    if (x > 344 && x < 358 && y > 282 && y < 392) return 'behind drop targets';
    for (const side of [0, 1]) {
      const X = side ? mx(x) : x; // mirror into the left half
      if (X > 44 && X < 108 && y > 625 + (X - 40) * (63 / 72) + 6 && y < 700) return 'under inlane guide';
      if (X > 70 && X < 100 && y > 548 + (X - 66) * (100 / 38) + 6 && y < 600) return 'inside slingshot';
    }
    return null;
  }

  const api = { W, H, R, DT, HZ, BALLS, LANE_X, PLUNGER_Y, PULL, FL_LEN, FL_R0, FL_R1, walls, GATE, BUMPERS, TARGETS, FLIPPERS, SENSORS, newGame, step, flipperPose, inLane, resting, illegal, toLane };
  root.PinballTable = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
