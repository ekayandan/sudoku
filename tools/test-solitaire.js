// Klondike engine tests: rules, undo, winnable deals (replaying the solver's line), solver speed.
const K = require('../games/solitaire/engine.js');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const C = (r, su) => su * 13 + r; // rank 0..12, suit 0 spades 1 hearts 2 diamonds 3 clubs
const total = (s) => s.t.flat().length + s.stock.length + s.waste.length + s.f.reduce((a, b) => a + b, 0);

// deal shape
const d = K.deal(42, 1);
assert(d.t.map((p) => p.length).join() === '1,2,3,4,5,6,7' && d.stock.length === 24 && total(d) === 52, 'deal shape');
assert(new Set([...d.t.flat(), ...d.stock]).size === 52, 'deal has 52 distinct cards');
assert(JSON.stringify(K.deal(42, 1)) === JSON.stringify(d), 'deal is deterministic');

// rules
const e = { draw: 1, t: [[C(12, 0)], [C(11, 1)], [], [C(5, 2)], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], f: [0, 0, 0, 0], stock: [], waste: [C(0, 3)] };
assert(K.legal(e, { k: 'mv', from: 1, to: 0, n: 1 }), 'red queen on black king');
assert(!K.legal(e, { k: 'mv', from: 0, to: 1, n: 1 }), 'king not on queen');
assert(K.legal(e, { k: 'mv', from: 0, to: 2, n: 1 }) === true, 'king to empty column (by hand)');
assert(!K.legal(e, { k: 'mv', from: 3, to: 2, n: 1 }), 'only kings on empty columns');
assert(K.legal(e, { k: 'mv', from: K.WASTE, to: K.F0 + 3, n: 1 }), 'ace to its foundation');
assert(!K.legal(e, { k: 'mv', from: K.WASTE, to: K.F0 + 0, n: 1 }), 'ace not to another suit');
assert(!K.legal(e, { k: 'mv', from: 3, to: K.F0 + 2, n: 1 }), '6 not on empty foundation');
assert(K.dests(e, 1, 0)[0] === 0, 'best spot for the queen is the king');
assert(K.dests(e, K.WASTE, 0)[0] === K.F0 + 3, 'best spot for an ace is its foundation');
assert(K.dests(e, 0, 0).every((x) => x < 0), 'king on an empty column is never auto-moved to another empty column');

// draw 3, recycle, undo restores everything
const s = K.deal(7, 3), snap = JSON.stringify(s), recs = [];
for (let i = 0; i < 8; i++) recs.push(K.apply(s, { k: 'draw' }));
assert(s.stock.length === 0 && s.waste.length === 24, 'eight draws of 3 empty the stock');
recs.push(K.apply(s, { k: 'draw' }));
assert(recs[8][0] === -2 && s.stock.length === 24, 'ninth draw turns the waste over');
while (recs.length) K.undo(s, recs.pop());
assert(JSON.stringify(s) === snap, 'undo restores the deal');
// a move that flips a card, undone
const f = { draw: 1, t: [[C(3, 0), C(12, 0)], [], [], [], [], [], []], down: [1, 0, 0, 0, 0, 0, 0], f: [0, 0, 0, 0], stock: [], waste: [] };
const fs = JSON.stringify(f), r = K.apply(f, { k: 'mv', from: 0, to: 1, n: 1 });
assert(f.down[0] === 0 && r[3] === 1, 'revealing flips the card');
K.undo(f, r); assert(JSON.stringify(f) === fs, 'undo turns it back face down');

// auto finish
const af = { draw: 1, t: [[C(1, 0), C(0, 0)], [], [], [], [], [], []], down: [0, 0, 0, 0, 0, 0, 0], f: [0, 13, 13, 13], stock: [], waste: [] };
af.t[0] = []; for (let r2 = 12; r2 >= 0; r2--) af.t[r2 % 2 ? 1 : 0].push(C(r2, 0));
af.t = [[C(12, 0)], [C(11, 0)], [C(10, 0)], [C(9, 0), C(8, 0)], [C(7, 0), C(6, 0), C(5, 0)], [C(4, 0), C(3, 0), C(2, 0)], [C(1, 0), C(0, 0)]];
af.f = [0, 13, 13, 13];
assert(K.canAutoFinish(af), 'can auto finish');
let m, n = 0; while ((m = K.nextFinishMove(af))) { K.apply(af, m); n++; }
assert(K.won(af) && n === 13, 'auto finish wins');

// winnable deals: replay the solver's line with the rules
for (const draw of [1, 3]) {
  let worst = 0, sum = 0, tries = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const t0 = Date.now(), w = K.winnableDeal(1000 + i * 7777, draw, { nodes: 20000 }), ms = Date.now() - t0;
    worst = Math.max(worst, ms); sum += ms; tries += w.tries;
    const st = K.deal(w.seed, draw);
    for (const mv of w.line) { assert(K.legal(st, mv), 'solver line has an illegal move'); K.apply(st, mv); }
    assert(K.won(st), 'solver line wins (draw ' + draw + ', seed ' + w.seed + ')');
    assert(total(st) === 52, 'cards conserved');
  }
  console.log('draw ' + draw + ': ' + N + ' winnable deals, avg ' + (sum / N).toFixed(0) + ' ms, worst ' + worst + ' ms, ' + (tries / N).toFixed(2) + ' seeds per deal');
  assert(worst < 600, 'deal generation too slow (' + worst + ' ms in Node; phones are slower)');
}
// hint from mid-game: solve again after following part of a line
const w = K.winnableDeal(99, 3, { nodes: 20000 }), mid = K.deal(w.seed, 3);
for (const mv of w.line.slice(0, 30)) K.apply(mid, mv);
const h = K.solve(mid, { nodes: 150000 });
assert(h.ok, 'mid-game position on a winning line is solvable');
console.log('solitaire engine ok');
