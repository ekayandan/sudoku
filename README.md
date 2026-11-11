# Sudoku

Unlimited sudoku that runs fully in the browser. Visit once, then it works offline forever (installable as an app).

- **240 built-in levels**: 60 each for Easy, Medium, Hard, Expert, sorted easiest first.
- **Endless**: fresh puzzles generated on the device in a background worker (a few are kept ready). If none is ready, a built-in level is "mutated" (digits relabelled, rows/columns/bands shuffled, maybe transposed): same difficulty, looks new.
- **Many saved games**: every puzzle you start is saved on its own, list under "In progress" on the home screen. Up to 40 kept.
- Notes (pencil marks), undo, erase, hint, mistakes in red, timer, highlights, keyboard (1-9, arrows, Backspace, N, Ctrl/Cmd+Z).
- No server, no accounts, no tracking. Progress lives in the browser's localStorage.

## How difficulty is graded

`sudoku.js` solves each puzzle like a person would and records the hardest technique needed:
singles → Easy (36+ clues) / Medium; locked candidates, pairs, triples → Hard; X-Wing, Swordfish or beyond → Expert.
Every puzzle has exactly one solution.

## Files

| File | What |
|---|---|
| `index.html`, `style.css`, `app.js` | the app |
| `sudoku.js` | engine: solver, grader, generator, mutator (works in Node too) |
| `levels.js` | built-in levels (generated) |
| `worker.js` | generates Endless puzzles off the main thread |
| `sw.js` | offline cache. **Bump `VERSION` on every change** so phones update |
| `tools/build-levels.js` | `node tools/build-levels.js` regenerates `levels.js` |
| `tools/test-engine.js` | `node tools/test-engine.js` checks uniqueness, solutions, mutation |
| `tools/make-icons.py` | redraws the icons |

## Run locally

```bash
python3 -m http.server 8742
```

Then open http://localhost:8742. Offline mode needs `localhost` or HTTPS.

## Put it online

Any static host works (GitHub Pages, Netlify, Cloudflare Pages). It needs HTTPS for offline mode.
On iPhone, open it in Safari and use Share → Add to Home Screen, otherwise Safari may clear its storage after a few weeks without use.
