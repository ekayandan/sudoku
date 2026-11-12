// Minesweeper: clear the field without touching a mine. Every board is solvable by logic alone. Engine: ./engine.js
import './engine.js';
const E = self.Mines;

const BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const I = (d, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  restart: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  zoom: I('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>'),
  zoomOut: I('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>'),
  flag: I('<path d="M6 21V4"/><path d="M6 4h12l-3 4 3 4H6"/>'),
};
// Cell glyphs: a flat red flag, and a dark dot for a mine (its square gets a colour at game over).
const FLAG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3.2v13.6" stroke="var(--mn-pole)" stroke-width="1.6" stroke-linecap="round"/><path d="M7.6 3.2l8.2 3.9-8.2 3.9z" fill="var(--mn-flag)"/><rect x="4.4" y="15.6" width="6.2" height="1.8" rx=".9" fill="var(--mn-pole)"/></svg>';
const MINE = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="4.6" fill="rgba(0,0,0,.42)"/></svg>';
const MINE_HUES = ['#db3236', '#f4840d', '#f4c20d', '#008744', '#48e6f1', '#4885ed', '#b648f2', '#ed44b5'];
const LABEL = { beginner: 'Easy', intermediate: 'Medium', expert: 'Hard' };
const fmt = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const ORDER = ['beginner', 'intermediate', 'expert'];
const ZOOMS = [1, 1.35, 1.75];
const zoomable = (size) => size === 'expert'; // only Hard is too small to tap comfortably on a phone

export default {
  id: 'mines',
  name: 'Minesweeper',
  saveVersion: 1,
  input: { model: 'pointer', targets: '.mn-c', secondary: true, focusRing: true, keys: { m: 'mode', z: 'zoom' } },
  help: [
    'Open every safe cell. A number tells how many of its 8 neighbours hide a mine.',
    'Every board can be solved by logic alone: no guessing needed. Your first tap is always safe.',
    'Tap opens a cell. Long-press (or right-click) puts a flag on a mine.',
    'Tap a number whose mines are all flagged to open the rest of its neighbours.',
    'Flag mode makes a tap place flags, for one-thumb play. Zoom enlarges the Hard board.',
    'Keyboard: arrows move, Enter opens, F flags, M switches tap mode, Z zooms, N starts a new board.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  root.innerHTML = `
    <main class="screen mn">
      <header class="topbar">
        <button class="icon-btn" data-act="home" aria-label="All games">${BACK}</button>
        <div class="mn-title"><div class="mn-name">Minesweeper</div><div class="muted small"><span class="mn-time">0:00</span> · <span class="mn-left">0</span> mines</div></div>
        <button class="icon-btn" data-act="new" aria-label="New board">${ICON.restart}</button>
      </header>
      <div class="seg mn-sizes">${ORDER.map((k) => `<button data-size="${k}">${LABEL[k]}</button>`).join('')}</div>
      <p class="mn-msg" aria-live="polite"></p>
      <div class="mn-stage"><div class="mn-board" role="grid" aria-label="Mine field"></div></div>
      <div class="mn-tools">
        <button class="tool mn-mode" data-act="mode" aria-pressed="false">${ICON.flag}<span>Flag <b class="mn-mode-state">off</b></span></button>
        <button class="tool mn-zoom" data-act="zoom"></button>
        <button class="tool" data-act="new">${ICON.plus}<span>New</span></button>
      </div>
    </main>`;
  const $ = (q) => root.querySelector(q);
  const stage = $('.mn-stage'), boardEl = $('.mn-board');
  const best = ctx.storage.get('best', {});
  const prefs = ctx.storage.get('prefs', { flagMode: false, zoom: 0 });

  let s = null;          // { v, size, w, h, mines (packed) | null, st (string), elapsed, over: null | 'win' | 'lose', hit }
  let mines = null, num = null, st = null; // runtime: Uint8Array mines, Int8Array numbers, Uint8Array state (0 hidden, 1 open, 2 flag)
  let cells = [], flip = false, paused = false, layoutKey = '';
  let shown = null, boomTimer = 0; // lose cascade: Set of mines revealed so far (null = all)

  // ---------- state ----------
  function newGame(size) {
    const z = E.SIZES[size];
    s = { v: 1, size, w: z.w, h: z.h, mines: null, st: '', elapsed: 0, over: null, hit: -1 };
    mines = null; num = null; st = new Uint8Array(z.w * z.h); stopBoom();
    build(); persist(); render();
  }
  const total = () => E.SIZES[s.size].mines;
  const flags = () => { let k = 0; for (const v of st) if (v === 2) k++; return k; };
  const opened = () => { let k = 0; for (const v of st) if (v === 1) k++; return k; };
  function persist() {
    s.st = Array.from(st).join('');
    ctx.storage.set('save', s);
    if (!mines || s.over) ctx.setStatus(null);
    else ctx.setStatus(LABEL[s.size] + ' · ' + (total() - flags()) + ' left', Math.round((opened() / (s.w * s.h - total())) * 100));
  }

  // ---------- layout ----------
  // Board is stored in its own orientation; a wide board is shown rotated on a tall screen (Expert 30×16 → 16×30).
  function build() {
    const sw = stage.clientWidth || root.clientWidth, sh = stage.clientHeight || root.clientHeight;
    flip = s.w !== s.h && (s.w > s.h) !== (sw > sh);
    const dw = flip ? s.h : s.w, dh = flip ? s.w : s.h;
    cells = new Array(s.w * s.h);
    const frag = document.createDocumentFragment();
    for (let r = 0; r < dh; r++) for (let c = 0; c < dw; c++) {
      const i = flip ? c * s.w + r : r * s.w + c;
      const el = document.createElement('div');
      el.dataset.i = i; el.dataset.p = (r + c) & 1; el.setAttribute('role', 'gridcell');
      cells[i] = el; frag.appendChild(el);
    }
    boardEl.replaceChildren(frag);
    boardEl.style.gridTemplateColumns = `repeat(${dw}, var(--cs))`;
    layoutKey = '';
    size();
    for (const el of cells) el.dataset.k = '';
  }
  function size() {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    const wantFlip = s.w !== s.h && (s.w > s.h) !== (sw > sh);
    if (wantFlip !== flip) { build(); render(); return; }
    const dw = flip ? s.h : s.w, dh = flip ? s.w : s.h;
    const fitW = Math.floor(sw / dw), fitH = Math.floor(sh / dh);
    // fit the whole board if cells stay comfortable; otherwise fit the width (cells ≈ 24 px) and scroll vertically
    let cs = Math.min(fitW, fitH, 46);
    if (cs < 30) cs = fitW >= 22 ? Math.min(fitW, 30) : 24;
    if (zoomable(s.size)) cs = Math.round(cs * ZOOMS[prefs.zoom]);
    const key = cs + ':' + dw;
    if (key === layoutKey) return;
    layoutKey = key;
    boardEl.style.setProperty('--cs', cs + 'px');
    boardEl.style.fontSize = Math.round(cs * 0.6) + 'px';
  }
  const ro = new ResizeObserver(() => size());
  ro.observe(stage);

  // ---------- render ----------
  function cellKey(i) {
    const v = st[i];
    if (s.over === 'lose') {
      if (mines[i] && v !== 2 && (i === s.hit || !shown || shown.has(i))) return 'mine';
      if (v === 2 && !mines[i] && !shown) return 'wrong';
    }
    if (v === 2) return 'flag';
    if (v === 1) return 'n' + num[i];
    return 'h';
  }
  function render() {
    for (let i = 0; i < cells.length; i++) {
      const el = cells[i], k = cellKey(i);
      if (el.dataset.k === k) continue;
      el.dataset.k = k;
      const focus = el.classList.contains('kb-focus');
      el.className = 'mn-c ' + (k === 'h' ? 'h' : k === 'flag' ? 'h f' : k === 'wrong' ? 'h f wrong' : k === 'mine' ? 'mine' : 'o ' + k) + (el.dataset.p === '1' ? ' d' : '') + (focus ? ' kb-focus' : '');
      el.style.background = k === 'mine' ? MINE_HUES[(i * 7 + (i >> 3)) % MINE_HUES.length] : '';
      el.innerHTML = k === 'flag' || k === 'wrong' ? FLAG : k === 'mine' ? MINE : k[0] === 'n' && k !== 'n0' ? k.slice(1) : '';
      el.setAttribute('aria-label', k === 'h' ? 'hidden' : k === 'flag' ? 'flag' : k[0] === 'n' ? (k === 'n0' ? 'empty' : k.slice(1)) : k === 'wrong' ? 'wrong flag' : 'mine');
    }
    const left = total() - flags();
    $('.mn-left').textContent = left;
    $('.mn-time').textContent = fmt(s.elapsed);
    $('.mn-msg').textContent = s.over === 'win' ? 'Cleared' : s.over === 'lose' ? 'You hit a mine' : '';
    root.querySelectorAll('[data-size]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.size === s.size)));
    $('.mn-mode').setAttribute('aria-pressed', String(prefs.flagMode));
    $('.mn-mode-state').textContent = prefs.flagMode ? 'on' : 'off';
    const z = $('.mn-zoom');
    z.hidden = !zoomable(s.size);
    z.setAttribute('aria-pressed', String(prefs.zoom > 0));
    z.innerHTML = (prefs.zoom === ZOOMS.length - 1 ? ICON.zoomOut : ICON.zoom) + '<span>Zoom' + (prefs.zoom ? ' <b>' + ZOOMS[prefs.zoom] + '×</b>' : '') + '</span>';
  }

  // ---------- moves ----------
  function ensureBoard(first) {
    if (mines) return;
    const g = E.generate(s.w, s.h, total(), first, ctx.rng(), { ms: 1500 });
    mines = g.mines; num = E.counts(s.w, s.h, mines);
    s.mines = E.pack(mines);
    ctx.requestPersistence();
  }
  function open(i) {
    if (st[i] !== 0) return [];
    if (mines[i]) { lose(i); return null; }
    const blocked = new Uint8Array(st.length); for (let j = 0; j < st.length; j++) if (st[j] === 2) blocked[j] = 1;
    const o = new Uint8Array(st.length); for (let j = 0; j < st.length; j++) if (st[j] === 1) o[j] = 1;
    const got = E.flood(s.w, s.h, num, o, i, blocked);
    for (const j of got) st[j] = 1;
    return got;
  }
  function reveal(i) {
    if (s.over) return;
    ensureBoard(i);
    if (st[i] === 1) return chord(i);
    if (st[i] !== 0) return;
    const got = open(i);
    if (got) after(got, i);
  }
  function chord(i) {
    if (!num || num[i] <= 0) return;
    const nb = E.neighbours(s.w, s.h)[i];
    let f = 0; for (const j of nb) if (st[j] === 2) f++;
    if (f !== num[i]) { ctx.haptics(15); pulse(nb.filter((j) => st[j] === 0)); return; }
    const got = [];
    for (const j of nb) {
      if (st[j] !== 0) continue;
      const g = open(j);
      if (!g) return; // hit a mine (wrong flag)
      got.push(...g);
    }
    if (got.length) after(got, i);
  }
  function after(got, from) {
    ctx.audio.tone(got.length > 8 ? 660 : 520, 40, 'triangle'); ctx.haptics(6);
    if (opened() === s.w * s.h - total()) return win(got, from);
    persist(); render(); cascade(got, from);
  }
  function toggleFlag(i) {
    if (s.over || !mines) return;
    if (st[i] === 1) return chord(i);
    st[i] = st[i] === 2 ? 0 : 2;
    ctx.audio.tone(st[i] === 2 ? 880 : 440, 30, 'square', 0.05); ctx.haptics(st[i] === 2 ? 25 : 10);
    persist(); render();
    if (st[i] === 2 && !ctx.settings.reducedMotion) cells[i].firstChild.animate([{ transform: 'translateY(-25%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }
  async function lose(i) {
    s.over = 'lose'; s.hit = i; st[i] = 1;
    ctx.audio.tone(140, 260, 'sawtooth'); ctx.haptics(120);
    // Other mines appear one by one, nearest first.
    const hr = Math.floor(i / s.w), hc = i % s.w, rest = [];
    for (let j = 0; j < mines.length; j++) if (mines[j] && j !== i && st[j] !== 2) rest.push([Math.hypot(Math.floor(j / s.w) - hr, (j % s.w) - hc), j]);
    rest.sort((a, b) => a[0] - b[0]);
    shown = ctx.settings.reducedMotion ? null : new Set();
    persist(); render();
    if (shown) {
      const step = Math.max(12, Math.min(60, 1200 / Math.max(1, rest.length)));
      let k = 0;
      const tick = () => {
        if (!shown) return;
        if (k >= rest.length) { shown = null; render(); return; }
        shown.add(rest[k++][1]); render();
        boomTimer = setTimeout(tick, step);
      };
      boomTimer = setTimeout(tick, 120);
    }
    await wait(shown ? 300 + Math.min(1300, rest.length * 60) : 400);
    if (s.over === 'lose' && await ctx.ui.confirm('You hit a mine.\nEvery board can be solved without guessing.', 'New game', 'See board')) newGame(s.size);
  }
  function stopBoom() { clearTimeout(boomTimer); shown = null; }
  async function win(got, from) {
    s.over = 'win';
    for (let j = 0; j < st.length; j++) if (mines[j]) st[j] = 2;
    const t = s.elapsed, prev = best[s.size], record = !prev || t < prev;
    if (record) { best[s.size] = Math.max(1, Math.round(t)); ctx.storage.set('best', best); }
    persist(); render(); cascade(got, from);
    ctx.audio.tone(784, 160, 'triangle'); setTimeout(() => ctx.audio.tone(1046, 220, 'triangle'), 150);
    ctx.haptics(40);
    await wait(900);
    if (s.over === 'win' && await ctx.ui.confirm(`Cleared!\n${LABEL[s.size]} in ${fmt(t)}` + (record ? ' · new best time' : ' · best ' + fmt(prev)), 'New game', 'See board')) newGame(s.size);
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ctx.settings.reducedMotion ? Math.min(ms, 200) : ms));

  // Reveal cascade: cells pop in by distance from the tapped cell.
  function cascade(got, from) {
    if (ctx.settings.reducedMotion || got.length < 2) return;
    const fr = Math.floor(from / s.w), fc = from % s.w;
    const step = Math.max(12, Math.min(32, 420 / Math.sqrt(got.length)));
    for (const j of got) {
      const d = Math.max(Math.abs(Math.floor(j / s.w) - fr), Math.abs((j % s.w) - fc));
      cells[j].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: Math.min(d * step, 480), easing: 'ease-out', fill: 'backwards' });
    }
  }
  function pulse(list) {
    if (ctx.settings.reducedMotion) return;
    for (const j of list) cells[j].animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.15)' }, { filter: 'brightness(1)' }], { duration: 260 });
  }

  // ---------- input ----------
  const idx = (el) => +el.dataset.i;
  input.on('activate', (el, { by }) => {
    const i = idx(el);
    if (prefs.flagMode && by !== 'key' && st[i] !== 1) { if (mines) toggleFlag(i); else reveal(i); }
    else reveal(i);
  });
  input.on('secondary', (el, { by }) => {
    const i = idx(el);
    if (prefs.flagMode && by === 'longpress') reveal(i);
    else if (mines) toggleFlag(i);
  });
  input.on('select', (el, { by }) => { if (by === 'key') el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  input.on('command', (name) => {
    if (name === 'new') askNew(s.size);
    else if (name === 'mode') setMode(!prefs.flagMode);
    else if (name === 'zoom') zoom();
  });
  function setMode(v) { prefs.flagMode = v; ctx.storage.set('prefs', prefs); render(); ctx.ui.toast(v ? 'Flag mode on: tap flags, long-press opens' : 'Flag mode off: tap opens, long-press flags'); }
  function zoom() { prefs.zoom = (prefs.zoom + 1) % ZOOMS.length; ctx.storage.set('prefs', prefs); size(); render(); }
  async function askNew(size) {
    const playing = mines && !s.over && opened() > 0;
    if (playing && !(await ctx.ui.confirm(size === s.size ? 'Start a new game? This one will be lost.' : 'Switch to ' + LABEL[size] + '? This game will be lost.'))) return;
    newGame(size);
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-size]');
    if (!b) return;
    if (b.dataset.size) { if (b.dataset.size !== s.size || s.over) askNew(b.dataset.size); return; }
    const a = b.dataset.act;
    if (a === 'home') ctx.back();
    else if (a === 'new') askNew(s.size);
    else if (a === 'mode') setMode(!prefs.flagMode);
    else if (a === 'zoom') zoom();
  });

  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    if (!paused && mines && !s.over) {
      s.elapsed += Math.min(now - last, 2000);
      $('.mn-time').textContent = fmt(s.elapsed);
    }
    last = now;
  }, 250);

  function load(saved) {
    if (!saved || saved.v !== 1 || !E.SIZES[saved.size]) return false;
    const z = E.SIZES[saved.size];
    if (saved.w !== z.w || saved.h !== z.h || typeof saved.st !== 'string' || saved.st.length !== z.w * z.h) return false;
    s = saved;
    st = Uint8Array.from(s.st, (ch) => +ch || 0);
    if (s.mines) { mines = E.unpack(s.mines, z.w * z.h); num = E.counts(z.w, z.h, mines); } else { mines = null; num = null; st.fill(0); }
    build(); persist(); render();
    return true;
  }

  return {
    start(saved) {
      if (!load(saved)) newGame(saved && E.SIZES[saved.size] ? saved.size : 'beginner');
      const mid = cells[Math.floor(s.h / 2) * s.w + Math.floor(s.w / 2)];
      if (mid) input.focus(mid);
    },
    pause() { paused = true; },
    resume() { paused = false; last = performance.now(); },
    save() { if (s) s.st = Array.from(st).join(''); return s; },
    destroy() { clearInterval(timer); stopBoom(); ro.disconnect(); },
  };
}
