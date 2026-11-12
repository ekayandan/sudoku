const E = require('../games/solo-test/engine.js');
let t = Date.now();
for (const id of ['english']) {
  const b = E.start(id);
  console.log(id, 'pegs', E.pegs(b), 'moves at start', E.moves(b).length);
  const sol = E.solve(b, { ms: 20000, target: id === 'english' ? 24 : -1 });
  if (!sol) throw new Error(id + ': no solution found (' + sol + ')');
  const p = b.slice();
  for (const m of sol) { if (!E.movesFrom(p, m.from).some((x) => x.to === m.to)) throw new Error('illegal move'); E.apply(p, m); }
  if (E.pegs(p) !== 1) throw new Error(id + ': did not finish with one peg');
  if (id === 'english' && p[24] !== 1) throw new Error('english: last peg not in centre');
  console.log(id, 'solved in', sol.length, 'moves,', Date.now() - t, 'ms'); t = Date.now();
}
if (E.moves(E.start('european')).length < 1) throw new Error('european has no opening move');
// an obviously lost position: two pegs far apart
const lost = E.start('english').map((v) => (v === -1 ? -1 : 0)); lost[2] = 1; lost[46] = 1;
if (E.solve(lost) !== null) throw new Error('lost position should be unsolvable');
console.log('solo-test engine ok');
