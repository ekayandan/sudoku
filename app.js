(() => {
  'use strict';
  const S = self.Sudoku;
  const DIFFS = S.DIFFICULTIES;
  const LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
  const KEY = 'sudoku';
  const $ = (s) => document.querySelector(s);

  // ---------- storage ----------
  const load = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

  const store = Object.assign({ games: {}, solved: {} }, load(KEY, {}));
  // maxSaved: unfinished games kept; the least recently played are dropped beyond it. A saved game is ~1-4 KB
  // (up to ~13 KB with full notes and 200 undo steps), so even 100 fits easily in the ~5 MB localStorage gives us.
  store.settings = Object.assign({ showMistakes: true, highlight: true, autoNotes: true, theme: 'system', maxSaved: 50 }, store.settings);
  for (const d of DIFFS) store.solved[d] = store.solved[d] || 0;
  const MAX_UNDO = 200;
  const persist = () => save(KEY, store);
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  };
  const filledPct = (g) => {
    let given = 0, ok = 0;
    for (let i = 0; i < 81; i++) { if (g.puzzle[i] !== '0') given++; else if (g.values[i]) ok++; }
    return Math.round((ok / (81 - given)) * 100);
  };
  const savedGames = () => Object.values(store.games).sort((a, b) => b.updated - a.updated);
  const prune = () => { for (const g of savedGames().slice(store.settings.maxSaved)) delete store.games[g.id]; };

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
  };

  // ---------- game state ----------
  let game = null;
  let selected = -1, notesMode = false, screen = 'home';
  const isGiven = (i) => game.puzzle[i] !== '0';

  function newGame(difficulty, puzzle, solution, id) {
    game = {
      id: id || Date.now().toString(36),
      difficulty, puzzle, solution,
      values: S.toArray(puzzle), notes: new Array(81).fill(0),
      mistakes: 0, hints: 0, elapsed: 0, history: [], done: false, updated: Date.now(),
    };
    store.games[game.id] = game;
    prune(); persist();
    selected = game.values.findIndex((v) => !v);
    notesMode = false;
    showGame();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  function resume(id) {
    game = store.games[id];
    if (!game) return;
    game.updated = Date.now(); persist();
    selected = -1; notesMode = false;
    showGame();
  }
  // Generating takes a few ms even for Expert, so it simply runs on tap.
  function startNew(d) {
    let g = null;
    while (!g) g = S.generate(d);
    newGame(d, S.toString(g.puzzle), S.toString(g.solution));
  }

  // ---------- moves ----------
  function commit(changes) {
    if (!changes.length) return;
    game.history.push(changes);
    if (game.history.length > MAX_UNDO) game.history.shift();
    afterMove();
  }
  function snapshot(changes, j) { changes.push({ i: j, v: game.values[j], n: game.notes[j] }); }
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
      if (val !== +game.solution[i]) {
        game.mistakes++;
        if (store.settings.showMistakes && navigator.vibrate) navigator.vibrate(40);
      } else {
        flashUnits(i);
      }
      clearPeerNotes(changes, i, val);
    }
    commit(changes);
  }
  function toggleNote(i, d) {
    if (!game || game.done || i < 0 || isGiven(i) || game.values[i]) return;
    const changes = [];
    snapshot(changes, i);
    game.notes[i] ^= 1 << d;
    commit(changes);
  }
  function input(d) {
    if (selected < 0) return;
    if (notesMode && !game.values[selected]) toggleNote(selected, d);
    else setValue(selected, d);
  }
  function undo() {
    if (!game || game.done) return;
    const changes = game.history.pop();
    if (!changes) return;
    for (let k = changes.length - 1; k >= 0; k--) {
      const c = changes[k]; game.values[c.i] = c.v; game.notes[c.i] = c.n;
    }
    selected = changes[0].i;
    afterMove();
  }
  function hint() {
    if (!game || game.done) return;
    const needs = (i) => game.values[i] !== +game.solution[i];
    let target = selected >= 0 && !isGiven(selected) && needs(selected) ? selected : -1;
    if (target < 0) { // pick the empty cell with the fewest possibilities: the most "logical" next step
      let best = 10;
      for (let i = 0; i < 81; i++) {
        if (!needs(i)) continue;
        const used = new Set(); for (const p of S.PEERS[i]) if (game.values[p]) used.add(game.values[p]);
        if (9 - used.size < best) { best = 9 - used.size; target = i; }
      }
    }
    if (target < 0) return;
    const val = +game.solution[target];
    const changes = [];
    snapshot(changes, target); game.values[target] = val; game.notes[target] = 0;
    clearPeerNotes(changes, target, val);
    game.hints++; selected = target;
    flashUnits(target);
    commit(changes);
  }

  let flashing = [];
  function flashUnits(i) {
    const units = [S.UNITS[S.ROW[i]], S.UNITS[9 + S.COL[i]], S.UNITS[18 + S.BOX[i]]];
    const vals = game.values.slice(); vals[i] = +game.solution[i];
    for (const u of units) {
      if (u.every((j) => vals[j] === +game.solution[j])) flashing.push(...u);
    }
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
    const parts = [fmt(game.elapsed)];
    parts.push(game.mistakes === 1 ? '1 mistake' : game.mistakes + ' mistakes');
    if (game.hints) parts.push(game.hints === 1 ? '1 hint' : game.hints + ' hints');
    $('#win-stats').textContent = LABEL[d] + ' — ' + parts.join(' · ');
    $('#win-next').textContent = 'New ' + LABEL[d] + ' game';
    $('#win-next').onclick = () => { $('#win').close(); startNew(d); };
    setTimeout(() => $('#win').showModal(), 500);
  }

  // ---------- rendering ----------
  const boardEl = $('#board'), padEl = $('#pad');
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.setAttribute('role', 'gridcell');
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); selected = i; renderBoard(); });
    boardEl.appendChild(el);
    cells.push(el);
  }
  const padBtns = [];
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.innerHTML = d + '<small></small>';
    b.setAttribute('aria-label', String(d));
    b.addEventListener('click', () => input(d));
    padEl.appendChild(b);
    padBtns.push(b);
  }

  function renderBoard() {
    if (!game) return;
    const st = store.settings;
    const sel = selected, sv = sel >= 0 ? game.values[sel] : 0;
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
    $('#game-name').textContent = LABEL[game.difficulty];
    $('#mistakes').textContent = game.mistakes + (game.mistakes === 1 ? ' mistake' : ' mistakes');
    $('#mistakes-wrap').hidden = !store.settings.showMistakes;
    $('#timer').textContent = fmt(game.elapsed);
    $('#btn-notes').setAttribute('aria-pressed', String(notesMode));
    $('#notes-state').textContent = notesMode ? 'on' : 'off';
    $('#game').classList.toggle('notes-on', notesMode);
  }

  function renderHome() {
    const saved = savedGames(), last = saved[0];
    $('#btn-continue').hidden = !last;
    $('#btn-saved').hidden = !saved.length;
    $('#btn-new').classList.toggle('primary', !last);
    if (last) {
      $('#continue-info').textContent = LABEL[last.difficulty] + ' · ' + filledPct(last) + '% · ' + fmt(last.elapsed);
      $('#continue-bar').style.width = filledPct(last) + '%';
      $('#saved-info').textContent = saved.length === 1 ? '1 unfinished game' : saved.length + ' unfinished games';
    }
  }

  function renderSaved() {
    const saved = savedGames();
    $('#saved-empty').hidden = !!saved.length;
    $('#saved-limit').textContent = 'Up to ' + store.settings.maxSaved + ' are kept; the least recently played go first. Change it in Settings.';
    const frag = document.createDocumentFragment();
    for (const g of saved) {
      const row = document.createElement('div');
      row.className = 'saved-row';
      const open = document.createElement('button');
      open.className = 'saved-open';
      open.innerHTML = '<span class="saved-name"></span><span class="muted small"></span>' +
        '<span class="bar"><i style="width:' + filledPct(g) + '%"></i></span>';
      open.querySelector('.saved-name').textContent = LABEL[g.difficulty];
      open.querySelector('.muted').textContent = filledPct(g) + '% · ' + fmt(g.elapsed) + ' · ' + ago(g.updated);
      open.addEventListener('click', () => resume(g.id));
      const del = document.createElement('button');
      del.className = 'icon-btn saved-del'; del.setAttribute('aria-label', 'Delete saved game'); del.textContent = '×';
      del.addEventListener('click', () => confirmDialog('Delete this ' + LABEL[g.difficulty] + ' game (' + filledPct(g) + '% done)?', () => {
        delete store.games[g.id]; persist(); renderSaved();
      }));
      row.append(open, del);
      frag.appendChild(row);
    }
    $('#saved-list').replaceChildren(frag);
  }

  function openNewGame() {
    const frag = document.createDocumentFragment();
    for (const d of DIFFS) {
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = '<b></b><span class="muted small"></span>';
      b.querySelector('b').textContent = LABEL[d];
      b.querySelector('span').textContent = store.solved[d] ? store.solved[d] + ' solved' : '';
      b.addEventListener('click', () => { $('#newgame').close(); startNew(d); });
      frag.appendChild(b);
    }
    $('#diff-list').replaceChildren(frag);
    $('#newgame').showModal();
  }

  // ---------- screens & navigation ----------
  // home is the root; "saved" and "game" are pushed on the browser history so the system back button works.
  const SCREENS = ['home', 'saved', 'game'];
  function setScreen(name) {
    screen = name;
    for (const n of SCREENS) $('#' + n).hidden = n !== name;
    if (name === 'home') renderHome();
    if (name === 'saved') renderSaved();
    window.scrollTo(0, 0);
  }
  function go(name) {
    if (history.state && history.state.screen === name) return setScreen(name);
    history.pushState({ screen: name }, '');
    setScreen(name);
  }
  function goBack() {
    if (history.state && history.state.screen) history.back(); else setScreen('home');
  }
  function showGame() {
    go('game');
    if (selected < 0 || selected > 80) selected = game.values.findIndex((v) => !v);
    lastTick = performance.now();
    renderGame();
  }
  window.addEventListener('popstate', (e) => {
    const name = (e.state && e.state.screen) || 'home';
    if (name === 'game' && !game) return setScreen('home');
    setScreen(name);
    if (name === 'game') { lastTick = performance.now(); renderGame(); }
  });

  function confirmDialog(text, yes) {
    $('#confirm-text').textContent = text;
    $('#confirm-yes').onclick = () => { $('#confirm').close(); yes(); };
    $('#confirm').showModal();
  }

  $('#btn-back').addEventListener('click', goBack);
  $('#btn-saved-back').addEventListener('click', goBack);
  $('#btn-continue').addEventListener('click', () => { const g = savedGames()[0]; if (g) resume(g.id); });
  $('#btn-saved').addEventListener('click', () => go('saved'));
  $('#btn-new').addEventListener('click', openNewGame);
  $('#newgame-cancel').addEventListener('click', () => $('#newgame').close());
  $('#btn-restart').addEventListener('click', () => {
    if (!game || game.done) return;
    confirmDialog('Restart this puzzle from the beginning?', () => {
      newGame(game.difficulty, game.puzzle, game.solution, game.id);
    });
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-erase').addEventListener('click', () => setValue(selected, 0));
  $('#btn-notes').addEventListener('click', () => { notesMode = !notesMode; renderGame(); });
  $('#btn-hint').addEventListener('click', hint);
  $('#win-home').addEventListener('click', () => { $('#win').close(); history.replaceState(null, ''); setScreen('home'); });
  $('#confirm-no').addEventListener('click', () => $('#confirm').close());

  // ---------- theme ----------
  // 'system' follows the device's light/dark mode; others force a scheme (see the [data-theme] blocks in style.css).
  const THEMES = { system: null, light: '#f8fafc', dark: '#0f172a' }; // value: browser bar color
  const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
  themeMetas.forEach((m) => { m.dataset.auto = m.content; });
  function applyTheme() {
    const t = store.settings.theme, root = document.documentElement;
    if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
    themeMetas.forEach((m) => { m.content = THEMES[t] || m.dataset.auto; });
    try { localStorage.setItem('sudoku.theme', t); } catch { /* ignore */ }
    document.querySelectorAll('[data-theme-opt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeOpt === t)));
  }
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => {
    store.settings.theme = b.dataset.themeOpt; persist(); applyTheme();
  }));
  applyTheme();

  // ---------- settings ----------
  $('#btn-settings').addEventListener('click', () => {
    document.querySelectorAll('[data-setting]').forEach((cb) => { cb.checked = !!store.settings[cb.dataset.setting]; });
    $('#max-saved').value = String(store.settings.maxSaved);
    $('#settings').showModal();
  });
  document.querySelectorAll('[data-setting]').forEach((cb) => cb.addEventListener('change', () => {
    store.settings[cb.dataset.setting] = cb.checked; persist();
  }));
  $('#max-saved').addEventListener('change', (e) => {
    store.settings.maxSaved = +e.target.value; prune(); persist(); renderHome();
  });
  $('#settings-close').addEventListener('click', () => $('#settings').close());

  // backup / restore (a JSON file the user keeps)
  $('#btn-backup').addEventListener('click', () => {
    persist();
    const data = JSON.stringify({ app: 'sudoku', store });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'sudoku-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#restore-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let backup = null;
    try { backup = JSON.parse(await file.text()).store; } catch { /* not JSON */ }
    $('#settings').close();
    if (!backup || !backup.games) return confirmDialog('That file is not a sudoku backup.', () => {});
    confirmDialog('Replace the progress on this device with this backup?', () => { save(KEY, backup); location.reload(); });
  });
  document.querySelectorAll('dialog').forEach((dl) => dl.addEventListener('click', (e) => { if (e.target === dl) dl.close(); }));

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (screen !== 'game' || !game || document.querySelector('dialog[open]')) return;
    const k = e.key;
    if (k >= '1' && k <= '9') { input(+k); return; }
    if (k === 'Backspace' || k === 'Delete' || k === '0') { setValue(selected, 0); return; }
    if ((k === 'z' || k === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); return; }
    if (k === 'n' || k === 'N') { notesMode = !notesMode; renderGame(); return; }
    if (k === 'Escape') { goBack(); return; }
    const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[k];
    if (mv) {
      e.preventDefault();
      const r = S.ROW[Math.max(selected, 0)], c = S.COL[Math.max(selected, 0)];
      selected = Math.abs(mv) === 1 ? r * 9 + (c + mv + 9) % 9 : ((r + mv / 9 + 9) % 9) * 9 + c;
      renderBoard();
    }
  });

  // ---------- timer ----------
  let lastTick = performance.now(), ticks = 0;
  setInterval(() => {
    const now = performance.now();
    if (screen === 'game' && game && !game.done && !document.hidden && !document.querySelector('dialog[open]')) {
      game.elapsed += Math.min(now - lastTick, 2000);
      $('#timer').textContent = fmt(game.elapsed);
      if (++ticks % 10 === 0) persist();
    }
    lastTick = now;
  }, 500);
  document.addEventListener('visibilitychange', () => { lastTick = performance.now(); if (document.hidden) persist(); });

  // ---------- install & offline ----------
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('#ios-hint').hidden = !isIOS || navigator.standalone === true;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // ---------- boot ----------
  history.replaceState(null, '');
  setScreen('home');
})();
