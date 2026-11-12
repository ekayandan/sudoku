// Playfield artwork, painted in code onto a 2D canvas (used as the 3D floor texture and for table thumbnails).
// Everything is original: per-table backgrounds, insert lenses with labels, lane arrows, the centre ring.
const TAU = Math.PI * 2;

function tablePath(c, T) {
  c.beginPath(); c.moveTo(10, T.H + 40); c.lineTo(10, 200); c.arc(200, 200, 190, Math.PI, TAU); c.lineTo(390, T.H + 40); c.closePath();
}
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function poly(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
function glow(c, x, y, r, color, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
}

// insert positions shared with the 3D renderer (it lights lenses at exactly these spots)
export function insertLayout(T) {
  const out = [];
  for (const ins of T.inserts) {
    if (ins.kind === 'mult') for (let m = 2; m <= 6; m++) out.push({ kind: 'mult', m, x: ins.x + (m - 4) * 28, y: ins.y, r: 11, label: m + '×' });
    else if (ins.kind === 'arrow') out.push({ ...ins, r: 13 });
    else if (ins.kind === 'kick') out.push({ ...ins, r: 8, label: 'KICK' });
    else if (ins.kind === 'letters') {
      const n = ins.text.length, w = 17;
      [...ins.text].forEach((ch, i) => out.push({ kind: 'letter', ch, i, group: ins.group, x: ins.x + (i - (n - 1) / 2) * w, y: ins.y, r: 7.5 }));
    }
  }
  // the centre ring (bonus meter) and the shoot-again lens
  const RC = T.spec.ring || [184, 452];
  for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i / 16) * TAU; out.push({ kind: 'ring', i, x: RC[0] + Math.cos(a) * 46, y: RC[1] + Math.sin(a) * 46, r: 5 }); }
  out.push({ kind: 'save', x: 184, y: 752, r: 9, label: 'SAVE' });
  for (const ro of T.rollovers) out.push({ kind: 'roll', id: ro.id, x: ro.x, y: ro.y, r: 6.5 });
  for (const kb of T.kickbacks) out.push({ kind: 'kickarrow', id: kb.id, x: (kb.rect[0] + kb.rect[2]) / 2, y: kb.rect[1] - 14, r: 6 });
  return out;
}

const painters = {
  'deep-current'(c, T, th, r) {
    c.globalAlpha = 0.08; c.fillStyle = '#bae6fd';
    for (const [x, w] of [[60, 40], [150, 26], [250, 50], [330, 22]]) poly(c, [[x, 0], [x + w, 0], [x + w * 2.4 + 60, 640], [x + 40, 640]]), c.fill();
    c.globalAlpha = 1;
    // caustic net
    c.strokeStyle = 'rgba(125,211,252,.07)'; c.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) { const x = r() * 380, y = r() * 700; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 20, y + r() * 30 - 15, x + 40, y + r() * 20 - 10); c.stroke(); }
    c.strokeStyle = 'rgba(186,230,253,.28)'; c.lineWidth = 1;
    for (let i = 0; i < 50; i++) { c.beginPath(); c.arc(20 + r() * 330, 100 + r() * 600, 1 + r() * 3.5, 0, TAU); c.stroke(); }
    // sand, rocks and seaweed by the drain
    c.fillStyle = '#062033'; c.beginPath(); c.moveTo(10, T.H); for (let x = 10; x <= 390; x += 16) c.lineTo(x, 790 + Math.sin(x * 0.07) * 9); c.lineTo(390, T.H + 40); c.lineTo(10, T.H + 40); c.fill();
    c.lineCap = 'round';
    for (const x0 of [130, 150, 170, 200, 222, 240]) {
      c.strokeStyle = r() < 0.5 ? 'rgba(45,212,191,.45)' : 'rgba(52,211,153,.35)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x0, 812); for (let y = 812; y > 760; y -= 6) c.lineTo(x0 + Math.sin(y * 0.22 + x0) * 5, y); c.stroke();
    }
    // manta
    c.save(); c.translate(184, 610); c.fillStyle = 'rgba(165,243,252,.12)';
    c.beginPath(); c.moveTo(0, -22); c.quadraticCurveTo(36, -20, 70, 8); c.quadraticCurveTo(32, 6, 10, 22); c.lineTo(0, 60); c.lineTo(-10, 22);
    c.quadraticCurveTo(-32, 6, -70, 8); c.quadraticCurveTo(-36, -20, 0, -22); c.fill(); c.restore();
    // coral fans on the right
    c.strokeStyle = 'rgba(251,113,133,.35)'; c.lineWidth = 2;
    for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(300, 420); c.lineTo(300 + Math.cos(-2.2 + i * 0.18) * 40, 420 + Math.sin(-2.2 + i * 0.18) * 40); c.stroke(); }
  },
  'neon-drive'(c, T, th, r) {
    // sunset sun with stripes
    const sx = 184, sy = 300;
    const g = c.createLinearGradient(0, sy - 120, 0, sy + 40); g.addColorStop(0, '#fde047'); g.addColorStop(0.5, '#fb923c'); g.addColorStop(1, '#db2777');
    c.save(); c.beginPath(); c.arc(sx, sy, 118, Math.PI, TAU); c.closePath(); c.clip();
    c.globalAlpha = 0.5; c.fillStyle = g; c.fillRect(sx - 120, sy - 120, 240, 160);
    c.globalAlpha = 1; c.fillStyle = th.floor[1];
    for (let i = 0; i < 6; i++) c.fillRect(sx - 120, sy - 46 + i * 9, 240, 2 + i * 0.9);
    c.restore();
    glow(c, sx, sy - 40, 200, 'rgba(244,114,182,.35)', 1);
    // mountains
    c.fillStyle = '#12082a'; c.beginPath(); c.moveTo(10, sy);
    for (let x = 10; x <= 360; x += 24) c.lineTo(x, sy - 14 - Math.abs(Math.sin(x * 0.04)) * 46 * r()); c.lineTo(360, sy); c.fill();
    // perspective grid floor
    c.strokeStyle = 'rgba(244,114,182,.38)'; c.lineWidth = 1.3;
    for (let i = 0; i < 16; i++) { const y = sy + Math.pow(i / 15, 1.9) * 520; c.beginPath(); c.moveTo(0, y); c.lineTo(400, y); c.stroke(); }
    c.strokeStyle = 'rgba(34,211,238,.3)';
    for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(sx + i * 6, sy); c.lineTo(sx + i * 70, T.H + 40); c.stroke(); }
    // stars
    c.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 70; i++) { const y = 20 + r() * (sy - 60); c.fillRect(20 + r() * 340, y, 1.3, 1.3); }
    // palms
    for (const [px, k] of [[44, 1], [324, -1]]) {
      c.strokeStyle = '#0a0418'; c.fillStyle = '#0a0418'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(px, 500); c.quadraticCurveTo(px + 10 * k, 420, px + 4 * k, 360); c.stroke();
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.55; c.lineWidth = 3; c.beginPath(); c.moveTo(px + 4 * k, 360); c.quadraticCurveTo(px + 4 * k + Math.cos(a) * 30, 360 + Math.sin(a) * 30 - 6, px + 4 * k + Math.cos(a) * 52, 360 + Math.sin(a) * 52 + 14); c.stroke(); }
    }
  },
  starfall(c, T, th, r) {
    // nebulae
    for (const [x, y, rad, col] of [[90, 160, 160, 'rgba(129,140,248,.35)'], [300, 380, 180, 'rgba(236,72,153,.22)'], [140, 560, 200, 'rgba(56,189,248,.18)'], [260, 120, 120, 'rgba(250,204,21,.12)']]) glow(c, x, y, rad, col, 1);
    // stars
    for (let i = 0; i < 260; i++) {
      const x = 12 + r() * 376, y = r() * 800, s = r();
      c.fillStyle = s > 0.92 ? '#fde68a' : s > 0.8 ? '#c7d2fe' : 'rgba(255,255,255,.75)';
      c.fillRect(x, y, s > 0.95 ? 2.2 : 1.2, s > 0.95 ? 2.2 : 1.2);
    }
    // energy cracks
    c.strokeStyle = 'rgba(165,180,252,.22)'; c.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      let x = 40 + r() * 300, y = 120 + r() * 600; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; c.lineTo(x, y); } c.stroke();
    }
    // ringed planet bottom left, moon top right
    const pg = c.createRadialGradient(80, 590, 4, 92, 600, 46); pg.addColorStop(0, '#fdba74'); pg.addColorStop(1, '#7c2d12');
    c.fillStyle = pg; c.beginPath(); c.arc(92, 600, 40, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(253,186,116,.6)'; c.lineWidth = 3; c.beginPath(); c.ellipse(92, 600, 66, 14, -0.35, 0, TAU); c.stroke();
    const mg = c.createRadialGradient(330, 470, 2, 334, 474, 22); mg.addColorStop(0, '#e0e7ff'); mg.addColorStop(1, '#3730a3');
    c.fillStyle = mg; c.beginPath(); c.arc(334, 474, 18, 0, TAU); c.fill();
    // comet streak
    const cg = c.createLinearGradient(220, 560, 330, 620); cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(224,231,255,.7)');
    c.strokeStyle = cg; c.lineWidth = 3; c.beginPath(); c.moveTo(220, 560); c.lineTo(330, 620); c.stroke();
    // black hole swirl under the saucer
    const h = T.saucers[0];
    if (h) for (let i = 0; i < 4; i++) { c.strokeStyle = `rgba(167,139,250,${0.5 - i * 0.1})`; c.lineWidth = 2; c.beginPath(); c.arc(h.x, h.y, 16 + i * 7, i, i + 4); c.stroke(); }
  },
};

export function paintTable(c, T, size) {
  const th = T.theme, k = size / T.W;
  c.save(); c.scale(k, k);
  c.fillStyle = '#05050a'; c.fillRect(0, 0, T.W, T.H + 40);
  tablePath(c, T);
  const g = c.createLinearGradient(0, 0, 0, T.H);
  g.addColorStop(0, th.floor[0]); g.addColorStop(0.45, th.floor[1]); g.addColorStop(1, th.floor[2]);
  c.fillStyle = g; c.fill();
  c.save(); tablePath(c, T); c.clip();
  (painters[T.id] || (() => {}))(c, T, th, rng(7));
  // title watermark
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = 'rgba(255,255,255,.12)'; c.font = '800 30px system-ui, sans-serif';
  c.save(); c.translate(184, 548); c.fillText(th.title, 0, 0); c.restore();
  // plunger lane
  c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(358, 200, 32, T.H);
  // lane arrows in inlanes/outlanes
  c.fillStyle = 'rgba(255,255,255,.18)';
  for (const x of [25, 53, 315, 343]) for (let i = 0; i < 2; i++) { poly(c, [[x - 5, 600 + i * 14], [x + 5, 600 + i * 14], [x, 608 + i * 14]]); c.fill(); }
  // apron and spin decals
  c.fillStyle = 'rgba(0,0,0,.35)';
  for (const sn of T.spinners) { c.fillRect(sn.rect[0], sn.rect[1] - 6, sn.rect[2] - sn.rect[0], sn.rect[3] - sn.rect[1] + 12); }
  // insert lenses (dim, the 3D layer lights them) + labels
  const RC = T.spec.ring || [184, 452];
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1; c.beginPath(); c.arc(RC[0], RC[1], 46, 0, TAU); c.stroke();
  c.beginPath(); c.arc(RC[0], RC[1], 30, 0, TAU); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill();
  c.fillStyle = 'rgba(255,255,255,.4)'; c.font = '700 9px system-ui, sans-serif'; c.fillText('BONUS', RC[0], RC[1]);
  for (const ins of insertLayout(T)) {
    const col = ins.kind === 'mult' ? th.accent : ins.kind === 'arrow' ? th.wall : ins.kind === 'ring' ? th.light : ins.kind === 'save' ? '#34d399' : th.guide;
    c.save(); c.translate(ins.x, ins.y);
    c.fillStyle = 'rgba(0,0,0,.55)'; c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 1.2;
    if (ins.kind === 'arrow') {
      c.rotate(((ins.rot || -90) + 90) * Math.PI / 180);
      poly(c, [[0, -ins.r - 4], [ins.r, ins.r], [-ins.r, ins.r]]); c.fill(); c.stroke();
      c.globalAlpha = 0.9; c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '700 7px system-ui, sans-serif';
      if (ins.label) c.fillText(ins.label, 0, ins.r + 10);
    } else {
      c.beginPath(); c.arc(0, 0, ins.r + 1.5, 0, TAU); c.fill(); c.stroke();
      c.globalAlpha = 0.85; c.fillStyle = 'rgba(255,255,255,.7)';
      if (ins.label && ins.kind !== 'kick') { c.font = `700 ${ins.kind === 'save' ? 6 : 8}px system-ui, sans-serif`; c.fillText(ins.label, 0, 0.5); }
      if (ins.kind === 'kick') { c.font = '700 6px system-ui, sans-serif'; c.fillText('KICK', 0, ins.r + 8); }
      if (ins.ch) { c.font = '800 9px system-ui, sans-serif'; c.fillText(ins.ch, 0, 0.5); }
    }
    c.restore();
  }
  c.restore();
  c.restore();
}

export function thumbnail(T, w) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round((w * (T.H + 20)) / T.W);
  const c = cv.getContext('2d'); paintTable(c, T, w);
  // a hint of the parts so thumbnails read as tables
  const k = w / T.W; c.save(); c.scale(k, k); c.lineCap = 'round';
  for (const wl of T.walls) {
    c.strokeStyle = wl.tag === 'bumper' ? T.theme.bumper : wl.tag === 'guide' ? T.theme.guide : T.theme.wall; c.lineWidth = wl.tag === 'bumper' ? 6 : 3;
    c.beginPath();
    if (wl.k === 'seg') { c.moveTo(wl.ax, wl.ay); c.lineTo(wl.bx, wl.by); } else if (wl.k === 'arc') c.arc(wl.x, wl.y, wl.R, wl.a0, wl.a1); else c.arc(wl.x, wl.y, wl.r - 3, 0, TAU);
    c.stroke();
  }
  for (const so of T.solids) { poly(c, so.pts); c.fillStyle = T.theme.solid; c.fill(); }
  for (const f of T.flippers) { c.strokeStyle = T.theme.flipper; c.lineWidth = 12; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + f.len * Math.cos(f.down), f.y + f.len * Math.sin(f.down)); c.stroke(); }
  c.restore();
  return cv;
}
