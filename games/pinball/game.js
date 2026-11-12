// Pinball: three tables in 3D. Physics and rules: ./engine.js + ./tables/*.js (pure, tested in tools/test-pinball.js).
// Rendering: ./render3d.js (three.js), playfield art: ./art.js. Score and messages: a dot-matrix display above the table.
import './engine.js';
import './tables/base.js';
import './tables/deep-current.js';
import './tables/neon-drive.js';
import './tables/starfall.js';
import { createRenderer } from './render3d.js';
import { thumbnail } from './art.js';

const E = self.PinballEngine;
const ORDER = ['starfall', 'neon-drive', 'deep-current'];
const TABLES = ORDER.map((id) => E.TABLES[id]);

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
    'Three tables: Starfall, Neon Drive and Deep Current. Pick one from the table list (‹ in the top bar).',
    'Launch: hold the right half (or Space / ↓) to pull the plunger, let go to launch. Longer pull = stronger.',
    'Touch: left half = left flippers, right half = right flippers. Swipe up = nudge (too many = TILT).',
    'Keyboard: Z or ← left, / or → right, ↑ or N nudge, P or Esc pause.',
    'Top lanes raise the bonus multiplier; flippers move the lit lanes.',
    'Starfall: drop S-T-A-R-S, then shoot the black hole for 3-ball multiball. Spinner lights both kickbacks.',
    'Neon Drive: hit N-E-O, then the garage for Overdrive multiball. The upper flipper feeds the bumpers.',
    'Deep Current: clear the coral bank twice for an extra ball; ride the left current.',
  ],
  create,
};

function create(ctx) {
  const { root, input } = ctx;
  root.insertAdjacentHTML('afterbegin', `
    <main class="screen pb">
      <header class="topbar">
        <button class="icon-btn" data-act="back" aria-label="Back">${BACK}</button>
        <div class="pb-title"><b class="pb-name">Pinball</b><div class="muted small pb-sub"></div></div>
        <button class="icon-btn pb-pausebtn" data-act="pause" aria-label="Pause">${PAUSE}</button>
      </header>
      <section class="pb-pick" hidden><div class="pb-cards"></div></section>
      <canvas class="pb-dmd" aria-hidden="true" hidden></canvas>
      <div class="pb-stage">
        <canvas class="pb-canvas" aria-label="Pinball table"></canvas>
        <div class="pb-over" hidden>
          <div class="pb-over-card">
            <b>Game over</b>
            <div class="pb-final"></div>
            <div class="muted small pb-final-best"></div>
            <button class="pb-new" data-act="new">Play again</button>
            <button class="pb-other" data-act="tables">Other tables</button>
          </div>
        </div>
      </div>
    </main>`);
  const $ = (q) => root.querySelector(q);
  const stage = $('.pb-stage'), canvas = $('.pb-canvas'), dmd = $('.pb-dmd');
  const bests = ctx.storage.get('bests', {});
  {
    const old = ctx.storage.get('best', 0); // the single-table version stored one high score
    if (old && !bests['deep-current']) { bests['deep-current'] = old; ctx.storage.set('bests', bests); }
  }
  let mode = 'pick', T = null, s = null, view = null, events = [];
  let raf = 0, running = false, last = 0, acc = 0, statusAt = 0, lastStatus = '', pickIdx = 0;

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'back') { if (mode === 'play') showPicker(); else ctx.back(); }
    if (a === 'pause') ctx.pause();
    if (a === 'new') newGame();
    if (a === 'tables') showPicker();
    if (a === 'table') play(b.dataset.id, null);
  });
  ctx.onBack(() => { if (mode === 'play') { showPicker(); return true; } return false; });

  // ------------------------------------------------------------ picker
  function showPicker() {
    if (mode === 'play' && s && !s.over) ctx.storage.set('save:' + T.id, s);
    mode = 'pick';
    root.classList.add('pb-picking');
    teardownView();
    $('.pb-pick').hidden = false; stage.hidden = true; dmd.hidden = true; $('.pb-pausebtn').hidden = true;
    $('.pb-name').textContent = 'Pinball'; $('.pb-sub').textContent = 'Choose a table';
    const cards = $('.pb-cards');
    cards.textContent = '';
    TABLES.forEach((t, i) => {
      const btn = document.createElement('button');
      btn.className = 'pb-card'; btn.dataset.act = 'table'; btn.dataset.id = t.id;
      if (i === pickIdx) btn.classList.add('sel');
      const th = thumbnail(t, 220); th.className = 'pb-thumb';
      const resume = ctx.storage.get('save:' + t.id, null);
      btn.append(th);
      btn.insertAdjacentHTML('beforeend', `<div class="pb-card-body"><b>${t.name}</b><span class="muted small">${t.blurb}</span>
        <span class="small pb-card-best">High ${fmt(bests[t.id] || 0)}${resume ? ' · <em>Continue</em>' : ''}</span></div>`);
      btn.style.setProperty('--tc', t.theme.wall);
      cards.append(btn);
    });
    ctx.setStatus(null);
    start();
  }

  // ------------------------------------------------------------ play
  function play(id, saved) {
    T = E.TABLES[id] || TABLES[0];
    pickIdx = Math.max(0, ORDER.indexOf(T.id));
    ctx.storage.set('table', T.id);
    const stored = saved || ctx.storage.get('save:' + T.id, null);
    s = valid(stored, T) ? stored : T.newGame(seed());
    ctx.storage.remove('save:' + T.id);
    mode = 'play';
    root.classList.remove('pb-picking');
    $('.pb-pick').hidden = true; stage.hidden = false; dmd.hidden = false; $('.pb-pausebtn').hidden = false;
    $('.pb-name').textContent = T.name; $('.pb-over').hidden = true;
    ctx.requestPersistence();
    teardownView();
    try {
      view = createRenderer(canvas, T, { reducedMotion: ctx.settings.reducedMotion, low: (self.devicePixelRatio || 1) > 2.5 && Math.min(screen.width, screen.height) < 500 });
    } catch (err) {
      ctx.ui.toast('3D is not available on this device');
      showPicker(); return;
    }
    layout();
    if (s.over) gameOver();
    updateHud(true);
    start();
  }
  function teardownView() { if (view) { view.dispose(); view = null; } }
  function seed() { return (Math.random() * 4294967296) >>> 0; }
  function newGame() {
    s = T.newGame(seed()); events = [];
    $('.pb-over').hidden = true;
    updateHud(true);
    if (!running) start();
  }

  // ------------------------------------------------------------ layout
  function layout() {
    if (!view) return;
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    view.resize(Math.round(r.width), Math.round(r.height));
    const dr = dmd.getBoundingClientRect();
    const k = Math.min(3, self.devicePixelRatio || 1);
    dmd.width = Math.round(dr.width * k); dmd.height = Math.round(dr.height * k); dmdKey = '';
  }
  const ro = new ResizeObserver(layout);
  ro.observe(stage); ro.observe(dmd);

  // ------------------------------------------------------------ loop
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    if (mode === 'pick') { pickInput(); return; }
    acc += dt;
    while (acc >= T.DT && running && mode === 'play') { acc -= T.DT; tick(); }
    if (mode !== 'play' || !view) return;
    view.render(s, events, dt); events = [];
    drawDmd(now / 1000);
  }
  function start() { if (running) return; running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function pickInput() {
    input.update();
    const cards = root.querySelectorAll('.pb-card');
    const move = (d) => { pickIdx = (pickIdx + d + TABLES.length) % TABLES.length; cards.forEach((c, i) => c.classList.toggle('sel', i === pickIdx)); cards[pickIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    if (input.pressed('flipperLeft') || input.pressed('nudge')) move(-1);
    if (input.pressed('flipperRight')) move(1);
    if (input.pressed('plunger')) play(TABLES[pickIdx].id, null);
  }

  function tick() {
    input.update();
    if (input.pressed('pause')) { ctx.pause(); return; }
    if (s.over) { if (input.pressed('plunger')) newGame(); return; }
    const inp = {
      L: input.held('flipperLeft') || input.pressed('flipperLeft'),
      R: input.held('flipperRight') || input.pressed('flipperRight'),
      plunger: input.held('plunger') || input.pressed('plunger'),
      nudge: input.pressed('nudge'),
    };
    const ev = T.step(s, inp);
    for (const e of ev) { sound(e); events.push(e); }
    if (events.length > 400) events.splice(0, events.length - 400);
    updateHud(false);
  }

  // ------------------------------------------------------------ sound & haptics
  const tone = (f, ms, type, vol) => ctx.audio.tone(f, ms, type, vol);
  const seq = (fs, gap, ms, type = 'triangle', vol = 0.06) => fs.forEach((f, i) => setTimeout(() => tone(f, ms, type, vol), i * gap));
  function sound(e) {
    switch (e[0]) {
      case 'bumper': tone(520 + e[1] * 90, 50, 'triangle', 0.07); ctx.haptics(15); break;
      case 'sling': tone(300, 40, 'square', 0.04); ctx.haptics(10); break;
      case 'flip': tone(120, 25, 'square', 0.025); break;
      case 'drop': tone(760, 60, 'triangle', 0.06); break;
      case 'standup': tone(840, 50, 'triangle', 0.05); break;
      case 'roll': tone(990, 50, 'sine', 0.06); break;
      case 'spin': tone(1400, 12, 'square', 0.02); break;
      case 'mult': seq([660, 880, 1100], 80, 70); break;
      case 'saucer': seq([220, 330, 440], 70, 90, 'sawtooth', 0.04); ctx.haptics(30); break;
      case 'kickback': tone(140, 160, 'sawtooth', 0.06); ctx.haptics(40); break;
      case 'show': if (e[1] === 'jackpot') seq([523, 659, 784, 1047, 1319], 70, 110); else if (e[1] === 'multiball') seq([392, 523, 659, 784, 1047], 90, 120); break;
      case 'extra': seq([880, 1175, 1568], 90, 90, 'triangle', 0.07); ctx.haptics(40); break;
      case 'launch': tone(180 + e[1] * 200, 90, 'sawtooth', 0.04); break;
      case 'drain': tone(110, 320, 'sawtooth', 0.05); ctx.haptics(60); break;
      case 'saved': tone(660, 160, 'sine', 0.06); break;
      case 'tilt': tone(90, 500, 'square', 0.06); ctx.haptics(120); break;
      case 'nudge': ctx.haptics(20); break;
      case 'clack': tone(1800, 15, 'square', 0.02); break;
      case 'over': gameOver(); break;
      default:
    }
  }

  function gameOver() {
    const best = bests[T.id] || 0;
    if (s.score > best) { bests[T.id] = s.score; ctx.storage.set('bests', bests); }
    $('.pb-final').textContent = fmt(s.score);
    $('.pb-final-best').textContent = s.score >= (bests[T.id] || 0) && s.score > 0 ? 'New high score!' : 'High score ' + fmt(bests[T.id] || 0);
    $('.pb-over').hidden = false;
    ctx.setStatus(null);
    updateHud(true);
  }

  function updateHud(force) {
    if (!s) return;
    $('.pb-sub').textContent = s.over ? 'Game over' : 'Ball ' + s.ballNum + '/' + T.BALLS + (s.extra ? ' +' + s.extra : '') + ' · High ' + fmt(Math.max(bests[T.id] || 0, s.score));
    const now = performance.now();
    if (!s.over && (force || now - statusAt > 1000)) {
      const st = T.name + ' · Ball ' + s.ballNum + ' · ' + fmt(s.score);
      if (st !== lastStatus) { ctx.setStatus(st, (s.ballNum - 1) / T.BALLS); lastStatus = st; }
      statusAt = now;
    }
  }

  // ------------------------------------------------------------ dot-matrix display
  const DW = 192, DH = 32;
  const dots = document.createElement('canvas'); dots.width = DW; dots.height = DH;
  const dg = dots.getContext('2d', { willReadFrequently: true });
  let dmdKey = '', lit = null;
  function drawDmd(t) {
    const g = dmd.getContext('2d'); if (!g || !dmd.width) return;
    const ball = !s.balls.some((b) => b.inPlay) && T.resting(s) && !s.over;
    let top = s.msgT > 0 ? s.msg : s.tilted ? 'TILT' : ball ? (s.ballNum === 1 && s.score === 0 ? 'Awaiting launch' : 'Ball ' + s.ballNum + ' ready') : s.mb ? 'MULTIBALL' : 'Ball ' + s.ballNum + '   ×' + s.mult;
    if (s.over) top = 'Game over';
    const scroll = top.length > 22;
    const key = top + '|' + s.score + (scroll ? '|' + Math.floor(t * 30) : '');
    if (key !== dmdKey) {
      dmdKey = key;
      dg.clearRect(0, 0, DW, DH); dg.fillStyle = '#fff'; dg.textBaseline = 'middle'; dg.textAlign = 'center';
      dg.font = '700 12px system-ui, sans-serif';
      if (scroll) { dg.textAlign = 'left'; const w = dg.measureText(top).width + 40; dg.fillText(top, DW - ((t * 50) % (w + DW)), 8); }
      else dg.fillText(top.toUpperCase(), DW / 2, 8);
      dg.font = '800 15px system-ui, sans-serif'; dg.fillText(fmt(s.score), DW / 2, 24);
      const px = dg.getImageData(0, 0, DW, DH).data;
      lit = new Uint8Array(DW * DH);
      for (let i = 0; i < DW * DH; i++) lit[i] = px[i * 4 + 3] > 110 ? 1 : 0;
      const W = dmd.width, H = dmd.height, cell = Math.min(W / DW, H / DH), ox = (W - cell * DW) / 2, oy = (H - cell * DH) / 2;
      g.fillStyle = '#05030a'; g.fillRect(0, 0, W, H);
      const on = T.theme.dmd || '#ff9f1c';
      for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
        g.fillStyle = lit[y * DW + x] ? on : 'rgba(255,159,28,.07)';
        g.beginPath(); g.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, cell * 0.38, 0, 6.3); g.fill();
      }
    }
  }

  // ------------------------------------------------------------ lifecycle
  function valid(v, t) { return v && v.v === 2 && v.table === t.id && Array.isArray(v.balls) && v.balls.length && Number.isFinite(v.balls[0].x) && Array.isArray(v.fl) && v.fl.length === t.flippers.length; }
  return {
    start(saved) {
      if (saved && saved.table && E.TABLES[saved.table] && valid(saved.s, E.TABLES[saved.table])) play(saved.table, saved.s);
      else { pickIdx = Math.max(0, ORDER.indexOf(ctx.storage.get('table', ORDER[0]))); showPicker(); }
    },
    pause() { stop(); },
    resume() { start(); },
    save() { return mode === 'play' && s && !s.over ? { table: T.id, s } : null; },
    destroy() { stop(); ro.disconnect(); teardownView(); },
  };
}
