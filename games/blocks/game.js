// Stackfall: falling-block puzzle. Rules: ./engine.js (pure, tested in tools/test-blocks.js). Drawing: canvas.
import './engine.js';
const E = self.BlocksEngine;

const BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';
// Our own palette (index = engine type order I O T S Z J L). Two tones each: light theme, dark theme.
const COLORS = {
  light: ['#d946ef', '#14b8a6', '#f59e0b', '#6366f1', '#84cc16', '#0ea5e9', '#f43f5e'],
  dark: ['#e879f9', '#2dd4bf', '#fbbf24', '#818cf8', '#a3e635', '#38bdf8', '#fb7185'],
};
const fmtN = (n) => n.toLocaleString('en-US');

export default {
  id: 'blocks',
  name: 'Stackfall',
  input: {
    model: 'action',
    stage: '.bk-stage',
    actions: [
      { id: 'left', kind: 'button', repeat: { delay: 170, rate: 50 } },
      { id: 'right', kind: 'button', repeat: { delay: 170, rate: 50 } },
      { id: 'softDrop', kind: 'button', repeat: { delay: 90, rate: 40 } },
      { id: 'hardDrop', kind: 'button' },
      { id: 'rotateCW', kind: 'button' },
      { id: 'rotateCCW', kind: 'button' },
      { id: 'hold', kind: 'button' },
      { id: 'pause', kind: 'button' },
    ],
    keys: {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'softDrop', ArrowUp: 'rotateCW',
      a: 'left', d: 'right', s: 'softDrop', w: 'rotateCW',
      x: 'rotateCW', z: 'rotateCCW', ' ': 'hardDrop', c: 'hold', Shift: 'hold',
    },
    touch: {
      gestures: { tap: 'rotateCW', swipeDown: 'hardDrop', swipeUp: 'hold', stepLeft: 'left', stepRight: 'right', stepDown: 'softDrop', step: 24 },
      console: { dpad: { left: 'left', right: 'right', down: 'softDrop', up: 'hardDrop' }, a: 'rotateCW', b: 'rotateCCW', c: 'hold', labels: { a: '⟳', b: '⟲', c: 'Hold' } },
      halves: { left: { button: 'left', swipeUp: 'hold', swipeDown: 'hardDrop' }, right: { button: 'right', swipeUp: 'rotateCW', swipeDown: 'hardDrop' } },
    },
  },
  help: [
    'Fill a whole row to clear it. Stack too high and the round ends.',
    'Every 10 rows the level goes up and pieces fall faster.',
    'Swipe controls: drag sideways to move, tap to turn, drag down slowly to soft-drop, flick down to drop, swipe up to hold.',
    'Buttons: D-pad moves (up drops), ⟳ / ⟲ turn, Hold keeps a piece for later. Change controls in the pause menu.',
    'Keyboard: ← → move, ↓ soft drop, ↑ / X turn right, Z turn left, Space drop, C or Shift hold, Esc or P pause.',
    'Points: 1 row 100, 2 rows 300, 3 rows 500, 4 rows 800, times the level. Chains and back-to-back fours earn extra.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  root.innerHTML = `
    <main class="screen bk">
      <header class="topbar">
        <button class="icon-btn" data-act="home" aria-label="All games">${BACK}</button>
        <div class="bk-title"><b>Stackfall</b><div class="muted small bk-sub"></div></div>
        <button class="icon-btn" data-act="pause" aria-label="Pause">${PAUSE}</button>
      </header>
      <div class="bk-stage">
        <canvas class="bk-canvas" aria-label="Playfield"></canvas>
        <div class="bk-over" hidden>
          <div class="bk-over-box">
            <h2>Stack topped out</h2>
            <p class="bk-over-score"></p>
            <p class="muted bk-over-best"></p>
            <button class="card primary bk-again" data-act="again"><b>Play again</b></button>
          </div>
        </div>
      </div>
    </main>`;
  const $ = (q) => root.querySelector(q);
  const stage = $('.bk-stage'), canvas = $('.bk-canvas'), g = canvas.getContext('2d');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'home') ctx.back();
    if (b.dataset.act === 'pause') ctx.pause();
    if (b.dataset.act === 'again') newGame();
  });

  let s = null, best = ctx.storage.get('best', 0);
  let running = false, raf = 0, last = 0, acc = 0, destroyed = false;
  const fx = { flash: [], shake: 0, shakeT: 0, bump: 0 };
  const rm = ctx.settings.reducedMotion;
  const inp = { left: false, right: false, soft: false, softHeld: false, hard: false, cw: false, ccw: false, hold: false };

  // ---------------------------------------------------------------- layout & theme
  let L = null, theme = null;
  function readTheme() {
    const cs = getComputedStyle(root), v = (n) => cs.getPropertyValue(n).trim();
    const bg = v('--bg');
    const dark = isDark(bg);
    theme = { dark, colors: dark ? COLORS.dark : COLORS.light, surface: v('--surface'), peer: v('--peer'), line: v('--line'), text: v('--text'), muted: v('--muted'), bg };
  }
  function isDark(c) {
    const m = c.match(/^#([0-9a-f]{6})$/i);
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) < 110;
  }
  function layout() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.max(100, r.width), H = Math.max(100, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const strip = Math.round(Math.min(64, Math.max(50, H * 0.08)));
    const c = Math.max(8, Math.floor(Math.min((W - 8) / E.W, (H - strip - 10) / (E.H - E.HIDDEN))));
    const bw = c * E.W, bh = c * (E.H - E.HIDDEN);
    const sw = Math.min(W - 4, Math.max(bw, 330));
    L = { W, H, dpr, c, bw, bh, bx: Math.round((W - bw) / 2), by: strip + 6, strip, sx: Math.round((W - sw) / 2), sw };
    readTheme();
    draw();
  }
  const ro = new ResizeObserver(layout);
  ro.observe(stage);
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { readTheme(); draw(); };
  mq.addEventListener('change', onScheme);

  // ---------------------------------------------------------------- drawing
  function rr(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
  function tile(x, y, size, color, alpha = 1) {
    const gap = Math.max(1, size * 0.07), s2 = size - gap * 2, r = s2 * 0.3;
    x += gap; y += gap;
    g.globalAlpha = alpha;
    g.fillStyle = color; rr(x, y, s2, s2, r); g.fill();
    // soft top light and bottom shade: a "pebble" look rather than bevelled bricks
    const gr = g.createLinearGradient(0, y, 0, y + s2);
    gr.addColorStop(0, 'rgba(255,255,255,.38)'); gr.addColorStop(0.45, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.16)');
    g.fillStyle = gr; rr(x, y, s2, s2, r); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    rr(x + s2 * 0.22, y + s2 * 0.14, s2 * 0.32, s2 * 0.12, s2 * 0.06); g.fill();
    g.globalAlpha = 1;
  }
  function ghostTile(x, y, size, color) {
    const gap = Math.max(1, size * 0.07), s2 = size - gap * 2, r = s2 * 0.3;
    g.globalAlpha = theme.dark ? 0.22 : 0.16; g.fillStyle = color; rr(x + gap, y + gap, s2, s2, r); g.fill();
    g.globalAlpha = 0.7; g.strokeStyle = color; g.lineWidth = Math.max(1.5, size * 0.06);
    rr(x + gap + 1, y + gap + 1, s2 - 2, s2 - 2, r); g.stroke();
    g.globalAlpha = 1;
  }
  function mini(type, cx, cy, size, dim) { // piece preview centred at cx, cy
    if (!type) return;
    const cells = E.CELLS[type][0];
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const [x, y] of cells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const ox = cx - ((x1 - x0 + 1) * size) / 2, oy = cy - ((y1 - y0 + 1) * size) / 2;
    const col = theme.colors[E.TYPES.indexOf(type)];
    for (const [x, y] of cells) tile(ox + (x - x0) * size, oy + (y - y0) * size, size, col, dim ? 0.35 : 1);
  }
  function label(text, x, y, align, size, color, weight = 600) {
    g.font = weight + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillStyle = color; g.fillText(text, x, y);
  }
  function draw(now = performance.now()) {
    if (!L || !s || destroyed) return;
    const { c, bx, by, bw, bh, strip, sx, sw, dpr } = L;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, L.W, L.H);
    // shake (hard drop / big clears), skipped with reduced motion
    let ox = 0, oy = 0;
    const st = now - fx.shakeT;
    if (fx.shake && st < 180) { const k = fx.shake * (1 - st / 180); ox = Math.sin(st * 0.25) * k; oy = Math.cos(st * 0.31) * k * 0.6; }
    const bt = now - fx.bump; if (fx.bump && bt < 120 && !rm) oy += Math.max(0, 2.5 * (1 - bt / 120));
    // top strip: hold · score · next
    const box = strip - 6, ms = Math.floor(Math.min(box / 3.2, 14));
    g.fillStyle = theme.peer; rr(sx, 0, box * 1.3, box, 12); g.fill();
    label('HOLD', sx + 8, 13, 'left', 10, theme.muted, 700);
    mini(s.hold, sx + box * 0.65, box * 0.6, ms, s.held);
    const nx = sx + sw - box * 2.7;
    g.fillStyle = theme.peer; rr(nx, 0, box * 2.7, box, 12); g.fill();
    label('NEXT', nx + 8, 13, 'left', 10, theme.muted, 700);
    for (let i = 0; i < 3; i++) mini(s.queue[i], nx + box * (0.5 + i * 0.85), box * 0.6, i ? ms * 0.8 : ms);
    const mid = (sx + box * 1.3 + nx) / 2;
    label(fmtN(s.score), mid, box * 0.5, 'center', Math.min(24, box * 0.42), theme.text, 750);
    label('Level ' + s.level + ' · ' + s.lines + (s.lines === 1 ? ' row' : ' rows'), mid, box * 0.5 + 18, 'center', 12, theme.muted, 550);

    g.save();
    g.translate(ox, oy);
    // well
    g.fillStyle = theme.peer; rr(bx - 4, by - 4, bw + 8, bh + 8, 14); g.fill();
    g.fillStyle = theme.dark ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.07)';
    for (let y = 0; y < E.H - E.HIDDEN; y++) for (let x = 0; x < E.W; x++) { g.beginPath(); g.arc(bx + x * c + c / 2, by + y * c + c / 2, Math.max(1, c * 0.06), 0, 6.283); g.fill(); }
    // stack
    for (let y = E.HIDDEN; y < E.H; y++) for (let x = 0; x < E.W; x++) {
      const v = s.board[y * E.W + x];
      if (v) tile(bx + x * c, by + (y - E.HIDDEN) * c, c, theme.colors[v - 1], s.over ? 0.45 : 1);
    }
    // ghost + piece
    if (!s.over && s.cur) {
      const p = s.cur, col = theme.colors[E.TYPES.indexOf(p.t)], gy = E.ghostY(s), cells = E.CELLS[p.t][p.r];
      if (gy !== p.y) for (const [x, y] of cells) if (gy + y >= E.HIDDEN) ghostTile(bx + (p.x + x) * c, by + (gy + y - E.HIDDEN) * c, c, col);
      // the piece blinks slightly while its lock timer runs, so you can see it is about to set
      const locking = E.grounded(s) ? s.lock / E.LOCK_MS : 0;
      const a = locking > 0 && !rm ? 1 - 0.25 * locking : 1;
      g.save(); g.beginPath(); g.rect(bx - 4, by, bw + 8, bh + 4); g.clip();
      for (const [x, y] of cells) if (p.y + y >= E.HIDDEN - 1) tile(bx + (p.x + x) * c, by + (p.y + y - E.HIDDEN) * c, c, col, a);
      g.restore();
    }
    // line-clear flash
    const life = rm ? 140 : 260;
    fx.flash = fx.flash.filter((f) => now - f.t < life);
    for (const f of fx.flash) {
      const k = 1 - (now - f.t) / life;
      g.fillStyle = theme.dark ? 'rgba(255,255,255,' + 0.55 * k + ')' : 'rgba(255,255,255,' + 0.9 * k + ')';
      for (const y of f.rows) {
        const grow = rm ? 0 : (1 - k) * c * 0.35;
        rr(bx - 2, by + (y - E.HIDDEN) * c - grow / 2 + 1, bw + 4, c - 2 + grow, c * 0.3); g.fill();
      }
    }
    g.restore();
  }

  // ---------------------------------------------------------------- game flow
  function newGame() {
    s = E.create((Math.random() * 2 ** 32) | 0, 1);
    $('.bk-over').hidden = true;
    fx.flash = [];
    ctx.requestPersistence();
    status();
    run();
  }
  function status() {
    $('.bk-sub').textContent = 'Best ' + fmtN(Math.max(best, s ? s.score : 0));
    ctx.setStatus(s && !s.over ? 'Level ' + s.level + ' · ' + fmtN(s.score) : null);
  }
  const tone = (f, ms, type = 'triangle', vol = 0.25) => ctx.audio.tone(f, ms, type, vol * 0.2); // vol 0..1 relative; 0.25 ≈ the shell's default level
  function tick() {
    input.update();
    if (input.pressed('pause')) { ctx.pause(); return false; }
    inp.left = input.pressed('left'); inp.right = input.pressed('right');
    inp.soft = input.pressed('softDrop'); inp.hard = input.pressed('hardDrop');
    inp.cw = input.pressed('rotateCW'); inp.ccw = input.pressed('rotateCCW'); inp.hold = input.pressed('hold');
    const ev = E.step(s, inp), now = performance.now();
    if (ev.rotated) tone(440, 25, 'sine', 0.25);
    else if (ev.moved) tone(300, 14, 'sine', 0.15);
    if (ev.held) tone(360, 40, 'triangle', 0.25);
    if (ev.hardDrop != null) { fx.bump = now; if (!rm && ev.hardDrop > 2) { fx.shake = 1.5; fx.shakeT = now; } tone(150, 55, 'square', 0.25); ctx.haptics(10); }
    if (ev.locked && !ev.rows.length && ev.hardDrop == null) tone(200, 30, 'triangle', 0.2);
    if (ev.rows && ev.rows.length) {
      const n = ev.rows.length;
      fx.flash.push({ rows: ev.rows.slice(), t: now });
      if (!rm) { fx.shake = n >= 4 ? 5 : 1 + n; fx.shakeT = now; } else if (n >= 4) { fx.shake = 1; fx.shakeT = now; }
      [523, 659, 784, 1047].slice(0, n).forEach((f, i) => setTimeout(() => tone(f, 70, 'triangle', 0.35), i * 55));
      ctx.haptics(n >= 4 ? 30 : 15);
    }
    if (ev.levelUp) { setTimeout(() => tone(880, 90, 'sine', 0.35), 260); }
    if (ev.locked) status();
    if (ev.over || s.over) { gameOver(); return false; }
    return true;
  }
  function gameOver() {
    stop();
    const record = s.score > best;
    if (record) { best = s.score; ctx.storage.set('best', best); }
    ctx.setStatus(null);
    ctx.storage.remove('save');
    $('.bk-over-score').textContent = fmtN(s.score) + ' points · level ' + s.level + ' · ' + s.lines + ' rows';
    $('.bk-over-best').textContent = record && s.score > 0 ? 'New best!' : 'Best ' + fmtN(best);
    $('.bk-over').hidden = false;
    tone(196, 300, 'triangle', 0.35);
    status();
    draw();
  }
  function frame(t) {
    if (!running) return;
    acc += Math.min(250, t - last); last = t;
    while (acc >= E.STEP_MS) { acc -= E.STEP_MS; if (!tick()) { draw(t); return; } }
    draw(t);
    raf = requestAnimationFrame(frame);
  }
  function run() {
    if (running || destroyed || !s || s.over) return;
    running = true; acc = 0; last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  return {
    start(saved) {
      s = E.load(saved);
      if (!s || s.over) newGame(); else { status(); run(); }
      draw();
    },
    pause() { stop(); draw(); },
    resume() { if (s && !s.over) run(); },
    save() { return s && !s.over ? E.save(s) : null; },
    destroy() { destroyed = true; stop(); ro.disconnect(); mq.removeEventListener('change', onScheme); },
  };
}
