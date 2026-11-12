// Solitaire (Klondike). Engine + solver: ./engine.js, run in ./worker.js for deals and hints.
import './engine.js';
const K = self.Klondike;
const { F0, WASTE, STOCK } = K;

const BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const I = (d) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  hint: I('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  stats: I('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  redeal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
};
// Suit symbols drawn as paths (no emoji fonts): 0 spade, 1 heart, 2 diamond, 3 club.
const SUIT_SVG = [
  '<path d="M12 2c3 3.6 8.5 7 8.5 11.3a4.2 4.2 0 0 1-7.2 3L14.6 22H9.4l1.3-5.7a4.2 4.2 0 0 1-7.2-3C3.5 9 9 5.6 12 2z"/>',
  '<path d="M12 21.5S2.5 15.3 2.5 8.7A4.9 4.9 0 0 1 12 6.4a4.9 4.9 0 0 1 9.5 2.3c0 6.6-9.5 12.8-9.5 12.8z"/>',
  '<path d="M12 1.5l8 10.5-8 10.5L4 12z"/>',
  '<circle cx="12" cy="6.8" r="4.4"/><circle cx="6.6" cy="13.6" r="4.4"/><circle cx="17.4" cy="13.6" r="4.4"/><path d="M12 9.5l1.6 2.5 1 10H9.4l1-10z"/>',
];
const SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANK_NAME = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
const fmt = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const HIST_CAP = 1500;

export default {
  id: 'solitaire',
  name: 'Solitaire',
  saveVersion: 1,
  input: { model: 'pointer', targets: '.tg', drag: true, focusRing: true, keys: { u: 'undo', d: 'draw' } },
  help: [
    'Build four piles, ace to king, one per suit. In the columns, stack down in alternating colours.',
    'Only a king (or a run starting with one) goes in an empty column.',
    'Tap a card to move it to the best spot; tap the stock to draw. Or drag cards and runs.',
    'Double-tap sends a card to its pile. Tap one card, then a column, to choose the spot yourself.',
    'Every deal can be won. Hint shows the next move on a winning line.',
    'When every card is face up and the stock is empty, the game finishes itself.',
    'Keyboard: arrows move, Enter picks and drops, D draws, U undoes, H hints, N new game.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  const rm = ctx.settings.reducedMotion;
  root.innerHTML = `
    <main class="screen sol">
      <header class="topbar">
        <button class="icon-btn" data-act="home" aria-label="All games">${BACK}</button>
        <div class="sol-title"><div class="sol-name">Solitaire</div><div class="muted small"><span class="sol-time">0:00</span> · <span class="sol-moves"></span></div></div>
        <button class="icon-btn" data-act="stats" aria-label="Statistics">${ICON.stats}</button>
      </header>
      <div class="sol-table pre" aria-label="Card table">
        <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${SUIT_SVG.map((p, i) => `<symbol id="sol-s${i}" viewBox="0 0 24 24">${p}</symbol>`).join('')}</defs></svg>
        <div class="sol-msg" hidden></div>
      </div>
      <div class="sol-tools">
        <button class="tool" data-act="undo">${ICON.undo}<span>Undo</span></button>
        <button class="tool" data-act="hint">${ICON.hint}<span>Hint</span></button>
        <button class="tool" data-act="new">${ICON.plus}<span>New</span></button>
      </div>
      <div class="sol-panel" hidden><div class="sol-box">
        <h3 class="sol-ptitle"></h3><p class="sol-ptext muted"></p>
        <div class="sol-choices">
          <button class="card" data-new="1"><b>Draw 1</b><span class="muted small">Relaxed</span></button>
          <button class="card" data-new="3"><b>Draw 3</b><span class="muted small">Classic</span></button>
        </div>
        <div class="modal-actions"><button class="pill sol-close" data-act="close">Cancel</button></div>
      </div></div>
    </main>`;
  const $ = (q) => root.querySelector(q);
  const table = $('.sol-table'), msgEl = $('.sol-msg'), panel = $('.sol-panel');
  const use = (su) => `<svg><use href="#sol-s${su}"/></svg>`;

  // ---------- elements: 52 cards + 13 slots, created once, positioned with transforms
  const cardEls = [];
  for (let c = 0; c < 52; c++) {
    const su = K.suit(c), r = K.rank(c), el = document.createElement('div');
    el.className = 'sc down' + (K.red(c) ? ' red' : '') + (r >= 10 ? ' court' : r === 0 ? ' ace' : '');
    el.dataset.c = c;
    el.innerHTML = `<span class="ix">${K.RANKS[r]}</span><svg class="is"><use href="#sol-s${su}"/></svg><span class="pip">${r >= 10 ? `<i>${K.RANKS[r]}</i>` : use(su)}</span>`;
    table.appendChild(el); cardEls.push(el);
  }
  const slotEls = [];
  for (let p = 0; p <= STOCK; p++) {
    const el = document.createElement('div');
    el.className = 'slot' + (p >= F0 && p < F0 + 4 ? ' found' : p === STOCK ? ' stock' : p === WASTE ? ' waste' : '');
    el.dataset.p = p;
    if (p >= F0 && p < F0 + 4) el.innerHTML = use(p - F0);
    if (p === STOCK) el.innerHTML = ICON.redeal;
    table.insertBefore(el, cardEls[0]); slotEls.push(el);
  }

  // ---------- state
  let s = null;          // { v, draw, seed, st, hist, moves, elapsed, won, counted }
  let sel = null;        // { p, i } picked card (tap-tap / keyboard)
  let hint = null;       // { cards: [], to } highlighted
  let drag = null;       // { p, i, cards, dx, dy }
  let busy = false;      // dealing or auto-finishing
  let paused = false, ver = 0, g = null;
  const loc = new Array(52);   // card → { p, i }
  const posOf = new Array(52); // card → { x, y, z }
  const stats = ctx.storage.get('stats', { 1: { played: 0, won: 0, best: 0 }, 3: { played: 0, won: 0, best: 0 } });
  let nextSeeds = ctx.storage.get('next', {});

  // ---------- worker
  let worker = null, reqId = 0;
  const pending = new Map();
  function call(msg) {
    if (!worker) {
      worker = new Worker(new URL('worker.js', import.meta.url));
      worker.onmessage = (e) => { const f = pending.get(e.data.id); pending.delete(e.data.id); if (f) f(e.data); };
    }
    const id = ++reqId;
    return new Promise((res) => { pending.set(id, res); worker.postMessage({ ...msg, id }); });
  }
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;
  function prefetch(draw) {
    if (nextSeeds[draw] != null) return;
    call({ type: 'deal', draw, seed: randomSeed() }).then((r) => { nextSeeds[draw] = r.seed; ctx.storage.set('next', nextSeeds); });
  }

  // ---------- layout
  function geom() {
    const W = table.clientWidth, H = table.clientHeight, pad = 6;
    const gap = Math.max(4, Math.round(W * 0.01));
    let cw = Math.floor((W - 2 * pad - 6 * gap) / 7);
    cw = Math.max(30, Math.min(cw, 100, Math.floor((H - 2 * pad) / 1.42 / 3.6)));
    const ch = Math.round(cw * 1.42);
    const x0 = Math.round((W - (7 * cw + 6 * gap)) / 2);
    const topY = pad, tabY = pad + ch + Math.max(10, Math.round(gap * 2.5));
    return { W, H, pad, gap, cw, ch, x0, topY, tabY, col: (p) => x0 + p * (cw + gap), fd: Math.max(6, Math.round(ch * 0.13)), fu: Math.round(ch * 0.33) };
  }
  function place() {
    g = geom();
    table.style.setProperty('--cw', g.cw + 'px'); table.style.setProperty('--ch', g.ch + 'px');
    const st = s.st, { col, topY, tabY, fd, ch } = g;
    for (let p = 0; p < 7; p++) {
      const pile = st.t[p], d = st.down[p], up = pile.length - d;
      let fu = g.fu;
      const room = g.H - g.pad - tabY - ch - d * fd;
      if (up > 1 && (up - 1) * fu > room) fu = Math.max(Math.round(ch * 0.2), Math.floor(room / (up - 1)));
      let y = tabY;
      pile.forEach((c, i) => { loc[c] = { p, i }; posOf[c] = { x: col(p), y, z: 10 + i, up: i >= d }; y += i < d ? fd : fu; });
      slotPos(p, col(p), tabY);
    }
    for (let i = 0; i < 4; i++) {
      for (let r = 0; r < st.f[i]; r++) { const c = i * 13 + r; loc[c] = { p: F0 + i, i: r }; posOf[c] = { x: col(3 + i), y: topY, z: 10 + r, up: true }; }
      slotPos(F0 + i, col(3 + i), topY);
    }
    const fan = Math.round(Math.min(g.cw * 0.46, (g.cw + g.gap) / 2)), nw = st.waste.length, vis = st.draw === 3 ? Math.min(3, nw) : Math.min(1, nw);
    st.waste.forEach((c, i) => { const k = i - (nw - vis); loc[c] = { p: WASTE, i }; posOf[c] = { x: col(1) + Math.max(0, k) * fan, y: topY, z: 10 + i, up: true }; });
    slotPos(WASTE, col(1), topY);
    st.stock.forEach((c, i) => { loc[c] = { p: STOCK, i }; posOf[c] = { x: col(0), y: topY, z: 10 + i, up: false }; });
    slotPos(STOCK, col(0), topY);
  }
  function slotPos(p, x, y) { slotEls[p].style.transform = `translate(${x}px, ${y}px)`; }

  const isPickable = (c) => {
    const L = loc[c], st = s.st;
    if (L.p < 7) return L.i >= st.down[L.p];
    if (L.p === WASTE) return L.i === st.waste.length - 1;
    if (L.p >= F0 && L.p < F0 + 4) return L.i === st.f[L.p - F0] - 1;
    return false;
  };
  function render(opts = {}) {
    place();
    table.classList.remove('pre');
    const st = s.st, hl = new Set(hint ? hint.cards : []);
    const selCards = sel ? new Set(K.pick(st, sel.p, sel.i) || []) : new Set();
    for (let c = 0; c < 52; c++) {
      const el = cardEls[c], P = posOf[c], prev = el._pos;
      const moved = prev && (prev.x !== P.x || prev.y !== P.y);
      if (!drag || !drag.cards.includes(c)) {
        el.style.transform = `translate(${P.x}px, ${P.y}px)`;
        el.style.zIndex = moved && !opts.instant ? 300 + P.z : P.z;
        if (moved && !opts.instant) setTimeout(() => { if (el._pos === P) el.style.zIndex = P.z; }, rm ? 0 : 220);
      }
      el._pos = P;
      const pick = !s.won && !busy && isPickable(c);
      el.classList.toggle('down', !P.up);
      const L = loc[c];
      el.classList.toggle('under', (L.p === STOCK && L.i < st.stock.length - 1) || (L.p === WASTE && L.i < st.waste.length - 3) || (L.p >= F0 && L.p < F0 + 4 && L.i < st.f[L.p - F0] - 1));
      el.classList.toggle('tg', pick);
      el.classList.toggle('sel', selCards.has(c));
      el.classList.toggle('hint', hl.has(c));
      el.setAttribute('aria-label', P.up ? RANK_NAME[K.rank(c)] + ' of ' + SUIT_NAME[K.suit(c)] : 'face-down card');
    }
    for (let p = 0; p <= STOCK; p++) {
      const el = slotEls[p];
      const empty = p < 7 ? !st.t[p].length : p === WASTE ? !st.waste.length : p === STOCK ? !st.stock.length : !st.f[p - F0];
      el.classList.toggle('tg', !s.won && !busy && (p === STOCK || (empty && p !== WASTE)));
      el.classList.toggle('hint', !!hint && hint.to === p);
      el.classList.toggle('sel', false);
      if (p === STOCK) { el.classList.toggle('empty', empty); el.classList.toggle('none', empty && !st.waste.length); el.setAttribute('aria-label', empty ? 'Turn the waste over' : 'Stock: draw'); }
    }
    if (hint && hint.to != null && hint.to < 7 && st.t[hint.to].length) cardEls[K.top(st.t[hint.to])].classList.add('hint');
    if (hint && hint.to >= F0 && hint.to < F0 + 4 && st.f[hint.to - F0]) cardEls[K.foundTop(st, hint.to - F0)].classList.add('hint');
    $('.sol-moves').textContent = s.moves + (s.moves === 1 ? ' move' : ' moves');
    $('.sol-time').textContent = fmt(s.elapsed);
    root.querySelector('[data-act="undo"]').disabled = !s.hist.length || s.won || busy;
  }

  function persist() {
    ctx.storage.set('save', s);
    const n = s.st.f.reduce((a, b) => a + b, 0);
    ctx.setStatus(s.won ? null : 'Draw ' + s.st.draw + ' · ' + s.moves + (s.moves === 1 ? ' move' : ' moves'), Math.round((n / 52) * 100));
  }

  // ---------- game flow
  function begin(seed, draw) {
    s = { v: 1, seed, st: K.deal(seed, draw), hist: [], moves: 0, elapsed: 0, won: false, counted: false };
    sel = null; hint = null; busy = false; ver++;
    msgEl.hidden = true;
    // deal animation: everything starts on the stock
    if (!rm) {
      g = geom();
      cardEls.forEach((el) => { el.style.transition = 'none'; el.style.transform = `translate(${g.col(0)}px, ${g.topY}px)`; el._pos = { x: g.col(0), y: g.topY }; el.classList.add('down'); });
      void table.offsetWidth;
      s.st.t.forEach((pile, p) => pile.forEach((c, i) => { cardEls[c].style.transitionDelay = (i * 7 + p) * 18 + 'ms'; }));
      cardEls.forEach((el) => { el.style.transition = ''; });
      setTimeout(() => cardEls.forEach((el) => { el.style.transitionDelay = ''; }), 1200);
    }
    persist(); render({ instant: rm });
    ctx.requestPersistence();
    prefetch(draw);
  }
  function newGame(draw) {
    closePanel();
    if (nextSeeds[draw] != null) { const seed = nextSeeds[draw]; delete nextSeeds[draw]; ctx.storage.set('next', nextSeeds); return begin(seed, draw); }
    busy = true; msgEl.textContent = 'Shuffling…'; msgEl.hidden = false; if (s) render();
    const my = ++ver;
    call({ type: 'deal', draw, seed: randomSeed() }).then((r) => { if (ver === my) begin(r.seed, draw); });
  }
  function act(m, opts = {}) {
    if (!K.legal(s.st, m)) return false;
    const rec = K.apply(s.st, m);
    s.hist.push(rec);
    if (s.hist.length > HIST_CAP) s.hist.splice(0, s.hist.length - HIST_CAP);
    if (!opts.auto) s.moves++;
    if (!s.counted) { s.counted = true; stats[s.st.draw].played++; ctx.storage.set('stats', stats); }
    sel = null; hint = null; ver++;
    if (rec[3]) ctx.audio.tone(660, 40, 'triangle');
    else ctx.audio.tone(m.k === 'draw' ? 300 : 480, 35, 'triangle');
    ctx.haptics(6);
    if (K.won(s.st)) return win();
    persist(); render();
    if (!opts.auto && K.canAutoFinish(s.st)) autoFinish();
    return true;
  }
  function autoFinish() {
    busy = true; render();
    const step = () => {
      const m = K.nextFinishMove(s.st);
      if (!m) { busy = false; persist(); render(); return; }
      busy = false; act(m, { auto: true }); if (!s.won) busy = true;
      if (!s.won) { if (rm) step(); else setTimeout(step, 75); }
    };
    setTimeout(step, rm ? 0 : 200);
  }
  function undo() {
    if (busy || s.won || !s.hist.length) return;
    K.undo(s.st, s.hist.pop());
    s.moves++; sel = null; hint = null; ver++;
    persist(); render();
  }
  function win() {
    s.won = true; busy = false;
    const st = stats[s.st.draw];
    st.won++;
    const record = !st.best || s.elapsed < st.best;
    if (record) st.best = Math.round(s.elapsed);
    ctx.storage.set('stats', stats);
    persist(); render();
    ctx.audio.tone(523, 90, 'triangle'); setTimeout(() => ctx.audio.tone(659, 90, 'triangle'), 110); setTimeout(() => ctx.audio.tone(784, 180, 'triangle'), 220);
    ctx.haptics(30);
    setTimeout(() => openPanel('You won', 'Draw ' + s.st.draw + ' · ' + fmt(s.elapsed) + ' · ' + s.moves + ' moves' + (record ? '\nNew best time' : '') + '\nWon ' + st.won + ' of ' + Math.max(st.played, st.won) + ' games. Play again?', 'Close'), rm ? 50 : 700);
  }
  // ---------- panel (new game / win)
  function openPanel(title, text, closeLabel = 'Cancel') {
    $('.sol-ptitle').textContent = title;
    $('.sol-ptext').textContent = text;
    $('.sol-close').textContent = closeLabel;
    $('.sol-close').hidden = !s;
    panel.hidden = false;
    root.querySelectorAll('[data-new]').forEach((b) => b.classList.toggle('cur', s && +b.dataset.new === s.st.draw));
  }
  function closePanel() { panel.hidden = true; }
  ctx.onBack(() => { if (!panel.hidden && s) { closePanel(); return true; } return false; });
  function askNew() {
    if (busy && !s) return;
    openPanel('New game', (s && s.moves && !s.won ? 'This game will count as lost. ' : '') + 'Every deal can be won.');
  }
  function showStats() {
    const line = (d) => { const x = stats[d]; return `Draw ${d}: ${x.played} played · ${x.won} won` + (x.played ? ` (${Math.round((x.won / x.played) * 100)}%)` : '') + (x.best ? ` · best ${fmt(x.best)}` : ''); };
    ctx.ui.confirm(line(1) + '\n' + line(3), 'OK', null);
  }

  // ---------- hint
  async function showHint() {
    if (busy || s.won) return;
    const my = ver;
    msgEl.textContent = 'Thinking…'; msgEl.hidden = false;
    const r = await call({ type: 'hint', state: s.st });
    if (my !== ver) return;
    msgEl.hidden = true;
    if (!r.move) { ctx.ui.toast(r.gaveUp ? 'No winning path found from here. Try Undo.' : 'No winning path from here. Try Undo.', 2600); return; }
    const m = r.move;
    if (m.k === 'draw') hint = { cards: s.st.stock.length ? [K.top(s.st.stock)] : [], to: STOCK };
    else hint = { cards: m.from < 7 ? s.st.t[m.from].slice(-m.n) : m.from === WASTE ? [K.top(s.st.waste)] : [K.foundTop(s.st, m.from - F0)], to: m.to };
    if (m.k === 'draw') ctx.ui.toast(s.st.stock.length ? 'Draw from the stock' : 'Turn the waste over');
    render();
  }

  // ---------- input
  const locate = (el) => {
    if (el.dataset.c != null) { const c = +el.dataset.c; return { c, p: loc[c].p, i: loc[c].i }; }
    return { c: -1, p: +el.dataset.p, i: -1 };
  };
  const pileIdx = (L) => (L.p < 7 ? L.i : 0);
  function moveTo(src, to) {
    const ds = K.dests(s.st, src.p, pileIdx(src));
    const ok = ds.includes(to) || ds.includes(-1 - to);
    if (!ok) return false;
    const n = src.p < 7 ? s.st.t[src.p].length - src.i : 1;
    return act({ k: 'mv', from: src.p, to, n });
  }
  const destPile = (L) => (L.p === STOCK ? -1 : L.p === WASTE ? -1 : L.p);
  function nudge(c) {
    ctx.haptics(20);
    if (rm || c < 0) return;
    cardEls[c].animate([{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '5px 0' }, { translate: '0 0' }], { duration: 180 });
  }
  input.on('activate', (el, { by }) => {
    if (busy || !s || s.won || !panel.hidden) return;
    const L = locate(el);
    if (L.p === STOCK) { sel = null; act({ k: 'draw' }); return; }
    if (sel) {
      const same = L.c >= 0 && sel.p === L.p && sel.i === L.i;
      if (!same && destPile(L) >= 0 && moveTo(sel, destPile(L))) return;
      if (by === 'key' && !same) { sel = L.c >= 0 && isPickable(L.c) ? { p: L.p, i: L.i } : null; hint = null; render(); return; }
      if (by === 'key' && same) { const best = K.dests(s.st, sel.p, pileIdx(sel)).filter((d) => d >= 0)[0]; const src = sel; sel = null; if (best == null || !moveTo(src, best)) { nudge(L.c); render(); } return; }
      sel = null;
    }
    if (L.c < 0 || !isPickable(L.c)) { render(); return; }
    if (by === 'key') { sel = { p: L.p, i: L.i }; hint = null; render(); return; }
    const best = K.dests(s.st, L.p, pileIdx(L)).filter((d) => d >= 0)[0];
    if (best != null && moveTo(L, best)) return;
    // nowhere to go: pick it up so the next tap chooses the spot
    nudge(L.c); sel = { p: L.p, i: L.i }; hint = null; render();
  });
  input.on('doubleactivate', (el) => {
    if (busy || !s || s.won) return;
    const L = locate(el);
    if (L.c < 0 || !isPickable(L.c) || (L.p >= F0 && L.p < F0 + 4)) return;
    if (L.p < 7 && L.i !== s.st.t[L.p].length - 1) return;
    if (K.canFound(s.st, L.c)) act({ k: 'mv', from: L.p, to: F0 + K.suit(L.c), n: 1 });
  });
  input.on('dragstart', (el) => {
    if (busy || !s || s.won || !panel.hidden) return;
    const L = locate(el);
    if (L.c < 0 || !isPickable(L.c)) return;
    const cards = K.pick(s.st, L.p, pileIdx(L));
    drag = { p: L.p, i: L.i, cards, dx: 0, dy: 0 };
    sel = null; hint = null;
    cards.forEach((c, k) => { cardEls[c].classList.add('drag'); cardEls[c].style.zIndex = 1000 + k; });
    render();
  });
  input.on('dragmove', ({ dx, dy }) => {
    if (!drag) return;
    drag.dx = dx; drag.dy = dy;
    for (const c of drag.cards) { const P = posOf[c]; cardEls[c].style.transform = `translate(${P.x + dx}px, ${P.y + dy}px) scale(1.04)`; }
  });
  input.on('drop', () => {
    if (!drag) return;
    const d = drag; drag = null;
    d.cards.forEach((c) => cardEls[c].classList.remove('drag'));
    const P = posOf[d.cards[0]], cx = P.x + d.dx, cy = P.y + d.dy;
    // the destination is the legal pile the dragged card overlaps most
    let best = null, area = 0;
    for (const code of K.dests(s.st, d.p, d.p < 7 ? d.i : 0)) {
      const p = code < 0 ? -1 - code : code;
      const x = p < 7 ? g.col(p) : g.col(3 + p - F0), y = p < 7 ? g.tabY : g.topY;
      const bottom = p < 7 ? Math.max(g.H, y + g.ch) : y + g.ch;
      const top = p < 7 && s.st.t[p].length ? posOf[K.top(s.st.t[p])].y : y;
      const ox = Math.min(cx + g.cw, x + g.cw) - Math.max(cx, x);
      const oy = Math.min(cy + g.ch, bottom) - Math.max(cy, Math.min(top, y));
      if (ox > 0 && oy > 0 && ox * oy > area) { area = ox * oy; best = p; }
    }
    if (best == null || !act({ k: 'mv', from: d.p, to: best, n: d.cards.length })) render();
  });
  input.on('command', (name) => {
    if (!s) return;
    if (name === 'undo') undo();
    else if (name === 'hint') showHint();
    else if (name === 'new') askNew();
    else if (name === 'draw' && !busy && !s.won) act({ k: 'draw' });
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-new]');
    if (!b) return;
    if (b.dataset.new) return newGame(+b.dataset.new);
    const a = b.dataset.act;
    if (a === 'home') ctx.back();
    else if (a === 'close') closePanel();
    else if (!s) return;
    else if (a === 'undo') undo();
    else if (a === 'hint') showHint();
    else if (a === 'stats') showStats();
    else if (a === 'new') askNew();
  });

  const ro = new ResizeObserver(() => { if (s) { table.classList.add('still'); render({ instant: true }); void table.offsetWidth; table.classList.remove('still'); } });
  ro.observe(table);

  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    if (s && !paused && !s.won && s.hist.length) { s.elapsed += Math.min(now - last, 2000); $('.sol-time').textContent = fmt(s.elapsed); }
    last = now;
  }, 500);

  function valid(x) {
    if (!x || x.v !== 1 || !x.st || !Array.isArray(x.st.t) || x.st.t.length !== 7 || !Array.isArray(x.hist)) return false;
    const all = [...x.st.t.flat(), ...x.st.stock, ...x.st.waste];
    return all.length + x.st.f.reduce((a, b) => a + b, 0) === 52;
  }

  return {
    start(saved) {
      if (valid(saved)) {
        s = saved; render({ instant: true }); persist(); prefetch(s.st.draw);
        if (!s.won && K.canAutoFinish(s.st)) autoFinish();
      } else newGame(nextSeeds[1] != null || nextSeeds[3] == null ? 1 : 3);
    },
    pause() { paused = true; },
    resume() { paused = false; last = performance.now(); },
    save() { return s; },
    destroy() { clearInterval(timer); ro.disconnect(); if (worker) worker.terminate(); },
  };
}
