// Control layer: the ONLY place that listens to keyboard, mouse, touch, pen (and later gamepad).
// Games declare what they accept (export default { input: {...} }) and get a handle as ctx.input.
// Design: docs/DESIGN.md §6. Reference for game authors: docs/CONTROLS.md.
//
// Two models:
//   pointer  board/card games. Targets are elements matching decl.targets inside the game root.
//            Events: select, activate, doubleactivate, secondary, dragstart, dragmove, drop, command.
//            Keyboard: arrows/WASD move a cursor between targets (geometric, or decl.navigate), Enter/Space activate,
//            F / Shift+Enter secondary, decl.keys map keys to commands.
//   action   arcade games. Named actions (button | dir4 | axis2) read once per simulation tick:
//            update(), pressed(id), held(id), released(id), dir(id), pressedDir(id), axis(id).
//            Touch schemes: gestures, console (on-screen D-pad + buttons), halves (left/right zones).

const DIRS = ['up', 'down', 'left', 'right'];
const DEFAULT_DIR_KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};
const KEY_LABEL = { ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' };
const LONG_PRESS_MS = 480, DRAG_PX = 8, DOUBLE_MS = 320;

let lastDevice = 'touch'; // 'touch' | 'mouse' | 'key' | 'pad'; shared across games

/**
 * @param {object} o
 * @param {HTMLElement} o.root     element the game renders into (must be position: relative)
 * @param {object} o.decl          the game's input declaration
 * @param {string} [o.scheme]      saved touch scheme for action games
 * @param {(s:string)=>void} [o.onScheme]  called when the player picks another scheme
 * @param {(what:'back'|'help')=>void} o.onSystem  shell hook for Esc / ? when the game does not use them
 * @param {()=>boolean} [o.isBlocked]  true while a shell dialog is open
 */
export function createInput(o) {
  const { root, decl } = o;
  const doc = root.ownerDocument;
  const listeners = {};
  let ui = null; // on-screen controls element (action model)
  let schemeCleanup = [];
  const cleanups = [];
  const listen = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };
  const emit = (type, ...args) => { for (const fn of listeners[type] || []) fn(...args); };
  const setDevice = (d) => {
    if (lastDevice === d) return;
    lastDevice = d;
    root.dataset.device = d;
    if (d !== 'key' && cursor) cursor.classList.remove('kb-focus');
    if (d === 'key' && cursor && decl.focusRing !== false && root.contains(cursor)) cursor.classList.add('kb-focus');
  };
  root.dataset.device = lastDevice;
  const blocked = () => (o.isBlocked ? o.isBlocked() : false);

  const api = {
    model: decl.model,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return api; },
    get device() { return lastDevice; },
    destroy() { while (cleanups.length) cleanups.pop()(); for (const c of schemeCleanup) c(); if (ui) ui.remove(); },
  };

  // ---------------------------------------------------------------- keyboard (both models)
  const gameKeys = decl.keys || {};
  const keyName = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const boundTo = (k) => gameKeys[k] ?? gameKeys[k.toUpperCase?.()];

  // ================================================================ pointer model
  let cursor = null;
  if (decl.model === 'pointer') {
    const sel = decl.targets;
    const targetOf = (el) => (el && el.closest ? el.closest(sel) : null);
    const inRoot = (el) => el && root.contains(el);
    const visibleTargets = () => [...root.querySelectorAll(sel)].filter((t) => t.offsetParent !== null || t.getClientRects().length);
    root.style.touchAction = decl.drag ? 'none' : 'manipulation';

    const setCursor = (el, why) => {
      if (cursor === el) { if (why) emit('select', el, { by: why }); return; }
      if (cursor) cursor.classList.remove('kb-focus');
      cursor = el;
      if (el && lastDevice === 'key' && decl.focusRing !== false) el.classList.add('kb-focus');
      if (el && why) emit('select', el, { by: why });
    };
    api.focus = (el) => setCursor(el, null);           // move the cursor without emitting select
    Object.defineProperty(api, 'cursor', { get: () => (inRoot(cursor) ? cursor : null) });

    // --- pointer
    let p = null;    // active press: { id, el, x, y, t, dragging, consumed, timer }
    let lastTap = { el: null, t: 0 };
    listen(root, 'pointerdown', (e) => {
      if (blocked()) return;
      setDevice(e.pointerType === 'mouse' ? 'mouse' : 'touch');
      const el = targetOf(e.target);
      if (!inRoot(el) || p) return;
      if (e.button === 2) return; // right click → contextmenu below
      if (decl.preventDefault !== false) e.preventDefault();
      p = { id: e.pointerId, el, x: e.clientX, y: e.clientY, t: performance.now(), dragging: false, consumed: false, timer: 0 };
      try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      setCursor(el, 'pointer');
      if (decl.secondary && e.pointerType !== 'mouse') {
        p.timer = setTimeout(() => { if (p && !p.dragging) { p.consumed = true; emit('secondary', p.el, { by: 'longpress' }); } }, LONG_PRESS_MS);
      }
    });
    listen(root, 'pointermove', (e) => {
      if (!p || e.pointerId !== p.id) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!p.dragging && decl.drag && !p.consumed && Math.hypot(dx, dy) > DRAG_PX) {
        p.dragging = true; clearTimeout(p.timer);
        emit('dragstart', p.el, { x: p.x, y: p.y });
      }
      if (p.dragging) emit('dragmove', { x: e.clientX, y: e.clientY, dx, dy, over: hit(e), from: p.el });
      else if (Math.hypot(dx, dy) > DRAG_PX * 2) clearTimeout(p.timer); // finger slid away: no long-press
    });
    const hit = (e, skip = p && p.dragging ? p.el : null) => { // skip = the element being dragged
      const els = doc.elementsFromPoint(e.clientX, e.clientY);
      for (const el of els) { const t = targetOf(el); if (inRoot(t) && t !== skip) return t; }
      return null;
    };
    const end = (e, cancelled) => {
      if (!p || e.pointerId !== p.id) return;
      clearTimeout(p.timer);
      const press = p; p = null;
      if (press.dragging) { emit('drop', cancelled ? null : hit(e, press.el), press.el, { x: e.clientX, y: e.clientY }); return; }
      if (cancelled || press.consumed) return;
      const now = performance.now();
      emit('activate', press.el, { by: 'pointer' });
      if (lastTap.el === press.el && now - lastTap.t < DOUBLE_MS) { emit('doubleactivate', press.el, { by: 'pointer' }); lastTap = { el: null, t: 0 }; }
      else lastTap = { el: press.el, t: now };
    };
    listen(root, 'pointerup', (e) => end(e, false));
    listen(root, 'pointercancel', (e) => end(e, true));
    listen(root, 'contextmenu', (e) => {
      const el = targetOf(e.target);
      if (!decl.secondary) return;
      e.preventDefault();
      if (!inRoot(el) || blocked()) return;
      if (p && p.consumed) return; // long-press already fired
      setCursor(el, 'pointer');
      emit('secondary', el, { by: 'mouse' });
    });

    // --- keyboard cursor
    const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const geometric = (from, dir) => {
      const c = center(from), ts = visibleTargets().filter((t) => t !== from);
      const ax = dir === 'left' || dir === 'right' ? 'x' : 'y', sign = dir === 'right' || dir === 'down' ? 1 : -1;
      const other = ax === 'x' ? 'y' : 'x';
      let best = null, bestScore = Infinity;
      for (const t of ts) {
        const tc = center(t), along = (tc[ax] - c[ax]) * sign, perp = Math.abs(tc[other] - c[other]);
        if (along <= 2) continue;
        const score = along + perp * 2.5;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      if (best || !decl.wrap) return best;
      for (const t of ts) { // wrap around: same line, far side
        const tc = center(t), along = (tc[ax] - c[ax]) * sign, perp = Math.abs(tc[other] - c[other]);
        const score = perp * 4 + along;
        if (along < -2 && score < bestScore) { bestScore = score; best = t; }
      }
      return best;
    };
    const moveCursor = (dir) => {
      let from = inRoot(cursor) ? cursor : null;
      if (!from) { const first = (decl.initialFocus && decl.initialFocus()) || visibleTargets()[0]; if (first) setCursor(first, 'key'); return; }
      const next = (decl.navigate && decl.navigate(from, dir)) || (decl.navigate && decl.navigateOnly ? null : geometric(from, dir));
      if (next) setCursor(next, 'key');
    };

    listen(doc, 'keydown', (e) => {
      if (blocked() || e.defaultPrevented) return;
      const k = keyName(e);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z') { e.preventDefault(); setDevice('key'); emit('command', e.shiftKey ? 'redo' : 'undo'); return; }
      if (mod || e.altKey) return;
      const bound = boundTo(k);
      if (bound) { e.preventDefault(); setDevice('key'); emit('command', bound, { key: k }); return; }
      const dir = DEFAULT_DIR_KEYS[k];
      if (dir) { e.preventDefault(); setDevice('key'); moveCursor(dir); return; }
      if (k === 'Enter' || k === ' ') {
        e.preventDefault(); setDevice('key');
        const el = inRoot(cursor) ? cursor : null;
        if (!el) { moveCursor('down'); return; }
        if (k === 'Enter' && e.shiftKey && decl.secondary) emit('secondary', el, { by: 'key' });
        else emit('activate', el, { by: 'key' });
        return;
      }
      if (k === 'f' && decl.secondary) { const el = inRoot(cursor) ? cursor : null; if (el) { setDevice('key'); emit('secondary', el, { by: 'key' }); } return; }
      if (k === 'h') { setDevice('key'); emit('command', 'hint'); return; }
      if (k === 'n') { setDevice('key'); emit('command', 'new'); return; }
      if (k === 'Escape') { setDevice('key'); emit('command', 'back'); o.onSystem('back'); return; }
      if (k === '?') { setDevice('key'); o.onSystem('help'); }
    });
    return api;
  }

  // ================================================================ action model
  const actions = new Map(); // id → state
  for (const a of decl.actions || []) {
    actions.set(a.id, {
      ...a, src: new Set(), pq: 0, rq: 0, pressed: false, released: false, next: 0,
      dirs: a.kind === 'dir4' ? [] : null, latched: null, pdir: null, pdirQ: null, ax: { x: 0, y: 0 }, stick: null,
    });
  }
  const A = (id) => { const a = actions.get(id); if (!a) throw new Error('Unknown action "' + id + '"'); return a; };
  // id may be "move" (dir4 with a direction) or "move.left" (one direction of a dir4) or a button id
  const split = (target) => { const [id, d] = target.split('.'); return { a: A(id), d }; };
  const press = (target, src) => {
    const { a, d } = split(target);
    if (a.kind === 'dir4' || a.kind === 'axis2') {
      if (!d) return;
      const key = d + '|' + src;
      if (a.src.has(key)) return;
      if (!a.src.size) a.pq++;
      a.src.add(key);
      a.dirs = a.dirs || [];
      a.dirs = a.dirs.filter((x) => x !== d); a.dirs.push(d);
      a.latched = d; a.pdirQ = d;
      return;
    }
    if (a.src.has(src)) return;
    if (!a.src.size) a.pq++;
    a.src.add(src);
  };
  const release = (target, src) => {
    const { a, d } = split(target);
    if (a.kind === 'dir4' || a.kind === 'axis2') {
      if (!d || !a.src.delete(d + '|' + src)) return;
      if (![...a.src].some((k) => k.startsWith(d + '|'))) a.dirs = a.dirs.filter((x) => x !== d);
      if (!a.src.size) a.rq++;
      return;
    }
    if (a.src.delete(src) && !a.src.size) a.rq++;
  };
  const tap = (target) => { press(target, 'tap'); release(target, 'tap'); }; // pressed for one tick, never held

  api.update = () => {
    const now = performance.now();
    for (const a of actions.values()) {
      // Several taps between two ticks (fast gesture steps) are delivered one per tick, not merged into one.
      a.pressed = a.pq > 0; a.released = a.rq > 0; a.pq = Math.min(3, Math.max(0, a.pq - 1)); a.rq = Math.min(3, Math.max(0, a.rq - 1));
      a.pdir = a.pdirQ; a.pdirQ = null;
      if (a.repeat) {
        if (a.pressed) a.next = now + a.repeat.delay;
        else if (a.src.size && now >= a.next) { a.pressed = true; a.next = now + a.repeat.rate; }
      }
    }
  };
  api.pressed = (id) => A(id).pressed;
  api.released = (id) => A(id).released;
  api.held = (id) => A(id).src.size > 0;
  api.dir = (id) => { const a = A(id); return a.dirs && a.dirs.length ? a.dirs[a.dirs.length - 1] : (a.latch ? a.latched : null); };
  api.pressedDir = (id) => A(id).pdir;            // direction pressed this tick (for buffered turns)
  api.clearDir = (id) => { A(id).latched = null; };
  api.axis = (id) => {
    const a = A(id);
    if (a.stick) return { x: a.stick.x, y: a.stick.y };
    const h = (d) => (a.dirs && a.dirs.includes(d) ? 1 : 0);
    return { x: h('right') - h('left'), y: h('down') - h('up') };
  };

  // --- keyboard → actions
  const keyMap = { ...gameKeys }; // key → "action" or "action.dir"
  for (const a of actions.values()) {
    if (a.kind === 'dir4' || a.kind === 'axis2') {
      const taken = new Set(Object.keys(keyMap));
      if (!Object.values(keyMap).some((v) => v.startsWith(a.id + '.'))) {
        for (const [k, d] of Object.entries(DEFAULT_DIR_KEYS)) if (!taken.has(k)) keyMap[k] = a.id + '.' + d;
      }
    }
  }
  if (actions.has('pause')) { keyMap.Escape = keyMap.Escape || 'pause'; keyMap.p = keyMap.p || 'pause'; }
  listen(doc, 'keydown', (e) => {
    if (blocked() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return; // defaultPrevented: the shell used it (e.g. Space/P to resume)
    const k = keyName(e), t = keyMap[k];
    if (t) { e.preventDefault(); setDevice('key'); if (!e.repeat) press(t, 'k:' + k); return; }
    if (k === 'Escape') { setDevice('key'); o.onSystem('back'); return; }
    if (k === '?') o.onSystem('help');
  });
  listen(doc, 'keyup', (e) => { const k = keyName(e), t = keyMap[k]; if (t) release(t, 'k:' + k); });
  // a key held while the window loses focus would stay "down" forever
  listen(doc.defaultView, 'blur', () => { for (const a of actions.values()) { for (const s of [...a.src]) if (s.includes('k:')) { const [d, src] = s.includes('|') ? s.split('|') : [null, s]; release(d ? a.id + '.' + d : a.id, src); } } });

  // --- touch schemes
  const schemes = decl.touch || {};
  const schemeNames = Object.keys(schemes);
  let scheme = schemeNames.includes(o.scheme) ? o.scheme : schemeNames[0] || null;
  root.style.touchAction = 'none';
  const zoneListen = (el, type, fn) => { el.addEventListener(type, fn); schemeCleanup.push(() => el.removeEventListener(type, fn)); };
  const stage = () => (decl.stage && root.querySelector(decl.stage)) || root;

  function buildScheme() {
    for (const c of schemeCleanup) c(); schemeCleanup = [];
    if (ui) { ui.remove(); ui = null; }
    root.dataset.scheme = scheme || '';
    if (scheme === 'gestures') gestures(schemes.gestures);
    if (scheme === 'console') consolePad(schemes.console);
    if (scheme === 'halves') halves(schemes.halves);
  }

  // Gestures: whole stage. tap / swipeX (on release, or while moving for dir4 'swipe') / stepX (continuous drag steps).
  function gestures(g) {
    const el = stage();
    let s = null;
    zoneListen(el, 'pointerdown', (e) => {
      if (blocked() || e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('button, a, input, .no-gesture')) return;
      setDevice(e.pointerType === 'mouse' ? 'mouse' : 'touch');
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, t: performance.now(), moved: false, trail: [[performance.now(), e.clientX, e.clientY]] };
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    zoneListen(el, 'pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const now = performance.now();
      s.trail.push([now, e.clientX, e.clientY]); while (s.trail.length > 6) s.trail.shift();
      const dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) s.moved = true;
      if (g.swipe) { // dir4: fire as soon as the finger has moved enough, then keep tracking for the next turn
        const th = g.swipeDistance || 18;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= th) {
          const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          tap(g.swipe + '.' + d); s.ox = e.clientX; s.oy = e.clientY; s.fired = true;
        }
        return;
      }
      const step = g.step || 32;
      if (g.stepLeft || g.stepRight) {
        let ddx = dx; // a fast drag can cover several steps in one event
        while (ddx >= step && g.stepRight) { tap(g.stepRight); s.ox += step; ddx -= step; s.stepped = 'x'; }
        while (ddx <= -step && g.stepLeft) { tap(g.stepLeft); s.ox -= step; ddx += step; s.stepped = 'x'; }
        if (s.stepped === 'x') return;
      }
      if (g.stepDown && dy >= step && s.stepped !== 'x') { tap(g.stepDown); s.oy += step; s.stepped = 'y'; }
    });
    const up = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const gs = s; s = null;
      if (gs.fired) return;
      const dx = e.clientX - gs.x, dy = e.clientY - gs.y, dt = performance.now() - gs.t;
      if (!gs.moved && dt < 350) { if (g.tap) tap(g.tap); return; }
      const t0 = gs.trail[0], vy = (e.clientY - t0[2]) / Math.max(1, performance.now() - t0[0]);
      const vx = (e.clientX - t0[1]) / Math.max(1, performance.now() - t0[0]);
      const horiz = Math.abs(dx) > Math.abs(dy);
      if (horiz) {
        if (gs.stepped === 'x') return;
        if (Math.abs(dx) > 30 || Math.abs(vx) > 0.5) { const n = dx > 0 ? g.swipeRight : g.swipeLeft; if (n) tap(n); }
      } else {
        const fast = Math.abs(vy) > 0.7;
        if (gs.stepped === 'y' && !fast) return;
        if (Math.abs(dy) > 30 || fast) { const n = dy > 0 ? g.swipeDown : g.swipeUp; if (n) tap(n); }
      }
    };
    zoneListen(el, 'pointerup', up);
    zoneListen(el, 'pointercancel', (e) => { if (s && e.pointerId === s.id) s = null; });
  }

  // Virtual console: D-pad (one element, slide between directions) + up to 3 buttons, in a bar under the stage.
  function consolePad(c) {
    ui = doc.createElement('div');
    ui.className = 'ctl ctl-console';
    const pad = doc.createElement('div');
    pad.className = 'ctl-dpad';
    pad.innerHTML = DIRS.map((d) => '<i class="ctl-d ctl-' + d + '"></i>').join('');
    ui.appendChild(pad);
    const dmap = typeof c.dpad === 'string' ? Object.fromEntries(DIRS.map((d) => [d, c.dpad + '.' + d])) : c.dpad || {};
    let cur = null, pid = null;
    const setDir = (d) => {
      if (d === cur) return;
      if (cur && dmap[cur]) release(dmap[cur], 'dpad');
      cur = d;
      if (d && dmap[d]) { press(dmap[d], 'dpad'); vibrate(); }
      pad.dataset.dir = d || '';
    };
    const dirAt = (e) => {
      const r = pad.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(x, y) < r.width * 0.12) return cur; // dead centre keeps the current direction
      return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    };
    zoneListen(pad, 'pointerdown', (e) => { e.preventDefault(); setDevice('touch'); pid = e.pointerId; try { pad.setPointerCapture(pid); } catch { /* ignore */ } setDir(dirAt(e)); });
    zoneListen(pad, 'pointermove', (e) => { if (e.pointerId === pid) setDir(dirAt(e)); });
    const padUp = (e) => { if (e.pointerId === pid) { pid = null; setDir(null); } };
    zoneListen(pad, 'pointerup', padUp); zoneListen(pad, 'pointercancel', padUp);

    const btns = doc.createElement('div');
    btns.className = 'ctl-btns';
    for (const name of ['c', 'b', 'a']) {
      if (!c[name]) continue;
      const b = doc.createElement('button');
      b.type = 'button'; b.className = 'ctl-btn ctl-' + name;
      b.textContent = (c.labels && c.labels[name]) || name.toUpperCase();
      b.setAttribute('aria-label', c[name]);
      const src = 'btn:' + name;
      zoneListen(b, 'pointerdown', (e) => { e.preventDefault(); setDevice('touch'); try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ } b.classList.add('down'); press(c[name], src); vibrate(); });
      const off = () => { b.classList.remove('down'); release(c[name], src); };
      zoneListen(b, 'pointerup', off); zoneListen(b, 'pointercancel', off);
      zoneListen(b, 'contextmenu', (e) => e.preventDefault());
      btns.appendChild(b);
    }
    ui.appendChild(btns);
    root.appendChild(ui);
  }

  // Split halves: two zones over the stage. Each zone: { button } | { stick } (+ optional swipeUp / swipeDown).
  function halves(h) {
    ui = doc.createElement('div');
    ui.className = 'ctl ctl-halves';
    const host = stage();
    if (host !== root) { const r = host.getBoundingClientRect(), rr = root.getBoundingClientRect(); ui.style.top = (r.top - rr.top) + 'px'; ui.style.height = r.height + 'px'; }
    for (const side of ['left', 'right']) {
      const z = h[side];
      const el = doc.createElement('div');
      el.className = 'ctl-zone ctl-zone-' + side;
      ui.appendChild(el);
      if (!z) continue;
      const knob = doc.createElement('i'); knob.className = 'ctl-knob'; el.appendChild(knob);
      let s = null;
      const src = 'half:' + side;
      zoneListen(el, 'pointerdown', (e) => {
        if (blocked() || s) return;
        e.preventDefault(); setDevice('touch');
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        s = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dir: null };
        el.classList.add('down');
        if (z.button) { press(z.button, src); vibrate(); }
        if (z.stick) { const r = el.getBoundingClientRect(); knob.style.left = (e.clientX - r.left) + 'px'; knob.style.top = (e.clientY - r.top) + 'px'; knob.style.transform = ''; }
      });
      zoneListen(el, 'pointermove', (e) => {
        if (!s || e.pointerId !== s.id || !z.stick) return;
        const R = 48, dx = e.clientX - s.x, dy = e.clientY - s.y, len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
        knob.style.transform = 'translate(' + dx * k + 'px,' + dy * k + 'px)';
        const a = A(z.stick.split('.')[0]);
        const nx = (dx * k) / R, ny = (dy * k) / R;
        if (a.kind === 'axis2') a.stick = len < R * 0.15 ? { x: 0, y: 0 } : { x: nx, y: ny };
        const d = len < R * 0.35 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (d !== s.dir) { if (s.dir) release(z.stick + '.' + s.dir, src); if (d) press(z.stick + '.' + d, src); s.dir = d; }
      });
      const up = (e) => {
        if (!s || e.pointerId !== s.id) return;
        const dy = e.clientY - s.y, dt = performance.now() - s.t;
        if (z.button) release(z.button, src);
        if (z.stick) { if (s.dir) release(z.stick + '.' + s.dir, src); const a = A(z.stick.split('.')[0]); a.stick = null; knob.style.transform = ''; }
        if (Math.abs(dy) > 40 && dt < 500) { const n = dy > 0 ? z.swipeDown : z.swipeUp; if (n) tap(n); }
        el.classList.remove('down'); s = null;
      };
      zoneListen(el, 'pointerup', up); zoneListen(el, 'pointercancel', up);
    }
    root.appendChild(ui);
  }

  const vibrate = () => { if (o.haptics && o.haptics()) try { navigator.vibrate && navigator.vibrate(8); } catch { /* ignore */ } };

  Object.defineProperty(api, 'scheme', { get: () => scheme });
  api.schemes = schemeNames;
  api.setScheme = (name) => { if (!schemeNames.includes(name)) return; scheme = name; buildScheme(); if (o.onScheme) o.onScheme(name); };
  api.releaseAll = () => { for (const a of actions.values()) { a.src.clear(); a.dirs = a.dirs && []; a.stick = null; a.pq = a.rq = 0; } };

  // Text for prompts ("Press Space", "Tap"), based on the last-used device.
  api.label = (id) => {
    if (lastDevice === 'key') {
      const k = Object.keys(keyMap).find((key) => keyMap[key] === id || keyMap[key].startsWith(id + '.'));
      return k ? KEY_LABEL[k] || (k.length === 1 ? k.toUpperCase() : k) : '';
    }
    if (scheme === 'console') { const c = schemes.console; const b = ['a', 'b', 'c'].find((n) => c[n] === id); if (b) return (c.labels && c.labels[b]) || b.toUpperCase(); }
    if (scheme === 'gestures') { const g = schemes.gestures; const n = Object.keys(g).find((n) => g[n] === id); if (n) return { tap: 'Tap', swipeUp: 'Swipe up', swipeDown: 'Swipe down', swipeLeft: 'Swipe left', swipeRight: 'Swipe right' }[n] || ''; }
    return 'Tap';
  };

  buildScheme();
  // Show on-screen controls only for touch players.
  listen(root, 'pointerdown', (e) => setDevice(e.pointerType === 'mouse' ? 'mouse' : 'touch'), true);
  return api;
}
