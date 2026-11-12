// Worst-case saved data for Chess: the longest possible game (about 5,950 moves under the 50-move rule = 11,900 plies),
// every ply written as a 5-character UCI promotion move, plus preferences.
module.exports = () => {
  const s = { v: 1, start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: Array(11900).fill('a7a8q').join(' '), human: 'b', level: 8, pref: 'r', resigned: true };
  return { 'g.chess.save': JSON.stringify(s), 'g.chess.prefs': JSON.stringify({ pref: 'r', level: 8 }) };
};
