const S = require('../games/sudoku/sudoku.js');
let ok = 0;
for (const d of S.DIFFICULTIES) {
  const t = Date.now(); let n = 0, tries = 0; const givens = [];
  const rand = S.makeRng(42);
  while (n < 8) {
    const g = S.generate(d, { rand, attempts: 1 }); tries++;
    if (!g) continue; n++;
    givens.push(g.grade.givens);
    if (!S.hasUniqueSolution(g.puzzle)) throw 'not unique';
    const sol = S.solve(g.puzzle).solution;
    if (S.toString(sol) !== S.toString(g.solution)) throw 'wrong solution';
    ok++;
  }
  console.log(d.padEnd(7), 'tries', tries, 'ms/puzzle', ((Date.now() - t) / n) | 0, 'givens', givens.join(','));
}
console.log('all checks ok', ok);
