// Chess against Stockfish. Rules: ./chess.js. Engine: ./engine/ (Stockfish.js 19 lite, GPL-3.0) in a Web Worker over UCI.
// Board: ./vendor/chessground.js (lichess.org's board, GPL-3.0) with the cburnett pieces (see vendor/README.txt).
// chessground handles touch/mouse on the board itself (tap-tap, drag); the control layer only drives the keyboard cursor.
import './chess.js';
import { Chessground } from './vendor/chessground.js';
const C = self.Chess;

const I = (d, w = 22) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  back: I('<path d="M15 18l-6-6 6-6"/>', 24),
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  hint: I('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  flip: I('<path d="M7 4v16M7 4L3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  flag: I('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', 22),
};
const ROLE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const piece = (t, c) => `<piece class="${ROLE[t]} ${c === 'w' ? 'white' : 'black'}"></piece>`;

// Difficulty: Stockfish "Skill Level" plus search limits. Level 1 also plays some random moves.
const LEVELS = [
  { skill: 0, depth: 1, ms: 60, random: 0.3 }, { skill: 1, depth: 2, ms: 100, random: 0.1 }, { skill: 3, depth: 3, ms: 150 },
  { skill: 6, depth: 5, ms: 250 }, { skill: 9, depth: 8, ms: 400 }, { skill: 13, depth: 11, ms: 700 },
  { skill: 17, depth: 15, ms: 1000 }, { skill: 20, depth: 30, ms: 1500 },
];
const REASON = { checkmate: 'Checkmate', stalemate: 'Stalemate', 'insufficient material': 'Draw · insufficient material', '50-move rule': 'Draw · 50-move rule', 'threefold repetition': 'Draw · repetition', resigned: 'Resigned' };
const BOARDS = { brown: 'Brown', blue: 'Blue' };

export default {
  id: 'chess',
  name: 'Chess',
  // Targets are an invisible 8×8 grid over the board (pointer-events: none), so they only serve the keyboard cursor.
  input: { model: 'pointer', targets: '.ch-k', focusRing: true, keys: { u: 'undo', f: 'flip', r: 'resign' } },
  help: [
    'Tap a piece, then a dotted square, or drag it.',
    'Undo takes back your last move and the computer\'s reply.',
    'Hint draws an arrow for the move the engine likes best.',
    'Levels 1 to 8: 1 is for beginners, 8 is full strength.',
    'Keyboard: arrows move, Enter picks and drops, U undo, H hint, F flip, N new game, R resign.',
    'Board: chessground by lichess.org. Pieces: cburnett. Engine: Stockfish. All GPL, all on your device.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  const main = document.createElement('main');
  main.className = 'screen ch';
  main.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-act="home" aria-label="All games">${ICON.back}</button>
        <div class="ch-title"><b>Chess</b><div class="muted small ch-sub" aria-live="polite"></div></div>
        <button class="icon-btn" data-act="resign" aria-label="Resign">${ICON.flag}</button>
      </header>
      <div class="ch-moves" aria-label="Moves"></div>
      <div class="ch-player ch-them"><span class="ch-name"></span><span class="ch-cap cg-wrap"></span></div>
      <div class="ch-wrap">
        <div class="ch-board"></div>
        <div class="ch-keys" aria-hidden="true"></div>
        <div class="ch-promo cg-wrap" hidden></div>
      </div>
      <div class="ch-player ch-you"><span class="ch-name">You</span><span class="ch-cap cg-wrap"></span></div>
      <div class="ch-tools">
        <button class="tool" data-act="undo">${ICON.undo}<span>Undo</span></button>
        <button class="tool" data-act="hint">${ICON.hint}<span>Hint</span></button>
        <button class="tool" data-act="flip">${ICON.flip}<span>Flip</span></button>
        <button class="tool" data-act="new">${ICON.plus}<span>New game</span></button>
      </div>
      <div class="ch-sheet" hidden>
        <div class="ch-card" role="dialog" aria-label="New game">
          <h3>New game</h3>
          <div class="ch-label">Play as</div>
          <div class="seg ch-seg">${[['w', 'White'], ['r', 'Random'], ['b', 'Black']].map(([v, t]) => `<button data-color="${v}">${t}</button>`).join('')}</div>
          <div class="ch-label">Level <span class="muted ch-lvname"></span></div>
          <div class="seg ch-seg">${LEVELS.map((_, i) => `<button data-level="${i + 1}">${i + 1}</button>`).join('')}</div>
          <div class="ch-label">Board</div>
          <div class="seg ch-seg">${Object.entries(BOARDS).map(([v, t]) => `<button data-board="${v}"><i class="ch-sw ${v}"></i>${t}</button>`).join('')}</div>
          <button class="ch-play" data-act="play">Play</button>
        </div>
      </div>`;
  root.appendChild(main);
  const $ = (q) => root.querySelector(q);
  const keysEl = $('.ch-keys');
  keysEl.innerHTML = '<div class="ch-k"></div>'.repeat(64);
  const kEls = [...keysEl.children];

  // ---------- state ----------
  let s = null;   // saved: { v, start, moves: string[] (UCI), human: 'w'|'b', level, pref, resigned, flip }
  let g = null;   // derived: C.play(...)
  let legal = [], paused = false, promoting = null, hint = null;
  const prefs = ctx.storage.get('prefs', { pref: 'w', level: 3 });
  if (!BOARDS[prefs.board]) prefs.board = 'brown';
  main.dataset.board = prefs.board;

  function recompute() {
    g = C.play(s.start, s.moves);
    legal = C.moves(g.pos);
    if (s.resigned) g.result = { over: true, winner: s.human === 'w' ? 'b' : 'w', reason: 'resigned' };
  }
  const myTurn = () => !g.result.over && g.pos.turn === s.human && !promoting;
  const color = (c) => (c === 'w' ? 'white' : 'black');
  const orientation = () => color(s.flip ? (s.human === 'w' ? 'b' : 'w') : s.human);

  // ---------- board ----------
  const cg = Chessground($('.ch-board'), {
    coordinates: true,
    autoCastle: true,
    animation: { enabled: !ctx.settings.reducedMotion, duration: 200 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, showDests: true, events: { after: (o, d) => onUserMove(o, d) } },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    drawable: { enabled: false, visible: true },
    blockTouchScroll: true,
  });
  function dests() {
    const m = new Map();
    if (myTurn()) for (const x of legal) { const f = C.sqName(x.from); if (!m.has(f)) m.set(f, []); m.get(f).push(C.sqName(x.to)); }
    return m;
  }
  function syncBoard() {
    const last = s.moves[s.moves.length - 1];
    cg.set({
      fen: C.toFEN(g.pos).split(' ')[0],
      orientation: orientation(),
      turnColor: color(g.pos.turn),
      lastMove: last ? [last.slice(0, 2), last.slice(2, 4)] : undefined,
      check: C.inCheck(g.pos) ? color(g.pos.turn) : false,
      movable: { color: myTurn() ? color(s.human) : undefined, dests: dests() },
    });
    cg.setAutoShapes(hint ? [{ orig: hint[0], dest: hint[1], brush: 'green' }] : []);
    // keyboard grid follows the orientation
    const white = orientation() === 'white';
    kEls.forEach((el, i) => { const r = i >> 3, f = i & 7; el.dataset.key = 'abcdefgh'[white ? f : 7 - f] + (white ? 8 - r : r + 1); });
  }

  function newGame(pref, level) {
    const human = pref === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : pref;
    s = { v: 1, start: C.START, moves: [], human, level, pref, resigned: false, flip: false };
    Object.assign(prefs, { pref, level }); ctx.storage.set('prefs', prefs);
    cancelEngine(); hint = null;
    recompute(); persist(); render(); think();
    ctx.requestPersistence();
  }
  function persist() {
    ctx.storage.set('save', { ...s, moves: s.moves.join(' ') });
    ctx.setStatus(g.result.over ? null : 'Level ' + s.level + ' · move ' + g.pos.full);
  }

  // ---------- render ----------
  function render() {
    syncBoard();
    const p = g.pos, them = s.human === 'w' ? 'b' : 'w';
    // player rows: the top row shows whoever sits at the top of the board
    const topIsThem = orientation() === color(s.human);
    const [topEl, botEl] = topIsThem ? [$('.ch-them'), $('.ch-you')] : [$('.ch-you'), $('.ch-them')];
    if (topEl.nextElementSibling !== $('.ch-wrap')) { $('.ch-wrap').before(topEl); $('.ch-wrap').after(botEl); }
    $('.ch-them .ch-name').innerHTML = 'Stockfish <span class="muted">level ' + s.level + '</span>';
    // captured pieces, shown next to the side that took them, plus the material lead (lichess style)
    const count = (b) => { const n = {}; for (const x of b) if (x) n[x] = (n[x] || 0) + 1; return n; };
    const start = count(C.parseFEN(s.start).b), now = count(p.b);
    const taken = (c) => { // pieces of colour c that are gone
      let html = '', val = 0;
      for (const t of 'qrbnp') {
        const x = c === 'w' ? t.toUpperCase() : t, n = Math.max(0, (start[x] || 0) - (now[x] || 0));
        if (n) html += `<span class="ch-grp">${piece(t, c).repeat(n)}</span>`;
        val += n * VALUE[t];
      }
      return { html, val };
    };
    const byYou = taken(them), byThem = taken(s.human), lead = byYou.val - byThem.val;
    $('.ch-you .ch-cap').innerHTML = byYou.html + (lead > 0 ? `<b>+${lead}</b>` : '');
    $('.ch-them .ch-cap').innerHTML = byThem.html + (lead < 0 ? `<b>+${-lead}</b>` : '');
    // status line under the title
    let msg;
    if (g.result.over) {
      const r = g.result;
      msg = REASON[r.reason] + (r.winner ? (r.winner === s.human ? ' · You win' : ' · Stockfish wins') : '');
    } else if (promoting) msg = 'Choose a piece';
    else if (myTurn()) msg = (C.inCheck(p) ? 'Check · ' : '') + 'Your move';
    else msg = 'Stockfish is thinking…';
    if (engine.busyFor === 'hint') msg = 'Looking for a good move…';
    $('.ch-sub').textContent = msg;
    $('.ch-sub').classList.toggle('end', g.result.over);
    // move list: one horizontally scrolling line
    let html = '';
    const sf = C.parseFEN(s.start), blackFirst = sf.turn === 'b';
    g.sans.forEach((san, i) => {
      const ply = i + (blackFirst ? 1 : 0);
      if (ply % 2 === 0) html += `<i>${sf.full + ply / 2}.</i>`;
      else if (i === 0) html += `<i>${sf.full}…</i>`;
      html += `<span${i === g.sans.length - 1 ? ' class="cur"' : ''}>${san}</span>`;
    });
    if (g.result.over) html += `<span class="res">${g.result.winner ? (g.result.winner === 'w' ? '1–0' : '0–1') : '½–½'}</span>`;
    const ml = $('.ch-moves');
    ml.innerHTML = html || '<span class="muted">' + (s.human === 'w' ? 'You play White' : 'You play Black') + ' · level ' + s.level + '</span>';
    ml.scrollLeft = ml.scrollWidth;
    root.querySelector('[data-act="undo"]').disabled = !undoable();
    root.querySelector('[data-act="hint"]').disabled = !myTurn();
    root.querySelector('[data-act="resign"]').disabled = g.result.over;
  }

  // ---------- moves ----------
  function play(m) {
    const san = C.san(g.pos, m, legal);
    s.moves.push(C.uci(m));
    hint = null;
    recompute(); persist(); render();
    const cap = san.includes('x');
    ctx.audio.tone(cap ? 330 : 440, 45, 'triangle'); ctx.haptics(cap ? 14 : 8);
    if (g.result.over) return gameOver();
    think();
  }
  async function onUserMove(orig, dest) {
    const from = C.sqIndex(orig), to = C.sqIndex(dest);
    const cands = myTurn() ? legal.filter((m) => m.from === from && m.to === to) : [];
    if (!cands.length) return render();
    let m = cands[0];
    if (cands.length > 1) {
      const promo = await pickPromotion(dest, g.pos.turn);
      if (!promo) return render(); // cancelled: chessground's moved pawn goes back
      m = cands.find((x) => x.promo === promo);
    }
    play(m);
  }
  // lichess-style promotion: a column of pieces over the promotion square
  function pickPromotion(dest, c) {
    const el = $('.ch-promo'), white = orientation() === 'white';
    const file = 'abcdefgh'.indexOf(dest[0]), col = white ? file : 7 - file;
    const top = (white ? 8 - +dest[1] : +dest[1] - 1) === 0;
    el.innerHTML = 'qnrb'.split('').map((t, i) =>
      `<button data-promo="${t}" aria-label="${ROLE[t]}" style="left:${col * 12.5}%;top:${(top ? i : 7 - i) * 12.5}%">${piece(t, c)}</button>`).join('');
    el.hidden = false;
    return new Promise((resolve) => {
      promoting = (v) => { promoting = null; el.hidden = true; resolve(v); };
      render();
    });
  }
  function undoable() { return !promoting && s.moves.length > (s.human === 'b' ? 1 : 0) && !s.resigned; }
  function undo() {
    if (!undoable()) return;
    cancelEngine();
    s.moves.pop(); recompute();
    while (s.moves.length && g.pos.turn !== s.human) { s.moves.pop(); recompute(); }
    hint = null;
    persist(); render(); think();
  }
  function flip() { s.flip = !s.flip; persist(); render(); }
  async function gameOver() {
    const r = g.result;
    ctx.setStatus(null);
    const win = r.winner === s.human;
    ctx.audio.tone(win ? 784 : r.winner ? 220 : 440, 200, 'triangle');
    const text = REASON[r.reason] + '\n' + (r.winner ? (win ? 'You win.' : 'Stockfish wins.') : 'The game is drawn.');
    await new Promise((res) => setTimeout(res, ctx.settings.reducedMotion ? 0 : 600));
    if (g && g.result.over && await ctx.ui.confirm(text, 'New game', 'View board')) openSheet();
  }
  async function resign() {
    if (g.result.over) return;
    if (!(await ctx.ui.confirm('Resign this game?', 'Resign'))) return;
    cancelEngine(); s.resigned = true; hint = null;
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
      if (m) { hint = [C.sqName(m.from), C.sqName(m.to)]; cg.selectSquare(null); }
      return render();
    }
    if (!m || (req.random && Math.random() < req.random)) m = (req.random ? legal[Math.floor(Math.random() * legal.length)] : null) || m || fallbackMove();
    const wait = Math.max(0, (ctx.settings.reducedMotion ? 150 : 450) - (performance.now() - req.t0));
    engine.busyFor = 'move';
    setTimeout(() => {
      engine.busyFor = '';
      if (req.stale || !g || C.toFEN(g.pos) !== req.fen || paused) { if (paused) req.stale = true; if (g) render(); return; }
      cg.move(C.sqName(m.from), C.sqName(m.to)); // animate; play() then syncs promotion, en passant and castling
      play(m);
    }, wait);
  }
  // If the engine can't load: take the most valuable capture, else a random move.
  function fallbackMove() {
    let best = null, bv = -1;
    for (const m of legal) { const x = g.pos.b[m.to], v = (x ? VALUE[x.toLowerCase()] : 0) + Math.random() * 0.5; if (v > bv) { bv = v; best = m; } }
    return best;
  }
  function askHint() {
    if (!myTurn()) return;
    request({ kind: 'hint', skill: 20, depth: 18, ms: 800 });
  }

  // ---------- new game sheet ----------
  let pick = null;
  function openSheet() {
    if (promoting) promoting(null);
    pick = { pref: prefs.pref, level: prefs.level };
    $('.ch-sheet').hidden = false; syncSheet();
  }
  function syncSheet() {
    root.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === pick.pref)));
    root.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.level === pick.level)));
    root.querySelectorAll('[data-board]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.board === prefs.board)));
    $('.ch-lvname').textContent = pick.level + ' · ' + ['beginner', 'novice', 'casual', 'club', 'strong club', 'expert', 'master', 'full strength'][pick.level - 1];
  }
  const closeSheet = () => { $('.ch-sheet').hidden = true; };
  ctx.onBack(() => {
    if (promoting) { promoting(null); return true; }
    if (!$('.ch-sheet').hidden) { closeSheet(); return true; }
    return false;
  });

  // ---------- input ----------
  input.on('activate', (el, { by } = {}) => { // keyboard cursor: Enter picks a piece, Enter again drops it
    if (by !== 'key' || promoting || !$('.ch-sheet').hidden) return;
    cg.selectSquare(el.dataset.key);
  });
  input.on('command', (name) => {
    if (!$('.ch-sheet').hidden && name !== 'back') return;
    if (name === 'undo') undo();
    else if (name === 'hint') askHint();
    else if (name === 'new') openSheet();
    else if (name === 'flip') flip();
    else if (name === 'resign') resign();
  });
  root.addEventListener('click', async (e) => {
    if (e.target.classList.contains('ch-sheet')) return closeSheet(); // tap outside the sheet
    if (e.target.classList.contains('ch-promo')) return promoting && promoting(null);
    const b = e.target.closest('[data-act], [data-color], [data-level], [data-board], [data-promo]');
    if (!b) return;
    if (b.dataset.promo) { if (promoting) promoting(b.dataset.promo); return; }
    if (b.dataset.color) { pick.pref = b.dataset.color; return syncSheet(); }
    if (b.dataset.level) { pick.level = +b.dataset.level; return syncSheet(); }
    if (b.dataset.board) { prefs.board = b.dataset.board; main.dataset.board = prefs.board; ctx.storage.set('prefs', prefs); return syncSheet(); }
    const act = b.dataset.act;
    if (act === 'home') ctx.back();
    else if (act === 'undo') undo();
    else if (act === 'hint') askHint();
    else if (act === 'flip') flip();
    else if (act === 'resign') resign();
    else if (act === 'new') openSheet();
    else if (act === 'play') {
      if (s && !g.result.over && s.moves.length > 1 && !(await ctx.ui.confirm('Start a new game? This one will be lost.', 'New game'))) return;
      closeSheet(); newGame(pick.pref, pick.level);
    }
  });

  function restore(saved) {
    try {
      if (!saved || saved.v !== 1 || !LEVELS[saved.level - 1] || !/^[wb]$/.test(saved.human)) return false;
      s = { ...saved, flip: !!saved.flip, moves: saved.moves ? String(saved.moves).split(' ').filter(Boolean) : [] };
      recompute();
      return true;
    } catch (e) { s = null; return false; }
  }

  return {
    start(saved) {
      if (restore(saved)) { persist(); render(); if (g.result.over) ctx.setStatus(null); think(); ctx.requestPersistence(); }
      else { s = null; newGame(prefs.pref, prefs.level); openSheet(); }
    },
    pause() { paused = true; cancelEngine(); if (g) render(); },
    resume() { paused = false; think(); },
    save() { return s ? { ...s, moves: s.moves.join(' ') } : null; },
    destroy() { clearTimeout(engine.timer); if (engine.w) engine.w.terminate(); engine.w = null; cg.destroy(); g = null; },
  };
}
