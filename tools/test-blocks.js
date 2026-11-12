// Tests for the Stackfall engine (games/blocks/engine.js).
const E = require('../games/blocks/engine.js');
const assert = (c, m) => { if (!c) throw new Error(m); };
const none = { left: false, right: false, soft: false, softHeld: false, hard: false, cw: false, ccw: false, hold: false };
const press = (k) => ({ ...none, [k]: true });
const empty = () => new Array(E.W * E.H).fill(0);

// shapes: 4 cells in every rotation, 4 distinct rotations return to start
for (const t of E.TYPES) for (let r = 0; r < 4; r++) assert(E.CELLS[t][r].length === 4, t + r + ' has 4 cells');

// 7-bag: every window of 7 aligned pieces contains each type once
{
  const s = E.create(42);
  const seen = [s.cur.t];
  for (let i = 0; i < 139; i++) { E.step(s, press('hard')); seen.push(s.cur.t); s.board = empty(); }
  for (let i = 0; i < 140; i += 7) assert(new Set(seen.slice(i, i + 7)).size === 7, 'bag at ' + i + ': ' + seen.slice(i, i + 7).join(''));
  // different seeds give different orders, same seed the same
  const a = E.create(1), b = E.create(1), c = E.create(2);
  assert(a.queue.join('') === b.queue.join(''), 'same seed same queue');
  assert(a.cur.t + a.queue.join('') !== c.cur.t + c.queue.join(''), 'different seeds differ');
}

// movement and walls
{
  const s = E.create(7);
  for (let i = 0; i < 12; i++) E.step(s, press('left'));
  const minX = Math.min(...E.CELLS[s.cur.t][s.cur.r].map(([x]) => x + s.cur.x));
  assert(minX === 0, 'piece stops at the left wall');
}

// wall kick: T rotating against the right wall kicks left instead of failing
{
  const s = E.create(3);
  s.cur = { t: 'T', r: 1, x: 8, y: 5 }; // vertical T hugging the right wall (cells at x 9,10? check fits)
  if (!E.fits(s, 'T', 1, 8, 5)) s.cur.x = 7;
  while (E.fits(s, 'T', s.cur.r, s.cur.x + 1, s.cur.y)) s.cur.x++;
  assert(E.rotate(s, 1), 'T rotates at the right wall');
  assert(s.cur.r === 2, 'rotation state advanced');
  for (const [x] of E.CELLS.T[2]) assert(x + s.cur.x < E.W, 'stays inside');
  // I piece vertical at the left wall rotates back to horizontal with a kick
  s.cur = { t: 'I', r: 1, x: -2, y: 5 };
  assert(E.fits(s, 'I', 1, -2, 5), 'vertical I at left wall fits');
  assert(E.rotate(s, 1), 'I kicks off the left wall');
  for (const [x] of E.CELLS.I[s.cur.r]) assert(x + s.cur.x >= 0, 'I inside after kick');
  // O never rotates
  s.cur = { t: 'O', r: 0, x: 4, y: 5 };
  assert(!E.rotate(s, 1), 'O does not rotate');
  // T-spin style kick into a slot: rotation uses the kick table, blocked rotation fails cleanly
  s.board = empty().fill(1); s.cur = { t: 'T', r: 0, x: 3, y: 5 };
  for (const [x, y] of E.CELLS.T[0]) s.board[(5 + y) * E.W + 3 + x] = 0;
  assert(!E.rotate(s, 1) && s.cur.r === 0, 'fully boxed-in T cannot rotate');
}

// line clears and scoring
{
  const s = E.create(5);
  s.board = empty();
  for (let y = E.H - 4; y < E.H; y++) for (let x = 0; x < E.W; x++) if (x !== 4) s.board[y * E.W + x] = 2;
  s.cur = { t: 'I', r: 1, x: 2, y: 0 }; // vertical I occupies column x+2 = 4
  const before = s.score;
  const ev = E.step(s, press('hard'));
  assert(ev.rows && ev.rows.length === 4, 'four rows cleared, got ' + (ev.rows && ev.rows.length));
  assert(s.board.every((c) => !c), 'board empty after the clear');
  const drop = ev.hardDrop * 2;
  assert(s.score - before === drop + 800 + 2000, 'four rows = 800 + perfect clear 2000 + drop, got ' + (s.score - before));
  assert(s.lines === 4, 'line count');
  // single at level 3
  s.level = 3; s.start = 3; s.lines = 0; s.combo = -1; s.b2b = false;
  for (let x = 0; x < E.W; x++) if (x < 3 || x > 6) s.board[(E.H - 1) * E.W + x] = 3;
  for (let x = 0; x < E.W; x++) s.board[(E.H - 2) * E.W + x] = x === 0 ? 3 : 0;
  s.cur = { t: 'I', r: 0, x: 3, y: 0 };
  const b2 = s.score, ev2 = E.step(s, press('hard'));
  assert(ev2.rows.length === 1, 'single');
  assert(s.score - b2 === ev2.hardDrop * 2 + 300, 'single = 100 × level 3, got ' + (s.score - b2 - ev2.hardDrop * 2));
}

// gravity, lock delay and levels
{
  const s = E.create(9);
  const y0 = s.cur.y;
  for (let i = 0; i < 61; i++) E.step(s, none);
  assert(s.cur.y === y0 + 1, 'level 1 falls one row per second, y ' + s.cur.y);
  assert(E.gravityMs(10) < E.gravityMs(5) && E.gravityMs(5) < E.gravityMs(1), 'gravity speeds up');
  // lock delay: piece sits on the floor ~LOCK_MS before locking
  const t = E.create(11); t.board = empty();
  while (E.down(t));
  const p = t.pieces; let n = 0;
  while (t.pieces === p && n < 200) { E.step(t, none); n++; }
  const ms = n * E.STEP_MS;
  assert(ms >= E.LOCK_MS - 20 && ms <= E.LOCK_MS + 40, 'lock after ~' + E.LOCK_MS + 'ms, got ' + ms.toFixed(0));
  // moving resets the lock timer but only a limited number of times
  const u = E.create(13); u.board = empty(); u.cur = { t: 'O', r: 0, x: 3, y: 0 };
  while (E.down(u));
  let steps = 0; const p2 = u.pieces;
  while (u.pieces === p2 && steps < 2000) { E.step(u, press(steps % 20 < 10 ? (steps % 2 ? 'left' : 'right') : 'none')); steps++; }
  assert(u.pieces === p2 + 1, 'piece locks eventually even when wiggled');
  // level up every 10 rows
  const v = E.create(1); v.lines = 9;
  v.board = empty(); for (let x = 0; x < E.W; x++) if (x < 3 || x > 6) v.board[(E.H - 1) * E.W + x] = 1;
  v.cur = { t: 'I', r: 0, x: 3, y: 0 };
  const ev = E.step(v, press('hard'));
  assert(v.level === 2 && ev.levelUp === 2, 'level 2 after 10 rows');
}

// hold: once per piece, swaps back
{
  const s = E.create(21);
  const first = s.cur.t, next = s.queue[0];
  E.step(s, press('hold'));
  assert(s.hold === first && s.cur.t === next, 'hold stores the piece and takes the next');
  E.step(s, press('hold'));
  assert(s.cur.t === next, 'second hold in a row is ignored');
  E.step(s, press('hard'));
  const now = s.cur.t;
  E.step(s, press('hold'));
  assert(s.cur.t === first && s.hold === now, 'hold swaps after a lock');
}

// game over when the stack reaches the top
{
  const s = E.create(4);
  s.board = empty();
  for (let y = 0; y < E.H; y++) for (let x = 0; x < E.W; x++) if (x !== 0) s.board[y * E.W + x] = 1;
  s.board.fill(0, 0, E.W * 2);
  let ev = {};
  for (let i = 0; i < 5 && !ev.over; i++) ev = E.step(s, press('hard'));
  assert(s.over, 'game over');
}

// save / restore round trip continues identically
{
  const a = E.create(77);
  const keys = ['left', 'right', 'cw', 'ccw', 'soft', 'hold', 'hard', 'none'];
  let r = { seed: 99 };
  for (let i = 0; i < 3000 && !a.over; i++) E.step(a, press(keys[Math.floor(E.rand(r) * keys.length)]));
  const json = JSON.stringify(E.save(a));
  const b = E.load(JSON.parse(json));
  assert(JSON.stringify(E.save(b)) === json, 'round trip is exact');
  r = { seed: 5 }; const r2 = { seed: 5 };
  for (let i = 0; i < 2000; i++) { E.step(a, press(keys[Math.floor(E.rand(r) * 8)])); E.step(b, press(keys[Math.floor(E.rand(r2) * 8)])); }
  assert(JSON.stringify(E.save(a)) === JSON.stringify(E.save(b)), 'restored game plays out identically');
  assert(E.load({ v: 0 }) === null && E.load(null) === null, 'bad saves rejected');
  console.log('save size', json.length, 'chars; score after random play', a.score);
}
console.log('blocks engine ok');
