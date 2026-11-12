// Fails CI if the app or saved data goes over budget (docs/DESIGN.md §4).
// Run: node tools/check-size.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const KB = 1024;
const BUDGET = {
  appHard: 3 * KB * KB, appTarget: 1 * KB * KB,  // everything a browser can download
  shell: 100 * KB,                                // shell + shared code (no icons, no games)
  game: 150 * KB,                                 // each games/<id>/ folder (without a bundled engine/, below)
  engine: { chess: 2.5 * KB * KB },               // games/<id>/engine/: third-party engine binaries (Stockfish WASM)
  savePerGame: 100 * KB, saveTotal: 1 * KB * KB,  // characters in localStorage, worst case
};
let failed = false;
const report = (name, size, budget, warnAt) => {
  const ok = size <= budget;
  if (!ok) failed = true;
  const tag = !ok ? 'FAIL' : warnAt && size > warnAt ? 'warn' : 'ok  ';
  console.log(tag + ' ' + name + ': ' + (size / KB).toFixed(1) + ' KB of ' + (budget / KB).toFixed(0) + ' KB');
};
const DEV_ONLY = new Set(['.git', '.github', '.claude', '.gitignore', '.DS_Store', 'tools', 'docs', 'README.md', 'LICENSE', 'node_modules']);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .filter((e) => !DEV_ONLY.has(e.name))
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const size = (files) => files.reduce((n, f) => n + fs.statSync(f).size, 0);

const all = walk(ROOT);
report('app download (all games)', size(all), BUDGET.appHard, BUDGET.appTarget);
report('shell + shared code', size(all.filter((f) => !f.includes(path.sep + 'games' + path.sep) && !f.includes(path.sep + 'icons' + path.sep))), BUDGET.shell);

global.self = global; require(path.join(ROOT, 'games/registry.js'));
let saveTotal = 0;
for (const g of self.GAMES) {
  const dir = path.join(ROOT, 'games', g.id);
  const engineDir = path.join(dir, 'engine') + path.sep, files = walk(dir);
  report('game ' + g.id, size(files.filter((f) => !BUDGET.engine[g.id] || !f.startsWith(engineDir))), BUDGET.game);
  if (BUDGET.engine[g.id]) report('engine ' + g.id, size(files.filter((f) => f.startsWith(engineDir))), BUDGET.engine[g.id]);
  const worst = path.join(__dirname, 'saves', g.id + '.js');
  if (!fs.existsSync(worst)) { console.log('FAIL game ' + g.id + ': missing tools/saves/' + g.id + '.js (worst-case saved data)'); failed = true; continue; }
  const data = require(worst)();
  const n = Object.entries(data).reduce((s, [k, v]) => {
    if (!k.startsWith('g.' + g.id + '.')) { console.log('FAIL ' + g.id + ': storage key "' + k + '" is outside g.' + g.id + '.*'); failed = true; }
    return s + k.length + String(v).length;
  }, 0);
  saveTotal += n;
  report('saved data ' + g.id + ', worst case', n, BUDGET.savePerGame);
}
report('saved data, all games, worst case', saveTotal, BUDGET.saveTotal);
process.exit(failed ? 1 : 0);
