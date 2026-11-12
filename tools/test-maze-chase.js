// Node tests for the Maze Chase engine (games/maze-chase/engine.js).
const E = require('../games/maze-chase/engine.js');
const assert = (c, m) => { if (!c) throw new Error(m); };
const { COLS } = E;

// 1. mazes: valid, every seed reachable, tunnels connect, no dead ends
assert(E.MAZES.length >= 3, 'need at least 3 mazes');
for (const m of E.MAZES) {
  const errs = E.validate(m);
  assert(!errs.length, m.name + ': ' + errs.join('; '));
  let tunnels = 0;
  for (let y = 0; y < E.ROWS; y++) if (E.open(m, 0, y)) { tunnels++; assert(E.open(m, COLS - 1, y) && E.open(m, -1, y), m.name + ' tunnel row ' + y); }
  assert(tunnels >= 1, m.name + ': no tunnel');
}
console.log('mazes ok:', E.MAZES.map((m) => m.name + ' ' + (m.dots.match(/[12]/g) || []).length + ' seeds').join(', '));

const play = (st, want, n) => { for (let i = 0; i < n; i++) E.step(st, typeof want === 'function' ? want(st) : want); };
const fresh = (seed = 1) => { const st = E.newGame(seed); st.mode = 'play'; st.modeT = 0; return st; };
const freezeBots = (st) => { for (const g of st.chasers) { g.mode = 'den'; g.rel = 1e9; g.x = 9; g.y = 10.5; } };

// 2. hero moves left from start, and stops at walls on the tile centre
{
  const st = fresh(); freezeBots(st);
  const x0 = st.hero.x;
  play(st, null, 30);
  assert(st.hero.x < x0 - 2, 'hero moves left at start');
  assert(st.hero.y === E.MAZES[0].start.y, 'stays on its row');
  play(st, null, 120);
  assert(Number.isInteger(st.hero.x) && !st.hero.moving, 'stopped on a tile centre at a wall: ' + st.hero.x);
}

// 3. buffered turn: pressing "down" early turns at the next opening, not before
{
  const st = fresh(); freezeBots(st);
  const m = E.MAZES[0];
  // Garden row 17: hero starts at x=9 going left; first opening down is x=6 (row 18 col 6)
  const by = m.start.y + 1;
  assert(!E.open(m, 8, by) && !E.open(m, 7, by) && E.open(m, 6, by), 'test assumes Garden layout');
  let turnedAt = null;
  play(st, (s) => { if (turnedAt === null && s.hero.dir === 'down') turnedAt = s.hero.x; return 'down'; }, 60);
  assert(turnedAt !== null && Math.abs(turnedAt - 6) <= E.TOL + 0.01, 'turned down at the x=6 junction, got ' + turnedAt);
  assert(st.hero.y > m.start.y + 0.5, 'went down');
  assert(Math.abs(st.hero.x - 6) < 1e-9, 'snapped onto the corridor centre line');
}

// 4. corner tolerance: a turn pressed just past a junction is still taken
{
  const st = fresh(); freezeBots(st);
  st.hero.x = 6 - 0.3; st.hero.dir = 'left';
  play(st, 'down', 1);
  assert(st.hero.dir === 'down', 'late turn accepted within tolerance');
  const st2 = fresh(); freezeBots(st2);
  st2.hero.x = 6 - 0.6; st2.hero.dir = 'left';
  play(st2, 'down', 1);
  assert(st2.hero.dir === 'left', 'too late: no turn');
}

// 5. reverse is immediate
{
  const st = fresh(); freezeBots(st);
  play(st, null, 10);
  play(st, 'right', 1);
  assert(st.hero.dir === 'right', 'reverse at once');
}

// 6. tunnel wraps
{
  const st = fresh(); freezeBots(st);
  let ty = 0; while (!E.open(E.MAZES[0], 0, ty)) ty++;
  st.hero.x = 1; st.hero.y = ty; st.hero.dir = 'left';
  play(st, 'left', 40);
  assert(st.hero.x > 12, 'came out on the right side: ' + st.hero.x);
}

// 7. chaser targeting
{
  const st = fresh();
  st.phase = 1; // chase
  st.hero.x = 9; st.hero.y = 21; st.hero.dir = 'left';
  st.chasers[0].x = 3; st.chasers[0].y = 4;
  const t0 = E.target(st, 0), t1 = E.target(st, 1), t2 = E.target(st, 2);
  assert(t0.x === 9 && t0.y === 21, 'Dart targets the hero');
  assert(t1.x === 5 && t1.y === 21, 'Snare targets 4 tiles ahead');
  assert(t2.x === 2 * 7 - 3 && t2.y === 2 * 21 - 4, 'Pincer doubles the vector from Dart');
  st.chasers[3].x = 1; st.chasers[3].y = 1;
  assert(E.target(st, 3).x === 9, 'Drift chases from afar');
  st.chasers[3].x = 8; st.chasers[3].y = 21;
  assert(E.target(st, 3) === null, 'Drift wanders when close');
  st.phase = 0;
  assert(E.target(st, 0) === E.CORNERS[0], 'scatter goes to the corner');
}

// 8. bots leave the den and roam; Dart reaches the hero area
{
  const st = fresh(3);
  st.hero.x = 9; st.hero.y = E.MAZES[0].start.y; // hero sits still: aim straight at it
  for (const g of st.chasers) g.rel = 0;
  let out = 0;
  for (let i = 0; i < 60 * 8 && st.mode === 'play'; i++) { st.hero.dir = 'left'; E.step(st, null); st.hero.x = 9; out = st.chasers.filter((g) => g.mode === 'out').length; }
  assert(out === 4 || st.mode === 'dying', 'all bots left the den');
  for (const g of st.chasers) if (g.mode === 'out') assert(E.open(E.MAZES[0], Math.round(g.x), Math.round(g.y)), 'bot on a path');
}

// 9. collisions: death, and eating a scared bot
{
  const st = fresh(); freezeBots(st);
  const g = st.chasers[0]; g.mode = 'out'; g.x = st.hero.x - 1; g.y = st.hero.y; g.dir = 'right';
  play(st, null, 10);
  assert(st.mode === 'dying', 'touching a bot kills');
  const lives = st.lives;
  play(st, null, 120);
  assert(st.lives === lives - 1 && st.mode === 'ready', 'lost a life and respawned');

  const s2 = fresh(); freezeBots(s2);
  const b = s2.chasers[1]; b.mode = 'out'; b.fr = true; b.x = s2.hero.x - 1; b.y = s2.hero.y; b.dir = 'right'; s2.frT = 5;
  const sc = s2.score;
  play(s2, null, 10);
  assert(s2.mode === 'play' && b.mode === 'eaten' && s2.score >= sc + 200, 'ate a scared bot');
  play(s2, null, 60 * 6);
  assert(b.mode !== 'eaten', 'eaten bot got home: ' + b.mode);
}

// 10. power star scares everyone, and it wears off
{
  const st = fresh(); freezeBots(st);
  st.chasers[0].mode = 'out'; st.chasers[0].x = 1; st.chasers[0].y = 1; st.chasers[0].dir = 'right';
  const m = E.MAZES[0];
  const i = m.dots.indexOf('2'); st.hero.x = i % COLS; st.hero.y = Math.floor(i / COLS);
  E.step(st, null);
  assert(st.frT > 0 && st.chasers.every((g) => g.fr), 'all scared');
  play(st, null, Math.ceil(E.frightTime(st) * 60) + 60);
  assert(st.frT === 0 && st.chasers.every((g) => !g.fr), 'scare wears off');
}

// 11. clearing the level goes to the next maze
{
  const st = fresh(); freezeBots(st);
  const m = E.MAZES[0];
  st.dots = '0'.repeat(m.dots.length); const i = (st.hero.y) * COLS + st.hero.x - 1;
  st.dots = st.dots.slice(0, i) + '1' + st.dots.slice(i + 1); st.left = 1;
  play(st, null, 20);
  assert(st.mode === 'clear', 'level clear');
  play(st, null, 60 * 3);
  assert(st.level === 2 && st.maze === 1 && st.left > 100, 'level 2 on the next maze');
}

// 12. save/restore round-trip: identical futures
{
  const st = fresh(42);
  const dirs = ['left', 'up', 'right', 'down'];
  const pilot = (s) => dirs[Math.floor(s.t * 0.7) % 4];
  play(st, pilot, 60 * 20);
  const copy = E.restore(JSON.parse(JSON.stringify(E.save(st))));
  assert(copy, 'restore');
  play(st, pilot, 60 * 30); play(copy, pilot, 60 * 30);
  assert(JSON.stringify(E.save(st)) === JSON.stringify(E.save(copy)), 'restored game evolves identically');
  assert(E.restore({ v: 99 }) === null && E.restore(null) === null, 'bad saves rejected');
}

// 13. long random play: no NaN, nothing walks through walls, game ends eventually
{
  for (let seed = 1; seed <= 5; seed++) {
    const st = E.newGame(seed);
    const dirs = ['left', 'up', 'right', 'down'];
    let want = 'left';
    for (let i = 0; i < 60 * 300 && st.mode !== 'over'; i++) {
      if (i % 37 === 0) want = dirs[(i * 7 + seed) % 4];
      E.step(st, want);
      const m = E.MAZES[st.maze];
      for (const e of [st.hero, ...st.chasers.filter((g) => g.mode === 'out' || g.mode === 'eaten')]) {
        assert(Number.isFinite(e.x) && Number.isFinite(e.y), 'finite');
        assert(E.tileAt(m, Math.round(e.x), Math.round(e.y)) === 0, 'in a wall at ' + e.x + ',' + e.y + ' seed ' + seed);
      }
    }
    assert(st.score > 0, 'scored');
  }
}
// 14. a seed-seeking pilot clears all three mazes when the bots stay home (the hero can physically reach everything)
{
  const st = fresh(7); freezeBots(st);
  const D = ['up', 'left', 'down', 'right'];
  const nextDir = (s) => {
    const m = E.MAZES[s.maze], sx = ((Math.round(s.hero.x) % COLS) + COLS) % COLS, sy = Math.round(s.hero.y);
    const seen = new Map([[sy * COLS + sx, null]]), q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      if (s.dots[y * COLS + x] !== '0') { let k = y * COLS + x, d = null; while (seen.get(k)) { d = seen.get(k); k = d[1]; } return d ? d[0] : null; }
      for (const d of D) {
        const nx = (x + E.DX[d] + COLS) % COLS, ny = y + E.DY[d];
        if (E.open(m, nx, ny) && !seen.has(ny * COLS + nx)) { seen.set(ny * COLS + nx, [d, y * COLS + x]); q.push([nx, ny]); }
      }
    }
    return null;
  };
  let want = null;
  for (let i = 0; i < 60 * 600 && st.level < 4; i++) {
    const h = st.hero;
    if (Math.abs(h.x - Math.round(h.x)) < 0.13 && Math.abs(h.y - Math.round(h.y)) < 0.13) want = nextDir(st) || want;
    E.step(st, want);
    if (st.mode === 'ready' && st.chasers[0].mode === 'out') freezeBots(st);
    assert(st.mode !== 'dying', 'no deaths with bots at home');
  }
  assert(st.level === 4, 'pilot cleared 3 mazes, at level ' + st.level + ' with ' + st.left + ' left');
  console.log('pilot cleared all mazes in', st.t.toFixed(0), 's of game time');
}
console.log('maze-chase engine ok');
