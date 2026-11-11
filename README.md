# Sudoku

Unlimited sudoku that runs fully in the browser. Visit once, then it works offline (installable as an app).

- **Home**: Continue (last game), Continue… (all unfinished games), New game (Easy / Medium / Hard / Expert), Settings.
- **New games** are generated on the device when you tap (a few ms, even Expert).
- **Saved games**: every game you start is saved. Settings → "Keep unfinished games" (10 / 25 / 50 / 100, default 50); the least recently played are dropped beyond that.
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
| `tools/make-icons.py` | redraws the icons |

## Run locally

```bash
python3 -m http.server 8742
```

Then open http://localhost:8742. Offline mode needs `localhost` or HTTPS.

## Put it online

Any static host works (GitHub Pages, Netlify, Cloudflare Pages). It needs HTTPS for offline mode.
On iPhone, open it in Safari and use Share → Add to Home Screen to access it offline. Settings has Download backup and Restore backup for progress.
