// Table 3: "Starfall", deep space. Four star bumpers, the S-T-A-R-S drop bank opens the black hole (saucer)
// for 3-ball Starfall multiball; kickbacks on both outlanes.
(function (root) {
  'use strict';
  const E = root.PinballEngine;
  E.define({
    id: 'starfall', name: 'Starfall', blurb: 'Black hole, five star targets, 3-ball multiball',
    hello: 'Lift off', laneChange: 'top', inside: root.PinballInside,
    theme: {
      floor: ['#111827', '#0b1023', '#020617'], wall: '#a5b4fc', guide: '#e0e7ff', accent: '#fde047', bumper: '#fb923c', bumperCap: '#fff7ed',
      sling: '#818cf8', drop: '#fde047', flipper: '#f8fafc', flipperTrim: '#818cf8', solid: '#0f172a', light: '#c7d2fe', title: 'STARFALL',
    },
    build(B) {
      root.PinballBase(B, { leftOrbit: false });
      // left deflector: turns a ball coming down the left wall back into the playfield
      B.seg(10, 300, 50, 340, { r: 3, tag: 'guide' }); B.seg(50, 340, 10, 380, { r: 3, tag: 'guide' });
      B.solid([[12, 306], [44, 340], [12, 374]], { tag: 'deflector' });
      for (const x of [150, 190, 230, 270]) B.seg(x, 52, x, 86, { r: 3, tag: 'guide' });
      [170, 210, 250].forEach((x) => B.rollover('top', x, 70, 32, 24));
      [[185, 128], [135, 172], [235, 172], [185, 214]].forEach(([x, y]) => B.bumper(x, y, 17));
      [118, 144, 170, 196, 222].forEach((x) => B.drop('stars', x + 2, 340, x + 20, 340));
      B.saucer('hole', 304, 236, -230, 330);
      B.post(286, 222, 4); B.post(322, 222, 4);
      B.spinner('spinner', 74, 430, 36);
      B.kickback([12, 700, 38, 740], { power: 1550 });
      B.kickback([B.mx(38), 700, B.mx(12), 740], { power: 1550 });
      B.insert = [
        { kind: 'mult', x: 184, y: 520 },
        { kind: 'arrow', x: 304, y: 280, rot: -90, lit: (s) => s.L.hole || s.mb, blink: true, label: 'HOLE' },
        { kind: 'kick', x: 25, y: 760, idx: 0 }, { kind: 'kick', x: B.mx(25), y: 760, idx: 1 },
        { kind: 'letters', x: 184, y: 365, text: 'STARS', group: 'stars' },
      ];
    },
    rules: {
      event(s, X, name) {
        if (name === 'rollovers:top') { X.score(10000); X.multUp(); X.say('Bonus ×' + s.mult, 1.8); X.show('sweep'); }
        else if (name === 'bank:stars') {
          X.score(30000);
          if (!s.mb) { s.L.hole = 1; X.say('Black hole open!', 2); } else X.say('Stars +30,000', 1.6);
          X.show('flash');
        } else if (name === 'hole') {
          if (s.mb) { X.score(100000); X.say('SUPER JACKPOT', 2.2); X.show('jackpot'); X.shake(1.2); }
          else if (s.L.hole) { s.L.hole = 0; X.multiball(2); X.say('STARFALL!', 2.5); X.show('multiball'); X.shake(1.2); }
        } else if (name === 'spin') {
          s.L.spins = (s.L.spins || 0) + 1;
          if (s.L.spins >= 20) { s.L.spins = 0; X.lightKick(0); X.lightKick(1); X.say('Kickbacks lit', 1.6); }
        } else if (name === 'bumper') {
          s.L.pops = (s.L.pops || 0) + 1;
          if (s.L.pops % 40 === 0) { X.score(20000); X.say('Supernova +20,000', 1.6); X.show('flash'); }
        } else if (name === 'mbend') X.say('Starfall over', 1.6);
      },
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
