// Worst-case saved data for Maze Chase: a full mid-level state on the largest maze, plus the high score.
const E = require('../../games/maze-chase/engine.js');
module.exports = () => {
  const st = E.newGame(123456789);
  st.level = 9999; st.score = 99999990; st.lives = 99; st.maze = 2; E.startLevel(st);
  st.bonus = { t: 9.99999, k: 'comet', pts: 5000, x: 9, y: 17 };
  st.pop = { x: 9.123456789, y: 17.123456789, text: '1600', t: 0.123456789 };
  for (const g of st.chasers) { g.x = 1.0123456789; g.y = 10.123456789; }
  st.hero.x = 17.123456789; st.hero.y = 27.123456789;
  return { 'g.maze-chase.save': JSON.stringify(E.save(st)), 'g.maze-chase.high': JSON.stringify(99999990) };
};
