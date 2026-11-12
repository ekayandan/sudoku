# Pocket Games

Timeless games in one small app that runs fully in the browser. Visit once, then it works offline (installable as an app).
No ads, no accounts, no tracking. Open it and you're back where you left off.

Games: Sudoku, Solo Test, Solitaire, Mines, Chess, Pinball (3D: Starfall, Neon Drive, Deep Current).

## License

GPL-3.0 (see [LICENSE](LICENSE)). Chess bundles the Stockfish engine (Stockfish.js 19, GPL-3.0, unmodified build in `games/chess/engine/`, notice and license there).

## Docs
- [docs/DESIGN.md](docs/DESIGN.md): what we're building and why: requirements, budgets, architecture
- [docs/ADDING-A-GAME.md](docs/ADDING-A-GAME.md): the game module contract and rules
- [docs/CONTROLS.md](docs/CONTROLS.md): the shared control layer (touch, mouse, keyboard)

## Files

| Path | What |
|---|---|
| `index.html`, `style.css`, `shell.js` | the app shell: home, settings, routing, lifecycle, backup |
| `shared/input.js` | control layer: the only code that reads keyboard/touch/mouse |
| `games/registry.js` | list of games (one line per game) |
| `games/<id>/` | one game: `game.js`, `icon.svg`, engine, styles |
| `sw.js` | offline cache: pre-caches every registered game |
| `tools/` | CI checks (`check-games.js`, `check-size.js`), tests (`test-*.js`), worst-case saves (`saves/`), input playground |

## Run locally

```bash
python3 -m http.server 8742
```

Open http://localhost:8742. Offline mode needs `localhost` or HTTPS.

## Checks (run in CI)

```bash
node tools/check-games.js && node tools/check-size.js && for t in tools/test-*.js; do node $t; done
```

## Put it online

GitHub Pages serves `main`. Any static HTTPS host works. On iPhone: Safari → Share → Add to Home Screen.
