// Table 1: "Deep Current", a deep-sea table. Jellyfish bumpers, a coral drop bank, the left current (orbit).
(function (root) {
  'use strict';
  const E = root.PinballEngine;
  E.define({
    id: 'deep-current', name: 'Deep Current', blurb: 'Jellyfish, coral and the left current',
    hello: 'Dive in!', laneChange: 'top', inside: root.PinballInside,
    theme: {
      floor: ['#0b4f73', '#073452', '#03142a'], wall: '#5eead4', guide: '#7dd3fc', accent: '#fbbf24', bumper: '#c084fc', bumperCap: '#f5d0fe',
      sling: '#2dd4bf', drop: '#fb7185', flipper: '#f1f5f9', flipperTrim: '#22d3ee', solid: '#0a2540', light: '#bae6fd', title: 'DEEP CURRENT',
    },
    build(B) {
      root.PinballBase(B, { leftOrbit: true });
      for (const x of [150, 190, 230, 270]) B.seg(x, 52, x, 86, { r: 3, tag: 'guide' });
      [[140, 168], [230, 168], [185, 236]].forEach(([x, y]) => B.bumper(x, y, 20));
      // drop bank on the right, with a solid block behind it
      B.seg(344, 282, 358, 262, { r: 2 }); B.seg(344, 282, 344, 392, { r: 2 }); B.seg(344, 392, 358, 412, { r: 2 });
      B.solid([[346, 284], [358, 268], [358, 406], [346, 390]], { tag: 'reef' });
      [[288, 310], [314, 336], [340, 362], [366, 388]].forEach(([y0, y1]) => B.drop('reef', 336, y0 + 4, 336, y1 - 4));
      [170, 210, 250].forEach((x) => B.rollover('top', x, 70, 32, 24));
      B.sensor('orbit', [12, 220, 40, 260], { dir: 'up' });
      B.insert = [
        { kind: 'mult', x: 184, y: 520 },
        { kind: 'arrow', x: 26, y: 300, rot: -90, lit: (s) => true, label: 'CURRENT' },
      ];
    },
    rules: {
      event(s, X, name) {
        if (name === 'rollovers:top') { X.score(10000); X.multUp(); X.say('Bonus ×' + s.mult, 1.8); X.show('sweep'); }
        else if (name === 'bank:reef') {
          s.L.banks = (s.L.banks || 0) + 1; X.score(25000); X.show('flash');
          if (s.L.banks % 2 === 0) X.extraBall(); else X.say('Reef cleared +25,000', 2);
        } else if (name === 'orbit') { X.score(5000); X.bonus(500); X.say('Current ride +5,000', 1.5); X.show('orbit'); }
      },
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
