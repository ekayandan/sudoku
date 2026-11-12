// Sudoku game module. Engine: ./sudoku.js (also used by tools/test-engine.js in Node).
import './sudoku.js';

const S = self.Sudoku;
const DIFFS = S.DIFFICULTIES;
const LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
// Saved data must stay under 100 KB in the worst case (checked in CI by tools/check-size.js):
// MAX_SAVED games (least recently played dropped first), each keeping its last MAX_UNDO cell changes.
const MAX_SAVED = 20, MAX_UNDO = 150;

const ICON = {
  back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  restart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  erase: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H8l-5-5a2 2 0 0 1 0-3l9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 9"/><path d="M6 11l7 7"/></svg>',
  notes: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  hint: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
};

const TEMPLATE = `
  <main class="screen sg-home">
    <header class="topbar">
      <button class="icon-btn" data-act="app-back" aria-label="All games">${ICON.back}</button>
      <h2>Sudoku</h2><span class="spacer"></span>
    </header>
    <nav class="menu">
      <button data-act="continue" class="card primary" hidden>
        <span class="menu-title">Continue</span><span class="small sg-continue-info"></span>
        <span class="bar"><i class="sg-continue-bar"></i></span>
      </button>
      <button data-act="saved" class="card" hidden><span class="menu-title">Continue…</span></button>
      <button data-act="new" class="card"><span class="menu-title">New game</span></button>
      <button data-act="settings" class="card"><span class="menu-title">Sudoku settings</span></button>
    </nav>
  </main>

  <main class="screen sg-saved" hidden>
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${ICON.back}</button>
      <h2>Active games</h2><span class="spacer"></span>
    </header>
    <div class="saved-list"></div>
    <p class="muted sg-saved-empty" hidden>No active games.</p>
  </main>

  <main class="screen sg-game" hidden>
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Back">${ICON.back}</button>
      <div class="game-title">
        <div class="sg-name"></div>
        <div class="muted small"><span class="sg-timer">0:00</span><span class="sg-mistakes-wrap"> · <span class="sg-mistakes">0 mistakes</span></span></div>
      </div>
      <button class="icon-btn" data-act="restart" aria-label="Restart">${ICON.restart}</button>
    </header>
    <div class="board" role="grid" aria-label="Sudoku board"></div>
    <div class="tools">
      <button class="tool" data-act="undo">${ICON.undo}<span>Undo</span></button>
      <button class="tool" data-act="erase">${ICON.erase}<span>Erase</span></button>
      <button class="tool" data-act="notes" aria-pressed="false">${ICON.notes}<span>Notes <b class="sg-notes-state">off</b></span></button>
      <button class="tool" data-act="hint">${ICON.hint}<span>Hint</span></button>
    </div>
    <div class="pad"></div>
  </main>

  <dialog class="modal sg-win">
    <h2>Solved! 🎉</h2>
    <p class="muted sg-win-stats"></p>
    <div class="modal-actions">
      <button data-act="win-home" class="pill">Sudoku menu</button>
      <button data-act="win-next" class="pill primary"></button>
    </div>
  </dialog>
  <dialog class="modal sg-newgame">
    <h2>New game</h2>
    <div class="diff-list"></div>
    <div class="modal-actions"><button data-act="close" class="pill">Cancel</button></div>
  </dialog>
  <dialog class="modal sg-settings">
    <h2>Sudoku settings</h2>
    <label class="toggle"><input type="checkbox" data-setting="showMistakes"> Show mistakes in red</label>
    <label class="toggle"><input type="checkbox" data-setting="highlight"> Highlight row, column, box and same numbers</label>
    <label class="toggle"><input type="checkbox" data-setting="autoNotes"> Remove notes automatically</label>
    <div class="modal-actions"><button data-act="close" class="pill primary">Done</button></div>
  </dialog>`;

const digitKeys = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [String(d), 'digit:' + d]));

export default {
  id: 'sudoku',
  name: 'Sudoku',
  saveVersion: 1,
  input: {
    model: 'pointer',
    targets: '.cell',
    focusRing: false, // the selected cell is already highlighted
    wrap: true,
    keys: { ...digitKeys, 0: 'erase', Backspace: 'erase', Delete: 'erase', n: 'notes' },
  },
  help: [
    'Tap a cell, then a number.',
    'Keyboard: arrows move, 1–9 enter, Backspace erases, N toggles notes, Ctrl/Cmd+Z undoes, H gives a hint, Esc goes back.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  root.innerHTML = TEMPLATE;
  const $ = (s) => root.querySelector(s);
  const store = Object.assign({ games: {}, solved: {} }, ctx.storage.get('store', {}));
  store.settings = Object.assign({ showMistakes: true, highlight: true, autoNotes: true }, store.settings);
  delete store.settings.theme; // theme moved to the app settings
  for (const d of DIFFS) store.solved[d] = store.solved[d] || 0;

  const savedGames = () => Object.values(store.games).sort((a, b) => b.updated - a.updated);
  const prune = () => { for (const g of savedGames().slice(MAX_SAVED)) delete store.games[g.id]; };
  const filledPct = (g) => {
    let given = 0, ok = 0;
    for (let i = 0; i < 81; i++) { if (g.puzzle[i] !== '0') given++; else if (g.values[i]) ok++; }
    return Math.round((ok / (81 - given)) * 100);
  };
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
  };
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  };
  function persist() {
    ctx.storage.set('store', store);
    const last = savedGames()[0];
    ctx.setStatus(last ? LABEL[last.difficulty] + ' · ' + filledPct(last) + '%' : null, last ? filledPct(last) : null);
  }

  // ---------- game state ----------
  let game = null, selected = -1, notesMode = false, screen = 'home', paused = false;
  const isGiven = (i) => game.puzzle[i] !== '0';

  function newGame(difficulty, puzzle, solution, id) {
    game = {
      id: id || Date.now().toString(36), difficulty, puzzle, solution,
      values: S.toArray(puzzle), notes: new Array(81).fill(0),
      mistakes: 0, hints: 0, elapsed: 0, history: [], done: false, updated: Date.now(),
    };
    store.games[game.id] = game;
    prune(); persist();
    select(game.values.findIndex((v) => !v));
    notesMode = false;
    showGame();
    ctx.requestPersistence();
  }
  function resume(id) {
    game = store.games[id];
    if (!game) return;
    game.updated = Date.now(); persist();
    selected = -1; notesMode = false;
    showGame();
  }
  function startNew(d) { let g = null; while (!g) g = S.generate(d); newGame(d, S.toString(g.puzzle), S.toString(g.solution)); }
  function select(i) { selected = i; if (i >= 0) input.focus(cells[i]); }

  // ---------- moves ----------
  function commit(changes) {
    if (!changes.length) return;
    game.history.push(changes);
    while (game.history.reduce((n, c) => n + c.length, 0) > MAX_UNDO) game.history.shift();
    afterMove();
  }
  const snapshot = (changes, j) => changes.push({ i: j, v: game.values[j], n: game.notes[j] });
  function clearPeerNotes(changes, i, val) {
    if (!store.settings.autoNotes) return;
    const bit = 1 << val;
    for (const p of S.PEERS[i]) if (game.notes[p] & bit) { snapshot(changes, p); game.notes[p] &= ~bit; }
  }
  function setValue(i, val) {
    if (!game || game.done || i < 0 || isGiven(i)) return;
    const changes = [];
    if (val === 0) {
      if (!game.values[i] && !game.notes[i]) return;
      snapshot(changes, i); game.values[i] = 0; game.notes[i] = 0;
    } else if (game.values[i] === val) {
      snapshot(changes, i); game.values[i] = 0;
    } else {
      snapshot(changes, i); game.values[i] = val; game.notes[i] = 0;
      if (val !== +game.solution[i]) { game.mistakes++; if (store.settings.showMistakes) ctx.haptics(40); }
      else flashUnits(i);
      clearPeerNotes(changes, i, val);
    }
    commit(changes);
  }
  function toggleNote(i, d) {
    if (!game || game.done || i < 0 || isGiven(i) || game.values[i]) return;
    const changes = []; snapshot(changes, i);
    game.notes[i] ^= 1 << d;
    commit(changes);
  }
  function enter(d) {
    if (selected < 0) return;
    if (notesMode && !game.values[selected]) toggleNote(selected, d); else setValue(selected, d);
  }
  function undo() {
    if (!game || game.done) return;
    const changes = game.history.pop();
    if (!changes) return;
    for (let k = changes.length - 1; k >= 0; k--) { const c = changes[k]; game.values[c.i] = c.v; game.notes[c.i] = c.n; }
    select(changes[0].i);
    afterMove();
  }
  function hint() {
    if (!game || game.done) return;
    const needs = (i) => game.values[i] !== +game.solution[i];
    let target = selected >= 0 && !isGiven(selected) && needs(selected) ? selected : -1;
    if (target < 0) { // the empty cell with the fewest possibilities: the most "logical" next step
      let best = 10;
      for (let i = 0; i < 81; i++) {
        if (!needs(i)) continue;
        const used = new Set(); for (const p of S.PEERS[i]) if (game.values[p]) used.add(game.values[p]);
        if (9 - used.size < best) { best = 9 - used.size; target = i; }
      }
    }
    if (target < 0) return;
    const val = +game.solution[target], changes = [];
    snapshot(changes, target); game.values[target] = val; game.notes[target] = 0;
    clearPeerNotes(changes, target, val);
    game.hints++; select(target);
    flashUnits(target);
    commit(changes);
  }
  let flashing = [];
  function flashUnits(i) {
    const units = [S.UNITS[S.ROW[i]], S.UNITS[9 + S.COL[i]], S.UNITS[18 + S.BOX[i]]];
    const vals = game.values.slice(); vals[i] = +game.solution[i];
    for (const u of units) if (u.every((j) => vals[j] === +game.solution[j])) flashing.push(...u);
    if (flashing.length) setTimeout(() => { flashing = []; renderBoard(); }, 450);
  }
  function afterMove() {
    game.updated = Date.now();
    if (game.values.join('') === game.solution) win();
    persist();
    renderGame();
  }
  function win() {
    game.done = true;
    const d = game.difficulty;
    store.solved[d]++;
    delete store.games[game.id]; persist();
    const parts = [fmt(game.elapsed), game.mistakes === 1 ? '1 mistake' : game.mistakes + ' mistakes'];
    if (game.hints) parts.push(game.hints === 1 ? '1 hint' : game.hints + ' hints');
    $('.sg-win-stats').textContent = LABEL[d] + ' — ' + parts.join(' · ');
    const next = $('[data-act="win-next"]');
    next.textContent = 'New ' + LABEL[d] + ' game';
    next.onclick = () => { $('.sg-win').close(); startNew(d); };
    ctx.audio.tone(660, 120, 'triangle');
    setTimeout(() => $('.sg-win').showModal(), 500);
  }

  // ---------- rendering ----------
  const boardEl = $('.board'), padEl = $('.pad');
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.setAttribute('role', 'gridcell');
    el.dataset.i = i;
    boardEl.appendChild(el); cells.push(el);
  }
  const padBtns = [];
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.innerHTML = d + '<small></small>';
    b.setAttribute('aria-label', String(d));
    b.addEventListener('click', () => enter(d));
    padEl.appendChild(b); padBtns.push(b);
  }

  function renderBoard() {
    if (!game) return;
    const st = store.settings, sel = selected, sv = sel >= 0 ? game.values[sel] : 0;
    const flashSet = new Set(flashing);
    for (let i = 0; i < 81; i++) {
      const v = game.values[i];
      let cls = 'cell r' + S.ROW[i] + ' c' + S.COL[i];
      if (isGiven(i)) cls += ' given';
      if (flashSet.has(i)) cls += ' flash';
      else if (i === sel) cls += ' selected';
      else if (st.highlight && sv && v === sv) cls += ' same';
      else if (st.highlight && sel >= 0 && (S.ROW[i] === S.ROW[sel] || S.COL[i] === S.COL[sel] || S.BOX[i] === S.BOX[sel])) cls += ' peer';
      if (v && st.showMistakes && !isGiven(i) && v !== +game.solution[i]) cls += ' wrong';
      const el = cells[i];
      if (el.className !== cls) el.className = cls;
      let html;
      if (v) html = String(v);
      else if (game.notes[i]) {
        html = '<div class="notes">';
        for (let d = 1; d <= 9; d++) {
          const has = game.notes[i] & (1 << d);
          html += '<span' + (has && st.highlight && d === sv ? ' class="hl"' : '') + '>' + (has ? d : '') + '</span>';
        }
        html += '</div>';
      } else html = '';
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
    }
  }
  function renderGame() {
    if (!game) return;
    renderBoard();
    const counts = new Array(10).fill(0);
    game.values.forEach((v, i) => { if (v && v === +game.solution[i]) counts[v]++; });
    padBtns.forEach((b, k) => {
      const left = 9 - counts[k + 1];
      b.classList.toggle('done', left === 0);
      b.querySelector('small').textContent = left;
    });
    $('.sg-name').textContent = LABEL[game.difficulty];
    $('.sg-mistakes').textContent = game.mistakes + (game.mistakes === 1 ? ' mistake' : ' mistakes');
    $('.sg-mistakes-wrap').hidden = !store.settings.showMistakes;
    $('.sg-timer').textContent = fmt(game.elapsed);
    $('[data-act="notes"]').setAttribute('aria-pressed', String(notesMode));
    $('.sg-notes-state').textContent = notesMode ? 'on' : 'off';
    $('.sg-game').classList.toggle('notes-on', notesMode);
  }
  function renderHome() {
    const saved = savedGames(), last = saved[0];
    $('[data-act="continue"]').hidden = !last;
    $('[data-act="saved"]').hidden = saved.length < 2;
    $('[data-act="new"]').classList.toggle('primary', !last);
    if (last) {
      $('.sg-continue-info').textContent = LABEL[last.difficulty] + ' · ' + filledPct(last) + '% · ' + fmt(last.elapsed);
      $('.sg-continue-bar').style.width = filledPct(last) + '%';
    }
  }
  function renderSaved() {
    const saved = savedGames();
    $('.sg-saved-empty').hidden = !!saved.length;
    const frag = document.createDocumentFragment();
    for (const g of saved) {
      const row = document.createElement('div');
      row.className = 'saved-row';
      const open = document.createElement('button');
      open.className = 'saved-open';
      open.innerHTML = '<span class="saved-name"></span><span class="muted small"></span><span class="bar"><i style="width:' + filledPct(g) + '%"></i></span>';
      open.querySelector('.saved-name').textContent = LABEL[g.difficulty];
      open.querySelector('.muted').textContent = filledPct(g) + '% · ' + fmt(g.elapsed) + ' · ' + ago(g.updated);
      open.addEventListener('click', () => resume(g.id));
      const del = document.createElement('button');
      del.className = 'icon-btn saved-del'; del.setAttribute('aria-label', 'Delete saved game'); del.textContent = '×';
      del.addEventListener('click', async () => {
        if (await ctx.ui.confirm('Delete this ' + LABEL[g.difficulty] + ' game (' + filledPct(g) + '% done)?')) { delete store.games[g.id]; persist(); renderSaved(); }
      });
      row.append(open, del);
      frag.appendChild(row);
    }
    $('.saved-list').replaceChildren(frag);
  }
  function openNewGame() {
    const frag = document.createDocumentFragment();
    for (const d of DIFFS) {
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = '<b></b><span class="muted small"></span>';
      b.querySelector('b').textContent = LABEL[d];
      b.querySelector('span').textContent = store.solved[d] ? store.solved[d] + ' solved' : '';
      b.addEventListener('click', () => { $('.sg-newgame').close(); startNew(d); });
      frag.appendChild(b);
    }
    $('.diff-list').replaceChildren(frag);
    $('.sg-newgame').showModal();
  }

  // ---------- screens ----------
  function setScreen(name) {
    screen = name;
    for (const n of ['home', 'saved', 'game']) $('.sg-' + n).hidden = n !== name;
    if (name === 'home') renderHome();
    if (name === 'saved') renderSaved();
  }
  function showGame() {
    setScreen('game');
    if (selected < 0 || selected > 80) select(game.values.findIndex((v) => !v));
    lastTick = performance.now();
    renderGame();
  }
  ctx.onBack(() => { if (screen === 'home') return false; persist(); setScreen('home'); return true; });

  // ---------- input (control layer) ----------
  input.on('select', (el) => { if (screen !== 'game' || !game) return; selected = +el.dataset.i; renderBoard(); });
  input.on('command', (name) => {
    if (screen !== 'game' || !game) return;
    if (name.startsWith('digit:')) enter(+name.slice(6));
    else if (name === 'erase') setValue(selected, 0);
    else if (name === 'notes') { notesMode = !notesMode; renderGame(); }
    else if (name === 'undo') undo();
    else if (name === 'hint') hint();
  });

  // ---------- buttons ----------
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'app-back': ctx.back(); break;
      case 'back': persist(); setScreen('home'); break;
      case 'continue': { const g = savedGames()[0]; if (g) resume(g.id); break; }
      case 'saved': setScreen('saved'); break;
      case 'new': openNewGame(); break;
      case 'settings':
        root.querySelectorAll('[data-setting]').forEach((cb) => { cb.checked = !!store.settings[cb.dataset.setting]; });
        $('.sg-settings').showModal(); break;
      case 'close': b.closest('dialog').close(); break;
      case 'restart':
        if (game && !game.done && await ctx.ui.confirm('Restart this puzzle from the beginning?')) newGame(game.difficulty, game.puzzle, game.solution, game.id);
        break;
      case 'undo': undo(); break;
      case 'erase': setValue(selected, 0); break;
      case 'notes': notesMode = !notesMode; renderGame(); break;
      case 'hint': hint(); break;
      case 'win-home': $('.sg-win').close(); setScreen('home'); break;
    }
  });
  root.querySelectorAll('[data-setting]').forEach((cb) => cb.addEventListener('change', () => { store.settings[cb.dataset.setting] = cb.checked; persist(); if (game) renderGame(); }));
  root.querySelectorAll('dialog').forEach((dl) => dl.addEventListener('click', (e) => { if (e.target === dl) dl.close(); }));

  // ---------- timer ----------
  let lastTick = performance.now(), ticks = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    if (screen === 'game' && game && !game.done && !paused && !root.querySelector('dialog[open]')) {
      game.elapsed += Math.min(now - lastTick, 2000);
      $('.sg-timer').textContent = fmt(game.elapsed);
      if (++ticks % 10 === 0) persist();
    }
    lastTick = now;
  }, 500);

  return {
    start() {
      // Open straight into the last game: "pick up where you left off".
      const last = savedGames()[0];
      if (last) resume(last.id); else setScreen('home');
    },
    pause() { paused = true; persist(); },
    resume() { paused = false; lastTick = performance.now(); },
    save() { persist(); return undefined; }, // Sudoku keeps its own "store" key
    destroy() { clearInterval(timer); persist(); },
  };
}
