# Design: one offline app, a handful of timeless games

Status: accepted · implementation: see docs/ADDING-A-GAME.md, docs/CONTROLS.md · Owner: Enver · Last updated: 2026-11-12

## 1. Motto

**Install one small app (≈0.5–3 MB) and own a set of timeless games that work offline forever.**
No ads, no accounts, no tracking, no network after the first visit. Open the app and you are back
exactly where you left off: on the metro, on a flight, in a queue.

Games are chosen because almost everyone enjoys them once in a while, not because they are trendy.
They are offline by nature: single player, no servers, no live content.

## 2. Game line-up

Working titles. Shipped names must be original or generic (see §9).

| Game | Kind | Status |
|---|---|---|
| Sudoku | board / puzzle | exists (this repo) |
| Solo Test (peg solitaire) | board / puzzle | planned |
| Solitaire (Klondike; later FreeCell, Spider) | cards | planned |
| Mines (minesweeper-style, no-guess boards) | board / puzzle | planned |
| Blocks (falling-block puzzle) | arcade | planned |
| Maze Chase (maze chase arcade) | arcade | planned |
| Pinball | arcade / physics | planned, last |

What a game needs to be added:
- Fun in sessions of 1 to 10 minutes and can be interrupted at any moment without losing anything.
- Fully deterministic and offline. Content is generated on the device or small enough to bundle.
- Fits the size budget (§4).
- Playable with touch alone. Keyboard is always supported (§6).

## 3. Product requirements (all games)

1. **Instant start.** From a cached launch to the first interactive frame takes under 1 s on a mid-range phone.
   Nothing blocks the first paint: no splash screens and no loading bars.
2. **Resume where you left off.**
   - Launching the app reopens the last game that was in progress. Action games reopen **paused**
     behind a "Tap to continue" overlay. A setting can switch this to "open Home".
   - Every game saves its state when the app goes to the background (`visibilitychange` → hidden,
     `pagehide`), and puzzle games also save after every move. Nothing is lost when the OS kills the tab.
   - Action games pause automatically on background, on window blur, and on gamepad disconnect.
3. **Offline.** The service worker pre-caches **every game** on install, not lazily, so a game
   never opened before still works in airplane mode. No runtime network requests, no CDNs, no web fonts.
4. **No ads, accounts, analytics or third-party scripts.** Ever.
5. **Saved data stays on the device** (localStorage). One backup file covers all games (§7.4).
6. **Quiet by default.** Sound is off by default (metro/flight). When on, sounds are synthesized with
   WebAudio: no audio files. Haptics are optional (`navigator.vibrate` where supported).
7. **Themes.** Auto / Light / Dark, shared by all games.
8. **Accessible.** Every game is fully playable from the keyboard (§6.5), uses no colour-only signals,
   and respects `prefers-reduced-motion`.

## 4. Technical constraints and budgets

- **Plain JS, HTML and CSS. No framework, no bundler, no runtime dependencies.** The repo is deployable as
  static files to any host with HTTPS. Small, vetted libraries are allowed only if MIT/BSD/Apache
  licensed and they fit the budget (no GPL code in the shipped app).
- **ES modules**, with games loaded via dynamic `import()` so only the opened game is parsed.
- **Rendering:** DOM/SVG for board and card games (crisp, accessible, easy theming), `<canvas>` for
  arcade games. Graphics are drawn in code (SVG/CSS/canvas): no image sprites except app icons.
- **Performance:** arcade games run at 60 fps on a mid-range phone, use a fixed-timestep simulation
  (deterministic, frame-rate independent) and allocate nothing per frame in the hot loop.
- **Size budgets** (enforced by `tools/check-size.js` in CI):

  | What | Budget |
  |---|---|
  | Whole app download (all games + shell + icons) | target ≤ 1 MB, hard fail > 3 MB |
  | Shell + shared code (incl. control layer) | ≤ 100 KB |
  | Each game (code + assets) | ≤ 150 KB |
  | Saved data, worst case, per game | ≤ 100 KB |
  | Saved data, worst case, all games | ≤ 1 MB (localStorage is ~5 MB per origin) |

- **Browsers:** current Safari (iOS/macOS), Chrome/Edge, Firefox. iOS home-screen PWA is a first-class target.

## 5. Architecture

```
index.html ─ shell (home, settings, routing, lifecycle, backup)
             │
             ├─ shared/  input (control layer), storage, theme, audio, haptics, rng, timer, ui
             │
             └─ games/<id>/  game.js (module), engine code, styles
sw.js        ─ pre-caches every game in games/registry.js; serves from cache, refreshes in the background
tools/       ─ tests, size check (check-size.js), game/input-boundary check (check-games.js), input playground
```

### 5.1 Shell
- **Routing:** hash routes, `#/` = Home, `#/<game-id>` = game. The back gesture or button returns to Home.
- **Home:** a large "Continue <game>" card for the last game played, then a grid of all games, each with
  its own progress/continue info. Settings: theme, sound, haptics, launch behaviour, controls (§6.6), backup.
- **Lifecycle:** the shell, not the game, listens to `visibilitychange`, `pagehide`, `blur`, and
  gamepad connect/disconnect, and calls `pause()` / `save()` on the active game.

### 5.2 Game module contract
Every game is an ES module with a default export:

```js
export default {
  id: 'solo-test',                // stable, used for storage and routes
  name: 'Solo Test',
  saveVersion: 1,                 // bump + migrate when the saved format changes
  input: { /* declaration, see §6 */ },
  create(ctx) { return instance; }
};

// ctx (given by the shell)
//   ctx.root      HTMLElement the game renders into
//   ctx.input     control layer handle for this game (§6)
//   ctx.storage   namespaced storage: get/set/remove under "g.<id>."
//   ctx.settings  read-only shared settings (theme, sound, reducedMotion…)
//   ctx.audio, ctx.haptics, ctx.rng (seedable), ctx.ui (dialogs, toasts, pause overlay)

// instance
//   start(savedState | null)   resume or start fresh
//   pause() / resume()         arcade games stop their loop; puzzle games stop the timer
//   save() -> JSON             small, versioned
//   command(name)              shell/toolbar commands: 'undo', 'hint', 'new', 'restart'…
//   destroy()
```

Games **never** touch `document`, `window` listeners, `localStorage` or `navigator` directly. Everything goes through `ctx`.
This keeps games testable in Node and lets the shell evolve without editing games.

## 6. Control layer (shared input)

### 6.1 Why
Input is implemented **once**, in `shared/input/`. Games declare *what they accept* (semantic
actions or pointer targets) and never read raw keys, touches or gamepad buttons. Supporting a new
input device or a new touch scheme, or adding remapping, keyboard navigation or on-screen prompts, means
changing the control layer only. No game changes.

Example: adding gamepads later is one adapter that maps the D-pad/A/B to existing actions. Every arcade
game and every board game (via the focus cursor, §6.3) gets gamepad support at once.

```
Devices                 Adapters                 Bindings                Game
keyboard ─────────┐
mouse / pen ──────┼──>  normalize to       ──>  device input  ──>   actions (arcade)
touch ────────────┤     pointer + button        → game action       or targets (board)
gamepad (later) ──┘     events                  (per game, remappable)
```

### 6.2 Two input models
A game picks one model in its `input` declaration.

**A. Pointer model.** For board and card games (Sudoku, Solo Test, Solitaire, Mines).
The game exposes **targets** (cells, holes, cards, piles) with hit areas. The layer turns
touch, mouse, pen, keyboard and gamepad into semantic events:

| Event | Touch | Mouse | Keyboard (cursor) | Gamepad (later) |
|---|---|---|---|---|
| `select(target)` | tap | click | arrows/WASD move, focus follows | D-pad |
| `activate(target)` | tap (or double-tap if declared) | click / double-click | Enter / Space | A |
| `secondary(target)` | long-press | right-click | F or Shift+Enter | X |
| `drag(from) → drop(to)` | drag | drag | pick up with Enter, move, Enter to drop; Esc cancels | A, D-pad, A |
| `command(name)` | toolbar buttons | toolbar buttons | keys (§6.5) | Start / Select / shoulders |

```js
input: {
  model: 'pointer',
  drag: true,                    // Solitaire yes, Sudoku no
  secondary: 'flag',             // label shown in help, e.g. Mines
  commands: ['undo', 'hint', 'new'],
  navigation: 'grid'             // or a function neighbor(target, dir) for irregular layouts (piles)
}
```

**B. Action model.** For arcade games (Blocks, Maze Chase, Pinball).
The game declares named actions. Each frame it *reads state*, so it does not handle events:

```js
input: {
  model: 'action',
  actions: [
    { id: 'left',     kind: 'button', repeat: { delay: 170, rate: 50 } },  // auto-repeat lives in the layer
    { id: 'right',    kind: 'button', repeat: { delay: 170, rate: 50 } },
    { id: 'rotate',   kind: 'button' },
    { id: 'drop',     kind: 'button' },
    { id: 'move',     kind: 'dir4' },     // 4-way, last-pressed wins (maze games)
    { id: 'aim',      kind: 'axis2' },    // analogue −1..1 (future games)
    { id: 'pause',    kind: 'button', system: true }
  ],
  touch: ['gestures', 'console', 'zones'],   // schemes this game supports, first = default
  defaults: { /* optional per-scheme presets, see §6.4 */ }
}

// in the game loop
input.pressed('rotate')    // went down this frame (edge, never lost even if tap < 1 frame)
input.held('left')         // is down (with auto-repeat pulses if declared)
input.released('drop')
input.dir('move')          // 'up' | 'down' | 'left' | 'right' | null
input.axis('aim')          // { x, y }
```

The layer buffers events between frames, so a quick tap is never missed, and does edge detection and
auto-repeat identically for every device.

### 6.3 Keyboard focus cursor (pointer games)
Board games get keyboard and gamepad play for free. The layer draws a focus ring on the current target
and moves it with arrows/WASD using the game's `navigation` (grid geometry or a `neighbor()` function).
Targets are real focusable elements with ARIA roles/labels where the game uses DOM, so screen readers work too.
The cursor appears on the first key press and hides on the next touch.

### 6.4 Touch schemes for arcade games
All schemes are built from one primitive, the **touch zone**: a screen region plus a behaviour
(`button`, `stick`, `swipe`). Presets combine zones; a game lists which presets fit it.

| Scheme | What the player sees | Typical use |
|---|---|---|
| **Gestures** | nothing on screen. Swipe = direction, tap = primary, swipe down = drop | Blocks, Maze Chase (default) |
| **Virtual console** | on-screen D-pad + A/B (+ pause) in the bottom area, multi-touch | anyone who prefers buttons |
| **Split halves** | bottom of screen split into left/right zones. Each half is a floating thumbstick or a button, per the game's declaration | Pinball (left half = left flipper, right half = right flipper), Maze Chase (left half = stick) |

Rules:
- On-screen controls sit in the bottom band so the playfield is never under the thumbs. Layout adapts to
  portrait/landscape and safe areas.
- Sticks are *floating* (centre where the thumb lands) with a dead zone and 4- or 8-way snapping for `dir4`.
- The virtual console shows automatically after touch input and hides after keyboard/gamepad input.
- Basics first: v1 ships Gestures + Virtual console + Split halves. Anything else is a new preset in the layer.

### 6.5 Keyboard (all games)
Global keys are handled by the shell or layer and mapped to commands, so they work everywhere:

| Key | Meaning |
|---|---|
| Esc / P | pause (arcade) or back (puzzle) |
| Ctrl/Cmd+Z | `undo` command |
| H | `hint` command |
| N | `new` command |
| ? | show controls for this game |

Arcade defaults: arrows/WASD = directions, Z/X or Space = primary/secondary, Shift/C = hold.
Pinball: Z / Left Shift = left flipper, / or M or Right Shift = right flipper, Space/Down = plunger.

### 6.6 Bindings, remapping, prompts
- Each game has a default binding set per device. The user can override bindings per game in Settings → Controls
  (later); overrides are stored by the shell, never by the game.
- `input.label(actionId)` returns the right glyph for the **last-used device** ("Space", "A", "Tap"),
  so help screens and hints are always correct without game code knowing about devices.

### 6.7 Enforced boundary
CI runs `tools/check-games.js`, which fails if any file under `games/` adds key, pointer, touch,
mouse or gamepad listeners or reads `navigator.getGamepads`. Input code lives in `shared/input/` only.

### 6.8 Supported input matrix

| Game | Model | Touch | Mouse | Keyboard | Console / halves | Gamepad (later) |
|---|---|---|---|---|---|---|
| Sudoku | pointer | tap | click | cursor + 1-9, N, Backspace | – | via cursor |
| Solo Test | pointer | tap-tap or drag | click / drag | cursor + Enter | – | via cursor |
| Solitaire | pointer | tap-to-move, drag | click / drag / double-click | cursor + Enter | – | via cursor |
| Mines | pointer | tap, long-press = flag | click, right-click | cursor + Enter / F | – | via cursor |
| Blocks | action | gestures | – | yes | console, halves | yes |
| Maze Chase | action | gestures | – | yes | console, halves (stick) | yes |
| Pinball | action | halves (flippers) | – | yes | halves (default) | yes |

Console buttons and thumbsticks are not offered for pointer games: tapping the board is better there.

## 7. Shared services

### 7.1 Storage
- Keys are namespaced `g.<game-id>.<name>`. Shell keys use `app.*`. Sudoku keeps its existing keys
  (`sudoku`, `sudoku.theme`), so current players lose nothing; the shell reads `sudoku.theme` once to migrate the theme.
- Every saved object has a `v` field. Games migrate old versions in `start()`.
- Undo history is capped per game, so the worst-case data stays inside the §4 budget (checked in CI).

### 7.2 Randomness
`ctx.rng` is a seedable PRNG. Generated content (deals, boards) stores only its seed and moves where
possible: tiny saves, reproducible bugs, shareable deals later.

### 7.3 Timing
Arcade games use the layer's frame clock with a fixed simulation step (e.g. 120 Hz physics for Pinball,
60 Hz logic elsewhere) and render with interpolation. The clock stops while paused or hidden.

### 7.4 Backup
One "Download backup" file (JSON) contains `app.*` and every game's namespace, with a format version.
Restore validates before replacing anything.

## 8. Quality

- Engines (generators, solvers, rules, physics) are pure modules with Node tests in `tools/`, like `sudoku.js` today.
- CI: `tools/check-games.js` (registry, files, input/storage boundaries), `tools/check-size.js` (budgets, worst-case saves from `tools/saves/<id>.js`), every `tools/test-*.js`.
- Manual release checklist: iOS Safari home-screen app in airplane mode, Android Chrome, desktop keyboard-only play.

## 9. Names, art, licensing

- No trademarked names or look-alike art: no "Tetris", "Pac-Man" or "Minesweeper" (the Windows game), and no copied
  sprites, mazes, sounds, colours or trade dress. Mechanics are fine; presentation is our own. For Blocks, avoid
  copying the classic look as a whole (board proportions, piece colours and style together).
- All graphics are original and drawn in code.
- Dependencies, if any, must be permissively licensed (MIT/BSD/Apache).

## 10. Roadmap

1. **M0 Platform:** shell (home, routing, lifecycle, storage, backup, pre-cache), control layer v1, Sudoku moved in
   with no change in behaviour, CI budgets updated.
2. **M1 Puzzles:** Solo Test, Solitaire (Klondike), Mines.
3. **M2 Arcade:** Blocks, then Maze Chase.
4. **M3 Pinball.**
5. **Later:** gamepad adapter, control remapping, Solitaire variants (FreeCell, Spider).

## 11. Open questions
- App name (working title: Pocket Games), and whether this repo gets renamed from `sudoku`.
- Final game names (the titles above are working titles).
