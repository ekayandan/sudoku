// Worst-case saved data for Pinball: a 4-ball multiball state on the biggest table with every counter at its largest,
// stored for every table (a paused game per table), plus the per-table high scores.
global.self = global;
const E = require('../../games/pinball/engine.js');
for (const f of ['base', 'deep-current', 'neon-drive', 'starfall']) require('../../games/pinball/tables/' + f + '.js');
module.exports = () => {
  const out = {};
  const bests = {};
  for (const T of Object.values(E.TABLES)) {
    const s = T.newGame(4294967295);
    const ball = () => ({ x: 123.45678901234567, y: 456.7890123456789, vx: -1234.5678901234567, vy: 2345.678901234567, inPlay: true, hold: 1.0123456789012345, sc: -2, sens: 4294967295, auto: 0.123456789012345, st: { x: 123.45678901234567, y: 456.7890123456789, t: 2.4958333333333336 } });
    Object.assign(s, { t: 8640000.123456789, score: 999999999999, ballNum: 3, extra: 99, mult: 6, bonus: 99999999, msg: 'JACKPOT 9,999,999,999', msgT: 1.2345678901234, charge: 0.123456789012345, saveT: 7.12345678901234, shake: 3.1234567890123, unstuck: 99999, queue: 3, mb: 1 });
    s.balls = [ball(), ball(), ball(), ball()];
    s.fl = s.fl.map(() => ({ a: -0.45378560551852565, w: -23.999999999999996, hold: 0.04583333333333334 }));
    s.flash = s.flash.map(() => 0.11583333333333334);
    s.spin = s.spin.map(() => 13.123456789012345); s.spinA = s.spinA.map(() => 999999.1234567890123);
    s.dropT = Object.fromEntries(T.drops.map((d) => [d.group, 1.123456789012345]));
    s.L = { banks: 99999, spins: 99, lock: 1, hole: 1, jx: 99999, pops: 999999 };
    out['g.pinball.save:' + T.id] = JSON.stringify(s);
    bests[T.id] = 999999999999;
    if (T.id === 'starfall') out['g.pinball.save'] = JSON.stringify({ table: T.id, s });
  }
  out['g.pinball.bests'] = JSON.stringify(bests);
  out['g.pinball.table'] = JSON.stringify('neon-drive');
  return out;
};
