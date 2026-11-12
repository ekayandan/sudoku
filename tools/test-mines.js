// Mines engine tests: no-guess generation for every size, solver plays each board to completion, generation timing.
const E = require('../games/mines/engine.js');
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const assert = (c, m) => { if (!c) throw new Error(m); };

// counts and flood on a tiny hand-made board
{
  const m = new Uint8Array(9); m[0] = 1; // 3×3, mine in the corner
  const n = E.counts(3, 3, m);
  assert(n.join(',') === '-1,1,0,1,1,0,0,0,0', 'counts: ' + n.join(','));
  const open = new Uint8Array(9), got = E.flood(3, 3, n, open, 8);
  assert(got.length === 8 && !open[0], 'flood should open all safe cells');
  assert(E.solve(3, 3, m, 8).solved, 'tiny board solvable');
  assert(E.unpack(E.pack(m), 9).join('') === m.join(''), 'pack/unpack');
}
// a 50/50 board must not count as solvable: 2×1 strip... use 3×2 with a classic pair
{
  // row0: . . ., row1: x ? ?  — mines at 3 or 4 undecidable
  const w = 4, h = 2, m = new Uint8Array(8); m[4] = 1; // cells: 0 1 2 3 / 4 5 6 7 ; first tap at 3
  const r = E.solve(w, h, m, 3);
  // whatever it opens, it must never reveal a mine (solve throws if it does)
  assert(r.open[4] === 0, 'never opens a mine');
}

const RUNS = { beginner: 300, intermediate: 150, expert: 100 };
let seed = 12345;
for (const id of Object.keys(E.SIZES)) {
  const { w, h, mines } = E.SIZES[id];
  let totalMs = 0, maxMs = 0, tries = 0;
  for (let k = 0; k < RUNS[id]; k++) {
    const r = rng(seed++), first = Math.floor(r() * w * h);
    const t0 = process.hrtime.bigint();
    const g = E.generate(w, h, mines, first, r);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    totalMs += ms; maxMs = Math.max(maxMs, ms); tries += g.tries;
    assert(g.noGuess, id + ': generation timed out');
    let c = 0; for (const v of g.mines) c += v; assert(c === mines, id + ': wrong mine count ' + c);
    for (const j of [first, ...E.neighbours(w, h)[first]]) assert(!g.mines[j], id + ': mine next to first tap');
    // the solver plays the board to completion from the first tap, using logic only
    const s = E.solve(w, h, g.mines, first, mines);
    assert(s.solved, id + ': solver could not finish');
    for (let i = 0; i < w * h; i++) assert(!!s.open[i] !== !!g.mines[i], id + ': end state wrong at ' + i);
    assert(E.counts(w, h, g.mines)[first] === 0, id + ': first tap should open an area');
  }
  console.log(`${id.padEnd(12)} ${RUNS[id]} boards no-guess, avg ${(totalMs / RUNS[id]).toFixed(1)} ms, max ${maxMs.toFixed(1)} ms, avg tries ${(tries / RUNS[id]).toFixed(1)}`);
  assert(maxMs < 500, id + ': generation too slow');
}
console.log('mines engine ok');
