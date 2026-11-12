// Worst-case saved data for Pinball: a full table state with every counter at its largest.
const T = require('../../games/pinball/table.js');
module.exports = () => {
  const s = T.newGame(4294967295);
  Object.assign(s, { t: 8640000.123456789, score: 999999999999, ballNum: 3, extra: 99, mult: 6, bonus: 99999999, banks: 99999, msg: 'Reef cleared +25,000', msgT: 1.2345678901234, charge: 0.123456789012345, saveT: 7.12345678901234, shake: 3.1234567890123, targetT: 1.123456789012345, unstuck: 99999, sens: 255 });
  s.ball = { x: 123.45678901234567, y: 456.7890123456789, vx: -1234.5678901234567, vy: 2345.678901234567, inPlay: true };
  s.fl = s.fl.map(() => ({ a: -0.45378560551852565, w: -23.999999999999996, hold: 0.04583333333333334 }));
  s.flash = s.flash.map(() => 0.11583333333333334);
  s.stuck = { x: 123.45678901234567, y: 456.7890123456789, t: 2.4958333333333336 };
  return { 'g.pinball.save': JSON.stringify(s), 'g.pinball.best': JSON.stringify(999999999999) };
};
