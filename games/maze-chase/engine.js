// Maze Chase engine. Pure, no DOM; works in the browser and in Node (tools/test-maze-chase.js).
// Coordinates are in tiles: an entity at (x, y) with integer x/y sits on that tile's centre.
// Everything that matters lives in one plain JSON object (state), so save/restore is JSON.stringify/parse.
(function (root) {
  'use strict';
  const COLS = 19, ROWS = 33, STEP = 1 / 60;
  const DIRS = ['up', 'left', 'down', 'right']; // tie-break order for chasers
  const DX = { up: 0, down: 0, left: -1, right: 1 }, DY = { up: -1, down: 1, left: 0, right: 0 };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const TOL = 0.42; // corner tolerance: how far from a tile centre the hero may still turn

  // Mazes: the left half (10 columns) of each row; column 9 is the centre and the rest is mirrored.
  // '#' wall  '.' seed  'o' power star  ' ' path without seed  '-' door  'H' den  'P' hero start
  // A path at the left/right edge is a tunnel to the other side.
  const BAND = ['#    ', '# ##-', '  #HH', '# #HH', '# ###', '#    ', '# ###']; // den area, rows 8–14, cols 5–9
  const band = (rows) => rows.map((r, i) => (i >= 8 && i <= 14 ? r + BAND[i - 8] : r));
  const MAZE_SRC = [
    { name: 'Garden', rows: band([
      '##########', '#........#', '#.##.###.#', '#o##.###.#', '#.........', '#.##.#.###', '#....#...#', '####.###.#',
      '####.', '####.', '    .', '####.', '####.', '####.', '####.',
      '#........#', '#.##.###.#', '#..#.....P', '##.#.#.###', '#....#...#', '#.######.#', '#.........',
      '#.##.#.###', '#o.#.#...#', '##.#.#.#.#', '#....#...#', '#.######.#', '#.........', '##########',
    ]) },
    { name: 'Pipes', rows: band([
      '##########', '#...#.....', '#o#.#.###.', '#.#...#...', '#.###.#.##', '#.....#...', '###.####.#', '    ...#.#',
      '####.', '####.', '####.', '####.', '####.', '####.', '####.',
      '#.........', '#.##.###.#', '#o.#...#.#', '##.#.#.#.P', '#....#.###', '#.##.#.###', '   .......',
      '#.##.###.#', '#..#.....#', '##.#.##.##', '#..#.##...', '#.##.##.##', '#.........', '##########',
    ]) },
    { name: 'Hive', rows: band([
      '##########', '#....#...#', '#.##.#.#.#', '#o##...#..', '#.##.#.###', '#....#...#', '#.##.#.#.#', '#.##...#.#',
      '#.##.', '#.##.', '#....', '#.##.', '#.##.', ' .##.', '#.##.',
      '#........#', '#.##.#.#.#', '#o.....#.P', '##.#.#.#.#', '#..#...#.#', '#.##.#.#.#', '#.........',
      '###.#.##.#', '#o..#.....', '#.#.##.#.#', '#.#....#.#', '#.####.#.#', '#.........', '##########',
    ]) },
  ];
  // 0 path, 1 wall, 2 door, 3 den
  function parse(src) {
    let rows = src.rows.map((r) => r + r.slice(0, 9).split('').reverse().join(''));
    // stretch to a tall phone: repeat rows that only hold vertical corridors (no two side-by-side paths)
    const plain = (r) => !/[^#][^#]/.test(r);
    const above = [], below = [];
    rows.forEach((r, y) => { if (y > 0 && y < 8 && plain(r)) above.push(y); if (y > 14 && y < rows.length - 1 && plain(r)) below.push(y); });
    const dup = new Set([...above.slice(0, 2), ...below.slice(-2)]);
    rows = rows.flatMap((r, y) => (dup.has(y) ? [r, r.replace(/[oP]/g, '.')] : [r]));
    const tiles = [], dots = [];
    let start = null, door = null;
    rows.forEach((r, y) => {
      if (r.length !== COLS) throw new Error(src.name + ': row ' + y + ' has ' + r.length + ' columns');
      for (let x = 0; x < COLS; x++) {
        const ch = r[x];
        tiles.push(ch === '#' ? 1 : ch === '-' ? 2 : ch === 'H' ? 3 : 0);
        dots.push(ch === '.' ? '1' : ch === 'o' ? '2' : '0');
        if (ch === 'P') start = { x, y };
        if (ch === '-') door = { x, y: y - 1 };
      }
    });
    if (rows.length !== ROWS) throw new Error(src.name + ': ' + rows.length + ' rows');
    return { name: src.name, tiles, dots: dots.join(''), start, rows, door, denY: door.y + 2.5 };
  }
  const MAZES = MAZE_SRC.map(parse);
  const CORNERS = [{ x: COLS - 2, y: -2 }, { x: 1, y: -2 }, { x: COLS - 1, y: ROWS + 1 }, { x: 0, y: ROWS + 1 }];
  const NAMES = ['Dart', 'Snare', 'Pincer', 'Drift']; // direct chase, ambush ahead, flank, shy/random
  const BONUS = [
    { k: 'berry', pts: 100 }, { k: 'pear', pts: 300 }, { k: 'acorn', pts: 500 }, { k: 'gem', pts: 700 },
    { k: 'bell', pts: 1000 }, { k: 'key', pts: 2000 }, { k: 'crown', pts: 3000 }, { k: 'comet', pts: 5000 },
  ];

  const mod = (a, n) => ((a % n) + n) % n;
  const tileAt = (m, x, y) => (y < 0 || y >= ROWS ? 1 : m.tiles[y * COLS + mod(x, COLS)]);
  const open = (m, x, y) => tileAt(m, x, y) === 0;
  const isTunnel = (x, y, m) => (x < 3 || x > COLS - 4) && open(m, 0, y);

  // ---------------------------------------------------------------- rng (mulberry32, state is one int)
  function rand(st) {
    let t = (st.seed = (st.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- setup
  function newGame(seed) {
    const st = { v: 1, seed: seed | 0, level: 1, score: 0, lives: 3, extra: false, maze: 0, dots: '', left: 0, eaten: 0, t: 0 };
    startLevel(st);
    return st;
  }
  const mazeOf = (st) => MAZES[st.maze];
  function startLevel(st) {
    st.maze = (st.level - 1) % MAZES.length;
    const m = mazeOf(st);
    st.dots = m.dots;
    st.left = (m.dots.match(/[12]/g) || []).length;
    st.eaten = 0;
    st.bonus = null;
    resetActors(st);
  }
  function resetActors(st) {
    const m = mazeOf(st), lv = st.level, DOOR = m.door, DEN_Y = m.denY;
    st.hero = { x: m.start.x, y: m.start.y, dir: 'left', moving: false, anim: 0 };
    const rel = lv === 1 ? [0, 1.5, 5, 9] : lv < 4 ? [0, 1, 3.5, 6] : [0, 0.5, 2, 4];
    st.chasers = [0, 1, 2, 3].map((i) => ({
      x: i === 0 ? DOOR.x : 8 + (i === 1 ? 1 : i === 2 ? 0 : 2), y: i === 0 ? DOOR.y : DEN_Y,
      dir: i === 0 ? 'left' : i === 2 ? 'down' : 'up', mode: i === 0 ? 'out' : 'den', fr: false, rel: rel[i],
    }));
    st.phase = 0; st.phaseT = 0; st.frT = 0; st.combo = 0; st.freeze = 0; st.pop = null;
    st.mode = 'ready'; st.modeT = st.t === 0 && lv === 1 ? 2 : 1.4; st.lt = 0; st.ev = [];
  }

  // ---------------------------------------------------------------- tuning per level
  const lvf = (st) => Math.min(1 + 0.055 * (st.level - 1), 1.33);
  const heroSpeed = (st) => (st.frT > 0 ? 7.6 : 7.1) * lvf(st);
  const frightTime = (st) => Math.max(1.5, 7 - 0.65 * (st.level - 1));
  const phases = (st) => (st.level === 1 ? [7, 20, 7, 20, 5, 20, 5] : st.level < 5 ? [6, 20, 6, 20, 4, 25, 2] : [5, 20, 5, 22, 3, 30, 1]);
  const scatter = (st) => st.phase % 2 === 0 && st.phase < 7;
  function chaserSpeed(st, g, i) {
    if (g.mode === 'eaten') return 14;
    if (g.mode === 'den' || g.mode === 'leave' || g.mode === 'enter') return g.mode === 'enter' ? 10 : 3.5;
    const f = lvf(st);
    if (isTunnel(Math.round(g.x), Math.round(g.y), mazeOf(st))) return 3.4 * f;
    if (g.fr) return 4.2 * f;
    let v = 6.7 * f;
    if (i === 0 && st.left <= 20 + st.level * 2) v *= 1.07; // Dart hurries when few seeds are left
    return v;
  }

  // ---------------------------------------------------------------- targeting
  function heroTile(st) { return { x: mod(Math.round(st.hero.x), COLS), y: Math.round(st.hero.y) }; }
  function target(st, i) {
    const DOOR = mazeOf(st).door, g = st.chasers[i], h = heroTile(st), d = st.hero.dir || 'left';
    if (g.mode === 'eaten') return DOOR;
    if (scatter(st)) return CORNERS[i];
    if (i === 0) return h;
    if (i === 1) return { x: h.x + DX[d] * 4, y: h.y + DY[d] * 4 };
    if (i === 2) {
      const p = { x: h.x + DX[d] * 2, y: h.y + DY[d] * 2 }, a = st.chasers[0];
      return { x: 2 * p.x - Math.round(a.x), y: 2 * p.y - Math.round(a.y) };
    }
    const dist2 = (g.x - h.x) ** 2 + (g.y - h.y) ** 2;
    return dist2 > 64 ? h : null; // Drift: hunts from afar, wanders randomly up close
  }
  function choose(st, g, i) {
    const m = mazeOf(st), x = Math.round(g.x), y = Math.round(g.y);
    const opts = DIRS.filter((d) => d !== OPP[g.dir] && open(m, x + DX[d], y + DY[d]));
    if (!opts.length) return OPP[g.dir];
    const t = g.fr ? null : target(st, i);
    if (!t) return opts[Math.floor(rand(st) * opts.length)];
    let best = opts[0], bd = Infinity;
    for (const d of opts) {
      const dd = (x + DX[d] - t.x) ** 2 + (y + DY[d] - t.y) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // ---------------------------------------------------------------- movement
  const approach = (v, to, s) => (v < to ? Math.min(to, v + s) : Math.max(to, v - s));
  function wrapX(e) { if (e.x < -0.5) e.x += COLS; else if (e.x >= COLS - 0.5) e.x -= COLS; }

  // Hero: free movement along corridors. `want` is the buffered direction (applied as soon as it is possible).
  function moveHero(st, want, s) {
    const h = st.hero, m = mazeOf(st);
    const cx = Math.round(h.x), cy = Math.round(h.y);
    if (want && want !== h.dir) {
      if (h.dir && want === OPP[h.dir]) h.dir = want;
      else {
        const off = DX[h.dir] ? Math.abs(h.x - cx) : Math.abs(h.y - cy);
        if (off <= TOL && open(m, cx + DX[want], cy + DY[want])) h.dir = want;
      }
    }
    const dx = DX[h.dir], dy = DY[h.dir];
    // the cross axis slides back onto the corridor centre line (this is what makes early/late turns smooth)
    if (dx) h.y = approach(h.y, cy, s); else h.x = approach(h.x, cx, s);
    const p = dx ? h.x : h.y, sg = dx || dy, c = Math.round(p);
    const ahead = (c - p) * sg;
    const nx = dx ? c + dx : cx, ny = dy ? c + dy : cy;
    let go = s;
    if (!open(m, nx, ny)) go = Math.max(0, Math.min(s, ahead));
    if (dx) h.x += go * dx; else h.y += go * dy;
    h.moving = go > 1e-6;
    if (h.moving) h.anim = (h.anim + go) % 1;
    wrapX(h);
  }

  // Chasers: tile to tile, choosing a direction at every tile centre.
  function moveChaser(st, g, i, s) {
    const m = mazeOf(st), DOOR = m.door, DEN_Y = m.denY;
    if (g.mode === 'den') {
      const top = DEN_Y - 0.35, bot = DEN_Y + 0.35;
      g.y += (g.dir === 'up' ? -s : s);
      if (g.y <= top) { g.y = top; g.dir = 'down'; } else if (g.y >= bot) { g.y = bot; g.dir = 'up'; }
      if (st.lt >= g.rel) g.mode = 'leave';
      return;
    }
    if (g.mode === 'leave') {
      if (Math.abs(g.x - DOOR.x) > 1e-6) { g.x = approach(g.x, DOOR.x, s); g.y = approach(g.y, DEN_Y, s); g.dir = g.x < DOOR.x ? 'right' : 'left'; return; }
      g.y = approach(g.y, DOOR.y, s); g.dir = 'up';
      if (g.y === DOOR.y) { g.mode = 'out'; g.dir = rand(st) < 0.5 ? 'left' : 'right'; }
      return;
    }
    if (g.mode === 'enter') {
      g.x = DOOR.x; g.y = approach(g.y, DEN_Y, s); g.dir = 'down';
      if (g.y === DEN_Y) { g.mode = 'leave'; g.fr = false; }
      return;
    }
    let rem = s, guard = 4;
    while (rem > 1e-9 && guard--) {
      const dx = DX[g.dir], dy = DY[g.dir], sg = dx || dy;
      const p = dx ? g.x : g.y;
      if (Math.abs(p - Math.round(p)) < 1e-7 && !open(m, Math.round(g.x) + dx, Math.round(g.y) + dy)) {
        // reversed while standing on a centre (phase change / scare): pick a real exit instead of the wall
        g.dir = choose(st, g, i);
        continue;
      }
      const c =sg > 0 ? Math.floor(p + 1e-7) + 1 : Math.ceil(p - 1e-7) - 1; // next tile centre ahead
      const dist = (c - p) * sg;
      if (rem < dist) { if (dx) g.x += rem * dx; else g.y += rem * dy; break; }
      if (dx) g.x = c; else g.y = c;
      rem -= dist;
      wrapX(g);
      if (g.mode === 'eaten' && Math.round(g.x) === DOOR.x && Math.round(g.y) === DOOR.y) { g.x = DOOR.x; g.y = DOOR.y; g.mode = 'enter'; return; }
      g.dir = choose(st, g, i);
      if (!open(m, Math.round(g.x) + DX[g.dir], Math.round(g.y) + DY[g.dir])) break; // boxed in (should not happen)
    }
  }

  // ---------------------------------------------------------------- the step
  const near = (a, b, r) => { let dx = Math.abs(a.x - b.x); dx = Math.min(dx, COLS - dx); return dx * dx + (a.y - b.y) ** 2 < r * r; };
  function addScore(st, n) {
    st.score += n;
    if (!st.extra && st.score >= 10000) { st.extra = true; st.lives++; st.ev.push('life'); }
  }

  /** Advances one fixed step (1/60 s). want = buffered direction or null. Returns st.ev (events for sound/UI). */
  function step(st, want) {
    st.ev = [];
    st.t += STEP;
    if (st.pop) { st.pop.t -= STEP; if (st.pop.t <= 0) st.pop = null; }
    if (st.mode === 'over') return st.ev;
    if (st.mode === 'ready') { st.modeT -= STEP; if (st.modeT <= 0) { st.mode = 'play'; st.ev.push('go'); } return st.ev; }
    if (st.mode === 'dying') {
      st.modeT -= STEP;
      if (st.modeT <= 0) {
        st.lives--;
        if (st.lives <= 0) { st.lives = 0; st.mode = 'over'; st.ev.push('over'); } else resetActors(st);
      }
      return st.ev;
    }
    if (st.mode === 'clear') {
      st.modeT -= STEP;
      if (st.modeT <= 0) { st.level++; startLevel(st); st.ev.push('level'); }
      return st.ev;
    }
    if (st.freeze > 0) { st.freeze -= STEP; return st.ev; }

    // timers
    st.lt += STEP;
    if (st.frT > 0) {
      st.frT -= STEP;
      if (st.frT <= 0) { st.frT = 0; for (const g of st.chasers) g.fr = false; }
    } else if (st.phase < 7) {
      st.phaseT += STEP;
      if (st.phaseT >= phases(st)[st.phase]) {
        st.phase++; st.phaseT = 0;
        for (const g of st.chasers) if (g.mode === 'out') g.dir = OPP[g.dir];
      }
    }
    if (st.bonus) { st.bonus.t -= STEP; if (st.bonus.t <= 0) st.bonus = null; }

    // hero
    moveHero(st, want, heroSpeed(st) * STEP);
    const m = mazeOf(st), hx = mod(Math.round(st.hero.x), COLS), hy = Math.round(st.hero.y);
    const di = hy * COLS + hx, d = st.dots[di];
    if (d === '1' || d === '2') {
      st.dots = st.dots.slice(0, di) + '0' + st.dots.slice(di + 1);
      st.left--; st.eaten++;
      if (d === '1') { addScore(st, 10); st.ev.push('dot'); } else {
        addScore(st, 50); st.ev.push('power');
        st.frT = frightTime(st); st.combo = 0;
        for (const g of st.chasers) if (g.mode !== 'eaten' && g.mode !== 'enter') { if (g.mode === 'out' && !g.fr) g.dir = OPP[g.dir]; g.fr = true; }
      }
      if (st.eaten === 70 || st.eaten === 170) {
        st.bonus = { t: 9 + rand(st) * 1.5, ...BONUS[Math.min(st.level - 1, BONUS.length - 1)], x: m.start.x, y: m.start.y };
      }
      if (st.left === 0) { st.mode = 'clear'; st.modeT = 2.2; st.bonus = null; st.ev.push('clear'); return st.ev; }
    }
    if (st.bonus && near(st.hero, st.bonus, 0.7)) {
      addScore(st, st.bonus.pts); st.pop = { x: st.bonus.x, y: st.bonus.y, text: String(st.bonus.pts), t: 1.4 };
      st.bonus = null; st.ev.push('bonus');
    }

    // chasers
    for (let i = 0; i < 4; i++) {
      const g = st.chasers[i];
      moveChaser(st, g, i, chaserSpeed(st, g, i) * STEP);
    }
    collide(st);
    return st.ev;
  }

  function collide(st) {
    for (const g of st.chasers) {
      if (g.mode !== 'out' || !near(st.hero, g, 0.62)) continue;
      if (g.fr) {
        const pts = 200 * 2 ** Math.min(st.combo, 3);
        st.combo++; addScore(st, pts);
        g.fr = false; g.mode = 'eaten';
        st.pop = { x: g.x, y: g.y, text: String(pts), t: 0.9 };
        st.freeze = 0.55; st.ev.push('eat');
      } else {
        st.mode = 'dying'; st.modeT = 1.7; st.bonus = null; st.ev.push('die');
        return;
      }
    }
  }

  // ---------------------------------------------------------------- save / restore
  function save(st) { const s = { ...st }; delete s.ev; return JSON.parse(JSON.stringify(s)); }
  function restore(o) {
    if (!o || o.v !== 1 || !MAZES[o.maze] || typeof o.dots !== 'string' || o.dots.length !== COLS * ROWS || !o.hero || !Array.isArray(o.chasers) || o.chasers.length !== 4) return null;
    const st = JSON.parse(JSON.stringify(o));
    st.ev = [];
    return st;
  }

  // ---------------------------------------------------------------- maze checks (used by tests)
  function validate(m) {
    const errs = [], path = (x, y) => tileAt(m, x, y) === 0;
    if (!m.start || m.tiles[m.start.y * COLS + m.start.x] !== 0) errs.push('hero start not on a path');
    for (let y = 0; y < ROWS; y++) {
      if (path(0, y) !== path(COLS - 1, y)) errs.push('tunnel row ' + y + ' is open on one side only');
      if (path(0, y) && (y === 0 || y === ROWS - 1)) errs.push('tunnel on border row ' + y);
    }
    if (!m.door || tileAt(m, m.door.x, m.door.y + 1) !== 2 || !path(m.door.x, m.door.y)) errs.push('door misplaced');
    // reachability: every path tile from the start (tunnels wrap)
    const seen = new Set([m.start.y * COLS + m.start.x]), q = [m.start];
    while (q.length) {
      const { x, y } = q.pop();
      for (const d of DIRS) {
        const nx = mod(x + DX[d], COLS), ny = y + DY[d];
        if (path(nx, ny) && !seen.has(ny * COLS + nx)) { seen.add(ny * COLS + nx); q.push({ x: nx, y: ny }); }
      }
    }
    let dots = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      if (m.dots[i] !== '0') dots++;
      if (!path(x, y)) { if (m.dots[i] !== '0') errs.push('seed on a wall at ' + x + ',' + y); continue; }
      if (!seen.has(i)) errs.push('unreachable path at ' + x + ',' + y);
      const n = DIRS.filter((d) => path(x + DX[d], y + DY[d])).length;
      if (n < 2) errs.push('dead end at ' + x + ',' + y);
      if (path(x + 1, y) && path(x, y + 1) && path(x + 1, y + 1) && x < COLS - 1) errs.push('open 2x2 block at ' + x + ',' + y);
    }
    if (dots < 150) errs.push('only ' + dots + ' seeds');
    return errs;
  }

  const api = { COLS, ROWS, STEP, DX, DY, OPP, TOL, MAZES, NAMES, BONUS, CORNERS, newGame, startLevel, resetActors, step, target, moveHero, open, tileAt, save, restore, validate, rand, frightTime };
  root.MazeChase = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
