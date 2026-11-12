// Worst-case saved data for Stackfall: a full board, long score/line counters, full bag and queue.
const E = require('../../games/blocks/engine.js');
module.exports = () => {
  const s = E.create(-123456789, 1);
  s.board = s.board.map((_, i) => 1 + (i % 7));
  Object.assign(s, { score: 999999999, lines: 99999, level: 9999, fall: 1234.5678901234, lock: 456.789012345678, steps: 9999999999, pieces: 9999999, combo: 99999 });
  s.bag = E.TYPES.split('');
  return { 'g.blocks.save': JSON.stringify(E.save(s)), 'g.blocks.best': JSON.stringify(999999999) };
};
