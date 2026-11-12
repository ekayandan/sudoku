// Klondike engine + solver. Pure, no DOM; works in the page, in the Worker (importScripts) and in Node.
// Card c in 0..51: suit = c / 13 | 0 (0 spades, 1 hearts, 2 diamonds, 3 clubs), rank = c % 13 (0 = ace … 12 = king).
// Piles: 0-6 tableau, 7-10 foundations (one per suit), 11 waste, 12 stock.
// State: { draw: 1|3, t: [7 arrays bottom→top], down: [7 face-down counts], f: [4 counts], stock: [top last], waste: [top last] }
(function (root) {
  'use strict';
  const F0 = 7, WASTE = 11, STOCK = 12;
  const suit = (c) => (c / 13) | 0, rank = (c) => c % 13;
  const red = (c) => { const s = suit(c); return s === 1 || s === 2; };
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function rng(seed) { // mulberry32, same as ctx.rng
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function deal(seed, draw) {
    const r = rng(seed), d = Array.from({ length: 52 }, (_, i) => i);
    for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const x = d[i]; d[i] = d[j]; d[j] = x; }
    const t = []; let k = 0;
    for (let i = 0; i < 7; i++) { t.push(d.slice(k, k + i + 1)); k += i + 1; }
    return { draw: draw === 3 ? 3 : 1, t, down: [0, 1, 2, 3, 4, 5, 6], f: [0, 0, 0, 0], stock: d.slice(k).reverse(), waste: [] };
  }
  const clone = (s) => ({ draw: s.draw, t: s.t.map((p) => p.slice()), down: s.down.slice(), f: s.f.slice(), stock: s.stock.slice(), waste: s.waste.slice() });
  const top = (a) => a[a.length - 1];
  const canFound = (s, c) => rank(c) === s.f[suit(c)];
  const canOn = (c, on) => rank(on) === rank(c) + 1 && red(on) !== red(c);
  const canTab = (s, c, p) => (s.t[p].length ? canOn(c, top(s.t[p])) : rank(c) === 12);
  const won = (s) => s.f.every((n) => n === 13);
  const foundTop = (s, i) => (s.f[i] ? i * 13 + s.f[i] - 1 : -1);

  // Cards a move from pile `from` (index idx in tableau) would carry, or null if it can't be picked up.
  function pick(s, from, idx) {
    if (from < 7) return idx >= s.down[from] && idx < s.t[from].length ? s.t[from].slice(idx) : null;
    if (from === WASTE) return s.waste.length ? [top(s.waste)] : null;
    if (from >= F0 && from < F0 + 4) { const c = foundTop(s, from - F0); return c >= 0 ? [c] : null; }
    return null;
  }
  function legal(s, m) {
    if (m.k === 'draw') return s.stock.length > 0 || s.waste.length > 0;
    const cards = pick(s, m.from, m.from < 7 ? s.t[m.from].length - m.n : 0);
    if (!cards || cards.length !== m.n || m.from === m.to) return false;
    if (m.to >= F0 && m.to < F0 + 4) return m.n === 1 && suit(cards[0]) === m.to - F0 && canFound(s, cards[0]);
    if (m.to < 7) return canTab(s, cards[0], m.to);
    return false;
  }
  // Applies a move, returns an undo record (small array).
  function apply(s, m) {
    if (m.k === 'draw') {
      if (s.stock.length) { const n = Math.min(s.draw, s.stock.length); for (let i = 0; i < n; i++) s.waste.push(s.stock.pop()); return [-1, n]; }
      s.stock = s.waste.reverse(); s.waste = []; return [-2];
    }
    let cards;
    if (m.from < 7) cards = s.t[m.from].splice(s.t[m.from].length - m.n, m.n);
    else if (m.from === WASTE) cards = [s.waste.pop()];
    else { const i = m.from - F0; cards = [i * 13 + s.f[i] - 1]; s.f[i]--; }
    if (m.to < 7) for (const c of cards) s.t[m.to].push(c);
    else s.f[m.to - F0]++;
    let flip = 0;
    if (m.from < 7 && s.t[m.from].length && s.down[m.from] === s.t[m.from].length) { s.down[m.from]--; flip = 1; }
    return [m.from, m.to, m.n, flip];
  }
  function undo(s, r) {
    if (r[0] === -1) { for (let i = 0; i < r[1]; i++) s.stock.push(s.waste.pop()); return; }
    if (r[0] === -2) { s.waste = s.stock.reverse(); s.stock = []; return; }
    const [from, to, n, flip] = r;
    if (flip) s.down[from]++;
    let cards;
    if (to < 7) cards = s.t[to].splice(s.t[to].length - n, n);
    else { const i = to - F0; cards = [i * 13 + s.f[i] - 1]; s.f[i]--; }
    if (from < 7) for (const c of cards) s.t[from].push(c);
    else if (from === WASTE) s.waste.push(cards[0]);
    else s.f[from - F0]++;
  }
  // Legal destinations for the cards picked at (from, idx), best first:
  // foundation, then a tableau card, then an empty column (not for a king that already sits on an empty column).
  function dests(s, from, idx) {
    const cards = pick(s, from, idx);
    if (!cards) return [];
    const out = [], c = cards[0];
    if (cards.length === 1 && from !== F0 + suit(c) && canFound(s, c)) out.push(F0 + suit(c));
    const empty = [];
    for (let p = 0; p < 7; p++) {
      if (p === from || !canTab(s, c, p)) continue;
      if (s.t[p].length) out.push(p); else empty.push(p);
    }
    if (!(from < 7 && idx === 0)) out.push(...empty);
    else out.push(...empty.map((p) => -1 - p)); // allowed by hand (drag), but never "best"
    return out;
  }
  // Safe to move to the foundation: no tableau card could ever need it (both opposite-colour piles are high enough).
  function safe(s, c) {
    const r = rank(c);
    if (r <= 1) return true;
    const o = red(c) ? [0, 3] : [1, 2];
    return s.f[o[0]] >= r && s.f[o[1]] >= r;
  }
  // When the tableau is all face up and the talon is empty, the lowest card left is always a column top.
  const canAutoFinish = (s) => !won(s) && !s.stock.length && !s.waste.length && s.down.every((d) => d === 0);
  function nextFinishMove(s) {
    for (let p = 0; p < 7; p++) if (s.t[p].length && canFound(s, top(s.t[p]))) return { k: 'mv', from: p, to: F0 + suit(top(s.t[p])), n: 1 };
    return null;
  }

  // ---------------------------------------------------------------- solver
  // Depth-first search with a transposition table and a node budget. Stock/waste moves are generated as
  // "draw k times, then play the waste card", so every reachable talon card is one branch.
  function key(s) {
    const cols = [];
    for (let p = 0; p < 7; p++) cols.push(String.fromCharCode(48 + s.down[p], ...s.t[p].map((c) => c + 60)));
    cols.sort();
    return String.fromCharCode(...s.f.map((n) => n + 48)) + cols.join(',') + '|' + String.fromCharCode(...s.stock.map((c) => c + 60)) + '|' + s.waste.length;
  }
  function talon(s) { // [{ c, draws }] cards that can become the waste top, with the draws needed
    const out = [], st = s.stock.slice(), w = s.waste.slice(), seenLen = new Set(), seenCard = new Set();
    let draws = 0;
    for (;;) {
      if (w.length && !seenCard.has(top(w))) { seenCard.add(top(w)); out.push({ c: top(w), draws }); }
      if (seenLen.has(st.length)) break;
      seenLen.add(st.length);
      if (st.length) { const n = Math.min(s.draw, st.length); for (let i = 0; i < n; i++) w.push(st.pop()); }
      else if (w.length) { st.push(...w.reverse()); w.length = 0; }
      else break;
      draws++;
    }
    return out;
  }
  function solve(s0, opts = {}) {
    const budget = opts.nodes || 150000;
    const s = clone(s0), path = [], recs = [], seen = new Set();
    let nodes = 0, out = false;
    const push = (m) => { recs.push(apply(s, m)); path.push(m); };
    const back = (n) => { for (let i = 0; i < n; i++) { undo(s, recs.pop()); path.pop(); } };
    function autoSafe() {
      let n = 0, again = true;
      while (again) {
        again = false;
        for (let p = 0; p < 7; p++) {
          const c = top(s.t[p]);
          if (s.t[p].length && canFound(s, c) && safe(s, c)) { push({ k: 'mv', from: p, to: F0 + suit(c), n: 1 }); n++; again = true; }
        }
        const w = top(s.waste);
        if (s.waste.length && canFound(s, w) && safe(s, w)) { push({ k: 'mv', from: WASTE, to: F0 + suit(w), n: 1 }); n++; again = true; }
      }
      return n;
    }
    function gen() {
      const ms = []; // [priority, draws, move]
      let firstEmpty = -1, kingWaiting = false;
      for (let p = 0; p < 7; p++) if (!s.t[p].length) { firstEmpty = p; break; }
      const tal = talon(s);
      for (let p = 0; p < 7; p++) {
        const col = s.t[p], d = s.down[p];
        if (!col.length) continue;
        const c = top(col);
        if (canFound(s, c)) ms.push([d ? 0 : 1, 0, { k: 'mv', from: p, to: F0 + suit(c), n: 1 }]);
        if (d > 0 && rank(col[d]) === 12) kingWaiting = true;
        for (let i = d; i < col.length; i++) {
          const base = col[i], n = col.length - i;
          const reveals = i === d && d > 0, empties = i === 0;
          const frees = i > d && canFound(s, col[i - 1]);
          if (!reveals && !empties && !frees) continue;
          for (let q = 0; q < 7; q++) {
            if (q === p) continue;
            if (!s.t[q].length) { if (q !== firstEmpty || !reveals || rank(base) !== 12) continue; ms.push([2, 0, { k: 'mv', from: p, to: q, n }]); continue; }
            if (!canOn(base, top(s.t[q]))) continue;
            ms.push([reveals ? 2 : frees ? 4 : 6, -d, { k: 'mv', from: p, to: q, n }]);
          }
        }
      }
      for (const { c } of tal) if (rank(c) === 12) kingWaiting = true;
      for (const { c, draws } of tal) {
        if (canFound(s, c)) ms.push([1, draws, { k: 'mv', from: WASTE, to: F0 + suit(c), n: 1 }, draws]);
        for (let q = 0; q < 7; q++) {
          if (!s.t[q].length) { if (q === firstEmpty && rank(c) === 12) ms.push([3, draws, { k: 'mv', from: WASTE, to: q, n: 1 }, draws]); continue; }
          if (canOn(c, top(s.t[q]))) ms.push([3, draws, { k: 'mv', from: WASTE, to: q, n: 1 }, draws]);
        }
      }
      // emptying a column only helps if a king is waiting for it
      const res = ms.filter((m) => !(m[0] === 6 && !kingWaiting));
      // foundation → tableau, last resort
      for (let i = 0; i < 4; i++) {
        const c = foundTop(s, i);
        if (c < 0 || rank(c) < 2) continue;
        for (let q = 0; q < 7; q++) if (s.t[q].length && canOn(c, top(s.t[q]))) res.push([8, 0, { k: 'mv', from: F0 + i, to: q, n: 1 }]);
      }
      res.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return res;
    }
    function dfs() {
      if (won(s)) return true;
      if (++nodes > budget) { out = true; return false; }
      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);
      for (const [, , m, draws] of gen()) {
        const before = recs.length;
        for (let i = 0; i < (draws || 0); i++) push({ k: 'draw' });
        push(m);
        autoSafe();
        if (dfs()) return true;
        back(recs.length - before);
        if (out) return false;
      }
      return false;
    }
    autoSafe();
    const ok = dfs();
    return { ok, line: ok ? path : null, nodes, gaveUp: out };
  }
  // A winnable deal: try seeds from `seed` on until the solver proves one (each try under a node budget).
  function winnableDeal(seed, draw, opts = {}) {
    let s = seed >>> 0;
    for (let tries = 1; ; tries++) {
      const d = deal(s, draw), r = solve(d, { nodes: opts.nodes || 60000 });
      if (r.ok) return { seed: s, state: d, line: r.line, tries };
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    }
  }

  const api = { F0, WASTE, STOCK, RANKS, suit, rank, red, rng, deal, clone, top, pick, legal, apply, undo, dests, canFound, won, foundTop, safe, canAutoFinish, nextFinishMove, talon, solve, winnableDeal, key };
  root.Klondike = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
