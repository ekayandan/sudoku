// Worst-case saved data for Mines: an Expert board mid-game (all mine indices, every cell's state) plus best times.
const E = require('../../games/mines/engine.js');
module.exports = () => {
  const { w, h, mines } = E.SIZES.expert, m = new Uint8Array(w * h);
  for (let i = w * h - mines; i < w * h; i++) m[i] = 1; // largest indices = longest packed form
  const s = { v: 1, size: 'expert', w, h, mines: E.pack(m), st: '2'.repeat(w * h), elapsed: 8640000000.123, over: 'lose', hit: w * h - 1 };
  return {
    'g.mines.save': JSON.stringify(s),
    'g.mines.best': JSON.stringify({ beginner: 8640000000, intermediate: 8640000000, expert: 8640000000 }),
    'g.mines.prefs': JSON.stringify({ flagMode: false, zoom: 2 }),
  };
};
