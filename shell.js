// App shell: home screen, routing (#/<game-id>), game lifecycle, storage, settings, backup, offline.
// Games are ES modules in games/<id>/game.js; see docs/ADDING-A-GAME.md for the contract.
import { createInput } from './shared/input.js';

const APP = 'pocket-games';
const $ = (s) => document.querySelector(s);
const GAMES = self.GAMES || [];
const byId = Object.fromEntries(GAMES.map((g) => [g.id, g]));

// ------------------------------------------------------------------ storage
const raw = {
  get(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const storageFor = (id) => ({
  get: (name, def) => raw.get('g.' + id + '.' + name, def),
  set: (name, v) => raw.set('g.' + id + '.' + name, v),
  remove: (name) => raw.del('g.' + id + '.' + name),
});

// One-time migration from the sudoku-only app (keys "sudoku", "sudoku.theme").
(function migrate() {
  if (raw.get('app.migrated', false)) return;
  const old = raw.get('sudoku', null);
  if (old && raw.get('g.sudoku.store', null) == null) {
    raw.set('g.sudoku.store', old);
    if (old.games && Object.keys(old.games).length) { raw.set('app.status', { sudoku: { text: 'In progress', pct: null, at: Date.now() } }); raw.set('app.last', 'sudoku'); }
  }
  try { const t = localStorage.getItem('sudoku.theme'); if (t && !raw.get('app.settings', null)) raw.set('app.settings', { theme: t }); } catch { /* ignore */ }
  raw.set('app.migrated', true);
})();

const settings = Object.assign({ theme: 'system', sound: false, haptics: true, launch: 'last' }, raw.get('app.settings', {}));
const saveSettings = () => { raw.set('app.settings', settings); try { localStorage.setItem('app.theme', settings.theme); } catch { /* ignore */ } };
const status = raw.get('app.status', {}); // id → { text, pct, at }  (pct 0..100 or null)
const saveStatus = () => raw.set('app.status', status);

// ------------------------------------------------------------------ theme
const THEMES = { system: null, light: '#f8fafc', dark: '#0f172a' };
const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
themeMetas.forEach((m) => { m.dataset.auto = m.content; });
function applyTheme() {
  const t = settings.theme, root = document.documentElement;
  if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
  themeMetas.forEach((m) => { m.content = THEMES[t] || m.dataset.auto; });
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeOpt === t)));
}
applyTheme(); saveSettings();

// ------------------------------------------------------------------ small UI services
const dialogOpen = () => !!document.querySelector('dialog[open]');
function confirmDialog(text, yesLabel = 'Yes', noLabel = 'Cancel') {
  return new Promise((resolve) => {
    $('#confirm-text').textContent = text;
    $('#confirm-yes').textContent = yesLabel; $('#confirm-no').textContent = noLabel;
    $('#confirm-no').hidden = !noLabel;
    const done = (v) => { $('#confirm').close(); resolve(v); };
    $('#confirm-yes').onclick = () => done(true);
    $('#confirm-no').onclick = () => done(false);
    $('#confirm').onclose = () => resolve(false);
    $('#confirm').showModal();
  });
}
let toastTimer = 0;
function toast(text, ms = 1800) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
let audioCtx = null;
const audio = {
  // tone(440, 80) — a short synthesized blip. Silent unless Sound is on in Settings.
  tone(freq = 440, ms = 80, type = 'square', vol = 0.05) {
    if (!settings.sound) return;
    try {
      audioCtx = audioCtx || new (self.AudioContext || self.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime;
      o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch { /* no audio */ }
  },
};
const haptics = (ms = 10) => { if (settings.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* ignore */ } };
// Small fast seedable PRNG (mulberry32). rng(seed) → () => float in [0, 1)
const rng = (seed = (Math.random() * 2 ** 32) >>> 0) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ------------------------------------------------------------------ home
function renderHome() {
  const last = raw.get('app.last', null);
  const lastGame = last && byId[last] && status[last] ? byId[last] : null;
  const cont = $('#btn-continue');
  cont.hidden = !lastGame;
  if (lastGame) {
    const st = status[lastGame.id];
    $('#continue-name').textContent = lastGame.name;
    $('#continue-info').textContent = st.text || '';
    $('#continue-bar').parentElement.hidden = st.pct == null;
    $('#continue-bar').style.width = (st.pct || 0) + '%';
    $('#continue-icon').src = 'games/' + lastGame.id + '/icon.svg';
  }
  const frag = document.createDocumentFragment();
  for (const g of GAMES) {
    const b = document.createElement('button');
    b.className = 'tile';
    b.innerHTML = '<img alt="" width="56" height="56"><b></b><span class="muted small"></span>';
    b.querySelector('img').src = 'games/' + g.id + '/icon.svg';
    b.querySelector('b').textContent = g.name;
    b.querySelector('span').textContent = status[g.id] ? status[g.id].text || 'In progress' : g.blurb || '';
    b.addEventListener('click', () => go(g.id));
    frag.appendChild(b);
  }
  $('#tiles').replaceChildren(frag);
}
$('#btn-continue').addEventListener('click', () => { const l = raw.get('app.last', null); if (l) go(l); });

// ------------------------------------------------------------------ running a game
let active = null; // { id, meta, mod, instance, input, ctx, root, paused, backHandlers }
const cssLoaded = new Set();
function loadCss(id, files) {
  for (const f of files) {
    if (!f.endsWith('.css') || cssLoaded.has(id + f)) continue;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'games/' + id + '/' + f;
    document.head.appendChild(l); cssLoaded.add(id + f);
  }
}

let opening = null; // id being loaded, so a second open of the same game (e.g. hashchange + boot) is ignored
async function openGame(id) {
  const meta = byId[id];
  if (!meta) return showHome();
  if ((active && active.id === id) || opening === id) return;
  closeGame();
  loadCss(id, meta.files || []);
  opening = id;
  let mod;
  try { mod = (await import('./games/' + id + '/game.js')).default; } catch (e) { console.error(e); opening = null; toast('Could not load ' + meta.name); return showHome(); }
  if (opening !== id) return; // another game was opened meanwhile
  opening = null;
  const root = document.createElement('div');
  root.className = 'game-root game-' + id;
  $('#play').replaceChildren(root);
  showScreen('play');
  document.title = meta.name;
  raw.set('app.last', id);

  const storage = storageFor(id);
  const a = { id, meta, mod, root, paused: false, backHandlers: [] };
  const decl = mod.input || { model: 'pointer', targets: '[data-target]' };
  a.input = createInput({
    root, decl,
    scheme: raw.get('app.scheme', {})[id],
    onScheme: (s) => { const m = raw.get('app.scheme', {}); m[id] = s; raw.set('app.scheme', m); },
    onSystem: (what) => { if (what === 'back') goBack(); if (what === 'help') showHelp(); },
    isBlocked: () => dialogOpen() || (a.paused && decl.model === 'action'),
    haptics: () => settings.haptics,
  });
  a.ctx = {
    id, root, input: a.input, storage,
    settings: Object.freeze({ ...settings, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }),
    audio, haptics, rng,
    ui: { confirm: confirmDialog, toast },
    setStatus(text, pct = null) { if (text == null) delete status[id]; else status[id] = { text, pct, at: Date.now() }; saveStatus(); },
    onBack(fn) { a.backHandlers.push(fn); },            // fn() → true if the game handled Back itself
    back: () => goBack(true),
    pause: () => pauseActive(true),
    requestPersistence() { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); },
  };
  active = a;
  try {
    a.instance = mod.create(a.ctx);
    a.instance.start(storage.get('save', null));
  } catch (e) { console.error(e); toast('Something went wrong in ' + meta.name); }
  // Arcade games reopen paused, behind "Tap to continue".
  if (decl.model === 'action' && storage.get('save', null) != null) pauseActive(true);
}

function persistActive() {
  if (!active || !active.instance) return;
  try {
    const s = active.instance.save && active.instance.save();
    if (s !== undefined) { if (s === null) active.ctx.storage.remove('save'); else active.ctx.storage.set('save', s); }
  } catch (e) { console.error(e); }
}
function pauseActive(showOverlay) {
  if (!active || active.paused) return;
  active.paused = true;
  active.input.releaseAll && active.input.releaseAll();
  try { active.instance.pause && active.instance.pause(); } catch (e) { console.error(e); }
  persistActive();
  if (showOverlay) showPauseOverlay();
}
function resumeActive() {
  if (!active || !active.paused) return;
  $('#pause').hidden = true;
  active.paused = false;
  try { active.instance.resume && active.instance.resume(); } catch (e) { console.error(e); }
}
function showPauseOverlay() {
  const ov = $('#pause'), a = active;
  $('#pause-schemes').replaceChildren(...(a.input.schemes || []).map((s) => {
    const b = document.createElement('button');
    b.textContent = { gestures: 'Swipe', console: 'Buttons', halves: 'Halves' }[s] || s;
    b.setAttribute('aria-pressed', String(a.input.scheme === s));
    b.addEventListener('click', (e) => { e.stopPropagation(); a.input.setScheme(s); showPauseOverlay(); });
    return b;
  }));
  $('#pause-controls').hidden = !(a.input.schemes && a.input.schemes.length > 1);
  ov.hidden = false;
}
$('#pause').addEventListener('click', (e) => { if (e.target.closest('button')) return; resumeActive(); });
$('#pause-resume').addEventListener('click', resumeActive);
$('#pause-home').addEventListener('click', () => goBack(true));
document.addEventListener('keydown', (e) => {
  if (!active || !active.paused || $('#pause').hidden || dialogOpen()) return;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'p' || e.key === 'P') { e.preventDefault(); resumeActive(); }
  else if (e.key === 'Escape') { e.preventDefault(); goBack(true); }
});

function closeGame() {
  if (!active) return;
  persistActive();
  try { active.instance && active.instance.destroy && active.instance.destroy(); } catch (e) { console.error(e); }
  active.input.destroy();
  $('#play').replaceChildren();
  $('#pause').hidden = true;
  active = null;
  document.title = 'Pocket Games';
}

function showHelp() {
  const h = active && active.mod.help;
  confirmDialog(h ? (Array.isArray(h) ? h.join('\n') : h) : 'No help for this game yet.', 'OK', null);
}

// ------------------------------------------------------------------ screens & navigation
function showScreen(name) {
  $('#home').hidden = name !== 'home';
  $('#play').hidden = name !== 'play';
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
}
function showHome() { opening = null; closeGame(); showScreen('home'); renderHome(); }
const route = () => decodeURIComponent((location.hash.match(/^#\/([\w-]+)/) || [])[1] || '');
let pushed = false; // true when the current #/game entry was added by go(), so history.back() stays inside the app
function go(id) { if (route() !== id) { history.pushState(null, '', '#/' + id); pushed = true; } openGame(id); }
function goBack(force) {
  if (!force && active) for (const fn of active.backHandlers) { try { if (fn()) return; } catch (e) { console.error(e); } }
  if (pushed && route()) history.back(); else { history.replaceState(null, '', location.pathname + location.search); showHome(); }
}
const onRoute = () => { const id = route(); if (id) openGame(id); else { pushed = false; showHome(); } };
window.addEventListener('popstate', onRoute);
window.addEventListener('hashchange', onRoute);

// ------------------------------------------------------------------ lifecycle
document.addEventListener('visibilitychange', () => {
  if (!active) return;
  if (document.hidden) {
    if (active.mod.input && active.mod.input.model === 'action') pauseActive(true); else { pauseActive(false); }
  } else if (!(active.mod.input && active.mod.input.model === 'action')) resumeActive();
});
window.addEventListener('pagehide', persistActive);
window.addEventListener('blur', () => { if (active && active.mod.input && active.mod.input.model === 'action') pauseActive(true); });

// ------------------------------------------------------------------ settings & backup
$('#btn-settings').addEventListener('click', () => {
  document.querySelectorAll('[data-setting]').forEach((cb) => { cb.checked = !!settings[cb.dataset.setting]; });
  $('#launch-last').checked = settings.launch === 'last';
  $('#settings').showModal();
});
document.querySelectorAll('[data-setting]').forEach((cb) => cb.addEventListener('change', () => { settings[cb.dataset.setting] = cb.checked; saveSettings(); }));
$('#launch-last').addEventListener('change', (e) => { settings.launch = e.target.checked ? 'last' : 'home'; saveSettings(); });
document.querySelectorAll('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => { settings.theme = b.dataset.themeOpt; saveSettings(); applyTheme(); }));
$('#settings-close').addEventListener('click', () => $('#settings').close());

$('#btn-backup').addEventListener('click', () => {
  persistActive();
  const data = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(g|app)\./.test(k)) data[k] = localStorage.getItem(k); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: APP, v: 1, data })], { type: 'application/json' }));
  a.download = APP + '-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#restore-file').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  let b = null; try { b = JSON.parse(await file.text()); } catch { /* not JSON */ }
  $('#settings').close();
  let data = null;
  if (b && b.app === APP && b.data && typeof b.data === 'object') data = b.data;
  else if (b && b.app === 'sudoku' && b.store && b.store.games) data = { 'g.sudoku.store': JSON.stringify(b.store) }; // old sudoku-only backups
  if (!data) return confirmDialog('That file is not a backup from this app.', 'OK', null);
  if (!(await confirmDialog('Replace the progress on this device with this backup?'))) return;
  closeGame();
  for (const k of Object.keys(localStorage)) if (/^(g|app)\./.test(k)) raw.del(k);
  for (const [k, v] of Object.entries(data)) if (/^(g|app)\./.test(k) && typeof v === 'string') try { localStorage.setItem(k, v); } catch { /* full */ }
  raw.set('app.migrated', true);
  location.replace(location.pathname);
});
document.querySelectorAll('dialog').forEach((dl) => dl.addEventListener('click', (e) => { if (e.target === dl) dl.close(); }));

// ------------------------------------------------------------------ install & offline
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
$('#ios-hint').hidden = !isIOS || navigator.standalone === true;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ------------------------------------------------------------------ boot
{
  const id = route(), last = raw.get('app.last', null);
  if (id) openGame(id);
  else if (settings.launch === 'last' && last && byId[last] && status[last]) { history.replaceState(null, '', location.pathname); showScreen('home'); renderHome(); go(last); }
  else showHome();
}
