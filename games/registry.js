// The list of games. Loaded by the page (home screen) and by sw.js (offline pre-cache).
// To add a game: add ONE entry below (keep alphabetical by id to make merges trivial).
//   id      folder name under games/, used in the URL (#/id) and storage keys (g.<id>.*)
//   name    shown on the home screen
//   blurb   one short line under the name
//   files   every file the game needs, relative to games/<id>/ (game.js first). All are cached for offline use.
// Each game folder also has icon.svg (square, drawn for a 48–96 px tile); it is cached automatically.
self.GAMES = [
  { id: 'chess', name: 'Chess', blurb: 'Play the computer, beginner to master', files: ['game.js', 'chess.js', 'vendor/chessground.js', 'vendor/chessground.base.css', 'vendor/cburnett.css', 'style.css', 'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm'] },
  { id: 'mines', name: 'Mines', blurb: 'Clear the field by logic, no guessing', files: ['game.js', 'engine.js', 'style.css'] },
  { id: 'solitaire', name: 'Solitaire', blurb: 'Klondike, every deal winnable', files: ['game.js', 'engine.js', 'worker.js', 'style.css'] },
  { id: 'pinball', name: 'Pinball', blurb: '3D tables: space, synthwave and the deep sea', files: ['game.js', 'engine.js', 'tables/base.js', 'tables/deep-current.js', 'tables/neon-drive.js', 'tables/starfall.js', 'art.js', 'render3d.js', 'vendor/three.module.min.js', 'vendor/EffectComposer.js', 'vendor/RenderPass.js', 'vendor/UnrealBloomPass.js', 'vendor/OutputPass.js', 'vendor/ShaderPass.js', 'vendor/MaskPass.js', 'vendor/Pass.js', 'vendor/CopyShader.js', 'vendor/LuminosityHighPassShader.js', 'vendor/OutputShader.js', 'vendor/RoomEnvironment.js', 'style.css'] },
  { id: 'solo-test', name: 'Solo Test', blurb: 'Jump pegs until one is left', files: ['game.js', 'engine.js', 'worker.js', 'style.css'] },
  { id: 'sudoku', name: 'Sudoku', blurb: 'Numbers 1 to 9, once each', files: ['game.js', 'sudoku.js', 'style.css'] },
];
