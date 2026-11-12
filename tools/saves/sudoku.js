// Worst-case saved data for Sudoku. Returns { localStorageKey: valueString } (see tools/check-size.js).
const fs = require('fs'), path = require('path');
const S = require('../../games/sudoku/sudoku.js');
module.exports = function worstCase() {
  const src = fs.readFileSync(path.join(__dirname, '../../games/sudoku/game.js'), 'utf8');
  const constant = (name) => { const m = src.match(new RegExp('\\b' + name + ' = (\\d+)')); if (!m) throw new Error(name + ' not found'); return +m[1]; };
  const MAX_SAVED = constant('MAX_SAVED'), MAX_UNDO = constant('MAX_UNDO');
  const g = S.generate('expert');
  const puzzle = S.toString(g.puzzle), solution = S.toString(g.solution);
  const worstGame = (k) => ({
    id: Date.now().toString(36) + k, difficulty: 'expert', puzzle, solution,
    values: g.puzzle.map((v) => v || 9), notes: new Array(81).fill(1022), // every cell filled / every note on
    mistakes: 99999, hints: 99999, elapsed: 8640000000.123, done: false, updated: Date.now(),
    history: Array.from({ length: MAX_UNDO }, () => [{ i: 80, v: 9, n: 1022 }]), // one change per step = most overhead
  });
  const store = {
    games: Object.fromEntries(Array.from({ length: MAX_SAVED }, (_, k) => [k, worstGame(k)])),
    solved: { easy: 999999, medium: 999999, hard: 999999, expert: 999999 },
    settings: { showMistakes: false, highlight: false, autoNotes: false },
  };
  return { 'g.sudoku.store': JSON.stringify(store) };
};
