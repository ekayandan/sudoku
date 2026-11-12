# Sudoku

One simple, tiny app that keeps you busy in a healthy way, wherever you are, as long as you have a Chrome browser.

No account, no ads, no tracking, no server. Open it once, and it works offline from then on. The whole app is about 49 KB.

## What you get

- Endless puzzles at four levels (Easy, Medium, Hard, Expert), generated on your device the moment you tap.
- Every puzzle has exactly one solution and is graded by the techniques a person would need, not by guessing.
- Notes, undo, erase, hint, mistakes in red, timer, keyboard support.
- Your games save themselves. Come back to any of them later.
- Light and dark themes.
- Install it as an app from Chrome (menu → Install). It then opens with no network at all.

Your progress lives only in your browser's localStorage. Settings has Download backup and Restore backup if you want to move it.

## How difficulty is graded

`sudoku.js` solves each puzzle like a person would and records the hardest technique needed:
singles → Easy / Medium; locked candidates, pairs, triples → Hard; X-Wing, Swordfish or beyond → Expert.

## Files

| File | What |
|---|---|
| `index.html`, `style.css`, `app.js` | the app |
| `sudoku.js` | engine: solver, grader, generator (works in Node too) |
| `sw.js` | offline cache. **Bump `VERSION` on every change** so installed copies update |
| `tools/test-engine.js` | `node tools/test-engine.js` checks uniqueness and solutions |
| `tools/check-size.js` | fails if the download or worst-case saved data goes over 100 KB (runs in CI) |
| `tools/make-icons.py` | redraws the icons |

## Run locally

```bash
python3 -m http.server 8742
```

Then open http://localhost:8742. Offline mode needs `localhost` or HTTPS.

## Put it online

Any static host works (GitHub Pages, Netlify, Cloudflare Pages). Offline mode needs HTTPS.
