// Chess rules. Pure, no DOM; works in the browser, in workers and in Node.
// Squares: 0..63, index = rank8-first (0 = a8, 7 = h8, 56 = a1, 63 = h1). Pieces: 'PNBRQK' white, 'pnbrqk' black, '' empty.
// A position is { b: string[64], turn: 'w'|'b', castle: 'KQkq'|'-'…, ep: square|-1, half, full }. apply() returns a new one.
(function (root) {
  'use strict';
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh';
  const sqName = (s) => FILES[s & 7] + (8 - (s >> 3));
  const sqIndex = (n) => (8 - +n[1]) * 8 + FILES.indexOf(n[0]);
  const colorOf = (p) => (!p ? '' : p === p.toUpperCase() ? 'w' : 'b');
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const at = (s, dr, df) => { const r = (s >> 3) + dr, f = (s & 7) + df; return r < 0 || r > 7 || f < 0 || f > 7 ? -1 : r * 8 + f; };

  function parseFEN(fen) {
    const [board, turn = 'w', castle = '-', ep = '-', half = '0', full = '1'] = String(fen).trim().split(/\s+/);
    const rows = board.split('/');
    if (rows.length !== 8) throw new Error('bad FEN');
    const b = [];
    for (const row of rows) for (const ch of row) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) b.push(''); else if (/[pnbrqk]/i.test(ch)) b.push(ch); else throw new Error('bad FEN'); }
    if (b.length !== 64 || b.filter((p) => p === 'K').length !== 1 || b.filter((p) => p === 'k').length !== 1) throw new Error('bad FEN');
    return { b, turn: turn === 'b' ? 'b' : 'w', castle: castle || '-', ep: ep === '-' ? -1 : sqIndex(ep), half: +half || 0, full: +full || 1 };
  }
  function toFEN(p) {
    let s = '';
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let f = 0; f < 8; f++) { const x = p.b[r * 8 + f]; if (!x) e++; else { if (e) s += e; e = 0; s += x; } }
      if (e) s += e;
      if (r < 7) s += '/';
    }
    return s + ' ' + p.turn + ' ' + (p.castle || '-') + ' ' + (p.ep < 0 ? '-' : sqName(p.ep)) + ' ' + p.half + ' ' + p.full;
  }

  // Is square s attacked by colour c?
  function attacked(p, s, c) {
    const b = p.b, up = c === 'w' ? 1 : -1; // pawns of colour c attack "forward": white from below (higher rank index)
    const P = c === 'w' ? 'P' : 'p', N = c === 'w' ? 'N' : 'n', B = c === 'w' ? 'B' : 'b', R = c === 'w' ? 'R' : 'r', Q = c === 'w' ? 'Q' : 'q', K = c === 'w' ? 'K' : 'k';
    for (const df of [-1, 1]) { const t = at(s, up, df); if (t >= 0 && b[t] === P) return true; }
    for (const [dr, df] of KN) { const t = at(s, dr, df); if (t >= 0 && b[t] === N) return true; }
    for (const [dr, df] of KG) { const t = at(s, dr, df); if (t >= 0 && b[t] === K) return true; }
    for (const [dirs, A] of [[DIAG, B], [ORTH, R]]) for (const [dr, df] of dirs) {
      let t = s;
      while ((t = at(t, dr, df)) >= 0) { const x = b[t]; if (x) { if (x === A || x === Q) return true; break; } }
    }
    return false;
  }
  const kingSq = (p, c) => p.b.indexOf(c === 'w' ? 'K' : 'k');
  const inCheck = (p, c = p.turn) => attacked(p, kingSq(p, c), c === 'w' ? 'b' : 'w');

  function pseudo(p) {
    const out = [], b = p.b, c = p.turn, them = c === 'w' ? 'b' : 'w';
    const add = (from, to, flags) => {
      if ((b[from] === 'P' && to < 8) || (b[from] === 'p' && to >= 56)) for (const q of 'qrbn') out.push({ from, to, promo: q, flags });
      else out.push({ from, to, flags });
    };
    for (let s = 0; s < 64; s++) {
      const x = b[s];
      if (!x || colorOf(x) !== c) continue;
      const t = x.toLowerCase();
      if (t === 'p') {
        const dir = c === 'w' ? -1 : 1, one = at(s, dir, 0);
        if (one >= 0 && !b[one]) {
          add(s, one, '');
          const home = c === 'w' ? 6 : 1, two = at(s, 2 * dir, 0);
          if (s >> 3 === home && !b[two]) out.push({ from: s, to: two, flags: 'n' });
        }
        for (const df of [-1, 1]) {
          const d = at(s, dir, df);
          if (d < 0) continue;
          if (b[d] && colorOf(b[d]) === them) add(s, d, 'c');
          else if (d === p.ep) out.push({ from: s, to: d, flags: 'e' });
        }
      } else if (t === 'n' || t === 'k') {
        for (const [dr, df] of t === 'n' ? KN : KG) { const d = at(s, dr, df); if (d >= 0 && colorOf(b[d]) !== c) out.push({ from: s, to: d, flags: b[d] ? 'c' : '' }); }
        if (t === 'k') {
          const [K, Q, home] = c === 'w' ? ['K', 'Q', 60] : ['k', 'q', 4], R = c === 'w' ? 'R' : 'r';
          if (s === home && !attacked(p, s, them)) {
            if (p.castle.includes(K) && b[home + 3] === R && !b[home + 1] && !b[home + 2] && !attacked(p, home + 1, them) && !attacked(p, home + 2, them)) out.push({ from: s, to: home + 2, flags: 'k' });
            if (p.castle.includes(Q) && b[home - 4] === R && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(p, home - 1, them) && !attacked(p, home - 2, them)) out.push({ from: s, to: home - 2, flags: 'q' });
          }
        }
      } else {
        const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH);
        for (const [dr, df] of dirs) {
          let d = s;
          while ((d = at(d, dr, df)) >= 0) {
            if (!b[d]) out.push({ from: s, to: d, flags: '' });
            else { if (colorOf(b[d]) === them) out.push({ from: s, to: d, flags: 'c' }); break; }
          }
        }
      }
    }
    return out;
  }

  function apply(p, m) {
    const b = p.b.slice(), x = b[m.from], c = p.turn;
    let castle = p.castle;
    b[m.to] = m.promo ? (c === 'w' ? m.promo.toUpperCase() : m.promo) : x;
    b[m.from] = '';
    if (m.flags === 'e') b[m.to + (c === 'w' ? 8 : -8)] = '';
    if (m.flags === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = ''; }
    if (m.flags === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = ''; }
    const strip = (chars) => { for (const ch of chars) castle = castle.replace(ch, ''); };
    if (x === 'K') strip('KQ'); if (x === 'k') strip('kq');
    for (const s of [m.from, m.to]) { if (s === 63) strip('K'); if (s === 56) strip('Q'); if (s === 7) strip('k'); if (s === 0) strip('q'); }
    const capture = m.flags === 'c' || m.flags === 'e' || (m.promo && p.b[m.to]);
    return {
      b, turn: c === 'w' ? 'b' : 'w', castle: castle || '-',
      ep: m.flags === 'n' ? (m.from + m.to) / 2 : -1,
      half: x.toLowerCase() === 'p' || capture ? 0 : p.half + 1,
      full: p.full + (c === 'b' ? 1 : 0),
    };
  }

  function moves(p) { return pseudo(p).filter((m) => !inCheck(apply(p, m), p.turn)); }

  function perft(p, d) {
    if (d === 0) return 1;
    const ms = moves(p);
    if (d === 1) return ms.length;
    let n = 0;
    for (const m of ms) n += perft(apply(p, m), d - 1);
    return n;
  }

  const uci = (m) => sqName(m.from) + sqName(m.to) + (m.promo || '');
  function fromUci(p, u) {
    const from = sqIndex(u.slice(0, 2)), to = sqIndex(u.slice(2, 4)), promo = u[4] || undefined;
    return moves(p).find((m) => m.from === from && m.to === to && (m.promo || undefined) === promo) || null;
  }

  function san(p, m, legal = moves(p)) {
    let s;
    const x = p.b[m.from], t = x.toUpperCase();
    if (m.flags === 'k') s = 'O-O';
    else if (m.flags === 'q') s = 'O-O-O';
    else {
      const cap = m.flags === 'c' || m.flags === 'e';
      if (t === 'P') s = (cap ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
      else {
        const rivals = legal.filter((o) => o.to === m.to && o.from !== m.from && p.b[o.from] === x);
        let dis = '';
        if (rivals.length) {
          const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7)), sameRank = rivals.some((o) => o.from >> 3 === m.from >> 3);
          if (!sameFile) dis = FILES[m.from & 7];
          else if (!sameRank) dis = String(8 - (m.from >> 3));
          else dis = sqName(m.from);
        }
        s = t + dis + (cap ? 'x' : '') + sqName(m.to);
      }
    }
    const q = apply(p, m);
    if (inCheck(q)) s += moves(q).length ? '+' : '#';
    return s;
  }
  function fromSan(p, s) {
    const clean = (x) => x.replace(/[+#?!]/g, '');
    const legal = moves(p);
    return legal.find((m) => clean(san(p, m, legal)) === clean(s)) || null;
  }

  // Repetition key: placement, side, castling, and the en-passant square only if a capture there is legal.
  function repKey(p) {
    const ep = p.ep >= 0 && moves(p).some((m) => m.flags === 'e') ? sqName(p.ep) : '-';
    return toFEN(p).split(' ').slice(0, 3).join(' ') + ' ' + ep;
  }

  function insufficient(p) {
    const rest = [];
    for (let s = 0; s < 64; s++) { const x = p.b[s]; if (x && x.toLowerCase() !== 'k') rest.push([x, s]); }
    if (rest.length === 0) return true;
    if (rest.some(([x]) => /[pqr]/i.test(x))) return false;
    if (rest.length === 1) return true; // K+minor vs K
    // only bishops, all on the same colour
    if (rest.every(([x]) => x.toLowerCase() === 'b')) { const sc = (s) => ((s >> 3) + (s & 7)) & 1; return rest.every(([, s]) => sc(s) === sc(rest[0][1])); }
    return false;
  }

  // A game: start FEN + list of UCI moves. Returns positions, SAN list and the result.
  function play(startFen, list) {
    let p = parseFEN(startFen || START);
    const positions = [p], sans = [], keys = [repKey(p)];
    for (const u of list) {
      const legal = moves(p), m = legal.find((x) => uci(x) === u);
      if (!m) throw new Error('illegal move ' + u);
      sans.push(san(p, m, legal));
      p = apply(p, m); positions.push(p); keys.push(repKey(p));
    }
    return { pos: p, positions, sans, result: outcome(p, keys) };
  }
  // { over, winner: 'w'|'b'|null, reason }
  function outcome(p, keys = [repKey(p)]) {
    const legal = moves(p);
    if (!legal.length) return inCheck(p) ? { over: true, winner: p.turn === 'w' ? 'b' : 'w', reason: 'checkmate' } : { over: true, winner: null, reason: 'stalemate' };
    if (insufficient(p)) return { over: true, winner: null, reason: 'insufficient material' };
    if (p.half >= 100) return { over: true, winner: null, reason: '50-move rule' };
    const last = keys[keys.length - 1];
    if (keys.filter((k) => k === last).length >= 3) return { over: true, winner: null, reason: 'threefold repetition' };
    return { over: false, winner: null, reason: '' };
  }

  const api = { START, parseFEN, toFEN, moves, apply, perft, uci, fromUci, san, fromSan, inCheck, kingSq, insufficient, outcome, play, sqName, sqIndex, colorOf };
  root.Chess = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
