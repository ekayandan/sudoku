// The list of games. Loaded by the page (home screen) and by sw.js (offline pre-cache).
// To add a game: add ONE entry below (keep alphabetical by id to make merges trivial).
//   id      folder name under games/, used in the URL (#/id) and storage keys (g.<id>.*)
//   name    shown on the home screen
//   blurb   one short line under the name
//   files   every file the game needs, relative to games/<id>/ (game.js first). All are cached for offline use.
// Each game folder also has icon.svg (square, drawn for a 48–96 px tile); it is cached automatically.
self.GAMES = [
  { id: 'solo-test', name: 'Solo Test', blurb: 'Jump pegs until one is left', files: ['game.js', 'engine.js', 'worker.js', 'style.css'] },
  { id: 'sudoku', name: 'Sudoku', blurb: 'Numbers 1 to 9, once each', files: ['game.js', 'sudoku.js', 'style.css'] },
];
