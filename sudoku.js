/*
 * Sudoku engine: solver, logical grader, generator and mutator.
 * Works in the browser, in a Web Worker and in Node (no dependencies).
 * Grids are arrays of 81 numbers (0 = empty) or strings of 81 chars ('0' = empty).
 */
(function (root) {
  'use strict';

  // ---------- geometry ----------
  const ROW = new Int8Array(81), COL = new Int8Array(81), BOX = new Int8Array(81);
  for (let i = 0; i < 81; i++) {
    ROW[i] = (i / 9) | 0;
    COL[i] = i % 9;
    BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0);
  }
  // UNITS: 0-8 rows, 9-17 cols, 18-26 boxes
  const UNITS = [];
  for (let u = 0; u < 27; u++) UNITS.push([]);
  for (let i = 0; i < 81; i++) {
    UNITS[ROW[i]].push(i);
    UNITS[9 + COL[i]].push(i);
    UNITS[18 + BOX[i]].push(i);
  }
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set([...UNITS[ROW[i]], ...UNITS[9 + COL[i]], ...UNITS[18 + BOX[i]]]);
    s.delete(i);
    PEERS.push(Int8Array.from(s));
  }
  const POP = new Int8Array(1024);
  for (let m = 1; m < 1024; m++) POP[m] = POP[m >> 1] + (m & 1);
  const ALL = 0x3fe; // bits 1..9

  function digitsOf(mask) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
    return out;
  }

  // ---------- random ----------
  function makeRng(seed) {
    if (seed === undefined || seed === null) return Math.random;
    let a = seed >>> 0;
    return function () { // mulberry32
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- conversions ----------
  function toArray(g) {
    if (typeof g === 'string') return Array.from(g, (c) => (c >= '1' && c <= '9' ? +c : 0));
    return Array.from(g);
  }
  function toString(g) { return Array.from(g, (v) => v || 0).join(''); }

  // ---------- backtracking solver (bitmask + MRV) ----------
  function solve(input, limit, rand) {
    limit = limit || 2;
    const g = toArray(input);
    const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
    const empties = [];
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (!v) { empties.push(i); continue; }
      const bit = 1 << v;
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return { count: 0, solution: null };
      rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
    }
    let count = 0, solution = null;
    function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let k = 0; k < empties.length; k++) {
        const i = empties[k];
        if (g[i]) continue;
        const mask = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        const n = POP[mask];
        if (n === 0) return;
        if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n === 1) break; }
      }
      if (best === -1) { count++; if (!solution) solution = g.slice(); return; }
      const ds = digitsOf(bestMask);
      if (rand) shuffle(ds, rand);
      const r = ROW[best], c = COL[best], b = BOX[best];
      for (const d of ds) {
        const bit = 1 << d;
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit; g[best] = d;
        rec();
        rows[r] ^= bit; cols[c] ^= bit; boxes[b] ^= bit; g[best] = 0;
        if (count >= limit) return;
      }
    }
    rec();
    return { count, solution };
  }

  function hasUniqueSolution(g) { return solve(g, 2).count === 1; }

  // ---------- logical grader ----------
  // Technique tiers: 1 singles, 2 locked candidates, 3 pairs/triples, 4 fish (X-Wing/Swordfish), 5 needs more
  const TECH_WEIGHT = { nakedSingle: 1, hiddenSingle: 2, locked: 8, subset2: 15, subset3: 25, fish2: 40, fish3: 60 };

  function grade(input) {
    const v = toArray(input);
    const cand = new Int32Array(81);
    let givens = 0;
    for (let i = 0; i < 81; i++) {
      if (v[i]) { givens++; continue; }
      let m = ALL;
      for (const p of PEERS[i]) if (v[p]) m &= ~(1 << v[p]);
      cand[i] = m;
    }
    let tier = 0, score = 0, empty = 81 - givens;
    const used = {};
    function note(t, w, name) { if (t > tier) tier = t; score += w; used[name] = (used[name] || 0) + 1; }
    function place(i, d) {
      v[i] = d; cand[i] = 0; empty--;
      const bit = ~(1 << d);
      for (const p of PEERS[i]) cand[p] &= bit;
    }
    function elim(i, mask) { // remove mask bits from cell i, return true if anything changed
      if (v[i] || !(cand[i] & mask)) return false;
      cand[i] &= ~mask; return true;
    }

    function nakedSingle() {
      for (let i = 0; i < 81; i++) if (!v[i] && POP[cand[i]] === 1) { place(i, 31 - Math.clz32(cand[i])); return true; }
      return false;
    }
    function hiddenSingle() {
      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d; let pos = -1, n = 0;
          for (const i of unit) if (cand[i] & bit) { n++; pos = i; if (n > 1) break; }
          if (n === 1) { place(pos, d); return true; }
        }
      }
      return false;
    }
    function locked() {
      // pointing: candidates for d in a box confined to one row/col
      for (let b = 0; b < 9; b++) {
        const box = UNITS[18 + b];
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d; const cells = box.filter((i) => cand[i] & bit);
          if (cells.length < 2) continue;
          for (const [GEO, off] of [[ROW, 0], [COL, 9]]) {
            const line = GEO[cells[0]];
            if (cells.every((i) => GEO[i] === line)) {
              let ch = false;
              for (const i of UNITS[off + line]) if (BOX[i] !== b) ch = elim(i, bit) || ch;
              if (ch) return true;
            }
          }
        }
      }
      // claiming: candidates for d in a row/col confined to one box
      for (let u = 0; u < 18; u++) {
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d; const cells = UNITS[u].filter((i) => cand[i] & bit);
          if (cells.length < 2) continue;
          const b = BOX[cells[0]];
          if (cells.every((i) => BOX[i] === b)) {
            let ch = false;
            for (const i of UNITS[18 + b]) if (!UNITS[u].includes(i)) ch = elim(i, bit) || ch;
            if (ch) return true;
          }
        }
      }
      return false;
    }
    function combos(arr, n, start, acc, fn) {
      if (acc.length === n) return fn(acc);
      for (let k = start; k < arr.length; k++) {
        acc.push(arr[k]);
        if (combos(arr, n, k + 1, acc, fn)) { acc.pop(); return true; }
        acc.pop();
      }
      return false;
    }
    function nakedSubset(n) {
      for (const unit of UNITS) {
        const cells = unit.filter((i) => !v[i] && POP[cand[i]] >= 2 && POP[cand[i]] <= n);
        if (cells.length < n) continue;
        const hit = combos(cells, n, 0, [], (set) => {
          let m = 0; for (const i of set) m |= cand[i];
          if (POP[m] !== n) return false;
          let ch = false;
          for (const i of unit) if (!set.includes(i)) ch = elim(i, m) || ch;
          return ch;
        });
        if (hit) return true;
      }
      return false;
    }
    function hiddenSubset(n) {
      for (const unit of UNITS) {
        const pos = {}; const ds = [];
        for (let d = 1; d <= 9; d++) {
          let m = 0;
          for (let k = 0; k < 9; k++) if (cand[unit[k]] & (1 << d)) m |= 1 << k;
          if (POP[m] >= 2 && POP[m] <= n) { pos[d] = m; ds.push(d); }
        }
        if (ds.length < n) continue;
        const hit = combos(ds, n, 0, [], (set) => {
          let m = 0, keep = 0;
          for (const d of set) { m |= pos[d]; keep |= 1 << d; }
          if (POP[m] !== n) return false;
          let ch = false;
          for (let k = 0; k < 9; k++) if (m & (1 << k)) ch = elim(unit[k], ALL & ~keep) || ch;
          return ch;
        });
        if (hit) return true;
      }
      return false;
    }
    function fish(n) {
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d;
        for (const [baseOff, coverOff] of [[0, 9], [9, 0]]) {
          const bases = []; const masks = {};
          for (let u = 0; u < 9; u++) {
            let m = 0;
            UNITS[baseOff + u].forEach((i, k) => { if (cand[i] & bit) m |= 1 << k; });
            if (POP[m] >= 2 && POP[m] <= n) { bases.push(u); masks[u] = m; }
          }
          if (bases.length < n) continue;
          const hit = combos(bases, n, 0, [], (set) => {
            let m = 0; for (const u of set) m |= masks[u];
            if (POP[m] !== n) return false;
            let ch = false;
            for (let k = 0; k < 9; k++) {
              if (!(m & (1 << k))) continue;
              for (const i of UNITS[coverOff + k]) {
                const baseIdx = baseOff === 0 ? ROW[i] : COL[i];
                if (!set.includes(baseIdx)) ch = elim(i, bit) || ch;
              }
            }
            return ch;
          });
          if (hit) return true;
        }
      }
      return false;
    }

    const steps = [
      [nakedSingle, 1, 'nakedSingle'],
      [hiddenSingle, 1, 'hiddenSingle'],
      [locked, 2, 'locked'],
      [() => nakedSubset(2) || hiddenSubset(2), 3, 'subset2'],
      [() => nakedSubset(3) || hiddenSubset(3), 3, 'subset3'],
      [() => fish(2), 4, 'fish2'],
      [() => fish(3), 4, 'fish3'],
    ];
    outer: while (empty > 0) {
      for (const [fn, t, name] of steps) {
        if (fn()) { note(t, TECH_WEIGHT[name], name); continue outer; }
      }
      tier = 5; break; // stuck: needs chains / guessing
    }
    return { tier, score: score + (tier === 5 ? 500 : 0), givens, used, solvedLogically: empty === 0 };
  }

  const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
  function difficultyOf(gr) {
    if (gr.tier <= 1) return gr.givens >= 36 ? 'easy' : 'medium';
    if (gr.tier <= 3) return 'hard';
    return 'expert';
  }

  // ---------- generator ----------
  function fullGrid(rand) { return solve(new Array(81).fill(0), 1, rand).solution; }

  // Remove clues in symmetric pairs while the solution stays unique.
  function carve(solution, rand, minGivens) {
    const p = solution.slice();
    let givens = 81;
    const order = shuffle(Array.from({ length: 41 }, (_, i) => i), rand);
    for (const i of order) {
      const j = 80 - i;
      const removed = i === j ? 1 : 2;
      if (givens - removed < minGivens) continue;
      const a = p[i], b = p[j];
      p[i] = 0; p[j] = 0;
      if (hasUniqueSolution(p)) givens -= removed;
      else { p[i] = a; p[j] = b; }
    }
    return p;
  }

  const TARGET_GIVENS = { easy: [36, 41], medium: [27, 31], hard: [17, 17], expert: [17, 17] };

  // Returns {puzzle, solution, difficulty, grade} or null if the attempt budget runs out.
  function generate(difficulty, opts) {
    opts = opts || {};
    const rand = opts.rand || makeRng(opts.seed);
    const attempts = opts.attempts || 200;
    const deadline = opts.timeLimitMs ? Date.now() + opts.timeLimitMs : Infinity;
    const [lo, hi] = TARGET_GIVENS[difficulty];
    for (let a = 0; a < attempts && Date.now() < deadline; a++) {
      const solution = fullGrid(rand);
      const minGivens = lo + Math.floor(rand() * (hi - lo + 1));
      const puzzle = carve(solution, rand, minGivens);
      const gr = grade(puzzle);
      if (difficultyOf(gr) === difficulty) return { puzzle, solution, difficulty, grade: gr };
    }
    return null;
  }

  // ---------- mutator ----------
  // Applies validity-preserving symmetries: digit relabel, row/col swaps within bands,
  // band/stack swaps, transpose. Difficulty and uniqueness are unchanged.
  function mutate(puzzle, solution, rand) {
    rand = rand || Math.random;
    const P = toArray(puzzle), S = solution ? toArray(solution) : null;
    const lineMap = () => {
      const bands = shuffle([0, 1, 2], rand); const out = [];
      for (const b of bands) for (const r of shuffle([0, 1, 2], rand)) out.push(b * 3 + r);
      return out;
    };
    const rowMap = lineMap(), colMap = lineMap();
    const digits = [0, ...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand)];
    const transpose = rand() < 0.5;
    const map = (g) => {
      const out = new Array(81);
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        let sr = rowMap[r], sc = colMap[c];
        if (transpose) { const t = sr; sr = sc; sc = t; }
        out[r * 9 + c] = digits[g[sr * 9 + sc]];
      }
      return out;
    };
    return { puzzle: map(P), solution: S ? map(S) : null };
  }

  const api = {
    ROW, COL, BOX, UNITS, PEERS, DIFFICULTIES,
    makeRng, shuffle, toArray, toString,
    solve, hasUniqueSolution, grade, difficultyOf, generate, mutate, fullGrid,
  };
  root.Sudoku = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
