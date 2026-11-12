// Chess against Stockfish. Rules: ./chess.js. Engine: ./engine/ (Stockfish.js 19 lite, GPL-3.0) in a Web Worker over UCI.
import './chess.js';
const C = self.Chess;

const BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const I = (d) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  hint: I('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  flag: I('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
};

// Original piece art, 45×45. One path per piece (plus small details), filled per side.
const BASE = 'M10 39.5h25v-3c0-1.2-.9-2-2-2H12c-1.1 0-2 .8-2 2z';
const ART = {
  p: [BASE + 'M15 34.5h15c0-3.6-2.4-6.6-5.3-7.9 1.9-1.2 3.1-3.3 3.1-5.6 0-2.4-1.3-4.4-3.2-5.5a4.6 4.6 0 1 0-4.3 0c-1.9 1.1-3.2 3.1-3.2 5.5 0 2.3 1.2 4.4 3.1 5.6-2.9 1.3-5.2 4.3-5.2 7.9z', ''],
  r: [BASE + 'M12.5 34.5h20l-2-4h-16zM15 30.5h15l-1-13H16zM12.5 17.5h20v-8h-4.2v3h-3.6v-3h-4.4v3h-3.6v-3h-4.2z', 'M15.5 17.5h14M14.6 30.5h15.8'],
  n: [BASE + 'M14 34.5h19.5c0-7-1.4-12.5-4.2-16.8-2.2-3.4-5.2-5.8-8.6-7l-1.4-3.2-2.3 3.8c-3.2 1.6-5.4 4.4-6.9 8L8.5 24c-.6 1.6.6 3.2 2.3 2.9l3.6-1.3 4.1-.6c1.3-.1 1.8 1.4.8 2.4-3 2.7-5.3 4.6-5.3 7.1z', 'M29.6 19c1.4 4 2 8.8 1.9 14M11.3 23.6l.9-.4'],
  b: [BASE + 'M15 34.5h15l-2.2-3.6h-10.6zM22.5 11c-5 3.8-8 8.6-7 13.6.6 3 3 5.4 7 6.3 4-.9 6.4-3.3 7-6.3 1-5-2-9.8-7-13.6zM22.5 6.3a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8z', 'M20.2 18.6l5 5M17.4 30.9h10.2'],
  q: [BASE + 'M12.5 34.5h20L37 15.5l-5.2 8.6-2.3-12.4-3.7 11.4-3.3-13-3.3 13-3.7-11.4-2.3 12.4L8 15.5zM8 13a2.3 2.3 0 1 0 0 4.6A2.3 2.3 0 1 0 8 13zM15.5 9.4a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 1 0 0-4.6zM22.5 6.8a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 1 0 0-4.6zM29.5 9.4a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 1 0 0-4.6zM37 13a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 1 0 0-4.6z', 'M12 29.5c6.5-1.6 14.5-1.6 21 0'],
  k: [BASE + 'M13 34.5h19c1.6-4 4.2-7.8 4.2-11.8 0-3.6-2.6-5.7-5.6-5.7-3.2 0-5.7 2.6-8.1 6.2-2.4-3.6-4.9-6.2-8.1-6.2-3 0-5.6 2.1-5.6 5.7 0 4 2.6 7.8 4.2 11.8zM21 5.5h3v3.2h3.2v3H24v5h-3v-5h-3.2v-3H21z', 'M22.5 22.8v11.7M13.8 29.6c5.6-1.4 11.8-1.4 17.4 0'],
};
const SYMBOLS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + Object.entries(ART).map(([t, [body, lines]]) =>
  ['w', 'b'].map((c) => `<symbol id="ch-${c}${t}" viewBox="0 0 45 45"><path d="${body}" style="fill:var(--p${c});stroke:var(--p${c}-line)" stroke-width="1.5" stroke-linejoin="round"/>${lines ? `<path d="${lines}" style="stroke:var(--p${c}-detail)" fill="none" stroke-width="1.3" stroke-linecap="round"/>` : ''}</symbol>`).join('')).join('') + '</svg>';
const pieceSvg = (p) => `<svg class="pc" viewBox="0 0 45 45"><use href="#ch-${C.colorOf(p)}${p.toLowerCase()}"/></svg>`;
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

// Difficulty: Stockfish "Skill Level" plus search limits. Level 1 also plays some random moves.
const LEVELS = [
  { skill: 0, depth: 1, ms: 60, random: 0.3 }, { skill: 1, depth: 2, ms: 100, random: 0.1 }, { skill: 3, depth: 3, ms: 150 },
  { skill: 6, depth: 5, ms: 250 }, { skill: 9, depth: 8, ms: 400 }, { skill: 13, depth: 11, ms: 700 },
  { skill: 17, depth: 15, ms: 1000 }, { skill: 20, depth: 30, ms: 1500 },
];
const REASON = { checkmate: 'Checkmate', stalemate: 'Stalemate', 'insufficient material': 'Draw: insufficient material', '50-move rule': 'Draw: 50-move rule', 'threefold repetition': 'Draw: threefold repetition', resigned: 'Resigned' };

export default {
  id: 'chess',
  name: 'Chess',
  input: { model: 'pointer', targets: '.sq', drag: true, focusRing: true, keys: { u: 'undo', r: 'resign' } },
  help: [
    'Tap a piece, then a dotted square, or drag it.',
    'Undo takes back your last move and the computer\'s reply.',
    'Hint shows the move the engine likes best.',
    'Levels 1 to 8: 1 is for beginners, 8 is full strength.',
    'Keyboard: arrows move, Enter picks/drops, U or Ctrl/Cmd+Z undoes, H hints, N new game.',
    'Engine: Stockfish (GPL-3.0), runs on your device.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  root.innerHTML = SYMBOLS + `
    <main class="screen ch">
      <header class="topbar">
        <button class="icon-btn" data-act="home" aria-label="All games">${BACK}</button>
        <div class="ch-title"><b>Chess</b><div class="muted small ch-sub"></div></div>
        <button class="icon-btn" data-act="new" aria-label="New game">${ICON.plus}</button>
      </header>
      <div class="ch-player ch-them"><span class="ch-dot"></span><span class="ch-name"></span><span class="ch-think muted small"></span><span class="ch-cap"></span></div>
      <div class="ch-wrap"><div class="ch-board" role="grid" aria-label="Chess board"></div>
        <div class="ch-promo" hidden><div class="ch-promo-box"></div></div>
      </div>
      <div class="ch-player ch-you"><span class="ch-dot"></span><span class="ch-name">You</span><span class="ch-msg small" aria-live="polite"></span><span class="ch-cap"></span></div>
      <div class="ch-moves" aria-label="Moves"></div>
      <div class="ch-tools">
        <button class="tool" data-act="undo">${ICON.undo}<span>Undo</span></button>
        <button class="tool" data-act="hint">${ICON.hint}<span>Hint</span></button>
        <button class="tool" data-act="resign">${ICON.flag}<span>Resign</span></button>
        <button class="tool" data-act="new">${ICON.plus}<span>New</span></button>
      </div>
      <div class="ch-panel" hidden>
        <div class="ch-card">
          <h3>New game</h3>
          <div class="muted small">Play as</div>
          <div class="seg ch-color"><button data-color="w">White</button><button data-color="r">Random</button><button data-color="b">Black</button></div>
          <div class="muted small">Level <b class="ch-lv"></b> <span class="ch-lvname"></span></div>
          <div class="seg ch-levels">${LEVELS.map((_, i) => `<button data-level="${i + 1}">${i + 1}</button>`).join('')}</div>
          <div class="ch-row"><button class="btn ch-cancel" data-act="cancel">Cancel</button><button class="btn primary" data-act="play">Play</button></div>
        </div>
      </div>
    </main>`;
  const $ = (q) => root.querySelector(q);
  const boardEl = $('.ch-board');
  const sqs = [];
  for (let k = 0; k < 64; k++) { const el = document.createElement('div'); boardEl.appendChild(el); sqs.push(el); }

  // ---------- state ----------
  let s = null;   // saved: { v, start, moves: string[] (UCI), human: 'w'|'b', level, pref, resigned }
  let g = null;   // derived: C.play(...)
  let legal = [], sel = -1, hint = null, dragFrom = -1, paused = false, promoting = null;
  const prefs = ctx.storage.get('prefs', { pref: 'w', level: 3 });

  function recompute() {
    g = C.play(s.start, s.moves);
    legal = C.moves(g.pos);
    if (s.resigned) g.result = { over: true, winner: s.human === 'w' ? 'b' : 'w', reason: 'resigned' };
  }
  const myTurn = () => !g.result.over && g.pos.turn === s.human && !promoting;
  const sqAt = (k) => (s.human === 'w' ? k : 63 - k); // display slot → board square

  function newGame(pref, level) {
    const human = pref === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : pref;
    s = { v: 1, start: C.START, moves: [], human, level, pref, resigned: false };
    Object.assign(prefs, { pref, level }); ctx.storage.set('prefs', prefs);
    cancelEngine(); sel = -1; hint = null;
    recompute(); persist(); render(); think();
    ctx.requestPersistence();
  }
  function persist() {
    ctx.storage.set('save', { ...s, moves: s.moves.join(' ') });
    ctx.setStatus(g.result.over ? null : 'Level ' + s.level + ' · move ' + g.pos.full);
  }

  // ---------- render ----------
  function render() {
    const p = g.pos, last = s.moves.length ? s.moves[s.moves.length - 1] : '';
    const lastSq = last ? [C.sqIndex(last.slice(0, 2)), C.sqIndex(last.slice(2, 4))] : [];
    const check = C.inCheck(p) ? C.kingSq(p, p.turn) : -1;
    const targets = new Map();
    if (sel >= 0) for (const m of legal) if (m.from === sel) targets.set(m.to, m.flags === 'c' || m.flags === 'e');
    for (let k = 0; k < 64; k++) {
      const q = sqAt(k), el = sqs[k], x = p.b[q], r = q >> 3, f = q & 7;
      let cls = 'sq ' + ((r + f) & 1 ? 'dk' : 'lt');
      if (lastSq.includes(q)) cls += ' last';
      if (q === sel) cls += ' sel';
      if (q === check) cls += ' check';
      if (hint && (hint[0] === q || hint[1] === q)) cls += ' hint';
      if (targets.has(q)) cls += targets.get(q) ? ' cap' : ' dot';
      if (el.classList.contains('kb-focus')) cls += ' kb-focus';
      if (el.className !== cls) el.className = cls;
      el.dataset.q = q;
      const co = (k % 8 === 0 ? `<i class="co rk">${8 - r}</i>` : '') + (k >= 56 ? `<i class="co fl">${'abcdefgh'[f]}</i>` : '');
      const html = co + (x ? pieceSvg(x) : '');
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
      el.setAttribute('aria-label', C.sqName(q) + (x ? ' ' + (C.colorOf(x) === 'w' ? 'white ' : 'black ') + NAMES[x.toLowerCase()] : ''));
    }
    const lv = LEVELS[s.level - 1];
    $('.ch-sub').textContent = 'Level ' + s.level + ' · You play ' + (s.human === 'w' ? 'White' : 'Black');
    $('.ch-them .ch-name').textContent = 'Computer · level ' + s.level + (lv.skill === 20 ? ' (full strength)' : '');
    $('.ch-them .ch-dot').className = 'ch-dot ' + (s.human === 'w' ? 'b' : 'w');
    $('.ch-you .ch-dot').className = 'ch-dot ' + s.human;
    $('.ch-them .ch-think').textContent = engine.busyFor === 'move' ? 'thinking…' : '';
    // captured material, shown next to the side that captured it
    const count = (b) => { const n = {}; for (const x of b) if (x) n[x] = (n[x] || 0) + 1; return n; };
    const start = count(C.parseFEN(s.start).b), now = count(p.b);
    const lost = (c) => 'qrbnp'.split('').map((t) => { const x = c === 'w' ? t.toUpperCase() : t; return pieceSvg(x).repeat(Math.max(0, (start[x] || 0) - (now[x] || 0))); }).join('');
    const them = s.human === 'w' ? 'b' : 'w';
    $('.ch-them .ch-cap').innerHTML = lost(s.human);
    $('.ch-you .ch-cap').innerHTML = lost(them);
    // message
    let msg = '';
    if (g.result.over) {
      const r = g.result;
      msg = REASON[r.reason] + (r.winner ? (r.winner === s.human ? ' · You win' : ' · Computer wins') : '');
    } else if (myTurn()) msg = C.inCheck(p) ? 'Check! Your move' : 'Your move';
    const m = $('.ch-msg');
    m.textContent = msg; m.classList.toggle('end', g.result.over);
    // move list
    let html = '';
    const startFull = C.parseFEN(s.start).full, blackFirst = C.parseFEN(s.start).turn === 'b';
    g.sans.forEach((san, i) => {
      const ply = i + (blackFirst ? 1 : 0);
      if (ply % 2 === 0) html += `<b>${startFull + ply / 2}.</b>`;
      else if (i === 0) html += `<b>${startFull}…</b>`;
      html += `<span${i === g.sans.length - 1 ? ' class="cur"' : ''}>${san}</span>`;
    });
    const ml = $('.ch-moves');
    ml.innerHTML = html || '<span class="muted">' + (s.human === 'w' ? 'You move first.' : 'The computer moves first.') + '</span>';
    ml.scrollTop = ml.scrollHeight;
    root.querySelector('[data-act="undo"]').disabled = !undoable();
    root.querySelector('[data-act="hint"]').disabled = !myTurn();
    root.querySelector('[data-act="resign"]').disabled = g.result.over;
  }

  // ---------- moves ----------
  function play(m, by) {
    const san = C.san(g.pos, m, legal);
    s.moves.push(C.uci(m));
    sel = -1; hint = null;
    recompute(); persist(); render();
    if (by !== 'drag') slide(m);
    const cap = san.includes('x');
    ctx.audio.tone(cap ? 330 : 440, 45, 'triangle'); ctx.haptics(cap ? 14 : 8);
    if (g.result.over) return gameOver();
    think();
  }
  function slide(m) {
    if (ctx.settings.reducedMotion) return;
    const a = sqs.find((e) => +e.dataset.q === m.from), b = sqs.find((e) => +e.dataset.q === m.to), pc = b && b.querySelector('.pc');
    if (!a || !pc) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    pc.animate([{ transform: `translate(${ra.left - rb.left}px, ${ra.top - rb.top}px)` }, { transform: 'none' }], { duration: 160, easing: 'cubic-bezier(.3,.7,.4,1)' });
  }
  async function humanMove(from, to, by) {
    const cands = legal.filter((m) => m.from === from && m.to === to);
    if (!cands.length) return false;
    let m = cands[0];
    if (cands.length > 1) {
      const promo = await pickPromotion(g.pos.turn);
      if (!promo) { sel = -1; render(); return true; }
      m = cands.find((x) => x.promo === promo);
    }
    play(m, by);
    return true;
  }
  function pickPromotion(color) {
    const box = $('.ch-promo-box');
    box.innerHTML = 'qrbn'.split('').map((t) => `<button data-promo="${t}" aria-label="${NAMES[t]}">${pieceSvg(color === 'w' ? t.toUpperCase() : t)}</button>`).join('');
    $('.ch-promo').hidden = false;
    return new Promise((resolve) => { promoting = (v) => { promoting = null; $('.ch-promo').hidden = true; resolve(v); }; });
  }
  function undoable() { return !promoting && s.moves.length > (s.human === 'b' ? 1 : 0) && !s.resigned; }
  function undo() {
    if (!undoable()) return;
    cancelEngine();
    s.moves.pop(); recompute();
    while (s.moves.length && g.pos.turn !== s.human) { s.moves.pop(); recompute(); }
    sel = -1; hint = null;
    persist(); render(); think();
  }
  async function gameOver() {
    const r = g.result;
    ctx.setStatus(null);
    const win = r.winner === s.human;
    ctx.audio.tone(win ? 784 : r.winner ? 220 : 440, 200, 'triangle');
    const text = REASON[r.reason] + '\n' + (r.winner ? (win ? 'You win! 🎉' : 'The computer wins.') : 'The game is drawn.');
    await new Promise((res) => setTimeout(res, ctx.settings.reducedMotion ? 0 : 500));
    if (g && g.result.over && await ctx.ui.confirm(text, 'New game', 'Look at board')) openPanel();
  }
  async function resign() {
    if (g.result.over) return;
    if (!(await ctx.ui.confirm('Resign this game?', 'Resign'))) return;
    cancelEngine(); s.resigned = true; sel = -1; hint = null;
    recompute(); persist(); render(); gameOver();
  }

  // ---------- engine ----------
  // One search at a time. A new request while busy stops the current one and starts when its bestmove arrives.
  const engine = { w: null, ready: false, cur: null, next: null, busyFor: '', failed: false };
  function spawn() {
    try {
      engine.w = new Worker(new URL('engine/stockfish-19-lite-single.js', import.meta.url));
    } catch (e) { engine.failed = true; return; }
    engine.w.onmessage = (e) => onLine(String(e.data));
    engine.w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); engineFailed(); };
    engine.w.postMessage('uci');
    engine.w.postMessage('setoption name Hash value 16');
    engine.w.postMessage('isready');
  }
  function engineFailed() {
    engine.failed = true;
    if (engine.w) engine.w.terminate();
    engine.w = null;
    const cur = engine.cur; engine.cur = null; engine.next = null; engine.busyFor = '';
    if (cur && !cur.stale) finish(cur, null);
  }
  function onLine(line) {
    if (line === 'readyok') engine.ready = true;
    if (!line.startsWith('bestmove')) return;
    const cur = engine.cur, best = line.split(' ')[1];
    clearTimeout(engine.timer);
    engine.cur = null; engine.busyFor = '';
    if (engine.next) { const n = engine.next; engine.next = null; send(n); }
    if (cur && !cur.stale) finish(cur, best && best !== '(none)' ? best : null);
  }
  function send(req) {
    if (engine.failed) return setTimeout(() => finish(req, null), 300);
    if (!engine.w) spawn();
    if (engine.failed) return setTimeout(() => finish(req, null), 300);
    engine.cur = req; engine.busyFor = req.kind;
    const w = engine.w;
    w.postMessage('setoption name Skill Level value ' + req.skill);
    w.postMessage('position fen ' + req.fen);
    w.postMessage('go depth ' + req.depth + ' movetime ' + req.ms);
    engine.timer = setTimeout(() => { if (engine.cur === req) engineFailed(); }, 20000 + req.ms);
  }
  function request(req) {
    req.fen = C.toFEN(g.pos); req.t0 = performance.now();
    if (engine.cur) { engine.cur.stale = true; engine.next = req; engine.w.postMessage('stop'); }
    else send(req);
    render();
  }
  function cancelEngine() {
    if (engine.cur) { engine.cur.stale = true; if (engine.w) engine.w.postMessage('stop'); }
    engine.next = null;
  }
  function think() {
    if (!g || g.result.over || paused || g.pos.turn === s.human) return;
    const lv = LEVELS[s.level - 1];
    request({ kind: 'move', skill: lv.skill, depth: lv.depth, ms: lv.ms, random: lv.random || 0 });
  }
  function finish(req, best) {
    if (req.stale || !g || C.toFEN(g.pos) !== req.fen) return;
    let m = best && C.fromUci(g.pos, best);
    if (req.kind === 'hint') {
      if (!m) m = fallbackMove();
      if (m) { hint = [m.from, m.to]; sel = -1; }
      return render();
    }
    if (!m || (req.random && Math.random() < req.random)) m = (req.random ? legal[Math.floor(Math.random() * legal.length)] : null) || m || fallbackMove();
    const wait = Math.max(0, (ctx.settings.reducedMotion ? 150 : 450) - (performance.now() - req.t0));
    engine.busyFor = 'move';
    setTimeout(() => {
      engine.busyFor = '';
      if (req.stale || C.toFEN(g.pos) !== req.fen || paused) { if (paused) req.stale = true; render(); return; }
      play(m, 'engine');
    }, wait);
  }
  // If the engine can't load: take the most valuable capture, else a random move.
  function fallbackMove() {
    const val = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    let best = null, bv = -1;
    for (const m of legal) { const x = g.pos.b[m.to], v = (x ? val[x.toLowerCase()] : 0) + Math.random() * 0.5; if (v > bv) { bv = v; best = m; } }
    return best;
  }
  function askHint() {
    if (!myTurn()) return;
    request({ kind: 'hint', skill: 20, depth: 18, ms: 800 });
    $('.ch-msg').textContent = 'Looking for a good move…';
  }

  // ---------- new game panel ----------
  let panelPick = null;
  function openPanel() {
    panelPick = { pref: prefs.pref, level: prefs.level };
    $('.ch-cancel').hidden = !s;
    $('.ch-panel').hidden = false; syncPanel();
  }
  function syncPanel() {
    root.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === panelPick.pref)));
    root.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.level === panelPick.level)));
    $('.ch-lv').textContent = panelPick.level;
    $('.ch-lvname').textContent = ['· beginner', '· novice', '· casual', '· club', '· strong club', '· expert', '· master', '· full strength'][panelPick.level - 1];
  }
  const closePanel = () => { $('.ch-panel').hidden = true; };
  ctx.onBack(() => {
    if (promoting) { promoting(null); return true; }
    if (!$('.ch-panel').hidden && s) { closePanel(); return true; }
    return false;
  });

  // ---------- input ----------
  const qOf = (el) => +el.dataset.q;
  input.on('activate', (el) => {
    if (!myTurn()) return;
    const q = qOf(el);
    if (sel >= 0 && sel !== q && legal.some((m) => m.from === sel && m.to === q)) { humanMove(sel, q, 'tap'); return; }
    if (sel !== q && legal.some((m) => m.from === q)) { sel = q; hint = null; }
    else { if (sel < 0 && g.pos.b[q] && C.colorOf(g.pos.b[q]) === s.human) ctx.haptics(20); sel = -1; }
    render();
  });
  input.on('dragstart', (el) => {
    const q = qOf(el);
    if (!myTurn() || !legal.some((m) => m.from === q)) return;
    dragFrom = q; sel = q; hint = null; render();
    el.classList.add('lift');
  });
  input.on('dragmove', ({ dx, dy }) => {
    if (dragFrom < 0) return;
    const el = sqs.find((e) => +e.dataset.q === dragFrom), pc = el && el.querySelector('.pc');
    if (pc) pc.style.transform = `translate(${dx}px, ${dy}px) scale(1.2)`;
  });
  input.on('drop', (over) => {
    if (dragFrom < 0) return;
    const from = dragFrom; dragFrom = -1;
    const el = sqs.find((e) => +e.dataset.q === from);
    if (el) { el.classList.remove('lift'); const pc = el.querySelector('.pc'); if (pc) pc.style.transform = ''; }
    if (over && qOf(over) !== from && legal.some((m) => m.from === from && m.to === qOf(over))) humanMove(from, qOf(over), 'drag');
    else render();
  });
  input.on('command', (name) => {
    if (name === 'undo') undo();
    else if (name === 'hint') askHint();
    else if (name === 'new') openPanel();
    else if (name === 'resign') resign();
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act], [data-color], [data-level], [data-promo]');
    if (!b) return;
    if (b.dataset.promo) { if (promoting) promoting(b.dataset.promo); return; }
    if (b.dataset.color) { panelPick.pref = b.dataset.color; return syncPanel(); }
    if (b.dataset.level) { panelPick.level = +b.dataset.level; return syncPanel(); }
    const act = b.dataset.act;
    if (act === 'home') ctx.back();
    else if (act === 'undo') undo();
    else if (act === 'hint') askHint();
    else if (act === 'resign') resign();
    else if (act === 'new') openPanel();
    else if (act === 'cancel') closePanel();
    else if (act === 'play') {
      if (s && !g.result.over && s.moves.length > 1 && !(await ctx.ui.confirm('Start a new game? This one will be lost.', 'New game'))) return;
      closePanel(); newGame(panelPick.pref, panelPick.level);
    }
  });

  function restore(saved) {
    try {
      if (!saved || saved.v !== 1 || !LEVELS[saved.level - 1] || !/^[wb]$/.test(saved.human)) return false;
      s = { ...saved, moves: saved.moves ? String(saved.moves).split(' ').filter(Boolean) : [] };
      recompute();
      return true;
    } catch (e) { s = null; return false; }
  }

  return {
    start(saved) {
      if (restore(saved)) { persist(); render(); if (g.result.over) ctx.setStatus(null); think(); ctx.requestPersistence(); }
      else { s = null; newGame(prefs.pref, prefs.level); openPanel(); }
    },
    pause() { paused = true; cancelEngine(); render(); },
    resume() { paused = false; think(); },
    save() { return s ? { ...s, moves: s.moves.join(' ') } : null; },
    destroy() { clearTimeout(engine.timer); if (engine.w) engine.w.terminate(); engine.w = null; },
  };
}
