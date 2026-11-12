// Mines engine: no-guess board generation and a logic solver. Pure, no DOM; works in the browser, a worker and Node.
// A board is w×h cells, index = r * w + c. Mines are a Uint8Array (1 = mine).
(function (root) {
  'use strict';
  const SIZES = {
    beginner: { name: 'Beginner', w: 9, h: 9, mines: 10 },
    intermediate: { name: 'Intermediate', w: 16, h: 16, mines: 40 },
    expert: { name: 'Expert', w: 30, h: 16, mines: 99 },
  };

  const nbCache = {};
  // Neighbour lists for every cell of a w×h board (cached).
  function neighbours(w, h) {
    const key = w + 'x' + h;
    if (nbCache[key]) return nbCache[key];
    const out = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const l = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < h && cc >= 0 && cc < w) l.push(rr * w + cc);
      }
      out.push(l);
    }
    return (nbCache[key] = out);
  }

  function counts(w, h, mines) {
    const nb = neighbours(w, h), n = new Int8Array(w * h);
    for (let i = 0; i < w * h; i++) { if (mines[i]) { n[i] = -1; continue; } let k = 0; for (const j of nb[i]) k += mines[j]; n[i] = k; }
    return n;
  }

  // Cells opened by revealing `start` (flood fill through zeros). `open` (Uint8Array) is updated; returns the new cells in BFS order.
  function flood(w, h, num, open, start, blocked) {
    const nb = neighbours(w, h), out = [];
    if (open[start] || (blocked && blocked[start])) return out;
    open[start] = 1; out.push(start);
    for (let q = 0; q < out.length; q++) {
      const i = out[q];
      if (num[i] !== 0) continue;
      for (const j of nb[i]) if (!open[j] && !(blocked && blocked[j])) { open[j] = 1; out.push(j); }
    }
    return out;
  }

  // Logic solver. Plays from `first` using only deductions (single-cell rules, pair/subset reasoning and the
  // total mine count). Returns { solved, open, known } where known marks deduced mines.
  function solve(w, h, mines, first, total) {
    const N = w * h, nb = neighbours(w, h), num = counts(w, h, mines);
    const open = new Uint8Array(N), known = new Uint8Array(N);
    if (total == null) { total = 0; for (let i = 0; i < N; i++) total += mines[i]; }
    let safeLeft = N - total;
    const reveal = (i) => { if (mines[i]) throw new Error('solver revealed a mine'); safeLeft -= flood(w, h, num, open, i, known).length; };
    reveal(first);
    let knownCount = 0;
    const markMine = (i) => { if (!known[i]) { known[i] = 1; knownCount++; } };
    while (safeLeft > 0) {
      let progress = false;
      // constraints from the frontier
      const cons = [];
      for (let i = 0; i < N; i++) {
        if (!open[i] || num[i] <= 0) continue;
        const u = []; let k = num[i];
        for (const j of nb[i]) { if (known[j]) k--; else if (!open[j]) u.push(j); }
        if (!u.length) continue;
        if (k === 0) { for (const j of u) if (!open[j]) reveal(j); progress = true; }
        else if (k === u.length) { for (const j of u) markMine(j); progress = true; }
        else cons.push({ u, k, i });
      }
      if (progress) continue;
      // pair reasoning: for constraints A, B sharing cells, if kA - kB == |A \ B| then A\B are mines and B\A are safe.
      const byCell = new Map();
      cons.forEach((c, ci) => { for (const j of c.u) { let l = byCell.get(j); if (!l) byCell.set(j, (l = [])); l.push(ci); } });
      outer: for (let a = 0; a < cons.length; a++) {
        const A = cons[a], seen = new Set();
        for (const j of A.u) for (const b of byCell.get(j)) {
          if (b === a || seen.has(b)) continue; seen.add(b);
          const B = cons[b], sB = new Set(B.u);
          const aOnly = A.u.filter((x) => !sB.has(x)), sA = new Set(A.u), bOnly = B.u.filter((x) => !sA.has(x));
          if (A.k - B.k === aOnly.length && (aOnly.length || bOnly.length)) {
            for (const x of aOnly) markMine(x);
            for (const x of bOnly) if (!open[x]) reveal(x);
            progress = true; break outer;
          }
        }
      }
      if (progress) continue;
      // global count: every remaining unknown cell is a mine, or none is
      const left = total - knownCount, unknown = [];
      for (let i = 0; i < N; i++) if (!open[i] && !known[i]) unknown.push(i);
      if (left === 0) { for (const i of unknown) reveal(i); continue; }
      if (left === unknown.length) { for (const i of unknown) markMine(i); continue; }
      // global count against the frontier: if the frontier constraints (disjoint cover) already need all mines left, the rest are safe
      const used = new Set(); let need = 0;
      for (const c of cons) if (c.u.every((x) => !used.has(x))) { c.u.forEach((x) => used.add(x)); need += c.k; }
      if (need === left) {
        const rest = unknown.filter((x) => !used.has(x));
        if (rest.length) { for (const x of rest) reveal(x); continue; }
      }
      break;
    }
    return { solved: safeLeft === 0, open, known };
  }

  // Random board with `count` mines, keeping the 3×3 around `first` free (so the first tap opens an area).
  function place(w, h, count, first, rng) {
    const N = w * h, mines = new Uint8Array(N), nb = neighbours(w, h);
    const banned = new Set([first, ...nb[first]]);
    const pool = [];
    for (let i = 0; i < N; i++) if (!banned.has(i)) pool.push(i);
    for (let k = 0; k < count; k++) { const j = k + Math.floor(rng() * (pool.length - k)); const t = pool[k]; pool[k] = pool[j]; pool[j] = t; mines[pool[k]] = 1; }
    return mines;
  }

  // No-guess generation: retry until the solver can finish the board from `first`.
  function generate(w, h, count, first, rng, opts) {
    const ms = (opts && opts.ms) || 3000, t0 = Date.now();
    let tries = 0, mines;
    for (;;) {
      tries++;
      mines = place(w, h, count, first, rng);
      if (solve(w, h, mines, first, count).solved) return { mines, tries, noGuess: true, ms: Date.now() - t0 };
      if (Date.now() - t0 > ms) return { mines, tries, noGuess: false, ms: Date.now() - t0 };
    }
  }

  // Compact text form for saving: one base-36 index list.
  const pack = (mines) => { const l = []; for (let i = 0; i < mines.length; i++) if (mines[i]) l.push(i.toString(36)); return l.join(','); };
  const unpack = (s, N) => { const m = new Uint8Array(N); if (s) for (const x of s.split(',')) { const i = parseInt(x, 36); if (i >= 0 && i < N) m[i] = 1; } return m; };

  const api = { SIZES, neighbours, counts, flood, solve, place, generate, pack, unpack };
  root.Mines = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
