// Stackfall engine: pure falling-block rules, no DOM. Works as a browser script (self.BlocksEngine) and in Node (require).
// Board: W x H cells, row 0 at the top; the top HIDDEN rows are the spawn area and are not drawn.
// Time is counted in fixed steps of STEP_MS; the view calls step() once per simulation tick.
(function () {
  const W = 10, H = 22, HIDDEN = 2, STEP_MS = 1000 / 60;
  const LOCK_MS = 480, LOCK_RESETS = 15;
  const TYPES = 'IOTSZJL';
  // Spawn shapes (row strings, '#' = block) in their bounding box. Rotations are derived by turning the box.
  const SHAPES = {
    I: ['....', '####', '....', '....'],
    O: ['.##.', '.##.', '....'],
    T: ['.#.', '###', '...'],
    S: ['.##', '##.', '...'],
    Z: ['##.', '.##', '...'],
    J: ['#..', '###', '...'],
    L: ['..#', '###', '...'],
  };
  // CELLS[type][rot] = [[x, y], ...]
  const CELLS = {};
  for (const t of TYPES) {
    const rows = SHAPES[t], n = rows.length;
    let cells = [];
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') cells.push([x, y]); }));
    CELLS[t] = [];
    for (let r = 0; r < 4; r++) {
      CELLS[t].push(cells.map((c) => c.slice()));
      if (t !== 'O') cells = cells.map(([x, y]) => [n - 1 - y, x]); // clockwise in an n×n box (y down)
    }
  }
  // Wall kicks (standard rotation-system tables, written with y pointing up, converted below).
  const K = (s) => s.split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return [x, -y]; });
  const KICKS = {
    '01': K('0,0 -1,0 -1,1 0,-2 -1,-2'), '10': K('0,0 1,0 1,-1 0,2 1,2'),
    '12': K('0,0 1,0 1,-1 0,2 1,2'), '21': K('0,0 -1,0 -1,1 0,-2 -1,-2'),
    '23': K('0,0 1,0 1,1 0,-2 1,-2'), '32': K('0,0 -1,0 -1,-1 0,2 -1,2'),
    '30': K('0,0 -1,0 -1,-1 0,2 -1,2'), '03': K('0,0 1,0 1,1 0,-2 1,-2'),
  };
  const KICKS_I = {
    '01': K('0,0 -2,0 1,0 -2,-1 1,2'), '10': K('0,0 2,0 -1,0 2,1 -1,-2'),
    '12': K('0,0 -1,0 2,0 -1,2 2,-1'), '21': K('0,0 1,0 -2,0 1,-2 -2,1'),
    '23': K('0,0 2,0 -1,0 2,1 -1,-2'), '32': K('0,0 -2,0 1,0 -2,-1 1,2'),
    '30': K('0,0 1,0 -2,0 1,-2 -2,1'), '03': K('0,0 -1,0 2,0 -1,2 2,-1'),
  };
  const LINE_SCORE = [0, 100, 300, 500, 800];

  // mulberry32: whole state is one 32-bit integer, so saves are tiny and exact.
  function rand(s) {
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // Seconds per row by level (guideline curve), as ms.
  const gravityMs = (level) => Math.max(1000 * Math.pow(0.8 - (Math.min(level, 20) - 1) * 0.007, Math.min(level, 20) - 1), STEP_MS / 20);

  function create(seed, startLevel = 1) {
    const s = {
      v: 1, board: new Array(W * H).fill(0), cur: null, queue: [], bag: [], hold: null, held: false,
      score: 0, lines: 0, level: startLevel, start: startLevel, seed: seed | 0, fall: 0, lock: 0, resets: 0, low: 0,
      combo: -1, b2b: false, over: false, pieces: 0, steps: 0,
    };
    fillQueue(s);
    spawn(s);
    return s;
  }
  function fillQueue(s) {
    while (s.queue.length < 5) {
      if (!s.bag.length) {
        const b = TYPES.split('');
        for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
        s.bag = b;
      }
      s.queue.push(s.bag.shift());
    }
  }
  const cellsOf = (p) => CELLS[p.t][p.r];
  function fits(s, t, r, x, y) {
    for (const [cx, cy] of CELLS[t][r]) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= W || by >= H) return false;
      if (by >= 0 && s.board[by * W + bx]) return false;
    }
    return true;
  }
  function spawn(s, type) {
    const t = type || s.queue.shift();
    fillQueue(s);
    const p = { t, r: 0, x: 3, y: 0 };
    s.fall = 0; s.lock = 0; s.resets = 0;
    if (!fits(s, t, 0, p.x, p.y)) { s.cur = p; s.over = true; return false; }
    if (fits(s, t, 0, p.x, p.y + 1)) p.y++; // drop straight into view
    s.cur = p; s.low = p.y;
    return true;
  }
  const grounded = (s) => !fits(s, s.cur.t, s.cur.r, s.cur.x, s.cur.y + 1);
  function ghostY(s) { const p = s.cur; let y = p.y; while (fits(s, p.t, p.r, p.x, y + 1)) y++; return y; }
  // A successful move/rotate while on the ground restarts the lock timer (limited, so a piece can't stall forever).
  function moved(s) {
    if (s.cur.y > s.low) { s.low = s.cur.y; s.resets = 0; }
    if (grounded(s) && s.resets < LOCK_RESETS) { s.lock = 0; s.resets++; }
  }
  function shift(s, dx) {
    const p = s.cur;
    if (!fits(s, p.t, p.r, p.x + dx, p.y)) return false;
    p.x += dx; moved(s); return true;
  }
  function rotate(s, dir) { // dir 1 = clockwise, -1 = counter-clockwise
    const p = s.cur, to = (p.r + dir + 4) % 4;
    if (p.t === 'O') return false;
    const kicks = (p.t === 'I' ? KICKS_I : KICKS)['' + p.r + to];
    for (const [kx, ky] of kicks) {
      if (fits(s, p.t, to, p.x + kx, p.y + ky)) { p.r = to; p.x += kx; p.y += ky; moved(s); return true; }
    }
    return false;
  }
  function down(s) {
    const p = s.cur;
    if (!fits(s, p.t, p.r, p.x, p.y + 1)) return false;
    p.y++; s.fall = 0;
    if (p.y > s.low) { s.low = p.y; s.resets = 0; s.lock = 0; }
    return true;
  }
  // Lock the piece, clear rows, score, spawn the next one. Returns an event object for the view.
  function lockPiece(s, ev) {
    const p = s.cur;
    for (const [cx, cy] of cellsOf(p)) { const y = p.y + cy; if (y >= 0) s.board[y * W + p.x + cx] = TYPES.indexOf(p.t) + 1; }
    const rows = [];
    for (let y = 0; y < H; y++) { let full = true; for (let x = 0; x < W; x++) if (!s.board[y * W + x]) { full = false; break; } if (full) rows.push(y); }
    for (const y of rows) { s.board.splice(y * W, W); s.board.unshift(...new Array(W).fill(0)); }
    const n = rows.length;
    ev.locked = true; ev.rows = rows; ev.piece = p.t;
    if (n) {
      let pts = LINE_SCORE[n] * s.level;
      if (n === 4) { if (s.b2b) pts = Math.floor(pts * 1.5); s.b2b = true; } else s.b2b = false;
      s.combo++;
      if (s.combo > 0) pts += 50 * s.combo * s.level;
      if (s.board.every((c) => !c)) pts += 2000 * s.level; // cleared the whole board
      s.score += pts; ev.points = pts;
      const before = s.level;
      s.lines += n;
      s.level = s.start + Math.floor(s.lines / 10);
      if (s.level > before) ev.levelUp = s.level;
    } else s.combo = -1;
    s.pieces++; s.held = false;
    if (!spawn(s)) ev.over = true;
  }
  /**
   * Advance one tick. inp: { left, right, soft, softHeld, hard, cw, ccw, hold } booleans (pressed this tick).
   * Returns an event object: { moved, rotated, held, hardDrop: rows, locked, rows: [cleared row indexes], points, levelUp, over }.
   */
  function step(s, inp) {
    const ev = {};
    if (s.over) return ev;
    s.steps++;
    if (inp.hold && !s.held) {
      const cur = s.cur.t, next = s.hold;
      s.hold = cur; s.held = true; ev.held = true;
      if (!(next ? spawn(s, next) : spawn(s))) { ev.over = true; return ev; }
    }
    if (inp.cw && rotate(s, 1)) ev.rotated = true;
    if (inp.ccw && rotate(s, -1)) ev.rotated = true;
    if (inp.left && !inp.right && shift(s, -1)) ev.moved = true;
    if (inp.right && !inp.left && shift(s, 1)) ev.moved = true;
    if (inp.hard) {
      let n = 0; while (down(s)) n++;
      s.score += 2 * n; ev.hardDrop = n;
      lockPiece(s, ev); return ev;
    }
    if (inp.soft && down(s)) { s.score += 1; ev.soft = true; }
    // gravity (soft drop held = at least 20 rows/s)
    const g = inp.softHeld ? Math.min(gravityMs(s.level), 50) : gravityMs(s.level);
    if (!grounded(s)) {
      s.fall += STEP_MS;
      while (s.fall >= g) { s.fall -= g; if (!down(s)) break; if (inp.softHeld) s.score += 1; }
      if (grounded(s)) s.fall = 0;
    }
    if (grounded(s)) {
      s.lock += STEP_MS;
      if (s.lock >= LOCK_MS) lockPiece(s, ev);
    } else s.lock = 0;
    return ev;
  }
  function save(s) {
    return { ...s, board: s.board.join(''), cur: { ...s.cur }, queue: s.queue.join(''), bag: s.bag.join('') };
  }
  function load(o) {
    if (!o || o.v !== 1 || typeof o.board !== 'string' || o.board.length !== W * H) return null;
    return { ...o, board: [...o.board].map(Number), cur: { ...o.cur }, queue: o.queue.split(''), bag: o.bag ? o.bag.split('') : [] };
  }
  const E = { W, H, HIDDEN, STEP_MS, LOCK_MS, TYPES, CELLS, KICKS, KICKS_I, create, step, fits, rotate, shift, down, ghostY, grounded, gravityMs, save, load, rand };
  if (typeof module !== 'undefined' && module.exports) module.exports = E; else self.BlocksEngine = E;
})();
