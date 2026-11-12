// Worst-case saved data for Solo Test: a full European game history.
const E = require('../../games/solo-test/engine.js');
module.exports = () => {
  const s = { board: 'european', b: E.start('european').map((v) => (v === -1 ? -1 : 1)), hist: Array.from({ length: 36 }, () => [48, 47, 46]), elapsed: 8640000000.123, over: false };
  return { 'g.solo-test.save': JSON.stringify(s), 'g.solo-test.best': JSON.stringify({ english: 'centre', european: 36 }) };
};
