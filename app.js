(() => {
  'use strict';
  const S = self.Sudoku, LEVELS = self.LEVELS;
  const DIFFS = S.DIFFICULTIES;
  const LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
  const KEY = 'sudoku.v1', POOL_KEY = 'sudoku.pool.v1', POOL_SIZE = 3;
  const $ = (s) => document.querySelector(s);

  // ---------- storage ----------
  const load = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

  const store = Object.assign({ progress: {}, games: {}, settings: {}, endless: {}, diff: 'easy' }, load(KEY, {}));
  store.settings = Object.assign({ showMistakes: true, highlight: true, autoNotes: true }, store.settings);
  for (const d of DIFFS) { store.progress[d] = store.progress[d] || {}; store.endless[d] = store.endless[d] || 0; }
  if (!DIFFS.includes(store.diff)) store.diff = 'easy';
  const MAX_SAVED = 40; // oldest untouched games are dropped beyond this
  const persist = () => save(KEY, store);
  const gameId = (mode, d, level) => (mode === 'level' ? 'L-' + d + '-' + level : 'E-' + Date.now().toString(36));
  const gameLabel = (g) => LABEL[g.difficulty] + (g.level ? ' · Level ' + g.level : ' · Endless');
  const filledPct = (g) => {
    let given = 0, ok = 0;
    for (let i = 0; i < 81; i++) { if (g.puzzle[i] !== '0') given++; else if (g.values[i]) ok++; }
    return Math.round((ok / (81 - given)) * 100);
  };
  const savedGames = () => Object.values(store.games).sort((a, b) => b.updated - a.updated);

  const pool = load(POOL_KEY, {});
  for (const d of DIFFS) pool[d] = Array.isArray(pool[d]) ? pool[d] : [];

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
  };

  // ---------- background generator (keeps a few fresh puzzles ready) ----------
  let worker = null, workerBusy = false;
  function refillPool() {
    if (workerBusy) return;
    const d = DIFFS.find((x) => pool[x].length < POOL_SIZE);
    if (!d) return;
    if (!worker) {
      try { worker = new Worker('worker.js'); } catch { return; }
      worker.onmessage = (e) => {
        workerBusy = false;
        const r = e.data;
        if (r && r.p && pool[r.d].length < POOL_SIZE) { pool[r.d].push({ p: r.p, s: r.s }); save(POOL_KEY, pool); }
        setTimeout(refillPool, 100);
        renderHome();
      };
      worker.onerror = () => { workerBusy = false; worker = null; };
    }
    workerBusy = true;
    worker.postMessage({ d });
  }

  function mutatedLevel(d) {
    const base = LEVELS[d][Math.floor(Math.random() * LEVELS[d].length)];
    const m = S.mutate(base, S.solve(base, 1).solution);
    return { p: S.toString(m.puzzle), s: S.toString(m.solution), mutated: true };
  }

  // ---------- game state ----------
  let game = null;
  let selected = -1, notesMode = false, screen = 'home';
  const isGiven = (i) => game.puzzle[i] !== '0';

  function newGame(mode, difficulty, level, puzzle, solution, id) {
    game = {
      id: id || gameId(mode, difficulty, level),
      mode, difficulty, level, puzzle, solution,
      values: S.toArray(puzzle), notes: new Array(81).fill(0),
      mistakes: 0, hints: 0, elapsed: 0, history: [], done: false, updated: Date.now(),
    };
    store.games[game.id] = game; store.diff = difficulty;
    const all = savedGames();
    for (const g of all.slice(MAX_SAVED)) delete store.games[g.id];
    persist();
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
  function startLevel(d, n) {
    const id = gameId('level', d, n);
    if (store.games[id]) return resume(id);
    const p = LEVELS[d][n - 1];
    newGame('level', d, n, p, S.toString(S.solve(p, 1).solution));
  }
  function startEndless(d) {
    const item = pool[d].shift() || mutatedLevel(d);
    save(POOL_KEY, pool);
    newGame('endless', d, null, item.p, item.s);
    setTimeout(refillPool, 500);
  }

  // ---------- moves ----------
  function commit(changes) {
    if (!changes.length) return;
    game.history.push(changes);
    if (game.history.length > 500) game.history.shift();
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
    if (game.mode === 'level') {
      const prev = store.progress[d][game.level];
      if (!prev || game.elapsed < prev.t) store.progress[d][game.level] = { t: Math.round(game.elapsed), m: game.mistakes };
    } else {
      store.endless[d]++;
    }
    delete store.games[game.id]; persist();
    const parts = [fmt(game.elapsed)];
    parts.push(game.mistakes === 1 ? '1 mistake' : game.mistakes + ' mistakes');
    if (game.hints) parts.push(game.hints === 1 ? '1 hint' : game.hints + ' hints');
    $('#win-stats').textContent = LABEL[d] + (game.level ? ' · Level ' + game.level : ' · Endless') + ' — ' + parts.join(' · ');
    const nextLevel = game.mode === 'level' ? nextUnsolved(d, game.level) : 0;
    $('#win-next').textContent = game.mode === 'level' && nextLevel ? 'Level ' + nextLevel : 'New ' + LABEL[d] + ' puzzle';
    $('#win-next').onclick = () => {
      $('#win').close();
      if (game.mode === 'level' && nextLevel) startLevel(d, nextLevel); else startEndless(d);
    };
    setTimeout(() => $('#win').showModal(), 500);
  }

  function nextUnsolved(d, after) {
    const n = LEVELS[d].length;
    for (let k = 1; k <= n; k++) {
      const lv = ((after + k - 1) % n) + 1;
      if (!store.progress[d][lv]) return lv;
    }
    return 0;
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
    $('#game-name').textContent = gameLabel(game);
    $('#mistakes').textContent = game.mistakes + (game.mistakes === 1 ? ' mistake' : ' mistakes');
    $('#mistakes-wrap').hidden = !store.settings.showMistakes;
    $('#timer').textContent = fmt(game.elapsed);
    $('#btn-notes').setAttribute('aria-pressed', String(notesMode));
    $('#notes-state').textContent = notesMode ? 'on' : 'off';
    $('#game').classList.toggle('notes-on', notesMode);
  }

  function renderHome() {
    const d = store.diff;
    // tabs
    const tabs = $('#diff-tabs');
    if (!tabs.children.length) {
      for (const x of DIFFS) {
        const b = document.createElement('button');
        b.setAttribute('role', 'tab'); b.textContent = LABEL[x]; b.dataset.d = x;
        b.addEventListener('click', () => { store.diff = x; persist(); renderHome(); });
        tabs.appendChild(b);
      }
    }
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.d === d));

    // games in progress
    const saved = savedGames();
    $('#saved').hidden = !saved.length;
    $('#saved-count').textContent = saved.length;
    const sfrag = document.createDocumentFragment();
    for (const g of saved) {
      const row = document.createElement('div');
      row.className = 'saved-row';
      const open = document.createElement('button');
      open.className = 'saved-open';
      open.innerHTML = '<span class="saved-name"></span><span class="muted small"></span>' +
        '<span class="bar"><i style="width:' + filledPct(g) + '%"></i></span>';
      open.querySelector('.saved-name').textContent = gameLabel(g);
      open.querySelector('.muted').textContent = filledPct(g) + '% · ' + fmt(g.elapsed);
      open.addEventListener('click', () => resume(g.id));
      const del = document.createElement('button');
      del.className = 'icon-btn saved-del'; del.setAttribute('aria-label', 'Delete saved game'); del.textContent = '×';
      del.addEventListener('click', () => confirmDialog('Delete this saved game (' + gameLabel(g) + ')?', () => {
        delete store.games[g.id]; persist(); renderHome();
      }));
      row.append(open, del);
      sfrag.appendChild(row);
    }
    $('#saved-list').replaceChildren(sfrag);

    // endless
    const solvedEndless = store.endless[d];
    $('#endless-info').textContent = 'A new ' + LABEL[d].toLowerCase() + ' puzzle, made on your device' +
      (solvedEndless ? ' · ' + solvedEndless + ' solved' : '');

    // levels
    const list = LEVELS[d], prog = store.progress[d];
    const solved = Object.keys(prog).length;
    $('#levels-count').textContent = solved + ' / ' + list.length + ' solved';
    const next = nextUnsolved(d, 0);
    const wrap = $('#levels');
    const frag = document.createDocumentFragment();
    list.forEach((_, k) => {
      const n = k + 1, p = prog[n], started = store.games[gameId('level', d, n)];
      const b = document.createElement('button');
      b.className = 'level' + (p ? ' solved' : '') + (started ? ' started' : '') + (n === next ? ' next' : '');
      b.innerHTML = n + (started ? '<small>' + filledPct(started) + '%</small>' : p ? '<small>' + fmt(p.t) + '</small>' : '');
      b.setAttribute('aria-label', 'Level ' + n + (started ? ', in progress' : p ? ', solved' : ''));
      b.addEventListener('click', () => startLevel(d, n));
      frag.appendChild(b);
    });
    wrap.replaceChildren(frag);
  }

  // ---------- screens & navigation ----------
  function showGame() {
    screen = 'game';
    $('#home').hidden = true; $('#game').hidden = false;
    if (!history.state || !history.state.game) history.pushState({ game: true }, '');
    if (selected < 0 || selected > 80) selected = game.values.findIndex((v) => !v);
    lastTick = performance.now();
    renderGame();
  }
  function showHome() {
    screen = 'home';
    $('#game').hidden = true; $('#home').hidden = false;
    persist();
    renderHome();
  }
  window.addEventListener('popstate', () => { if (screen === 'game') showHome(); });

  function confirmDialog(text, yes) {
    $('#confirm-text').textContent = text;
    $('#confirm-yes').onclick = () => { $('#confirm').close(); yes(); };
    $('#confirm').showModal();
  }

  $('#btn-back').addEventListener('click', () => { if (history.state && history.state.game) history.back(); else showHome(); });
  $('#btn-endless').addEventListener('click', () => startEndless(store.diff));
  $('#btn-restart').addEventListener('click', () => {
    if (!game || game.done) return;
    confirmDialog('Restart this puzzle from the beginning?', () => {
      newGame(game.mode, game.difficulty, game.level, game.puzzle, game.solution, game.id);
    });
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-erase').addEventListener('click', () => setValue(selected, 0));
  $('#btn-notes').addEventListener('click', () => { notesMode = !notesMode; renderGame(); });
  $('#btn-hint').addEventListener('click', hint);
  $('#win-home').addEventListener('click', () => { $('#win').close(); $('#btn-back').click(); });
  $('#confirm-no').addEventListener('click', () => $('#confirm').close());

  // settings
  $('#btn-settings').addEventListener('click', () => {
    document.querySelectorAll('[data-setting]').forEach((cb) => { cb.checked = !!store.settings[cb.dataset.setting]; });
    $('#settings').showModal();
  });
  document.querySelectorAll('[data-setting]').forEach((cb) => cb.addEventListener('change', () => {
    store.settings[cb.dataset.setting] = cb.checked; persist();
  }));
  $('#settings-close').addEventListener('click', () => $('#settings').close());
  document.querySelectorAll('dialog').forEach((dl) => dl.addEventListener('click', (e) => { if (e.target === dl) dl.close(); }));

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (screen !== 'game' || !game || document.querySelector('dialog[open]')) return;
    const k = e.key;
    if (k >= '1' && k <= '9') { input(+k); return; }
    if (k === 'Backspace' || k === 'Delete' || k === '0') { setValue(selected, 0); return; }
    if ((k === 'z' || k === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); return; }
    if (k === 'n' || k === 'N') { notesMode = !notesMode; renderGame(); return; }
    if (k === 'Escape') { $('#btn-back').click(); return; }
    const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[k];
    if (mv) {
      e.preventDefault();
      if (selected < 0) selected = 0;
      else {
        const r = S.ROW[selected], c = S.COL[selected];
        if (mv === -1) selected = r * 9 + ((c + 8) % 9);
        else if (mv === 1) selected = r * 9 + ((c + 1) % 9);
        else if (mv === -9) selected = ((r + 8) % 9) * 9 + c;
        else selected = ((r + 1) % 9) * 9 + c;
      }
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
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !standalone) $('#ios-hint').hidden = false;
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('#btn-install').hidden = false; });
  $('#btn-install').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null; $('#btn-install').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#btn-install').hidden = true; });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.ready.then(() => { $('#offline-status').textContent = '✓ Saved on this device — works offline'; });
  }

  // ---------- boot ----------
  renderHome();
  setTimeout(refillPool, 1500);
})();
