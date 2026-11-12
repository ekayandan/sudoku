// Shared lower playfield for every table: outer shell, plunger lane and gate, outlanes, inlanes, slingshots and
// the two main flippers. Tables add their own upper playfield. Mirrored around x = 184 (B.MID).
(function (root) {
  'use strict';
  root.PinballBase = function base(B, o = {}) {
    const { H, mx } = B;
    // outer shell: top arch, plunger lane, right wall
    B.arc(200, 200, 190, 180, 360, { r: 2 });
    B.seg(390, 200, 390, H + 20, { r: 2 });
    B.seg(358, 200, 358, H + 20, { r: 2, tag: 'lane' });
    B.gate(358, 200, 390, 186);
    if (o.leftOrbit) {
      // left orbit: a channel between the outer wall and an inner guide, curving into the playfield
      B.seg(10, 200, 10, 300, { r: 2 });
      B.arc(90, 300, 80, 115, 180, { r: 2 });
      B.seg(56.2, 372.5, 10, 440, { r: 2 });
      B.seg(10, 440, 10, H + 20, { r: 2 });
      B.arc(200, 200, 158, 180, 228, { r: 3, tag: 'guide' });
      B.seg(42, 200, 42, 300, { r: 3, tag: 'guide' });
      B.solid([[12, 303], [12, 335], [17.1, 345.6], [24.1, 355.3], [32.5, 363.9], [41.9, 371.3], [51, 376.5], [12, 431]], { tag: 'orbit wall' });
    } else B.seg(10, 200, 10, H + 20, { r: 2 });
    for (const side of [0, 1]) {
      const X = side ? mx : (x) => x;
      B.seg(X(40), 560, X(40), H + 20, { r: 3, tag: 'guide' });
      B.seg(X(40), 625, X(112), 688, { r: 3, tag: 'guide' });
      const a = [X(66), 540], b = [X(104), 640], c = [X(66), 605];
      B.sling(side ? b : a, side ? a : b, c);
      B.solid([[X(46), 636], [X(106), 688], [X(106), 700], [X(46), 700]], { tag: 'apron' });
      B.sensor('outlane', side ? [mx(38), 640, mx(12), 690] : [12, 640, 38, 690], { idx: side, dir: 'down' });
      B.sensor('inlane', side ? [mx(63), 575, mx(43), 610] : [43, 575, 63, 610], { idx: side, dir: 'down' });
    }
    B.flipper(118, 700, 30, -26, { side: 'L' });
    B.flipper(mx(118), 700, 150, 206, { side: 'R' });
  };
  // the ball centre must stay inside the shell
  root.PinballInside = (x, y) => x > 10 + 9 - 1.5 && x < 390 - 9 + 1.5 && (y >= 200 || Math.hypot(x - 200, y - 200) < 190 - 9 + 1.5) && !(y > 205 && x > 358 - 9 + 1.5 && x < 358 + 9 - 1.5);
})(typeof self !== 'undefined' ? self : globalThis);
