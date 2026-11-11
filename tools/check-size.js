// Fails if the app download or the worst-case saved data goes over budget.
// Run: node tools/check-size.js   (runs in CI on every push)
const fs = require('fs'), path = require('path');
const S = require('../sudoku.js');
const ROOT = path.join(__dirname, '..');
const BUDGET = 100 * 1024; // bytes for the app, characters for localStorage
let failed = false;
const report = (name, size) => {
  const ok = size <= BUDGET;
  if (!ok) failed = true;
  console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + ': ' + (size / 1024).toFixed(1) + ' KB of ' + BUDGET / 1024 + ' KB');
};

// 1. App: every file a browser can load, i.e. everything except dev-only files.
const DEV_ONLY = new Set(['.git', '.github', '.claude', '.gitignore', '.DS_Store', 'tools', 'README.md']);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .filter((e) => !DEV_ONLY.has(e.name))
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
report('app download', walk(ROOT).reduce((n, f) => n + fs.statSync(f).size, 0));

// 2. Saved data: MAX_SAVED games, every one as large as a game can get, using the limits from app.js.
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const constant = (name) => {
  const m = app.match(new RegExp('\\b' + name + ' = (\\d+)'));
  if (!m) throw new Error(name + ' not found in app.js');
  return +m[1];
};
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
  settings: { showMistakes: false, highlight: false, autoNotes: false, theme: 'system' },
};
report('saved data, worst case (' + MAX_SAVED + ' games, ' + MAX_UNDO + ' undo changes each)',
  'sudoku'.length + JSON.stringify(store).length + 'sudoku.theme'.length + 'system'.length);

process.exit(failed ? 1 : 0);
