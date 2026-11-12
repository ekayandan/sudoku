// Pinball: "Deep Current", a deep-sea table. Physics and rules: ./table.js (pure, tested in tools/test-pinball.js).
import './table.js';
const T = self.PinballTable;

const BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export default {
  id: 'pinball',
  name: 'Pinball',
  input: {
    model: 'action',
    stage: '.pb-stage',
    actions: [
      { id: 'flipperLeft', kind: 'button' },
      { id: 'flipperRight', kind: 'button' },
      { id: 'plunger', kind: 'button' },
      { id: 'nudge', kind: 'button' },
      { id: 'pause', kind: 'button' },
    ],
    keys: {
      z: 'flipperLeft', ArrowLeft: 'flipperLeft',
      '/': 'flipperRight', ArrowRight: 'flipperRight',
      ' ': 'plunger', ArrowDown: 'plunger', Enter: 'plunger',
      ArrowUp: 'nudge', n: 'nudge',
    },
    touch: {
      halves: { left: { button: 'flipperLeft', swipeUp: 'nudge' }, right: { button: 'flipperRight', swipeUp: 'nudge' } },
      console: { dpad: { left: 'flipperLeft', right: 'flipperRight', down: 'plunger', up: 'nudge' }, a: 'flipperRight', b: 'plunger', c: 'nudge', labels: { a: '◢', b: '⇣', c: '≋' } },
    },
  },
  help: [
    'Keep the pearl in play with the flippers. You have 3 balls.',
    'Launch: hold the right half (or Space / ↓) to pull the plunger, let go to launch. Longer pull = stronger.',
    'Touch: left half = left flipper, right half = right flipper. Swipe up = nudge (too many nudges = TILT).',
    'Keyboard: Z or ← left flipper, / or → right flipper, ↑ or N nudge, P or Esc pause.',
    'Light all three top lanes to raise the bonus multiplier (flippers shift the lit lanes).',
    'Drop all four coral targets for 25,000; every second bank gives an extra ball.',
    'Ride the left current (orbit) for 5,000. Ball save covers the first 8 seconds of each ball.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  root.insertAdjacentHTML('afterbegin', `
    <main class="screen pb">
      <header class="topbar">
        <button class="icon-btn" data-act="home" aria-label="All games">${BACK}</button>
        <div class="pb-title"><b class="pb-score">0</b><div class="muted small"><span class="pb-ball"></span> · High <span class="pb-best"></span></div></div>
        <button class="icon-btn" data-act="pause" aria-label="Pause">${PAUSE}</button>
      </header>
      <div class="pb-stage">
        <canvas class="pb-canvas" aria-label="Pinball table"></canvas>
        <div class="pb-over" hidden>
          <div class="pb-over-card">
            <b>Game over</b>
            <div class="pb-final"></div>
            <div class="muted small pb-final-best"></div>
            <button class="pb-new" data-act="new">New game</button>
          </div>
        </div>
      </div>
    </main>`);
  const $ = (q) => root.querySelector(q);
  const stage = $('.pb-stage'), canvas = $('.pb-canvas'), g = canvas.getContext('2d');
  let best = ctx.storage.get('best', 0);
  let s = T.newGame(seed());
  let raf = 0, running = false, last = 0, acc = 0, statusAt = 0, lastStatus = '';
  let scale = 1, dpr = 1, ox = 0, oy = 0, bg = null;

  function seed() { return (Math.random() * 4294967296) >>> 0; }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'home') ctx.back();
    if (a === 'pause') ctx.pause();
    if (a === 'new') newGame();
  });

  function newGame() {
    s = T.newGame(seed());
    $('.pb-over').hidden = true;
    ctx.requestPersistence();
    updateHud(true); draw();
    if (!running) start();
  }

  // ------------------------------------------------------------ layout
  function layout() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    scale = Math.min(r.width / T.W, r.height / T.H);
    dpr = Math.min(3, self.devicePixelRatio || 1);
    const cw = Math.floor(T.W * scale), ch = Math.floor(T.H * scale);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ox = 0; oy = 0;
    bg = renderStatic(canvas.width, canvas.height, scale * dpr);
    draw();
  }
  const ro = new ResizeObserver(layout);
  ro.observe(stage);

  // ------------------------------------------------------------ loop
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    while (acc >= T.DT && running) { acc -= T.DT; tick(); }
    draw();
  }
  function start() { if (running) return; running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function tick() {
    input.update();
    if (input.pressed('pause')) { ctx.pause(); return; }
    if (s.over) {
      if (input.pressed('plunger')) newGame();
      return;
    }
    const inp = {
      L: input.held('flipperLeft') || input.pressed('flipperLeft'),
      R: input.held('flipperRight') || input.pressed('flipperRight'),
      plunger: input.held('plunger') || input.pressed('plunger'),
      nudge: input.pressed('nudge'),
    };
    const ev = T.step(s, inp);
    for (const e of ev) sound(e);
    updateHud(false);
  }

  // ------------------------------------------------------------ sound & haptics
  const tone = (f, ms, type, vol) => ctx.audio.tone(f, ms, type, vol);
  function sound(e) {
    switch (e[0]) {
      case 'bumper': tone(520 + e[1] * 90, 50, 'triangle', 0.07); ctx.haptics(15); break;
      case 'sling': tone(300, 40, 'square', 0.04); ctx.haptics(10); break;
      case 'flip': tone(120, 25, 'square', 0.025); break;
      case 'target': tone(760, 60, 'triangle', 0.06); break;
      case 'lane': tone(990, 50, 'sine', 0.06); break;
      case 'mult': [660, 880, 1100].forEach((f, i) => setTimeout(() => tone(f, 70, 'triangle', 0.06), i * 80)); break;
      case 'orbit': tone(440, 120, 'sine', 0.06); break;
      case 'extra': [880, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 90, 'triangle', 0.07), i * 90)); ctx.haptics(40); break;
      case 'launch': tone(180 + e[1] * 200, 90, 'sawtooth', 0.04); break;
      case 'drain': tone(110, 320, 'sawtooth', 0.05); ctx.haptics(60); break;
      case 'saved': tone(660, 160, 'sine', 0.06); break;
      case 'tilt': tone(90, 500, 'square', 0.06); ctx.haptics(120); break;
      case 'nudge': ctx.haptics(20); break;
      case 'over': gameOver(); break;
      default:
    }
  }

  function gameOver() {
    if (s.score > best) { best = s.score; ctx.storage.set('best', best); }
    $('.pb-final').textContent = fmt(s.score);
    $('.pb-final-best').textContent = s.score >= best && s.score > 0 ? 'New high score!' : 'High score ' + fmt(best);
    $('.pb-over').hidden = false;
    ctx.setStatus(null);
    updateHud(true);
  }

  function updateHud(force) {
    $('.pb-score').textContent = fmt(s.score);
    $('.pb-ball').textContent = s.over ? 'Game over' : 'Ball ' + s.ballNum + (s.extra ? ' +' + s.extra : '');
    $('.pb-best').textContent = fmt(Math.max(best, s.score));
    const now = performance.now();
    if (!s.over && (force || now - statusAt > 1000)) {
      const st = 'Ball ' + s.ballNum + ' · ' + fmt(s.score);
      if (st !== lastStatus) { ctx.setStatus(st, (s.ballNum - 1) / T.BALLS); lastStatus = st; }
      statusAt = now;
    }
  }

  // ------------------------------------------------------------ drawing
  function tablePath(c) {
    c.beginPath(); c.moveTo(10, T.H + 20); c.lineTo(10, 200); c.arc(200, 200, 190, Math.PI, 2 * Math.PI); c.lineTo(390, T.H + 20); c.closePath();
  }
  function renderStatic(w, h, k) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    // water
    tablePath(c);
    const gr = c.createLinearGradient(0, 0, 0, T.H);
    gr.addColorStop(0, '#0b4f73'); gr.addColorStop(0.45, '#073452'); gr.addColorStop(1, '#03142a');
    c.fillStyle = gr; c.fill();
    c.save(); tablePath(c); c.clip();
    // light rays from the surface
    c.globalAlpha = 0.07; c.fillStyle = '#bae6fd';
    for (const [x, wdt] of [[60, 40], [150, 26], [250, 50], [330, 22]]) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + wdt, 0); c.lineTo(x + wdt * 2.4 + 60, 620); c.lineTo(x + 40, 620); c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
    // bubbles
    let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    c.strokeStyle = 'rgba(186,230,253,.25)'; c.lineWidth = 1;
    for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(20 + r() * 330, 100 + r() * 560, 1 + r() * 3, 0, 7); c.stroke(); }
    // sea floor: seaweed and sand by the drain
    c.fillStyle = '#062033';
    c.beginPath(); c.moveTo(10, T.H); for (let x = 10; x <= 390; x += 20) c.lineTo(x, 800 + Math.sin(x * 0.07) * 8); c.lineTo(390, T.H + 20); c.lineTo(10, T.H + 20); c.fill();
    c.strokeStyle = 'rgba(45,212,191,.35)'; c.lineWidth = 3; c.lineCap = 'round';
    for (const x0 of [140, 160, 210, 232]) { c.beginPath(); c.moveTo(x0, 812); for (let y = 812; y > 770; y -= 6) c.lineTo(x0 + Math.sin(y * 0.25 + x0) * 4, y); c.stroke(); }
    // title
    c.textAlign = 'center'; c.fillStyle = 'rgba(165,243,252,.13)'; c.font = '700 26px system-ui, sans-serif';
    c.fillText('DEEP CURRENT', 184, 455);
    drawManta(c, 184, 395);
    // plunger lane
    c.fillStyle = 'rgba(2,6,23,.45)'; c.fillRect(358, 200, 32, T.H);
    // aprons under the inlane guides, drop-target block, slingshots
    c.fillStyle = '#0a2540';
    for (const side of [0, 1]) {
      const X = side ? (x) => 368 - x : (x) => x;
      poly(c, [[X(40), 625], [X(112), 688], [X(112), T.H + 20], [X(40), T.H + 20]]); c.fill();
      poly(c, [[X(66), 540], [X(104), 640], [X(66), 605]]); c.fillStyle = '#0e3a5c'; c.fill(); c.fillStyle = '#0a2540';
    }
    poly(c, [[344, 282], [358, 262], [358, 412], [344, 392]]); c.fill();
    // orbit chevrons
    c.strokeStyle = 'rgba(94,234,212,.5)'; c.lineWidth = 2.5;
    for (const y of [235, 255, 275]) { c.beginPath(); c.moveTo(19, y + 6); c.lineTo(26, y); c.lineTo(33, y + 6); c.stroke(); }
    c.restore();
    // walls
    c.lineCap = 'round'; c.shadowColor = '#22d3ee'; c.shadowBlur = 6 * k;
    for (const wl of T.walls) {
      if (wl.tag === 'bumper') continue;
      c.strokeStyle = wl.tag === 'guide' ? '#7dd3fc' : wl.tag === 'sling' ? '#2dd4bf' : wl.tag === 'sling-side' ? '#0e7490' : '#5eead4';
      c.lineWidth = Math.max(2.5, wl.r * 2);
      c.beginPath();
      if (wl.k === 'seg') { c.moveTo(wl.ax, wl.ay); c.lineTo(wl.bx, wl.by); } else if (wl.k === 'arc') c.arc(wl.x, wl.y, wl.R, wl.a0, wl.a1);
      else c.arc(wl.x, wl.y, wl.r, 0, 7);
      c.stroke();
    }
    c.shadowBlur = 0;
    // flipper pivots' guide posts
    return cv;
  }
  function drawManta(c, x, y) {
    c.save(); c.translate(x, y); c.fillStyle = 'rgba(165,243,252,.10)';
    c.beginPath(); c.moveTo(0, -18); c.quadraticCurveTo(30, -16, 56, 6); c.quadraticCurveTo(26, 4, 8, 18); c.lineTo(0, 46); c.lineTo(-8, 18);
    c.quadraticCurveTo(-26, 4, -56, 6); c.quadraticCurveTo(-30, -16, 0, -18); c.fill(); c.restore();
  }
  function poly(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }

  function glow(c, x, y, r, color, a) {
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = a; c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.globalAlpha = 1;
  }

  function draw() {
    if (!bg) return;
    const c = g, k = scale * dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(bg, 0, 0);
    c.setTransform(k, 0, 0, k, ox, oy);
    c.lineCap = 'round';
    // rollover lane lights
    for (let i = 0; i < 3; i++) {
      const x = 170 + i * 40;
      if (s.lanes[i]) glow(c, x, 70, 20, '#fbbf24', 0.7);
      c.beginPath(); c.arc(x, 70, 6, 0, 7);
      c.fillStyle = s.lanes[i] ? '#fde68a' : '#12324d'; c.fill();
      c.strokeStyle = s.lanes[i] ? '#f59e0b' : '#38bdf8'; c.lineWidth = 1.5; c.stroke();
    }
    // multiplier lights
    c.font = '700 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let m = 2; m <= 6; m++) {
      const x = 184 + (m - 4) * 26, on = s.mult >= m;
      c.beginPath(); c.arc(x, 520, 10, 0, 7); c.fillStyle = on ? '#f59e0b' : 'rgba(18,50,77,.9)'; c.fill();
      c.strokeStyle = on ? '#fde68a' : 'rgba(56,189,248,.5)'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = on ? '#1c1917' : 'rgba(186,230,253,.6)'; c.fillText(m + '×', x, 520.5);
    }
    // bumpers: glowing jellyfish
    T.BUMPERS.forEach(([x, y], i) => {
      const f = s.flash[i] > 0;
      glow(c, x, y, f ? 42 : 30, f ? '#f0abfc' : '#c084fc', f ? 0.9 : 0.35);
      const gr = c.createRadialGradient(x - 6, y - 7, 2, x, y, 20);
      gr.addColorStop(0, f ? '#fff' : '#f5d0fe'); gr.addColorStop(0.6, f ? '#f0abfc' : '#a855f7'); gr.addColorStop(1, '#6b21a8');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, 20, 0, 7); c.fill();
      c.strokeStyle = f ? '#fff' : '#e9d5ff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 13, 0, 7); c.stroke();
    });
    // slingshot faces flash
    for (let i = 0; i < 2; i++) if (s.flash[3 + i] > 0) {
      const X = i ? (x) => 368 - x : (x) => x;
      c.strokeStyle = '#ccfbf1'; c.lineWidth = 6; c.shadowColor = '#2dd4bf'; c.shadowBlur = 12 * k;
      c.beginPath(); c.moveTo(X(66), 540); c.lineTo(X(104), 640); c.stroke(); c.shadowBlur = 0;
    }
    // drop targets (coral)
    T.TARGETS.forEach(([y0, y1], i) => {
      if (s.targets[i]) { c.fillStyle = '#fb7185'; c.strokeStyle = '#fecdd3'; }
      else { c.fillStyle = 'rgba(251,113,133,.12)'; c.strokeStyle = 'rgba(251,113,133,.4)'; }
      roundRect(c, 332, y0 + 1, 8, y1 - y0 - 2, 3); c.fill(); c.lineWidth = 1; c.stroke();
    });
    // gate
    c.strokeStyle = s.ball.inPlay ? '#5eead4' : 'rgba(94,234,212,.35)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(T.GATE.ax, T.GATE.ay); c.lineTo(T.GATE.bx, T.GATE.by); c.stroke();
    // plunger
    const py = T.PLUNGER_Y + s.charge * T.PULL;
    c.strokeStyle = '#94a3b8'; c.lineWidth = 1.5; c.beginPath();
    for (let y = py + 4, j = 0; y < T.H; y += 4, j++) c.lineTo(j % 2 ? 364 : 384, y);
    c.stroke();
    c.fillStyle = s.charge > 0 ? '#fbbf24' : '#e2e8f0'; roundRect(c, 362, py, 24, 6, 2); c.fill();
    // flippers
    for (let i = 0; i < 2; i++) drawFlipper(c, i);
    // ball: a pearl
    const b = s.ball;
    const gr = c.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, T.R);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#e2e8f0'); gr.addColorStop(1, '#94a3b8');
    c.fillStyle = gr; c.beginPath(); c.arc(b.x, b.y, T.R, 0, 7); c.fill();
    // ball save light
    if (s.saveT > 0 && !s.over) {
      const on = s.saveT > 2 || Math.floor(s.saveT * 6) % 2 === 0;
      c.fillStyle = on ? '#34d399' : 'rgba(52,211,153,.25)'; c.font = '700 10px system-ui, sans-serif';
      c.fillText('SAVE', 184, 742);
    }
    // messages
    let msg = s.msgT > 0 ? s.msg : '';
    let hint = '';
    if (!b.inPlay && T.resting(s) && !s.over) hint = input.device === 'key' ? 'Hold Space to pull · let go to launch' : input.scheme === 'console' ? 'Hold ⇣ to pull · let go to launch' : 'Hold the right side to pull · let go to launch';
    if (s.tilted) msg = 'TILT';
    if (msg) banner(c, msg, 588, 15);
    if (hint) banner(c, hint, 780, 12);
  }
  function banner(c, text, y, size) {
    c.font = '700 ' + size + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width + 20;
    c.fillStyle = 'rgba(2,6,23,.72)'; roundRect(c, 184 - w / 2, y - size, w, size * 2, size); c.fill();
    c.fillStyle = '#e0f2fe'; c.fillText(text, 184, y + 0.5);
  }
  function drawFlipper(c, i) {
    const p = T.flipperPose(i, s.fl[i].a);
    const ang = Math.atan2(p.ty - p.py, p.tx - p.px), nx = -Math.sin(ang), ny = Math.cos(ang);
    c.beginPath();
    c.arc(p.px, p.py, T.FL_R0, ang + Math.PI / 2, ang - Math.PI / 2);
    c.lineTo(p.tx - nx * T.FL_R1, p.ty - ny * T.FL_R1);
    c.arc(p.tx, p.ty, T.FL_R1, ang - Math.PI / 2, ang + Math.PI / 2);
    c.closePath();
    c.fillStyle = '#f1f5f9'; c.fill();
    c.strokeStyle = s.fl[i].hold > 0 ? '#fbbf24' : '#22d3ee'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#0e7490'; c.beginPath(); c.arc(p.px, p.py, 3, 0, 7); c.fill();
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ------------------------------------------------------------ lifecycle
  function valid(v) { return v && v.v === 1 && v.ball && Number.isFinite(v.ball.x) && Array.isArray(v.fl) && v.fl.length === 2; }
  return {
    start(saved) {
      if (valid(saved)) s = saved; else { s = T.newGame(seed()); ctx.requestPersistence(); }
      if (s.over) gameOver();
      updateHud(true);
      layout();
      start();
    },
    pause() { stop(); draw(); },
    resume() { start(); },
    save() { return s.over ? null : s; },
    destroy() { stop(); ro.disconnect(); },
  };
}
