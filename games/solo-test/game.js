// Solo Test (peg solitaire). Engine: ./engine.js
import './engine.js';
const E = self.SoloTest;

const BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const I = (d) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  restart: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
};
// Rating printed on the old boxes: fewer pegs left = higher "IQ".
const RATING = [[1, 'Genius'], [2, 'Very clever'], [3, 'Clever'], [4, 'Good'], [5, 'Average']];
const rating = (n, centre) => (centre ? 'Genius — in the centre!' : (RATING.find(([k]) => k === n) || [0, 'Keep practising'])[1]);
const fmt = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export default {
  id: 'solo-test',
  name: 'Solo Test',
  input: { model: 'pointer', targets: '.hole', drag: true, keys: { u: 'undo', r: 'restart' } },
  help: [
    'Jump a peg over a neighbour into an empty hole; the jumped peg is removed.',
    'Goal: one peg left. The best finish is in the centre.',
    'Tap a peg, then a highlighted hole — or drag it.',
    'IQ level: 1 left = Genius, 2 = Very clever, 3 = Clever, 4 = Good, 5 = Average.',
    'Keyboard: arrows move, Enter picks/drops, U or Ctrl/Cmd+Z undoes, R restarts.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  root.innerHTML = `
    <main class="screen st">
      <header class="topbar">
        <button class="icon-btn" data-act="home" aria-label="All games">${BACK}</button>
        <div class="st-title"><b>Solo Test</b><div class="muted small"><span class="st-pegs"></span> · <span class="st-time">0:00</span></div></div>
        <button class="icon-btn" data-act="restart" aria-label="Restart">${ICON.restart}</button>
      </header>
      <div class="st-wrap"><div class="st-board" role="grid" aria-label="Peg board"></div></div>
      <div class="seg st-boards">
        <button data-board="english">English</button><button data-board="european">European</button>
      </div>
      <div class="st-tools">
        <button class="tool" data-act="undo">${ICON.undo}<span>Undo</span></button>
        <span class="st-best muted small"></span>
        <span class="st-left"><b class="st-count"></b><span class="muted small">pegs left</span></span>
      </div>
    </main>`;
  const $ = (s) => root.querySelector(s);
  const boardEl = $('.st-board');
  const best = ctx.storage.get('best', {});

  let s = null;           // { board, b: number[], hist: [from, over, to][], elapsed, over }
  let sel = -1, hintMove = null, paused = false, dragFrom = -1;
  const holes = [];
  for (let i = 0; i < 49; i++) {
    const el = document.createElement('div');
    el.dataset.i = i;
    el.innerHTML = '<i></i>';
    boardEl.appendChild(el); holes.push(el);
  }

  function newGame(board) {
    s = { board, b: E.start(board), hist: [], elapsed: 0, over: false };
    sel = -1; hintMove = null;
    persist(); render();
  }
  function persist() {
    ctx.storage.set('save', s);
    const n = E.pegs(s.b), total = E.pegs(E.start(s.board)) ;
    ctx.setStatus(s.over ? null : E.BOARDS[s.board].name + ' · ' + n + ' pegs', Math.round(((total - n) / (total - 1)) * 100));
  }
  const targetsOf = (i) => (i >= 0 ? E.movesFrom(s.b, i) : []);

  function render() {
    const tg = new Set(targetsOf(sel).map((m) => m.to));
    for (let i = 0; i < 49; i++) {
      const v = s.b[i], el = holes[i];
      let cls = v === -1 ? 'off' : 'hole' + (v === 1 ? ' peg' : '');
      if (i === sel) cls += ' sel';
      if (tg.has(i)) cls += ' target';
      if (hintMove && (i === hintMove.from || i === hintMove.to)) cls += ' hint';
      if (v === 1 && s.over && i === 24 && E.pegs(s.b) === 1) cls += ' win';
      if (el.className.replace(' kb-focus', '') !== cls) el.className = cls + (el.classList.contains('kb-focus') ? ' kb-focus' : '');
      el.setAttribute('aria-label', v === 1 ? 'peg' : 'empty');
    }
    $('.st-pegs').textContent = E.BOARDS[s.board].name;
    $('.st-count').textContent = E.pegs(s.b);
    $('.st-time').textContent = fmt(s.elapsed);
    root.querySelectorAll('[data-board]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.board === s.board)));
    const b = best[s.board];
    $('.st-best').textContent = b ? 'Best: ' + (b === 'centre' ? '1, centre' : b) : '';
  }

  function move(m) {
    E.apply(s.b, m);
    s.hist.push([m.from, m.over, m.to]);
    sel = -1; hintMove = null;
    ctx.audio.tone(520, 50, 'triangle'); ctx.haptics(8);
    animate(m);
    // keep the same peg selected if it can jump again (chains are common)
    if (targetsOf(m.to).length) sel = m.to;
    if (!E.moves(s.b).length) finish();
    persist(); render();
    input.focus(holes[m.to]);
  }
  function animate(m) {
    if (ctx.settings.reducedMotion) return;
    const el = holes[m.to].firstChild, a = holes[m.from].getBoundingClientRect(), b = holes[m.to].getBoundingClientRect();
    el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(1.15)` }, { transform: 'translate(0,0) scale(1)' }], { duration: 170, easing: 'cubic-bezier(.3,.7,.4,1)' });
    holes[m.over].firstChild.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.3)', opacity: 0 }], { duration: 160 });
  }
  async function finish() {
    s.over = true;
    const n = E.pegs(s.b), centre = n === 1 && s.b[24] === 1;
    const score = centre ? 'centre' : n, prev = best[s.board];
    const rank = (x) => (x === 'centre' ? 0 : x);
    const record = prev == null || rank(score) < rank(prev);
    if (record) { best[s.board] = score; ctx.storage.set('best', best); }
    const msg = (n === 1 ? '🎉 ' : '') + n + (n === 1 ? ' peg' : ' pegs') + ' left\nIQ level: ' + rating(n, centre) +
      '\n\n' + RATING.map(([k, t]) => k + ' → ' + t).join('\n');
    ctx.audio.tone(n === 1 ? 784 : 330, 160, 'triangle');
    await new Promise((r) => setTimeout(r, ctx.settings.reducedMotion ? 0 : 350));
    if (await ctx.ui.confirm(msg + (record ? '\nNew best!' : '') + '\nTime ' + fmt(s.elapsed), 'Play again', 'Look at board')) newGame(s.board);
  }
  function undo() {
    const h = s.hist.pop();
    if (!h) return;
    E.undo(s.b, { from: h[0], over: h[1], to: h[2] });
    s.over = false; sel = h[0]; hintMove = null;
    persist(); render(); input.focus(holes[h[0]]);
  }
  // ---------- input ----------
  input.on('activate', (el) => {
    if (s.over) return;
    const i = +el.dataset.i;
    const m = targetsOf(sel).find((x) => x.to === i);
    if (m) return move(m);
    if (s.b[i] === 1 && i !== sel) { sel = targetsOf(i).length ? i : -1; if (sel < 0) { ctx.haptics(20); } }
    else sel = -1;
    hintMove = null; render();
  });
  input.on('dragstart', (el) => {
    const i = +el.dataset.i;
    if (s.over || s.b[i] !== 1 || !targetsOf(i).length) return;
    dragFrom = i; sel = i; hintMove = null; render();
    el.classList.add('lift');
  });
  input.on('dragmove', ({ dx, dy }) => { if (dragFrom >= 0) holes[dragFrom].firstChild.style.transform = `translate(${dx}px, ${dy}px) scale(1.15)`; });
  input.on('drop', (over) => {
    if (dragFrom < 0) return;
    const from = dragFrom; dragFrom = -1;
    holes[from].classList.remove('lift'); holes[from].firstChild.style.transform = '';
    const m = over && targetsOf(from).find((x) => x.to === +over.dataset.i);
    if (m) { E.apply(s.b, m); s.hist.push([m.from, m.over, m.to]); sel = targetsOf(m.to).length ? m.to : -1; hintMove = null; ctx.audio.tone(520, 50, 'triangle'); ctx.haptics(8); if (!E.moves(s.b).length) finish(); persist(); render(); }
    else render();
  });
  input.on('command', (name) => {
    if (name === 'undo') undo();
    else if (name === 'restart') restart();
  });
  async function restart() { if (!s.hist.length || s.over || await ctx.ui.confirm('Start this board again?')) newGame(s.board); }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act], [data-board]');
    if (!b) return;
    if (b.dataset.board) {
      if (b.dataset.board === s.board) return;
      if (s.hist.length && !s.over && !(await ctx.ui.confirm('Switch board? This game will be lost.'))) return;
      return newGame(b.dataset.board);
    }
    if (b.dataset.act === 'home') ctx.back();
    if (b.dataset.act === 'undo') undo();
    if (b.dataset.act === 'restart') restart();
  });

  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    if (!paused && !s.over && s.hist.length) { s.elapsed += Math.min(now - last, 2000); $('.st-time').textContent = fmt(s.elapsed); }
    last = now;
  }, 500);

  return {
    start(saved) {
      if (saved && Array.isArray(saved.b) && saved.b.length === 49 && E.BOARDS[saved.board]) { s = saved; render(); persist(); }
      else newGame('english');
      ctx.requestPersistence();
    },
    pause() { paused = true; },
    resume() { paused = false; last = performance.now(); },
    save() { return s; },
    destroy() { clearInterval(timer); },
  };
}
