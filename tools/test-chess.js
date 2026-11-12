// Chess rules: perft, SAN, game end, save/restore. Run: node tools/test-chess.js
const C = require('../games/chess/chess.js');
const eq = (a, b, what) => { if (a !== b) throw new Error(what + ': expected ' + b + ', got ' + a); };
const t0 = Date.now();

// Perft (move counts) against known values.
const PERFT = [
  [C.START, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]], // "Kiwipete"
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],                  // en passant + pins
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],    // promotions, castling
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [fen, counts] of PERFT) counts.forEach((n, i) => eq(C.perft(C.parseFEN(fen), i + 1), n, 'perft ' + (i + 1) + ' ' + fen));
console.log('perft ok', Date.now() - t0, 'ms');

// FEN round trip
for (const [fen] of PERFT) eq(C.toFEN(C.parseFEN(fen)), fen, 'fen round trip');

// SAN
const g = C.play(C.START, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6', 'd7c6', 'e1g1']);
eq(g.sans.join(' '), 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O', 'san');
const dis = C.parseFEN('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
eq(C.san(C.parseFEN('7k/8/8/8/8/8/8/R4RK1 w - - 0 1'), C.fromUci(C.parseFEN('7k/8/8/8/8/8/8/R4RK1 w - - 0 1'), 'a1c1')), 'Rac1', 'file disambiguation');
eq(C.san(C.parseFEN('7k/8/8/R7/8/8/8/R5K1 w - - 0 1'), C.fromUci(C.parseFEN('7k/8/8/R7/8/8/8/R5K1 w - - 0 1'), 'a1a3')), 'R1a3', 'rank disambiguation');
eq(C.san(C.parseFEN('7k/P7/8/8/8/8/8/K7 w - - 0 1'), C.fromUci(C.parseFEN('7k/P7/8/8/8/8/8/K7 w - - 0 1'), 'a7a8q')), 'a8=Q+', 'promotion san');
eq(C.uci(C.fromSan(dis, 'O-O')), 'e1g1', 'fromSan castle');
const ep = C.play('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1', ['e2e4', 'd4e3']);
eq(ep.sans.join(' '), 'e4 dxe3', 'en passant san'); eq(ep.pos.b[C.sqIndex('e4')], '', 'ep removes pawn');

// Game end
eq(C.play(C.START, ['f2f3', 'e7e5', 'g2g4', 'd8h4']).result.reason, 'checkmate', "fool's mate");
eq(C.play(C.START, ['f2f3', 'e7e5', 'g2g4', 'd8h4']).sans[3], 'Qh4#', 'mate sign');
eq(C.outcome(C.parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason, 'stalemate', 'stalemate');
eq(C.outcome(C.parseFEN('8/8/4k3/8/8/2B5/4K3/8 w - - 0 1')).reason, 'insufficient material', 'K+B v K');
eq(C.outcome(C.parseFEN('8/8/4k3/8/8/2N5/4K3/8 w - - 0 1')).reason, 'insufficient material', 'K+N v K');
eq(C.outcome(C.parseFEN('8/8/4k3/8/8/2N1b3/4K3/8 w - - 0 1')).over, false, 'N v B is not dead');
eq(C.outcome(C.parseFEN('8/8/2b1k3/8/8/3B4/4K3/8 w - - 0 1')).reason, 'insufficient material', 'same-colour bishops');
eq(C.outcome(C.parseFEN('8/8/4k3/8/8/4K3/8/7R w - - 100 80')).reason, '50-move rule', '50 moves');
const rep = C.play(C.START, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
eq(rep.result.reason, 'threefold repetition', 'threefold');
eq(C.play(C.START, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1']).result.over, false, 'not yet threefold');

// Save / restore: replaying start + moves gives the same position
const moves = [];
let p = C.parseFEN(C.START);
for (let i = 0; i < 120; i++) {
  const ms = C.moves(p); if (!ms.length || C.outcome(p).over) break;
  const m = ms[(i * 7919) % ms.length]; moves.push(C.uci(m)); p = C.apply(p, m);
}
const saved = JSON.parse(JSON.stringify({ start: C.START, moves }));
eq(C.toFEN(C.play(saved.start, saved.moves).pos), C.toFEN(p), 'restore');
let threw = false; try { C.play(C.START, ['e2e5']); } catch (e) { threw = true; }
eq(threw, true, 'illegal move rejected');
console.log('chess rules ok', Date.now() - t0, 'ms');
