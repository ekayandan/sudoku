# Adding a game

Read `docs/DESIGN.md` first (product rules), then `docs/CONTROLS.md` (input). This page is the contract.

## Files you own

```
games/<id>/game.js      ES module, default export (below). Listed first in the registry.
games/<id>/icon.svg     square tile icon, original art, readable at 48–96 px, rounded square background
games/<id>/style.css    optional; scope every rule under .game-<id>
games/<id>/*.js         engine / logic modules (pure, no DOM, testable in Node)
tools/saves/<id>.js     returns the worst-case saved data (CI fails without it, see tools/check-size.js)
tools/test-<id>.js      Node tests for your engine (CI runs every tools/test-*.js)
```

Plus **one line** in `games/registry.js` (keep entries alphabetical by id). That line is the only place games
touch shared files. Don't edit `shell.js`, `shared/`, `style.css`, `sw.js` or `index.html` in a game PR.
If the platform needs a change, open a separate PR or issue.

## The module

```js
export default {
  id: 'blocks',
  name: 'Blocks',
  input: { /* see docs/CONTROLS.md */ },
  help: ['One line per tip. Shown on "?".'],
  create(ctx) {
    // render into ctx.root (a flex column, position: relative, full height)
    return {
      start(saved) {},   // saved = what save() returned last time, or null. Resume exactly where the player was.
      pause() {},        // stop loops/timers. Called when the app is hidden, on blur (arcade), or via ctx.pause().
      resume() {},       // restart loops/timers
      save() {},         // return small JSON (null = nothing to resume). Called on pause, hide and exit.
      destroy() {},      // stop everything; the root is removed after this
    };
  },
};
```

### ctx

| | |
|---|---|
| `ctx.root` | your element. Render here only. |
| `ctx.input` | control layer (docs/CONTROLS.md). The only way to read player input. |
| `ctx.storage.get(name, default)` / `.set(name, value)` / `.remove(name)` | JSON storage under `g.<id>.<name>`. Never use `localStorage` directly. |
| `ctx.setStatus(text, pct)` | one line shown on the home tile and the Continue card, e.g. `'Klondike · 3 moves'`. `null` = nothing in progress (no Continue card). |
| `ctx.pause()` | pause the game and show the shared pause overlay (arcade games: wire your pause button and `pause` action to this) |
| `ctx.back()` | leave to the home screen |
| `ctx.onBack(fn)` | `fn()` returns `true` if you handled Back yourself (e.g. closing an in-game menu) |
| `ctx.ui.confirm(text)` → `Promise<boolean>`, `ctx.ui.toast(text)` | shared dialogs |
| `ctx.audio.tone(freq, ms, type, vol)` | synthesized blip; silent unless the player turned Sound on |
| `ctx.haptics(ms)` | short vibration if enabled |
| `ctx.rng(seed)` | seedable PRNG returning floats in [0,1). Store seeds, not whole decks/boards, where you can. |
| `ctx.settings` | read-only: `theme`, `sound`, `haptics`, `reducedMotion` |
| `ctx.requestPersistence()` | ask the browser to keep storage (call when a real game starts) |

## Rules (CI checks most of them: `node tools/check-games.js`)

- **No input listeners in games** (keyboard, pointer, touch, mouse, wheel, contextmenu, gamepad). `click` on your
  own buttons is fine. Everything else goes through `ctx.input`.
- **No `localStorage`, network, service worker or `document`-level listeners.** Everything goes through `ctx`.
- **Resume exactly.** `save()` must capture everything needed to continue: board, score, timer, RNG state,
  and for arcade games positions/velocities. `start(saved)` restores it. Test it: play, reload, continue.
- **Arcade games** use a fixed-timestep loop (`requestAnimationFrame` + accumulator), call `ctx.input.update()` once per
  simulation step, stop the loop in `pause()`, and never run while paused. The shell reopens arcade games paused.
- **Budgets:** ≤ 150 KB for your folder, ≤ 100 KB worst-case saved data. `node tools/check-size.js`.
- **Look:** use the CSS variables from `style.css` (`--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`, …)
  so Light/Dark both work. For canvas, read them with `getComputedStyle(ctx.root)`. Don't hard-code a light-only palette.
- **Layout:** portrait phone first (390×844), must also work on desktop. Respect safe areas. Top bar pattern:
  back button (calls `ctx.back()`), title, right-side action, like Sudoku.
- **Original names and art only.** No trademarks or look-alike assets (docs/DESIGN.md §9).
- `prefers-reduced-motion` → shorten or skip animations (`ctx.settings.reducedMotion`).

## Running locally

```bash
python3 -m http.server 8742      # then open http://localhost:8742/#/<id>
node tools/check-games.js && node tools/check-size.js && node tools/test-<id>.js
```

`tools/input-playground.html` shows what every touch scheme produces, which helps when tuning controls.

## Deploying

GitHub Pages serves `main`. Rebase on `main`, resolve the registry line if needed (keep both entries,
alphabetical), make sure CI passes, merge. Phones pick up the update on the next launch (the service worker serves
the cached copy instantly and refreshes it in the background).
