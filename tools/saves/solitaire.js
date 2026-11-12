// Worst-case saved data for Solitaire: a full game with the undo history at its cap (HIST_CAP in game.js).
const K = require('../../games/solitaire/engine.js');
module.exports = () => {
  const st = K.deal(4294967295, 3);
  const hist = Array.from({ length: 1500 }, () => [10, 6, 12, 1]);
  const s = { v: 1, seed: 4294967295, st, hist, moves: 999999, elapsed: 8640000000.123, won: false, counted: true };
  const stats = { 1: { played: 99999, won: 99999, best: 8640000000 }, 3: { played: 99999, won: 99999, best: 8640000000 } };
  return { 'g.solitaire.save': JSON.stringify(s), 'g.solitaire.stats': JSON.stringify(stats), 'g.solitaire.next': JSON.stringify({ 1: 4294967295, 3: 4294967295 }) };
};
