// The list of games. Loaded by the page (home screen) and by sw.js (offline pre-cache).
// To add a game: add ONE entry below (keep alphabetical by id to make merges trivial).
//   id      folder name under games/, used in the URL (#/id) and storage keys (g.<id>.*)
//   name    shown on the home screen
//   blurb   one short line under the name
//   files   every file the game needs, relative to games/<id>/ (game.js first). All are cached for offline use.
// Each game folder also has icon.svg (square, drawn for a 48–96 px tile); it is cached automatically.
self.GAMES = [
  { id: 'blocks', name: 'Stackfall', blurb: 'Drop blocks, clear full rows', files: ['game.js', 'engine.js', 'style.css'] },
  { id: 'chess', name: 'Chess', blurb: 'Play the computer, beginner to master', files: ['game.js', 'chess.js', 'style.css', 'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm'] },
  { id: 'maze-chase', name: 'Maze Chase', blurb: 'Grab every seed, dodge the bots', files: ['game.js', 'engine.js', 'style.css'] },
  { id: 'mines', name: 'Mines', blurb: 'Clear the field by logic, no guessing', files: ['game.js', 'engine.js', 'style.css'] },
  { id: 'solitaire', name: 'Solitaire', blurb: 'Klondike, every deal winnable', files: ['game.js', 'engine.js', 'worker.js', 'style.css'] },
  { id: 'pinball', name: 'Pinball', blurb: 'Flippers, bumpers and a deep-sea table', files: ['game.js', 'table.js', 'style.css'] },
  { id: 'solo-test', name: 'Solo Test', blurb: 'Jump pegs until one is left', files: ['game.js', 'engine.js', 'worker.js', 'style.css'] },
  { id: 'sudoku', name: 'Sudoku', blurb: 'Numbers 1 to 9, once each', files: ['game.js', 'sudoku.js', 'style.css'] },
];
