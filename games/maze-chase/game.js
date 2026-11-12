// Maze Chase: collect every seed while four bots hunt you. Engine: ./engine.js (pure, tested in Node).
import './engine.js';
const E = self.MazeChase;
const { COLS, ROWS, STEP } = E;

const BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
const fmt = (n) => n.toLocaleString('en-US');
const ANG = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

const PALETTE = {
  light: {
    wall: '#bfe6dc', edge: '#2a8a7b', door: '#e879a6', seed: '#c2410c', star: '#d97706',
    hero: '#7c3aed', heroHi: '#c4b5fd', heroDark: '#4c1d95',
    bots: ['#e11d48', '#d97706', '#059669', '#4f46e5'], scared: '#64748b', scaredHi: '#f1f5f9', text: '#0f172a', pop: '#0e7490',
  },
  dark: {
    wall: '#113a35', edge: '#2dd4bf', door: '#f472b6', seed: '#fdba74', star: '#fcd34d',
    hero: '#a78bfa', heroHi: '#ede9fe', heroDark: '#5b21b6',
    bots: ['#fb7185', '#fbbf24', '#34d399', '#818cf8'], scared: '#475569', scaredHi: '#e2e8f0', text: '#e2e8f0', pop: '#67e8f9',
  },
};
const GEM = ['#e11d48', '#65a30d', '#a16207', '#0ea5e9', '#eab308', '#f59e0b', '#c026d3', '#f43f5e'];

export default {
  id: 'maze-chase',
  name: 'Maze Chase',
  saveVersion: 1,
  input: {
    model: 'action',
    stage: '.mc-stage',
    actions: [
      { id: 'move', kind: 'dir4', latch: true },
      { id: 'start', kind: 'button' },
      { id: 'pause', kind: 'button' },
    ],
    keys: { ' ': 'start', Enter: 'start' },
    touch: {
      gestures: { swipe: 'move', tap: 'start' },
      console: { dpad: 'move', a: 'pause', labels: { a: 'II' } },
      halves: { left: { stick: 'move' }, right: { button: 'start' } },
    },
  },
  help: [
    'Steer Nib through the maze and collect every seed.',
    'Four bots hunt you: Dart chases, Snare cuts you off, Pincer flanks, Drift wanders when close.',
    'A star makes the bots scared for a few seconds: catch them for 200, 400, 800, 1600. They flash before it ends.',
    'Turn early: a swipe or arrow just before a corner is remembered and taken at the next opening.',
    'The side openings are tunnels. Gems appear twice per level for bonus points. Extra life at 10,000.',
    'Swipe anywhere to steer (or pick Buttons / Halves in the pause menu). Keyboard: arrows/WASD, P or Esc pauses.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  const main = document.createElement('main');
  main.className = 'screen mc';
  main.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="home" aria-label="All games">${BACK}</button>
      <div class="mc-title"><b class="mc-score">0</b><div class="muted small"><span class="mc-level">Level 1</span> · Best <span class="mc-high">0</span></div></div>
      <button class="icon-btn" data-act="pause" aria-label="Pause">${PAUSE}</button>
    </header>
    <div class="mc-hud"><span class="mc-lives" aria-label="Lives"></span><span class="mc-maze muted small"></span></div>
    <div class="mc-stage"><canvas class="mc-canvas" aria-label="Maze"></canvas></div>`;
  root.prepend(main); // the control layer may already have put its on-screen controls into root
  const $ = (s) => main.querySelector(s);
  const stage = $('.mc-stage'), canvas = $('.mc-canvas'), g = canvas.getContext('2d');
  const wallLayer = document.createElement('canvas'), wg = wallLayer.getContext('2d');

  let st = null, high = ctx.storage.get('high', 0);
  let raf = 0, running = false, last = 0, acc = 0, prevMode = '';
  let ts = 20, dpr = 1, pal = PALETTE.light, wallKey = '';
  const prev = { hx: 0, hy: 0, c: [[0, 0], [0, 0], [0, 0], [0, 0]] };
  let shown = { score: -1, level: -1, lives: -1, high: -1 };
  let waka = 0;

  // ---------------------------------------------------------------- setup / layout
  function readPalette() {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const m = bg.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    const lum = m ? (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 : 255;
    pal = lum < 128 ? PALETTE.dark : PALETTE.light;
  }
  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    ts = Math.max(6, Math.min(w / COLS, h / ROWS));
    dpr = Math.min(3, self.devicePixelRatio || 1);
    const cw = Math.round(ts * COLS), ch = Math.round(ts * ROWS);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    wallKey = '';
    draw(1);
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);

  function newGame() {
    st = E.newGame((Math.random() * 2 ** 31) | 0);
    snap(); wallKey = ''; input.clearDir('move');
    ctx.requestPersistence();
    status();
  }
  function snap() {
    prev.hx = st.hero.x; prev.hy = st.hero.y;
    st.chasers.forEach((c, i) => { prev.c[i][0] = c.x; prev.c[i][1] = c.y; });
  }
  function status() {
    if (!st || st.mode === 'over') ctx.setStatus(null);
    else ctx.setStatus('Level ' + st.level + ' · ' + fmt(st.score), Math.round((st.eaten / (st.eaten + st.left)) * 100));
  }

  // ---------------------------------------------------------------- loop
  function frame(now) {
    raf = requestAnimationFrame(frame);
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= STEP) { acc -= STEP; tick(); if (!running) return; }
    draw(acc / STEP);
  }
  function tick() {
    input.update();
    if (input.pressed('pause')) { ctx.pause(); return; }
    const pd = input.pressedDir('move');
    if (st.mode === 'over') {
      if (input.pressed('start') || pd) { if (st.score > high) saveHigh(); newGame(); }
      return;
    }
    snap();
    const ev = E.step(st, input.dir('move'));
    if (prevMode === 'dying' && st.mode === 'ready') { input.clearDir('move'); snap(); }
    if (st.mode === 'ready' && prevMode !== 'ready') snap();
    prevMode = st.mode;
    for (const e of ev) sound(e);
  }
  function saveHigh() { if (st.score > high) { high = st.score; ctx.storage.set('high', high); } }
  function sound(e) {
    const a = ctx.audio;
    if (e === 'dot') { waka ^= 1; a.tone(waka ? 620 : 520, 35, 'triangle', 0.03); }
    else if (e === 'power') { a.tone(330, 90, 'sawtooth', 0.04); setTimeout(() => a.tone(495, 120, 'sawtooth', 0.04), 70); ctx.haptics(15); }
    else if (e === 'eat') { a.tone(880, 70, 'square', 0.04); setTimeout(() => a.tone(1320, 110, 'square', 0.04), 60); ctx.haptics(20); }
    else if (e === 'bonus') { a.tone(988, 60, 'triangle'); setTimeout(() => a.tone(1319, 120, 'triangle'), 60); }
    else if (e === 'die') { [520, 440, 370, 300, 240, 180].forEach((f, i) => setTimeout(() => a.tone(f, 140, 'triangle', 0.05), 250 + i * 150)); ctx.haptics(60); }
    else if (e === 'clear') { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => a.tone(f, 110, 'triangle'), i * 110)); }
    else if (e === 'life') { [784, 988, 1175].forEach((f, i) => setTimeout(() => a.tone(f, 90, 'square', 0.03), i * 90)); }
    else if (e === 'go') a.tone(660, 80, 'triangle', 0.03);
    else if (e === 'over') { saveHigh(); status(); a.tone(196, 400, 'triangle'); }
    if (e === 'level' || e === 'die') status();
  }
  function startLoop() { if (running) return; running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); }
  function stopLoop() { running = false; cancelAnimationFrame(raf); }

  // ---------------------------------------------------------------- drawing
  function drawWalls() {
    const key = st.maze + '|' + ts + '|' + dpr + '|' + (pal === PALETTE.dark);
    if (key === wallKey) return;
    wallKey = key;
    wallLayer.width = canvas.width; wallLayer.height = canvas.height;
    const c = wg, s = ts * dpr, m = E.MAZES[st.maze];
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, wallLayer.width, wallLayer.height);
    const isWall = (x, y) => (y < 0 || y >= ROWS ? true : x < 0 || x >= COLS ? !E.open(m, x, y) : m.tiles[y * COLS + x] === 1);
    const ins = s * 0.2, r = s * 0.28;
    // fill: each wall tile is a rounded core plus bridges to its wall neighbours, so walls read as soft blocks
    const paint = (fill, inset) => {
      c.fillStyle = fill;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (!isWall(x, y)) continue;
        const X = x * s, Y = y * s, l = isWall(x - 1, y), rr = isWall(x + 1, y), u = isWall(x, y - 1), d = isWall(x, y + 1);
        c.beginPath(); c.roundRect(X + inset, Y + inset, s - 2 * inset, s - 2 * inset, Math.max(0, r - (ins - inset))); c.fill();
        if (l) c.fillRect(X, Y + inset, s / 2, s - 2 * inset);
        if (rr) c.fillRect(X + s / 2, Y + inset, s / 2, s - 2 * inset);
        if (u) c.fillRect(X + inset, Y, s - 2 * inset, s / 2);
        if (d) c.fillRect(X + inset, Y + s / 2, s - 2 * inset, s / 2);
        for (const qx of [-1, 1]) for (const qy of [-1, 1]) {
          if (isWall(x + qx, y) && isWall(x, y + qy) && isWall(x + qx, y + qy)) c.fillRect(X + (qx > 0 ? s / 2 : 0), Y + (qy > 0 ? s / 2 : 0), s / 2, s / 2);
        }
      }
    };
    paint(pal.edge, ins);
    paint(pal.wall, ins + Math.max(1.5 * dpr, s * 0.08));
    // door
    c.fillStyle = pal.door;
    c.fillRect(m.door.x * s, (m.door.y + 1) * s + s * 0.4, s, s * 0.2);
  }

  function lerp(a, b, t) { return Math.abs(b - a) > 1.5 ? b : a + (b - a) * t; }

  function draw(alpha) {
    if (!st || !canvas.width) return;
    drawWalls();
    const s = ts * dpr, c = g, T = st.t;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    const flashWalls = st.mode === 'clear' && Math.floor(st.modeT * 5) % 2 === 0;
    c.globalAlpha = flashWalls ? 0.35 : 1;
    c.drawImage(wallLayer, 0, 0);
    c.globalAlpha = 1;
    const P = (v) => (v + 0.5) * s;

    // seeds and stars
    const dots = st.dots;
    c.fillStyle = pal.seed; c.beginPath();
    const dr = Math.max(1.4 * dpr, s * 0.1);
    for (let i = 0; i < dots.length; i++) if (dots.charCodeAt(i) === 49) { const x = P(i % COLS), y = P((i / COLS) | 0); c.moveTo(x + dr, y); c.arc(x, y, dr, 0, 6.2832); }
    c.fill();
    const pulse = st.mode === 'play' ? 0.85 + 0.15 * Math.sin(T * 8) : 1;
    c.fillStyle = pal.star;
    for (let i = 0; i < dots.length; i++) if (dots.charCodeAt(i) === 50) star(c, P(i % COLS), P((i / COLS) | 0), s * 0.42 * pulse, s * 0.17 * pulse, T * 1.5);

    // bonus gem
    if (st.bonus) gem(c, P(st.bonus.x), P(st.bonus.y), s * 0.42, GEM[E.BONUS.findIndex((b) => b.k === st.bonus.k)] || GEM[0]);

    // bots
    const dying = st.mode === 'dying', hideBots = (dying && st.modeT < 1.25) || st.mode === 'clear' || st.mode === 'over';
    if (!hideBots) st.chasers.forEach((ch, i) => {
      const x = lerp(prev.c[i][0], ch.x, alpha), y = lerp(prev.c[i][1], ch.y, alpha);
      if (st.freeze > 0 && st.pop && Math.abs(st.pop.x - ch.x) < 0.01 && Math.abs(st.pop.y - ch.y) < 0.01) return;
      bot(c, P(x), P(y), s, i, ch);
    });

    // hero
    const h = st.hero;
    const hx = lerp(prev.hx, h.x, alpha), hy = lerp(prev.hy, h.y, alpha);
    if (st.mode !== 'over') {
      hero(c, P(hx), P(hy), s, h, dying ? 1 - Math.max(0, st.modeT - 0.2) / 1.5 : 0);
      if (hx < 0.5) hero(c, P(hx + COLS), P(hy), s, h, 0); else if (hx > COLS - 1.5) hero(c, P(hx - COLS), P(hy), s, h, 0);
    }

    // popups and banners
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (st.pop) { c.fillStyle = pal.pop; c.font = '700 ' + Math.round(s * 0.62) + 'px system-ui, sans-serif'; c.fillText(st.pop.text, P(st.pop.x), P(st.pop.y)); }
    const banner = (t, y, size, col) => { c.font = '800 ' + Math.round(s * size) + 'px system-ui, sans-serif'; c.fillStyle = col; c.fillText(t, P(9), P(y)); };
    if (st.mode === 'ready') banner('Get set!', E.MAZES[st.maze].door.y + 5, 0.8, pal.door);
    if (st.mode === 'clear') banner('Level ' + st.level + ' clear!', E.MAZES[st.maze].door.y + 5, 0.8, pal.door);
    if (st.mode === 'over') {
      banner('Game over', E.MAZES[st.maze].door.y + 5, 0.9, pal.door);
      const how = input.device === 'key' ? 'Press Space' : input.scheme === 'console' ? 'Press the pad' : 'Tap';
      banner(how + ' to play again', E.MAZES[st.maze].door.y + 7.3, 0.55, pal.text);
    }
    hud();
  }

  function star(c, x, y, R, r, rot) {
    c.beginPath();
    for (let k = 0; k < 8; k++) { const a = rot + (k * Math.PI) / 4, q = k % 2 ? r : R; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath(); c.fill();
  }
  function gem(c, x, y, R, col) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(x, y + R); c.lineTo(x - R, y - R * 0.25); c.lineTo(x - R * 0.55, y - R * 0.75); c.lineTo(x + R * 0.55, y - R * 0.75); c.lineTo(x + R, y - R * 0.25); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(x - R * 0.5, y - R * 0.25); c.lineTo(x, y + R * 0.7); c.lineTo(x - R * 0.1, y - R * 0.25); c.closePath(); c.fill();
  }

  // Nib: a round little beetle with two antennae. Faces its direction; antennae bob while it walks.
  function hero(c, x, y, s, h, die) {
    const R = s * 0.44 * (1 - die * 0.9), a = ANG[h.dir || 'left'], bob = h.moving ? Math.sin(h.anim * Math.PI * 2) : 0;
    if (R <= 0.5) return;
    c.save(); c.translate(x, y); c.rotate(die * Math.PI * 3);
    // antennae (behind the head, pointing back-up relative to motion)
    c.strokeStyle = pal.heroDark; c.lineWidth = Math.max(1, s * 0.07); c.lineCap = 'round';
    const back = a + Math.PI;
    for (const side of [-1, 1]) {
      const aa = back + side * (0.75 + bob * 0.12);
      const ex = Math.cos(aa) * R * 1.25, ey = Math.sin(aa) * R * 1.25;
      c.beginPath(); c.moveTo(Math.cos(aa) * R * 0.6, Math.sin(aa) * R * 0.6); c.lineTo(ex, ey); c.stroke();
      c.fillStyle = pal.door; c.beginPath(); c.arc(ex, ey, s * 0.08, 0, 6.2832); c.fill();
    }
    // body
    const sq = h.moving ? 1 + bob * 0.04 : 1;
    c.rotate(a); c.scale(sq, 2 - sq);
    const grd = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    grd.addColorStop(0, pal.heroHi); grd.addColorStop(0.45, pal.hero); grd.addColorStop(1, pal.heroDark);
    c.fillStyle = grd; c.beginPath(); c.arc(0, 0, R, 0, 6.2832); c.fill();
    // shell line
    c.strokeStyle = pal.heroDark; c.lineWidth = Math.max(1, s * 0.045);
    c.beginPath(); c.moveTo(-R * 0.95, 0); c.lineTo(-R * 0.15, 0); c.stroke();
    // eyes (looking forward)
    for (const side of [-1, 1]) {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(R * 0.38, side * R * 0.33, R * 0.24, 0, 6.2832); c.fill();
      c.fillStyle = '#111827'; c.beginPath(); c.arc(R * 0.47, side * R * 0.33, R * 0.12, 0, 6.2832); c.fill();
    }
    c.restore();
  }

  // Bots: rounded boxes on two little wheels with a visor eye and a different antenna each.
  function bot(c, x, y, s, i, ch) {
    const scared = ch.fr && ch.mode !== 'eaten' && ch.mode !== 'enter';
    const eyesOnly = ch.mode === 'eaten' || ch.mode === 'enter';
    const flash = scared && st.frT < 2 && Math.floor(st.frT * 6) % 2 === 0;
    const col = scared ? (flash ? pal.scaredHi : pal.scared) : pal.bots[i];
    const W = s * 0.82, H = s * 0.78, x0 = x - W / 2, y0 = y - H / 2 + s * 0.02;
    const d = ch.dir, ex = E.DX[d] * s * 0.1, ey = E.DY[d] * s * 0.08;
    if (!eyesOnly) {
      // antenna
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(1, s * 0.07);
      c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 - s * 0.14); c.stroke();
      const ay = y0 - s * 0.17;
      c.beginPath();
      if (scared || i === 0) c.arc(x, ay, s * 0.07, 0, 6.2832);
      else if (i === 1) { c.moveTo(x - s * 0.09, ay + s * 0.05); c.lineTo(x, ay - s * 0.08); c.lineTo(x + s * 0.09, ay + s * 0.05); c.closePath(); }
      else if (i === 2) c.rect(x - s * 0.07, ay - s * 0.06, s * 0.14, s * 0.12);
      else { c.moveTo(x, ay - s * 0.09); c.lineTo(x + s * 0.08, ay); c.lineTo(x, ay + s * 0.09); c.lineTo(x - s * 0.08, ay); c.closePath(); }
      c.fill();
      // body
      c.beginPath(); c.roundRect(x0, y0, W, H * 0.86, s * 0.2); c.fill();
      // wheels
      const roll = st.t * 10 + i;
      c.fillStyle = pal.heroDark === '#5b21b6' ? '#0b1120' : '#1f2937';
      for (const k of [-1, 1]) { c.beginPath(); c.arc(x + k * W * 0.27, y0 + H * 0.86, s * 0.11 + Math.sin(roll + k) * s * 0.01, 0, 6.2832); c.fill(); }
    }
    // visor
    if (scared) {
      c.fillStyle = flash ? '#e11d48' : '#f8fafc';
      for (const k of [-1, 1]) { c.beginPath(); c.arc(x + k * s * 0.16, y - s * 0.07, s * 0.07, 0, 6.2832); c.fill(); }
      c.strokeStyle = c.fillStyle; c.lineWidth = Math.max(1, s * 0.05); c.beginPath();
      for (let k = 0; k <= 6; k++) c.lineTo(x - s * 0.24 + k * s * 0.08, y + s * 0.14 + (k % 2 ? -1 : 1) * s * 0.04);
      c.stroke();
      return;
    }
    c.fillStyle = '#f8fafc';
    c.beginPath(); c.roundRect(x - s * 0.28 + ex * 0.5, y - s * 0.2 + ey * 0.5, s * 0.56, s * 0.3, s * 0.15); c.fill();
    if (eyesOnly) { c.strokeStyle = pal.bots[i]; c.lineWidth = Math.max(1, s * 0.05); c.stroke(); }
    c.fillStyle = '#0f172a';
    c.beginPath(); c.arc(x + ex * 1.4, y - s * 0.05 + ey * 1.2, s * 0.09, 0, 6.2832); c.fill();
  }

  function hud() {
    if (shown.score !== st.score) { shown.score = st.score; $('.mc-score').textContent = fmt(st.score); }
    const hi = Math.max(high, st.score);
    if (shown.high !== hi) { shown.high = hi; $('.mc-high').textContent = fmt(hi); }
    if (shown.level !== st.level) { shown.level = st.level; $('.mc-level').textContent = 'Level ' + st.level; $('.mc-maze').textContent = E.MAZES[st.maze].name + ' maze'; }
    const lives = Math.max(0, st.lives - 1);
    if (shown.lives !== lives) {
      shown.lives = lives;
      $('.mc-lives').innerHTML = Array.from({ length: Math.min(lives, 6) }, () => '<i class="mc-life"></i>').join('');
      $('.mc-lives').setAttribute('aria-label', lives + ' spare lives');
    }
  }

  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'home') ctx.back();
    if (b.dataset.act === 'pause') ctx.pause();
  });

  return {
    start(saved) {
      readPalette();
      st = E.restore(saved);
      if (!st) newGame(); else { snap(); status(); }
      prevMode = st.mode;
      layout();
      startLoop();
    },
    pause() { stopLoop(); if (st) { saveHigh(); status(); } draw(1); },
    resume() { readPalette(); wallKey = ''; layout(); startLoop(); },
    save() { if (!st) return null; saveHigh(); status(); return st.mode === 'over' ? null : E.save(st); },
    destroy() { stopLoop(); ro.disconnect(); },
  };
}
