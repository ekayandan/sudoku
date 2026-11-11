# Sudoku

Unlimited sudoku that runs fully in the browser. Visit once, then it works offline (installable as an app).

- **Home**: Continue (last game), Continue… (all active games, shown when there are 2+), New game (Easy / Medium / Hard / Expert), Settings.
- **New games** are generated on the device when you tap (a few ms, even Expert).
- **Saved games**: every game you start is saved, up to 20; the least recently played is dropped beyond that. Each keeps its last 150 undo changes, so saved data stays under 100 KB.
- **Appearance**: Auto (follows the device's light/dark mode), Light or Dark.
- Notes (pencil marks), undo, erase, hint, mistakes in red, timer, highlights, keyboard (1-9, arrows, Backspace, N, Ctrl/Cmd+Z), backup/restore to a file.
- No server, no accounts, no tracking. Progress lives in the browser's localStorage.

## How difficulty is graded

`sudoku.js` solves each puzzle like a person would and records the hardest technique needed:
singles → Easy (36+ clues) / Medium; locked candidates, pairs, triples → Hard; X-Wing, Swordfish or beyond → Expert.
Every puzzle has exactly one solution.

## Files

| File | What |
|---|---|
| `index.html`, `style.css`, `app.js` | the app |
| `sudoku.js` | engine: solver, grader, generator (works in Node too) |
| `sw.js` | offline cache. **Bump `VERSION` on every change** so phones update |
| `tools/test-engine.js` | `node tools/test-engine.js` checks uniqueness, solutions |
| `tools/check-size.js` | `node tools/check-size.js` fails if the app download or worst-case saved data is over 100 KB (runs in CI) |
| `tools/make-icons.py` | redraws the icons |

## Run locally

```bash
python3 -m http.server 8742
```

Then open http://localhost:8742. Offline mode needs `localhost` or HTTPS.

## Put it online

Any static host works (GitHub Pages, Netlify, Cloudflare Pages). It needs HTTPS for offline mode.
On iPhone, open it in Safari and use Share → Add to Home Screen to access it offline. Settings has Download backup and Restore backup for progress.
