// Generates fresh puzzles off the main thread so the UI never freezes.
importScripts('sudoku.js');
self.onmessage = (e) => {
  const d = e.data.d;
  let g = null;
  while (!g) g = self.Sudoku.generate(d, { attempts: 50 });
  self.postMessage({ d, p: self.Sudoku.toString(g.puzzle), s: self.Sudoku.toString(g.solution) });
};
