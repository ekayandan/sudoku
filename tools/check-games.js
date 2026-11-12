// Checks every game in games/registry.js is complete and keeps to the platform rules (docs/ADDING-A-GAME.md):
//   - folder, icon.svg and every listed file exist; game.js is listed first
//   - input code lives only in shared/input.js: games add no keyboard/pointer/touch/mouse/gamepad listeners
//   - games do not touch localStorage or the service worker directly (use ctx.storage)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.self = global; require(path.join(ROOT, 'games/registry.js'));
let failed = false;
const fail = (m) => { console.log('FAIL ' + m); failed = true; };
const ids = new Set();
const BANNED = [
  [/addEventListener\(\s*['"](key\w*|pointer\w*|touch\w*|mouse\w*|wheel|contextmenu|gamepad\w*)['"]/, 'input listener (use ctx.input)'],
  [/\bon(key\w+|pointer\w+|touch\w+|mouse\w+|contextmenu)\s*=/, 'input handler property (use ctx.input)'],
  [/navigator\.getGamepads/, 'gamepad access (use ctx.input)'],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, 'direct storage (use ctx.storage)'],
  [/serviceWorker/, 'service worker access'],
  [/\bfetch\(|XMLHttpRequest|WebSocket/, 'network access (games are offline)'],
];
for (const g of self.GAMES) {
  if (!/^[a-z0-9-]+$/.test(g.id)) fail(g.id + ': id must be lowercase letters, digits, dashes');
  if (ids.has(g.id)) fail(g.id + ': duplicate id'); ids.add(g.id);
  if (!g.name) fail(g.id + ': missing name');
  if (!Array.isArray(g.files) || g.files[0] !== 'game.js') fail(g.id + ': files must start with game.js');
  const dir = path.join(ROOT, 'games', g.id);
  for (const f of ['icon.svg', ...(g.files || [])]) if (!fs.existsSync(path.join(dir, f))) fail(g.id + ': missing ' + f);
  // engine/ holds unmodified third-party engine builds (e.g. Stockfish WASM, which loads its own .wasm): not game code
  for (const f of (g.files || []).filter((f) => f.endsWith('.js') && !f.startsWith('engine/'))) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const [re, what] of BANNED) if (re.test(line)) fail('games/' + g.id + '/' + f + ':' + (i + 1) + ' ' + what);
    });
  }
}
console.log(failed ? 'game checks failed' : 'game checks ok (' + self.GAMES.length + ' games)');
process.exit(failed ? 1 : 0);
