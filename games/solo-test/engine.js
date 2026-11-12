// Solo Test (peg solitaire) engine. Pure, no DOM; works in the browser and in Node.
// Boards live on a 7×7 grid, index = r * 7 + c. A position is an array of 49 values: -1 off-board, 0 empty, 1 peg.
(function (root) {
  'use strict';
  const N = 7;
  const BOARDS = {
    english: { name: 'English', rows: ['..ooo..', '..ooo..', 'ooooooo', 'ooo.ooo', 'ooooooo', '..ooo..', '..ooo..'] },
    european: { name: 'European', rows: ['...oo..', '.ooooo.', 'ooooooo', 'ooooooo', 'ooooooo', '.ooooo.', '..ooo..'] },
  };
  // '.' inside the shape = the starting empty hole; outside cells are where the row has a space-shaped corner.
  const SHAPES = {
    english: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
    european: ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'],
  };
  function start(id) {
    const shape = SHAPES[id], rows = BOARDS[id].rows, b = new Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      b[r * N + c] = shape[r][c] !== '#' ? -1 : rows[r][c] === 'o' ? 1 : 0;
    }
    return b;
  }
  const DIRS = [-N, N, -1, 1];
  const inside = (i, d) => { const r = (i / N) | 0, c = i % N; if (d === -1 || d === 1) { const c2 = c + 2 * d; return c2 >= 0 && c2 < N; } const r2 = r + 2 * (d / N); return r2 >= 0 && r2 < N; };
  function movesFrom(b, i) {
    const out = [];
    if (b[i] !== 1) return out;
    for (const d of DIRS) if (inside(i, d) && b[i + d] === 1 && b[i + 2 * d] === 0) out.push({ from: i, over: i + d, to: i + 2 * d });
    return out;
  }
  function moves(b) { const out = []; for (let i = 0; i < N * N; i++) if (b[i] === 1) out.push(...movesFrom(b, i)); return out; }
  function apply(b, m) { b[m.from] = 0; b[m.over] = 0; b[m.to] = 1; }
  function undo(b, m) { b[m.from] = 1; b[m.over] = 1; b[m.to] = 0; }
  const pegs = (b) => b.reduce((n, v) => n + (v === 1 ? 1 : 0), 0);

  // 8 symmetries of the square (all boards here are symmetric) for the memo key.
  const SYM = [];
  for (let s = 0; s < 8; s++) {
    const map = new Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      let rr = r, cc = c;
      if (s & 1) cc = N - 1 - cc;
      if (s & 2) rr = N - 1 - rr;
      if (s & 4) { const t = rr; rr = cc; cc = t; }
      map[r * N + c] = rr * N + cc;
    }
    SYM.push(map);
  }
  const P2 = Array.from({ length: N * N }, (_, i) => 2 ** i);
  function key(b) {
    let best = Infinity;
    for (const map of SYM) { let k = 0; for (let i = 0; i < N * N; i++) if (b[i] === 1) k += P2[map[i]]; if (k < best) best = k; }
    return best;
  }

  // Solve to a single peg (anywhere, or at `target` if given). Returns the move list, [] if already solved,
  // null if impossible, or undefined if the time budget ran out.
  function solve(board, { target = -1, goal = 1, ms = 1500, dead = new Set() } = {}) {
    const b = board.slice(), path = [], t0 = Date.now();
    const useSym = target < 0 || target === 24; // the centre is fixed by every symmetry
    let nodes = 0, timeout = false;
    function rec(n) {
      if (n <= goal) return goal > 1 || target < 0 || b[target] === 1;
      if ((++nodes & 1023) === 0 && Date.now() - t0 > ms) { timeout = true; return false; }
      const k = useSym ? key(b) : null;
      if (k !== null && dead.has(k)) return false;
      for (const m of moves(b)) {
        apply(b, m); path.push(m);
        if (rec(n - 1)) return true;
        path.pop(); undo(b, m);
        if (timeout) return false;
      }
      if (k !== null && !timeout) dead.add(k);
      return false;
    }
    const ok = rec(pegs(b));
    if (ok) return path;
    return timeout ? undefined : null;
  }

  // Position classes (Conway): colour cells by (r+c)%3 and by (r-c)%3. Every jump flips the parity of all three
  // counts in both colourings, so the pairwise parity sums never change. A single peg can only end on a cell whose
  // pattern matches the current board's, so many one-peg finishes are ruled out instantly.
  const CLS = Array.from({ length: N * N }, (_, i) => { const r = (i / N) | 0, c = i % N; return [(r + c) % 3, ((r - c) % 3 + 3) % 3]; });
  function signature(b) {
    const k = [[0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < N * N; i++) if (b[i] === 1) { k[0][CLS[i][0]]++; k[1][CLS[i][1]]++; }
    return k.map((x) => ((x[0] + x[1]) & 1) * 2 + ((x[1] + x[2]) & 1)).join(',');
  }
  function oneEndCells(b) { // cells where a single last peg could legally end, by the invariant
    const sig = signature(b), out = [];
    for (let i = 0; i < N * N; i++) if (b[i] !== -1) { const one = b.map((v, j) => (v === -1 ? -1 : j === i ? 1 : 0)); if (signature(one) === sig) out.push(i); }
    return out;
  }

  // Fewest pegs still reachable from this position. Returns { best, exact }: exact=false means the time ran out
  // and `best` is only the smallest goal not yet ruled out (the real best may be worse).
  function bestPossible(board, { ms = 2000, memo = {} } = {}) {
    const t0 = Date.now(), n = pegs(board);
    for (let goal = 1; goal < n; goal++) {
      if (goal === 1 && !oneEndCells(board).length) continue;
      const left = ms - (Date.now() - t0);
      if (left <= 0) return { best: goal, exact: false };
      const r = solve(board, { goal, ms: left, dead: (memo[goal] = memo[goal] || new Set()) });
      if (r) return { best: goal, exact: true };
      if (r === undefined) return { best: goal, exact: false };
    }
    return { best: n, exact: true };
  }

  const api = { N, BOARDS, start, moves, movesFrom, apply, undo, pegs, solve, bestPossible, oneEndCells };
  root.SoloTest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
