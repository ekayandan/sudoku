// Table 2: "Neon Drive", a night drive into a synthwave sunset. Spinner orbit, N-E-O targets open the garage
// (saucer) for 2-ball Overdrive multiball; an upper flipper feeds the bumpers.
(function (root) {
  'use strict';
  const E = root.PinballEngine;
  E.define({
    id: 'neon-drive', name: 'Neon Drive', blurb: 'Spinners, an upper flipper and Overdrive multiball',
    hello: 'Start your engine', laneChange: 'top', inside: root.PinballInside,
    theme: {
      floor: ['#2e1065', '#1e0b3a', '#0b0618'], wall: '#f472b6', guide: '#22d3ee', accent: '#facc15', bumper: '#f472b6', bumperCap: '#fdf4ff',
      sling: '#22d3ee', drop: '#a3e635', flipper: '#fdf2f8', flipperTrim: '#f472b6', solid: '#1a0b2e', light: '#f0abfc', title: 'NEON DRIVE',
    },
    build(B) {
      root.PinballBase(B, { leftOrbit: true });
      for (const x of [150, 190, 230, 270]) B.seg(x, 52, x, 86, { r: 3, tag: 'guide' });
      [170, 210, 250].forEach((x) => B.rollover('top', x, 70, 32, 24));
      [[150, 165], [226, 165], [188, 225]].forEach(([x, y]) => B.bumper(x, y, 18));
      B.spinner('spinner', 26, 250, 28);
      B.sensor('orbit', [12, 220, 40, 260], { dir: 'up' });
      // N-E-O standups, free-standing on the right
      [[222, 246], [256, 280], [290, 314]].forEach(([y0, y1]) => B.standup('neo', 300, y0, 300, y1));
      B.saucer('garage', 184, 336, -260, 260);
      B.post(160, 322, 4); B.post(208, 322, 4);
      // upper right flipper
      B.flipper(334, 392, 158, 204, { side: 'R', len: 42, r0: 7, r1: 4 });
      B.kickback([12, 700, 38, 740], { power: 1550 });
      B.insert = [
        { kind: 'mult', x: 184, y: 520 },
        { kind: 'arrow', x: 184, y: 380, rot: -90, lit: (s) => s.L.lock || s.mb, blink: true, label: 'GARAGE' },
        { kind: 'arrow', x: 26, y: 300, rot: -90, lit: () => true, label: 'SPIN' },
        { kind: 'kick', x: 25, y: 760, idx: 0 },
        { kind: 'letters', x: 280, y: 268, text: 'NEO', group: 'neo' },
      ];
    },
    rules: {
      event(s, X, name) {
        if (name === 'rollovers:top') { X.score(10000); X.multUp(); X.say('Bonus ×' + s.mult, 1.8); X.show('sweep'); }
        else if (name === 'spin') {
          s.L.spins = (s.L.spins || 0) + 1;
          if (s.L.spins >= 25) { s.L.spins = 0; if (!s.kick[0]) { X.lightKick(0); X.say('Kickback lit', 1.6); } else X.score(10000); }
        } else if (name === 'standups:neo') {
          X.resetStandups('neo');
          if (!s.mb) { s.L.lock = 1; X.say('Garage open!', 2); X.show('sweep'); } else X.score(20000);
        } else if (name === 'garage') {
          if (s.mb) { const j = 50000 * (s.L.jx = (s.L.jx || 0) + 1); X.score(j); X.say('JACKPOT ' + j.toLocaleString('en-US'), 2.2); X.show('jackpot'); X.shake(1); }
          else if (s.L.lock) { s.L.lock = 0; s.L.jx = 0; X.multiball(1); X.say('OVERDRIVE!', 2.5); X.show('multiball'); X.shake(1); }
        } else if (name === 'orbit') { X.score(5000); X.show('orbit'); }
        else if (name === 'bumper' && s.mb) X.score(500);
        else if (name === 'mbend') { X.say('Overdrive over', 1.6); s.L.jx = 0; }
      },
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
