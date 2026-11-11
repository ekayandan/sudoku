const S = require('../sudoku.js');
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
    const m = S.mutate(g.puzzle, g.solution, rand);
    if (!S.hasUniqueSolution(m.puzzle)) throw 'mutant not unique';
    if (S.toString(S.solve(m.puzzle).solution) !== S.toString(m.solution)) throw 'mutant solution';
    if (S.difficultyOf(S.grade(m.puzzle)) !== d) throw 'mutant difficulty changed';
    ok++;
  }
  console.log(d.padEnd(7), 'tries', tries, 'ms/puzzle', ((Date.now() - t) / n) | 0, 'givens', givens.join(','));
}
console.log('all checks ok', ok);
