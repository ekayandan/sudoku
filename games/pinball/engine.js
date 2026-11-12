// Pinball engine: builds a playable table from a table spec (tables/*.js) and steps it. Pure, no DOM; runs in the
// browser and in Node. World units: tables are 400 wide, y grows downwards. One step = 1/240 s.
//
// Collision: every step is split into substeps so each ball (and a flipper tip) moves less than ~0.35 ball radii per
// substep relative to anything it can touch; each substep resolves overlap against capsule segments, arcs, circles,
// the rotating flippers and the other balls. Nothing can be crossed without overlapping it first, so a ball never
// tunnels, whatever its speed.
//
// A spec gives geometry via build(B) (B.seg, B.arc, B.bumper, B.sling, B.drop, B.standup, B.rollover, B.sensor,
// B.spinner, B.saucer, B.kickback, B.flipper, B.solid ...) and rules via rules.event(s, X, name, idx, ball).
// State is plain JSON (saved as-is), so everything a rule needs lives in s.L (named counters/lights).
(function (root) {
  'use strict';
  const deg = Math.PI / 180, HZ = 240, DT = 1 / HZ, VMAX = 2800, R = 9, W_UP = 24, W_DOWN = 14, G0 = 1150;
  const TABLES = root.PinballTables || (root.PinballTables = {});

  // ------------------------------------------------------------------ geometry helpers
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
  function inPoly(x, y, p) {
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inRect = (b, r) => b.x >= r[0] && b.x <= r[2] && b.y >= r[1] && b.y <= r[3];

  // ------------------------------------------------------------------ build
  function define(spec) {
    const W = spec.W || 400, H = spec.H || 830, MID = spec.mid || 184, G = spec.gravity || G0;
    const lane = Object.assign({ x: 374, x0: 358, x1: 390, top: 200, plungerY: 772, pull: 30 }, spec.lane);
    const walls = [], bumpers = [], slings = [], drops = [], standups = [], rollovers = [], sensors = [], spinners = [],
      saucers = [], kickbacks = [], flippers = [], solids = [], gates = [];
    let nFlash = 0;
    const mirror = (x) => 2 * MID - x;
    const B = {
      deg, W, H, MID, mx: mirror, lane,
      seg(ax, ay, bx, by, o = {}) {
        const c = { k: 'seg', ax, ay, bx, by, r: o.r ?? 3, e: o.e ?? 0.45, tag: o.tag || 'wall', kick: o.kick || 0, id: o.id ?? -1, hidden: !!o.hidden };
        walls.push(c); return c;
      },
      chain(pts, o) { for (let i = 1; i < pts.length; i++) B.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], o); },
      arc(x, y, rad, a0, a1, o = {}) {
        const c = { k: 'arc', x, y, R: rad, a0: a0 * deg, a1: a1 * deg, r: o.r ?? 3, e: o.e ?? 0.4, tag: o.tag || 'wall', kick: 0, id: -1 };
        walls.push(c); return c;
      },
      post(x, y, r = 5, o = {}) { const c = { k: 'circ', x, y, r, e: o.e ?? 0.5, tag: 'post', kick: 0, id: -1 }; walls.push(c); return c; },
      bumper(x, y, r = 20, o = {}) {
        const c = { k: 'circ', x, y, r, e: 0.6, tag: 'bumper', kick: o.kick || 520, id: bumpers.length, fl: nFlash++ };
        walls.push(c); bumpers.push(c); return c;
      },
      // slingshot: kicking face a→b, plus the two passive sides to c (the corner behind it)
      sling(a, b, c, o = {}) {
        const id = slings.length, fl = nFlash++;
        B.seg(a[0], a[1], c[0], c[1], { r: 3, tag: 'sling-side' });
        B.seg(c[0], c[1], b[0], b[1], { r: 3, tag: 'sling-side' });
        const f = B.seg(a[0], a[1], b[0], b[1], { r: 3, tag: 'sling', kick: o.kick || 430, e: 0.4, id });
        f.fl = fl; slings.push(f); solids.push({ pts: [a, b, c], tag: 'sling' });
      },
      // drop target: a capsule (radius 4) that drops when hit; group = bank name; nx,ny = face normal
      drop(group, ax, ay, bx, by) {
        const t = { ax, ay, bx, by, group, id: drops.length, fl: nFlash++ };
        drops.push(t); return t;
      },
      standup(group, ax, ay, bx, by) {
        const c = B.seg(ax, ay, bx, by, { r: 4, e: 0.35, tag: 'standup' });
        c.id = standups.length; c.group = group; c.fl = nFlash++; standups.push(c); return c;
      },
      rollover(group, x, y, w = 16, h = 22) {
        const r = { group, x, y, rect: [x - w / 2, y - h / 2, x + w / 2, y + h / 2], id: rollovers.length };
        rollovers.push(r); return r;
      },
      // generic trigger: fires rules.event(name, idx) when a ball enters rect (dir: 'up'|'down'|'left'|'right' filter)
      sensor(name, rect, o = {}) { const sn = { name, rect, idx: o.idx || 0, dir: o.dir || '', id: sensors.length }; sensors.push(sn); return sn; },
      spinner(name, x, y, w, o = {}) {
        const sp = { name, x, y, w, rect: [x - w / 2, y - 6, x + w / 2, y + 6], id: spinners.length, vertical: !!o.vertical };
        if (sp.vertical) sp.rect = [x - 6, y - w / 2, x + 6, y + w / 2];
        spinners.push(sp); return sp;
      },
      saucer(name, x, y, ex, ey, o = {}) { const sc = { name, x, y, ex, ey, hold: o.hold || 1.1, id: saucers.length, fl: nFlash++ }; saucers.push(sc); return sc; },
      kickback(rect, o = {}) { const k = { rect, power: o.power || 1500, id: kickbacks.length }; kickbacks.push(k); return k; },
      flipper(x, y, down, up, o = {}) {
        const f = { x, y, down: down * deg, up: up * deg, len: o.len || 56, r0: o.r0 || 9, r1: o.r1 || 5, side: o.side || (up < down ? 'L' : 'R'), id: flippers.length };
        flippers.push(f); return f;
      },
      // a filled solid region (drawn by the renderer, and the ball centre must never be inside it)
      solid(pts, o = {}) { solids.push({ pts, tag: o.tag || 'solid', color: o.color }); },
      // lane exit gate: solid only for balls already in play
      gate(ax, ay, bx, by) { const c = { k: 'seg', ax, ay, bx, by, r: 2, e: 0.3, tag: 'gate', kick: 0, id: -1 }; gates.push(c); return c; },
    };
    spec.build(B);

    const rules = spec.rules || {};
    const points = Object.assign({ bumper: 1000, sling: 100, drop: 2500, standup: 1500, rollover: 500, spin: 120, saucer: 5000, kickback: 2000, inlane: 1000, outlane: 3000 }, spec.points);
    const BALLS = spec.balls || 3, BALL_SAVE = spec.ballSave ?? 8;

    // ------------------------------------------------------------------ state
    const rnd = (s) => { let x = s.seed | 0 || 0x9e3779b9; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.seed = x >>> 0; return s.seed / 4294967296; };
    const newBall = () => ({ x: lane.x, y: lane.plungerY - R - 2, vx: 0, vy: 0, inPlay: false, hold: 0, sc: -1, sens: 0, auto: 0, st: { x: 0, y: 0, t: 0 } });
    function newGame(seed = 1) {
      const s = {
        v: 2, table: spec.id, seed: seed >>> 0 || 1, t: 0,
        balls: [newBall()],
        fl: flippers.map((f) => ({ a: f.down, w: 0, hold: 0 })),
        charge: 0, score: 0, ballNum: 1, extra: 0, mult: 1, bonus: 0,
        drops: drops.map(() => 1), dropT: {}, stand: standups.map(() => 0), roll: rollovers.map(() => 0),
        spin: spinners.map(() => 0), spinA: spinners.map(() => 0), kick: kickbacks.map(() => 0),
        flash: new Array(nFlash).fill(0),
        saveT: 0, saveReady: 1, shake: 0, tilted: false, over: false, mb: 0, queue: 0,
        msg: spec.hello || 'Launch!', msgT: 2, unstuck: 0, L: {},
      };
      if (rules.init) rules.init(s);
      return s;
    }
    const inLane = (b) => b.x > lane.x0 && b.y > lane.top + 20;
    const restingBall = (s) => s.balls.find((b) => !b.inPlay && !b.auto && inLane(b) && b.y > lane.plungerY - R - 40);
    const resting = (s) => !!restingBall(s);

    // ------------------------------------------------------------------ X: what rules can do
    function makeX(s, ev) {
      const X = {
        rnd: () => rnd(s),
        score(n) { if (!s.tilted) { s.score += n * (s.L.scoreMult || 1); ev.push(['score', n * (s.L.scoreMult || 1), X.at]); } },
        bonus(n) { if (!s.tilted) s.bonus += n; },
        say(msg, sec = 2) { s.msg = msg; s.msgT = sec; ev.push(['say', msg]); },
        multUp() { if (s.mult < 6) s.mult++; ev.push(['mult', s.mult]); },
        extraBall() { s.extra++; X.say('EXTRA BALL!', 2.5); ev.push(['extra']); },
        multiball(n) { s.queue += n; if (!s.mb) s.mb = 1; s.saveT = Math.max(s.saveT, 10); ev.push(['multiball', n]); },
        lightKick(i) { if (!s.kick[i]) { s.kick[i] = 1; ev.push(['kicklit', i]); } },
        resetDrops(group) { drops.forEach((d, i) => { if (!group || d.group === group) s.drops[i] = 1; }); },
        resetStandups(group) { standups.forEach((d, i) => { if (!group || d.group === group) s.stand[i] = 0; }); },
        show(name) { ev.push(['show', name]); },
        shake(a) { ev.push(['quake', a]); },
        ballsInPlay: () => s.balls.filter((b) => b.inPlay).length + s.queue,
        at: null,
      };
      return X;
    }
    const fire = (s, X, name, idx, ball) => { X.at = ball ? [ball.x, ball.y] : null; if (rules.event && !s.tilted) rules.event(s, X, name, idx, ball); };

    // ------------------------------------------------------------------ collisions
    function resolve(b, qx, qy, rr, e, svx, svy, fx, fy) {
      let dx = b.x - qx, dy = b.y - qy;
      let d = Math.hypot(dx, dy);
      const min = R + rr;
      if (d >= min) return 0;
      let nx, ny;
      if (d < 1e-6) { nx = fx; ny = fy; } else { nx = dx / d; ny = dy / d; }
      b.x = qx + nx * min; b.y = qy + ny * min;
      const rvx = b.vx - svx, rvy = b.vy - svy, vn = rvx * nx + rvy * ny;
      if (vn >= 0) return 1e-3;
      const tx = rvx - vn * nx, ty = rvy - vn * ny;
      b.vx = svx + tx * 0.985 - e * vn * nx;
      b.vy = svy + ty * 0.985 - e * vn * ny;
      return -vn;
    }
    function hitStatic(s, b, c, ev, X) {
      let q;
      if (c.k === 'seg') q = closestSeg(b.x, b.y, c);
      else if (c.k === 'arc') q = closestArc(b.x, b.y, c);
      else q = [c.x, c.y];
      const rr = c.r;
      if (Math.abs(b.x - q[0]) > R + rr || Math.abs(b.y - q[1]) > R + rr) return;
      let fx = 0, fy = -1;
      if (c.k === 'seg') { const ex = c.bx - c.ax, ey = c.by - c.ay, l = Math.hypot(ex, ey) || 1; fx = ey / l; fy = -ex / l; if (fy > 0) { fx = -fx; fy = -fy; } }
      const imp = resolve(b, q[0], q[1], rr, c.e, 0, 0, fx, fy);
      if (!imp) return;
      if (c.kick && imp > 40 && !s.tilted) {
        let nx = b.x - q[0], ny = b.y - q[1]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < c.kick) { b.vx += (c.kick - vn) * nx; b.vy += (c.kick - vn) * ny; }
        s.flash[c.fl] = 0.14;
        X.at = [b.x, b.y];
        if (c.tag === 'bumper') { X.score(points.bumper); s.bonus += 100; ev.push(['bumper', c.id, q[0], q[1]]); fire(s, X, 'bumper', c.id, b); }
        else { X.score(points.sling); ev.push(['sling', c.id, q[0], q[1]]); fire(s, X, 'sling', c.id, b); }
      } else if (c.tag === 'standup' && imp > 60 && !s.tilted) {
        s.flash[c.fl] = 0.2; X.at = [b.x, b.y]; X.score(points.standup); s.bonus += 300;
        const was = s.stand[c.id]; s.stand[c.id] = 1;
        ev.push(['standup', c.id, b.x, b.y]); fire(s, X, 'standup', c.id, b);
        if (!was && standups.every((t, i) => t.group !== c.group || s.stand[i])) fire(s, X, 'standups:' + c.group, 0, b);
      } else if (imp > 160) ev.push(['wall', imp]);
    }
    function hitDrop(s, b, d, ev, X) {
      const q = closestSeg(b.x, b.y, d);
      if (Math.abs(b.x - q[0]) > R + 4 || Math.abs(b.y - q[1]) > R + 4) return;
      const ex = d.bx - d.ax, ey = d.by - d.ay, l = Math.hypot(ex, ey) || 1;
      const imp = resolve(b, q[0], q[1], 4, 0.35, 0, 0, ey / l, -ex / l);
      if (imp > 60 && !s.tilted) {
        s.drops[d.id] = 0; s.flash[d.fl] = 0.25; X.at = [b.x, b.y]; X.score(points.drop); s.bonus += 500;
        ev.push(['drop', d.id, q[0], q[1]]); fire(s, X, 'drop', d.id, b);
        if (drops.every((t, i) => t.group !== d.group || !s.drops[i])) {
          s.dropT[d.group] = 1.2; ev.push(['bank', d.group]); fire(s, X, 'bank:' + d.group, 0, b);
        }
      }
    }
    function flipperPose(i, a) {
      const f = flippers[i];
      return { px: f.x, py: f.y, tx: f.x + f.len * Math.cos(a), ty: f.y + f.len * Math.sin(a) };
    }
    function hitFlipper(s, b, i, ev) {
      const F = flippers[i], f = s.fl[i], p = flipperPose(i, f.a);
      const ex = p.tx - p.px, ey = p.ty - p.py, l2 = ex * ex + ey * ey;
      let t = ((b.x - p.px) * ex + (b.y - p.py) * ey) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = p.px + ex * t, qy = p.py + ey * t, rr = F.r0 + (F.r1 - F.r0) * t;
      if (Math.abs(b.x - qx) > R + rr || Math.abs(b.y - qy) > R + rr) return;
      const dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy) || 1;
      const cx = qx + (dx / d) * rr, cy = qy + (dy / d) * rr;
      const svx = -f.w * (cy - p.py), svy = f.w * (cx - p.px);
      const imp = resolve(b, qx, qy, rr, 0.32, svx, svy, 0, -1);
      if (imp > 250) ev.push(['flipper', i, imp]);
    }
    function hitBalls(s, ev) {
      const bs = s.balls;
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (a.hold > 0 || b.hold > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= 2 * R || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d, o = (2 * R - d) / 2;
        a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j2 = -0.9 * vn;
          a.vx -= nx * j2; a.vy -= ny * j2; b.vx += nx * j2; b.vy += ny * j2;
          if (-vn > 150) ev.push(['clack', -vn]);
        }
      }
    }

    // ------------------------------------------------------------------ step
    // inp: { L, R, plunger, nudge } (booleans). Returns a list of events for sound, haptics and effects.
    function step(s, inp) {
      const ev = [];
      if (s.over) return ev;
      const X = makeX(s, ev);
      s.t += DT;
      if (s.msgT > 0) s.msgT -= DT;
      for (let i = 0; i < s.flash.length; i++) if (s.flash[i] > 0) s.flash[i] -= DT;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - 0.6 * DT);
      if (s.saveT > 0) s.saveT -= DT;
      for (const g in s.dropT) if ((s.dropT[g] -= DT) <= 0) { delete s.dropT[g]; X.resetDrops(g); ev.push(['reset', g]); }
      for (let i = 0; i < s.spin.length; i++) {
        if (s.spin[i] > 0) {
          const before = Math.floor(s.spinA[i]);
          s.spinA[i] += s.spin[i] * DT; s.spin[i] = Math.max(0, s.spin[i] - (1.6 + s.spin[i] * 0.9) * DT);
          if (Math.floor(s.spinA[i]) !== before) { X.at = [spinners[i].x, spinners[i].y]; X.score(points.spin); ev.push(['spin', i]); fire(s, X, 'spin', i, null); }
        }
        if (s.spinA[i] > 1e6) s.spinA[i] %= 1;
      }
      if (rules.tick && !s.tilted) rules.tick(s, X, DT);

      // flippers: a short tap keeps a flipper up for a moment
      for (let i = 0; i < flippers.length; i++) {
        const f = s.fl[i], want = flippers[i].side === 'L' ? inp.L : inp.R;
        if (want && !s.tilted) {
          if (f.hold <= 0) {
            ev.push(['flip', i]);
            if (i < 2) rotateLanes(s, flippers[i].side);
          }
          f.hold = 0.05;
        } else if (f.hold > 0) f.hold -= DT;
      }

      // queued multiball balls: one per 0.6 s, auto-launched from the lane
      if (s.queue > 0 && !s.balls.some((b) => !b.inPlay && inLane(b) && b.y > lane.plungerY - 80)) {
        const nb = newBall(); nb.auto = 0.4; s.balls.push(nb); s.queue--;
      }
      // plunger (the right flipper button also pulls it)
      const pull = inp.plunger || inp.R;
      const rb = restingBall(s);
      if (rb) {
        if (pull) s.charge = Math.min(1, s.charge + DT / 0.9);
        else if (s.charge > 0) { rb.vy = -(700 + 1750 * s.charge); rb.vx = 0; ev.push(['launch', s.charge]); s.charge = 0; }
      } else if (!pull) s.charge = 0;
      for (const b of s.balls) if (b.auto > 0 && (b.auto -= DT) <= 0) { b.auto = 0; b.vy = -2300 - rnd(s) * 150; ev.push(['launch', 1]); }

      // nudge
      if (inp.nudge && s.balls.some((b) => b.inPlay) && !s.tilted) {
        for (const b of s.balls) if (b.inPlay && b.hold <= 0) { b.vx += (rnd(s) - 0.5) * 160; b.vy -= 140; }
        s.shake += 1; ev.push(['nudge']);
        if (s.shake > 3.2) { s.tilted = true; s.msg = 'TILT'; s.msgT = 99; ev.push(['tilt']); }
        else if (s.shake > 2.2) X.say('Careful…', 1.2);
      }

      // saucers: held balls wait, then get kicked out
      for (const b of s.balls) if (b.hold > 0) {
        const sc = saucers[b.sc];
        b.x = sc.x; b.y = sc.y; b.vx = 0; b.vy = 0;
        if ((b.hold -= DT) <= 0) { b.hold = 0; b.vx = sc.ex + (rnd(s) - 0.5) * 60; b.vy = sc.ey; b.y += Math.sign(sc.ey) * 2; b.sc = -2 - sc.id; ev.push(['eject', sc.id]); }
      }

      // substeps
      let moving = false;
      for (let i = 0; i < flippers.length; i++) {
        const up = s.fl[i].hold > 0 && !s.tilted, F = flippers[i];
        if (Math.abs(s.fl[i].a - (up ? F.up : F.down)) > 1e-9) moving = true;
      }
      let sp = 0;
      for (const b of s.balls) sp = Math.max(sp, Math.hypot(b.vx, b.vy));
      sp += moving ? W_UP * 74 : 0;
      const n = Math.min(24, Math.max(1, Math.ceil((sp * DT) / (R * 0.35))));
      const h = DT / n;
      const plungerY = lane.plungerY + s.charge * lane.pull;
      for (let k = 0; k < n; k++) {
        for (const b of s.balls) if (b.hold <= 0) { b.vy += G * h; b.x += b.vx * h; b.y += b.vy * h; }
        for (let i = 0; i < flippers.length; i++) {
          const f = s.fl[i], F = flippers[i], dir = Math.sign(F.up - F.down);
          const up = f.hold > 0 && !s.tilted, target = up ? F.up : F.down;
          const diff = (target - f.a) * dir;
          if (Math.abs(diff) < 1e-9) { f.w = 0; continue; }
          const w = diff > 0 ? W_UP * dir : -W_DOWN * dir;
          let na = f.a + w * h;
          if ((target - na) * Math.sign(w) <= 0) na = target;
          f.w = (na - f.a) / h; f.a = na;
        }
        for (let pass = 0; pass < 2; pass++) {
          for (const b of s.balls) {
            if (b.hold > 0) continue;
            for (const c of walls) hitStatic(s, b, c, ev, X);
            if (b.inPlay) for (const c of gates) hitStatic(s, b, c, ev, X);
            for (const d of drops) if (s.drops[d.id]) hitDrop(s, b, d, ev, X);
            for (let i = 0; i < flippers.length; i++) hitFlipper(s, b, i, ev);
            if (inLane(b) && b.y + R > plungerY) { b.y = plungerY - R; if (b.vy > 0) b.vy = 0; }
          }
          if (s.balls.length > 1) hitBalls(s, ev);
        }
        for (const b of s.balls) {
          const v = Math.hypot(b.vx, b.vy);
          if (v > VMAX) { b.vx *= VMAX / v; b.vy *= VMAX / v; }
        }
      }

      for (let i = s.balls.length - 1; i >= 0; i--) {
        const b = s.balls[i];
        if (!b.inPlay && b.x < lane.x0 - 6) {
          b.inPlay = true;
          if (s.saveReady) { s.saveT = Math.max(s.saveT, BALL_SAVE); s.saveReady = 0; }
        }
        triggers(s, b, ev, X);
        stuckCheck(s, b, inp, ev);
        if (!(b.x > 0 && b.x < W && b.y > -20 && Number.isFinite(b.vx + b.vy))) { ev.push(['escape']); Object.assign(b, newBall()); }
        else if (b.y > H) drain(s, i, ev, X);
        if (s.over) break;
      }
      return ev;
    }

    function rotateLanes(s, side) {
      if (!s.balls.some((b) => b.inPlay)) return;
      const groups = {};
      rollovers.forEach((r, i) => { if (r.group === spec.laneChange) (groups[r.group] = groups[r.group] || []).push(i); });
      for (const g in groups) {
        const ix = groups[g], v = ix.map((i) => s.roll[i]);
        const nv = side === 'R' ? [v[v.length - 1], ...v.slice(0, -1)] : [...v.slice(1), v[0]];
        ix.forEach((i, k) => { s.roll[i] = nv[k]; });
      }
    }

    function triggers(s, b, ev, X) {
      // rollovers, sensors, spinners, kickbacks: edge-triggered on entry (bit flags per ball)
      let now = 0, bit = 0;
      const list = [];
      for (const r of rollovers) { if (inRect(b, r.rect)) now |= 1 << bit; list.push(['roll', r]); bit++; }
      for (const sn of sensors) { if (inRect(b, sn.rect)) now |= 1 << bit; list.push(['sens', sn]); bit++; }
      for (const sp of spinners) { if (inRect(b, sp.rect)) now |= 1 << bit; list.push(['spin', sp]); bit++; }
      for (const kb of kickbacks) { if (inRect(b, kb.rect)) now |= 1 << bit; list.push(['kick', kb]); bit++; }
      const entered = now & ~b.sens;
      b.sens = now;
      if (entered && !s.tilted) list.forEach(([kind, o], i) => {
        if (!(entered & (1 << i))) return;
        X.at = [b.x, b.y];
        if (kind === 'roll') {
          X.score(points.rollover); s.bonus += 200;
          const was = s.roll[o.id]; s.roll[o.id] = 1; ev.push(['roll', o.id]);
          fire(s, X, 'roll', o.id, b);
          if (!was && rollovers.every((r, j) => r.group !== o.group || s.roll[j])) {
            rollovers.forEach((r, j) => { if (r.group === o.group) s.roll[j] = 0; });
            fire(s, X, 'rollovers:' + o.group, 0, b);
          }
        } else if (kind === 'sens') {
          const d = o.dir;
          if ((d === 'up' && b.vy >= 0) || (d === 'down' && b.vy <= 0) || (d === 'left' && b.vx >= 0) || (d === 'right' && b.vx <= 0)) return;
          if (o.name === 'inlane') { X.score(points.inlane); s.bonus += 200; }
          if (o.name === 'outlane') X.score(points.outlane);
          ev.push(['sensor', o.name, o.idx]); fire(s, X, o.name, o.idx, b);
        } else if (kind === 'spin') {
          const v = o.vertical ? Math.abs(b.vx) : Math.abs(b.vy);
          s.spin[o.id] = Math.min(14, s.spin[o.id] + v / 120);
          ev.push(['spinhit', o.id]);
        } else if (kind === 'kick' && s.kick[o.id] && b.vy > 0) {
          s.kick[o.id] = 0; b.vy = -o.power; b.vx = (rnd(s) - 0.5) * 40;
          X.score(points.kickback); ev.push(['kickback', o.id, b.x, b.y]); fire(s, X, 'kickback', o.id, b);
        }
      });
      // saucers: a slow enough ball nearby is caught (sc < -1 after an eject: wait until it has left)
      for (const sc of saucers) {
        const d = Math.hypot(b.x - sc.x, b.y - sc.y);
        if (b.sc === -2 - sc.id) { if (d > 26) b.sc = -1; continue; }
        if (b.hold <= 0 && b.sc === -1 && d < 11 && Math.hypot(b.vx, b.vy) < 1100) {
          b.sc = sc.id; b.hold = sc.hold; b.x = sc.x; b.y = sc.y; b.vx = 0; b.vy = 0;
          s.flash[sc.fl] = sc.hold; X.at = [sc.x, sc.y];
          if (!s.tilted) { X.score(points.saucer); s.bonus += 1000; }
          ev.push(['saucer', sc.id, sc.x, sc.y]); fire(s, X, sc.name, sc.id, b);
        }
      }
    }

    function stuckCheck(s, b, inp, ev) {
      const st = b.st;
      if (!b.inPlay || b.hold > 0 || (inLane(b) && b.y > 600)) { st.t = 0; st.x = b.x; st.y = b.y; return; }
      if (Math.hypot(b.x - st.x, b.y - st.y) > 8) { st.x = b.x; st.y = b.y; st.t = 0; return; }
      st.t += DT;
      const cradled = inp.L || inp.R;
      if (st.t > (cradled ? 12 : 2.5)) {
        b.vx = (rnd(s) - 0.5) * 500; b.vy = -500 - rnd(s) * 300; b.y -= 2;
        st.t = 0; s.unstuck++; ev.push(['unstick']);
      }
    }

    function drain(s, i, ev, X) {
      const b = s.balls[i];
      if (s.saveT > 0 && !s.tilted) {
        Object.assign(b, newBall()); b.auto = 0.5; ev.push(['saved']); X.say('Ball saved', 1.6);
        return;
      }
      s.balls.splice(i, 1);
      const left = s.balls.length + s.queue;
      if (left > 0) {
        ev.push(['lost']);
        if (left === 1 && s.mb) { s.mb = 0; ev.push(['mbend']); fire(s, X, 'mbend', 0, null); }
        return;
      }
      const bonus = s.tilted ? 0 : s.bonus * s.mult;
      s.score += bonus;
      ev.push(['drain', bonus]);
      fire(s, X, 'drain', 0, null);
      s.bonus = 0; s.mult = 1; s.saveReady = 1; s.tilted = false; s.shake = 0; s.mb = 0;
      s.roll = s.roll.map(() => 0);
      s.balls = [newBall()]; s.charge = 0;
      if (s.extra > 0) { s.extra--; X.say('Shoot again', 2.5); return; }
      s.ballNum++;
      if (s.ballNum > BALLS) { s.ballNum = BALLS; s.over = true; s.msg = 'Game over'; s.msgT = 99; ev.push(['over']); return; }
      X.say(bonus ? 'Bonus ' + bonus.toLocaleString('en-US') : 'Ball ' + s.ballNum, 2);
    }

    // Where a ball centre must never be (used by the tests): inside a solid, too deep in a wall, off the table.
    function illegal(s, b) {
      const x = b.x, y = b.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return 'nan';
      if (y > H + 40) return null;
      if (spec.inside && !spec.inside(x, y)) return 'outside the table';
      for (const so of solids) if (inPoly(x, y, so.pts)) return 'inside ' + so.tag;
      for (const c of walls) {
        let q;
        if (c.k === 'seg') q = closestSeg(x, y, c); else if (c.k === 'arc') q = closestArc(x, y, c); else q = [c.x, c.y];
        if (Math.hypot(x - q[0], y - q[1]) < R + c.r - 2.5) return 'inside ' + c.tag + (c.k === 'circ' ? '' : ' ' + c.k) + ' @' + (c.ax ?? c.x) + ',' + (c.ay ?? c.y);
      }
      return null;
    }

    const T = {
      id: spec.id, name: spec.name, blurb: spec.blurb, spec, W, H, R, DT, HZ, BALLS, MID, lane, G,
      walls, bumpers, slings, drops, standups, rollovers, sensors, spinners, saucers, kickbacks, flippers, solids, gates,
      inserts: B.insert || [], theme: spec.theme || {}, newGame, step, flipperPose, inLane, resting, restingBall, illegal, points,
    };
    TABLES[spec.id] = T;
    return T;
  }

  const api = { define, TABLES, R, DT, HZ, VMAX };
  root.PinballEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
